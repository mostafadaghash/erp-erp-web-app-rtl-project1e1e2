import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  assertBranchAccess,
  hasPermission,
  logAction,
  requireAuth,
  type AuthUser,
} from "./lib/auth";
import type { Permission } from "./lib/permissions";
import { roleHasFollowUpWorkspaceAccess } from "../shared/customerFollowUpWorkspaceRules.ts";
import {
  CUSTOMER_TRACKING_LOCK_MS,
  CUSTOMER_TRACKING_MAX_FAILED_ATTEMPTS,
  CUSTOMER_TRACKING_SOURCE_LABELS,
  buildPublicTrackingSteps,
  getPhoneLast4,
  isValidCustomerTrackingToken,
  normalizePhoneLast4Input,
  publicTrackingStatus,
  type CustomerTrackingSourceType,
} from "../shared/customerTrackingPortalRules.ts";

const trackingSourceTypeValidator = v.union(
  v.literal("order"),
  v.literal("repair"),
  v.literal("delivery"),
);

const GENERIC_VERIFY_ERROR = "تعذر التحقق من بيانات المتابعة";
const LOCKED_VERIFY_ERROR = "تم إيقاف محاولات التحقق مؤقتًا. حاول مرة أخرى بعد قليل";

const SOURCE_VIEW_PERMISSION: Record<CustomerTrackingSourceType, Permission> = {
  order: "view_orders",
  repair: "view_repairs",
  delivery: "view_deliveries",
};

type PublicSourceSnapshot = {
  sourceType: CustomerTrackingSourceType;
  sourceId: string;
  sourceNumber: string;
  branchId: Id<"branches">;
  phone: string;
  rawStatus: string;
  deliveryStatus?: string;
  lastUpdatedAt: number;
};

async function requireWorkspaceManager(ctx: MutationCtx): Promise<AuthUser> {
  const user = await requireAuth(ctx);
  if (!hasPermission(user, "manage_follow_ups") && !roleHasFollowUpWorkspaceAccess(user.role)) {
    throw new ConvexError("ليس لديك صلاحية لإدارة روابط متابعة العملاء");
  }
  return user;
}

function canViewSource(user: AuthUser, sourceType: CustomerTrackingSourceType): boolean {
  if (user.role === "admin" || user.role === "manager") return true;
  if (user.role === "customer_service" && sourceType === "delivery") return true;
  return hasPermission(user, SOURCE_VIEW_PERMISSION[sourceType]);
}

function assertFollowUpPortalAccess(user: AuthUser, followUp: Doc<"customerFollowUps">): void {
  assertBranchAccess(user, followUp);
  if (
    followUp.sourceType !== "order" &&
    followUp.sourceType !== "repair" &&
    followUp.sourceType !== "delivery"
  ) {
    throw new ConvexError("هذه المتابعة غير مرتبطة بعملية يمكن عرضها للعميل");
  }
  if (!followUp.sourceId) throw new ConvexError("المتابعة غير مرتبطة بعملية صالحة");
  if (!canViewSource(user, followUp.sourceType)) {
    throw new ConvexError("ليس لديك صلاحية للوصول إلى العملية المرتبطة");
  }
}

async function latestAuditAt(
  ctx: MutationCtx,
  module: "orders" | "repairs" | "deliveries",
  recordId: string,
  fallback: number,
): Promise<number> {
  const latest = await ctx.db
    .query("auditLogs")
    .withIndex("by_record", (q) => q.eq("module", module).eq("recordId", recordId))
    .order("desc")
    .first();
  return latest?.timestamp ?? latest?._creationTime ?? fallback;
}

async function resolveOrderSnapshot(
  ctx: MutationCtx,
  sourceId: string,
): Promise<PublicSourceSnapshot | null> {
  const orderId = ctx.db.normalizeId("orders", sourceId);
  if (!orderId) return null;
  const order = await ctx.db.get(orderId);
  if (!order?.branchId) return null;

  const customer = order.customerId ? await ctx.db.get(order.customerId) : null;
  const deliveries = await ctx.db
    .query("deliveries")
    .withIndex("by_order_status", (q) => q.eq("orderId", orderId))
    .collect();
  const latestDelivery = [...deliveries].sort((a, b) => b._creationTime - a._creationTime)[0];
  const lastUpdatedAt = Math.max(
    await latestAuditAt(ctx, "orders", sourceId, order._creationTime),
    latestDelivery
      ? await latestAuditAt(ctx, "deliveries", String(latestDelivery._id), latestDelivery._creationTime)
      : 0,
  );

  return {
    sourceType: "order",
    sourceId: String(order._id),
    sourceNumber: order.orderNumber,
    branchId: order.branchId,
    phone: order.customerPhone?.trim() || customer?.phone?.trim() || "",
    rawStatus: order.status,
    deliveryStatus: latestDelivery?.status,
    lastUpdatedAt,
  };
}

async function resolveRepairSnapshot(
  ctx: MutationCtx,
  sourceId: string,
): Promise<PublicSourceSnapshot | null> {
  const repairId = ctx.db.normalizeId("repairs", sourceId);
  if (!repairId) return null;
  const repair = await ctx.db.get(repairId);
  if (!repair?.branchId) return null;
  const latestHistory = await ctx.db
    .query("repairStatusHistory")
    .withIndex("by_repair_date", (q) => q.eq("repairId", repairId))
    .order("desc")
    .first();
  const auditAt = await latestAuditAt(ctx, "repairs", sourceId, repair._creationTime);
  return {
    sourceType: "repair",
    sourceId: String(repair._id),
    sourceNumber: repair.repairNumber,
    branchId: repair.branchId,
    phone: repair.customerPhone.trim(),
    rawStatus: repair.status,
    lastUpdatedAt: Math.max(auditAt, latestHistory?.changedAt ?? 0, repair._creationTime),
  };
}

async function resolveDeliverySnapshot(
  ctx: MutationCtx,
  sourceId: string,
): Promise<PublicSourceSnapshot | null> {
  const deliveryId = ctx.db.normalizeId("deliveries", sourceId);
  if (!deliveryId) return null;
  const delivery = await ctx.db.get(deliveryId);
  if (!delivery?.branchId) return null;
  return {
    sourceType: "delivery",
    sourceId: String(delivery._id),
    sourceNumber: delivery.deliveryNumber,
    branchId: delivery.branchId,
    phone: delivery.customerPhone.trim(),
    rawStatus: delivery.status,
    lastUpdatedAt: await latestAuditAt(ctx, "deliveries", sourceId, delivery._creationTime),
  };
}

async function resolveSourceSnapshot(
  ctx: MutationCtx,
  sourceType: CustomerTrackingSourceType,
  sourceId: string,
): Promise<PublicSourceSnapshot | null> {
  if (sourceType === "order") return resolveOrderSnapshot(ctx, sourceId);
  if (sourceType === "repair") return resolveRepairSnapshot(ctx, sourceId);
  return resolveDeliverySnapshot(ctx, sourceId);
}

export const ensureLink = mutation({
  args: {
    followUpId: v.id("customerFollowUps"),
    proposedToken: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireWorkspaceManager(ctx);
    const followUp = await ctx.db.get(args.followUpId);
    if (!followUp) throw new ConvexError("المتابعة غير موجودة");
    assertFollowUpPortalAccess(user, followUp);

    const sourceType = followUp.sourceType as CustomerTrackingSourceType;
    const sourceId = followUp.sourceId!;
    const source = await resolveSourceSnapshot(ctx, sourceType, sourceId);
    if (!source || source.branchId !== followUp.branchId) {
      throw new ConvexError("تعذر العثور على العملية المرتبطة بهذه المتابعة");
    }
    if (!getPhoneLast4(source.phone)) {
      throw new ConvexError("رقم هاتف العميل غير صالح لإنشاء رابط متابعة");
    }

    const existing = await ctx.db
      .query("customerTrackingLinks")
      .withIndex("by_source", (q) => q.eq("sourceType", sourceType).eq("sourceId", sourceId))
      .unique();
    if (existing) {
      return {
        token: existing.token,
        sourceType,
        sourceNumber: source.sourceNumber,
      };
    }

    const proposedToken = args.proposedToken.trim().toLowerCase();
    if (!isValidCustomerTrackingToken(proposedToken)) {
      throw new ConvexError("تعذر إنشاء رابط متابعة آمن. أعد المحاولة");
    }
    const collision = await ctx.db
      .query("customerTrackingLinks")
      .withIndex("by_token", (q) => q.eq("token", proposedToken))
      .unique();
    if (collision) throw new ConvexError("تعذر إنشاء رابط متابعة آمن. أعد المحاولة");

    const now = Date.now();
    await ctx.db.insert("customerTrackingLinks", {
      branchId: source.branchId,
      sourceType,
      sourceId,
      sourceNumber: source.sourceNumber,
      token: proposedToken,
      failedAttempts: 0,
      createdBy: user.userId,
      createdAt: now,
      updatedAt: now,
    });

    await logAction(ctx, user, {
      action: "tracking_link_create",
      module: "customer_follow_ups",
      recordId: String(followUp._id),
      recordLabel: source.sourceNumber,
      details: `تم إنشاء رابط متابعة آمن للعملية ${source.sourceNumber}`,
      branchId: source.branchId,
      sourceType,
      sourceId,
      sourceNumber: source.sourceNumber,
    });

    return {
      token: proposedToken,
      sourceType,
      sourceNumber: source.sourceNumber,
    };
  },
});

export const verify = mutation({
  args: {
    token: v.string(),
    phoneLast4: v.string(),
  },
  handler: async (ctx, args) => {
    const token = args.token.trim().toLowerCase();
    const submittedLast4 = normalizePhoneLast4Input(args.phoneLast4);
    if (!isValidCustomerTrackingToken(token) || !submittedLast4) {
      throw new ConvexError(GENERIC_VERIFY_ERROR);
    }

    const link = await ctx.db
      .query("customerTrackingLinks")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!link) throw new ConvexError(GENERIC_VERIFY_ERROR);

    const now = Date.now();
    if (link.lockedUntil && link.lockedUntil > now) {
      throw new ConvexError(LOCKED_VERIFY_ERROR);
    }

    const source = await resolveSourceSnapshot(ctx, link.sourceType, link.sourceId);
    if (!source || source.branchId !== link.branchId) {
      throw new ConvexError(GENERIC_VERIFY_ERROR);
    }
    const expectedLast4 = getPhoneLast4(source.phone);
    if (!expectedLast4 || expectedLast4 !== submittedLast4) {
      const failedAttempts = (link.failedAttempts ?? 0) + 1;
      const shouldLock = failedAttempts >= CUSTOMER_TRACKING_MAX_FAILED_ATTEMPTS;
      await ctx.db.patch(link._id, {
        failedAttempts: shouldLock ? 0 : failedAttempts,
        lockedUntil: shouldLock ? now + CUSTOMER_TRACKING_LOCK_MS : undefined,
        updatedAt: now,
      });
      throw new ConvexError(shouldLock ? LOCKED_VERIFY_ERROR : GENERIC_VERIFY_ERROR);
    }

    await ctx.db.patch(link._id, {
      failedAttempts: 0,
      lockedUntil: undefined,
      lastVerifiedAt: now,
      updatedAt: now,
      sourceNumber: source.sourceNumber,
    });

    const status = publicTrackingStatus(
      source.sourceType,
      source.rawStatus,
      source.deliveryStatus,
    );
    const steps = buildPublicTrackingSteps(
      source.sourceType,
      source.rawStatus,
      source.deliveryStatus,
    );
    const currentStep = steps.find((step) => step.state === "current" || step.state === "stopped")?.label ?? status;

    // SECURITY CONTRACT: return only the intentionally public projection below.
    // Never spread source documents or return customer, finance, staff, diagnosis, notes, or accounting fields.
    return {
      sourceNumber: source.sourceNumber,
      sourceType: source.sourceType,
      sourceTypeLabel: CUSTOMER_TRACKING_SOURCE_LABELS[source.sourceType],
      status,
      currentStatus: currentStep,
      lastUpdatedAt: source.lastUpdatedAt,
      steps,
    };
  },
});
