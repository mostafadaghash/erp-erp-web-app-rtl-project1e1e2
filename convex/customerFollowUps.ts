import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  assertBranchAccess,
  hasPermission,
  logAction,
  requirePermission,
  resolveWriteBranch,
  type AuthUser,
} from "./lib/auth";
import type { Permission } from "./lib/permissions";
import { businessDate } from "../shared/businessDate.ts";
import { isValidIsoDate } from "../shared/businessRules.ts";
import {
  FOLLOW_UP_COMMERCIAL_STATUS_LABELS,
  deriveFollowUpCommercialStatus,
  mapDeliverySourceStatus,
  mapOrderSourceStatus,
  mapRepairSourceStatus,
  type FollowUpSourceType,
  type RepairRejectionParty,
} from "../shared/customerFollowUpRules.ts";

const sourceTypeValidator = v.union(
  v.literal("lead"),
  v.literal("order"),
  v.literal("repair"),
  v.literal("delivery"),
  v.literal("delivered_operation"),
  v.literal("manual"),
);

const workflowStatusValidator = v.union(
  v.literal("pending"),
  v.literal("follow_up_later"),
  v.literal("completed"),
);

const rejectionPartyValidator = v.union(v.literal("customer"), v.literal("technician"));

const SOURCE_VIEW_PERMISSION: Partial<Record<FollowUpSourceType, Permission>> = {
  lead: "view_leads",
  order: "view_orders",
  repair: "view_repairs",
  delivery: "view_deliveries",
  delivered_operation: "view_deliveries",
};

function requiredText(value: string | undefined, label: string, maxLength = 300): string {
  const normalized = value?.trim().replace(/\s+/g, " ");
  if (!normalized) throw new ConvexError(`${label} مطلوب`);
  if (normalized.length > maxLength) throw new ConvexError(`${label} أطول من الحد المسموح`);
  return normalized;
}

function optionalText(value: string | undefined, maxLength = 1000): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (normalized.length > maxLength) throw new ConvexError("النص أطول من الحد المسموح");
  return normalized;
}

function validDate(value: string, label: string): string {
  if (!isValidIsoDate(value)) throw new ConvexError(`${label} غير صالح`);
  return value;
}

function assertSourcePermission(user: AuthUser, sourceType: FollowUpSourceType): void {
  if (sourceType === "manual" || user.role === "admin") return;
  const permission = SOURCE_VIEW_PERMISSION[sourceType];
  if (!permission || !hasPermission(user, permission)) {
    throw new ConvexError("ليس لديك صلاحية للوصول إلى مصدر هذه المتابعة");
  }
}

function canAccessFollowUp(user: AuthUser, followUp: Doc<"customerFollowUps">): boolean {
  if (user.role === "admin" || user.role === "manager") return true;
  if (!user.branchId || followUp.branchId !== user.branchId) return false;
  if (followUp.sourceType === "manual") {
    return (
      followUp.assignedToProfileId === user.employeeId ||
      followUp.createdBy === user.userId ||
      hasPermission(user, "view_customers")
    );
  }
  const permission = SOURCE_VIEW_PERMISSION[followUp.sourceType];
  return Boolean(permission && hasPermission(user, permission));
}

function assertFollowUpAccess(user: AuthUser, followUp: Doc<"customerFollowUps">): void {
  assertBranchAccess(user, followUp);
  if (!canAccessFollowUp(user, followUp)) {
    throw new ConvexError("ليس لديك صلاحية للوصول إلى هذه المتابعة");
  }
}

function resolveReadBranch(user: AuthUser, requested?: Id<"branches">): Id<"branches"> | undefined {
  if (user.role === "admin") return requested;
  if (!user.branchId) throw new ConvexError("يجب ربط حسابك بفرع قبل عرض المتابعات");
  if (requested && requested !== user.branchId) {
    throw new ConvexError("ليس لديك صلاحية للوصول إلى بيانات هذا الفرع");
  }
  return user.branchId;
}

type SourceSnapshot = {
  sourceId: string;
  sourceNumber?: string;
  sourceStatus?: string;
  customerId?: Id<"customers">;
  customerName: string;
  phone?: string;
  branchId?: Id<"branches">;
};

async function resolveSourceSnapshot(
  ctx: MutationCtx,
  user: AuthUser,
  input: {
    sourceType: FollowUpSourceType;
    sourceId?: string;
    repairRejectionParty?: RepairRejectionParty;
  },
): Promise<SourceSnapshot | undefined> {
  if (input.sourceType === "manual") {
    if (input.sourceId?.trim()) throw new ConvexError("المتابعة اليدوية لا ترتبط برقم مصدر داخلي");
    return undefined;
  }

  assertSourcePermission(user, input.sourceType);
  const rawSourceId = requiredText(input.sourceId, "مصدر المتابعة", 200);

  if (input.sourceType === "lead") {
    const id = ctx.db.normalizeId("leads", rawSourceId);
    if (!id) throw new ConvexError("فرصة البيع غير صالحة");
    const lead = await ctx.db.get(id);
    if (!lead) throw new ConvexError("فرصة البيع غير موجودة");
    return {
      sourceId: String(id),
      sourceStatus: lead.status,
      customerId: lead.convertedToCustomerId,
      customerName: lead.name,
      phone: lead.phone,
      branchId: lead.branchId,
    };
  }

  if (input.sourceType === "order") {
    const id = ctx.db.normalizeId("orders", rawSourceId);
    if (!id) throw new ConvexError("أمر البيع غير صالح");
    const order = await ctx.db.get(id);
    if (!order) throw new ConvexError("أمر البيع غير موجود");
    const shippedDelivery = await ctx.db
      .query("deliveries")
      .withIndex("by_order_status", (q) => q.eq("orderId", id).eq("status", "shipped"))
      .first();
    return {
      sourceId: String(id),
      sourceNumber: order.orderNumber,
      sourceStatus: mapOrderSourceStatus(order.status, Boolean(shippedDelivery)),
      customerId: order.customerId,
      customerName: order.customerName,
      phone: order.customerPhone,
      branchId: order.branchId,
    };
  }

  if (input.sourceType === "repair") {
    const id = ctx.db.normalizeId("repairs", rawSourceId);
    if (!id) throw new ConvexError("عملية الصيانة غير صالحة");
    const repair = await ctx.db.get(id);
    if (!repair) throw new ConvexError("عملية الصيانة غير موجودة");
    const sourceStatus = mapRepairSourceStatus(
      repair.status,
      repair.cancellationReason,
      input.repairRejectionParty,
    );
    if (repair.status === "cancelled" && !sourceStatus) {
      throw new ConvexError("حدد ما إذا كان رفض الصيانة من العميل أو من الفني");
    }
    return {
      sourceId: String(id),
      sourceNumber: repair.repairNumber,
      sourceStatus,
      customerId: repair.customerId,
      customerName: repair.customerName,
      phone: repair.customerPhone,
      branchId: repair.branchId,
    };
  }

  const id = ctx.db.normalizeId("deliveries", rawSourceId);
  if (!id) throw new ConvexError("الشحنة غير صالحة");
  const delivery = await ctx.db.get(id);
  if (!delivery) throw new ConvexError("الشحنة غير موجودة");
  if (input.sourceType === "delivered_operation" && delivery.status !== "delivered") {
    throw new ConvexError("المصدر المحدد لم يتم تسليمه بعد");
  }
  return {
    sourceId: String(id),
    sourceNumber: delivery.deliveryNumber,
    sourceStatus: mapDeliverySourceStatus(delivery.status),
    customerId: delivery.customerId,
    customerName: delivery.customerName,
    phone: delivery.customerPhone,
    branchId: delivery.branchId,
  };
}

async function resolveAssignee(
  ctx: MutationCtx,
  user: AuthUser,
  branchId: Id<"branches">,
  requested?: Id<"userProfiles">,
): Promise<{ assignedToProfileId: Id<"userProfiles">; assignedToName: string }> {
  if (!requested || requested === user.employeeId) {
    return { assignedToProfileId: user.employeeId, assignedToName: user.name };
  }
  const profile = await ctx.db.get(requested);
  if (!profile) throw new ConvexError("المسؤول عن المتابعة غير موجود");
  if (!profile.isActive) throw new ConvexError("لا يمكن إسناد المتابعة إلى موظف غير نشط");
  if (profile.branchId && profile.branchId !== branchId && profile.role !== "admin") {
    throw new ConvexError("لا يمكن إسناد المتابعة إلى موظف في فرع آخر");
  }
  return { assignedToProfileId: profile._id, assignedToName: profile.name };
}

function presentFollowUp(followUp: Doc<"customerFollowUps">, asOfDate: string) {
  const commercialStatus = deriveFollowUpCommercialStatus({
    status: followUp.status,
    followUpDate: followUp.followUpDate,
    asOfDate,
  });
  return {
    ...followUp,
    commercialStatus,
    commercialStatusLabel: FOLLOW_UP_COMMERCIAL_STATUS_LABELS[commercialStatus],
  };
}

export const get = query({
  args: {
    id: v.id("customerFollowUps"),
    asOfDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "view_follow_ups");
    const followUp = await ctx.db.get(args.id);
    if (!followUp) return null;
    assertFollowUpAccess(user, followUp);
    const asOfDate = validDate(args.asOfDate ?? businessDate(), "تاريخ التقييم");
    return presentFollowUp(followUp, asOfDate);
  },
});

export const list = query({
  args: {
    branchId: v.optional(v.id("branches")),
    sourceType: v.optional(sourceTypeValidator),
    sourceId: v.optional(v.string()),
    customerId: v.optional(v.id("customers")),
    assignedToProfileId: v.optional(v.id("userProfiles")),
    status: v.optional(workflowStatusValidator),
    fromDate: v.optional(v.string()),
    toDate: v.optional(v.string()),
    asOfDate: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "view_follow_ups");
    const branchId = resolveReadBranch(user, args.branchId);
    const fromDate = args.fromDate ? validDate(args.fromDate, "تاريخ البداية") : undefined;
    const toDate = args.toDate ? validDate(args.toDate, "تاريخ النهاية") : undefined;
    if (fromDate && toDate && fromDate > toDate) {
      throw new ConvexError("تاريخ البداية يجب ألا يكون بعد تاريخ النهاية");
    }
    if (args.sourceId && !args.sourceType) {
      throw new ConvexError("حدد نوع المصدر مع رقم المصدر");
    }
    const asOfDate = validDate(args.asOfDate ?? businessDate(), "تاريخ التقييم");
    const requestedLimit = Number.isFinite(args.limit) ? Math.floor(args.limit ?? 100) : 100;
    const limit = Math.min(Math.max(requestedLimit, 1), 200);
    const candidateLimit = Math.min(Math.max(limit * 5, 100), 500);

    let rows: Doc<"customerFollowUps">[];
    if (args.sourceType && args.sourceId) {
      rows = await ctx.db
        .query("customerFollowUps")
        .withIndex("by_source", (q) => q.eq("sourceType", args.sourceType!).eq("sourceId", args.sourceId!))
        .order("desc")
        .take(candidateLimit);
    } else if (args.assignedToProfileId && args.status) {
      rows = await ctx.db
        .query("customerFollowUps")
        .withIndex("by_assignee_status_date", (q) =>
          q.eq("assignedToProfileId", args.assignedToProfileId!).eq("status", args.status!),
        )
        .order("desc")
        .take(candidateLimit);
    } else if (args.assignedToProfileId) {
      rows = await ctx.db
        .query("customerFollowUps")
        .withIndex("by_assignee_date", (q) => q.eq("assignedToProfileId", args.assignedToProfileId!))
        .order("desc")
        .take(candidateLimit);
    } else if (args.customerId) {
      rows = await ctx.db
        .query("customerFollowUps")
        .withIndex("by_customer_date", (q) => q.eq("customerId", args.customerId!))
        .order("desc")
        .take(candidateLimit);
    } else if (branchId && args.status) {
      rows = await ctx.db
        .query("customerFollowUps")
        .withIndex("by_branch_status_date", (q) => q.eq("branchId", branchId).eq("status", args.status!))
        .order("desc")
        .take(candidateLimit);
    } else if (branchId) {
      rows = await ctx.db
        .query("customerFollowUps")
        .withIndex("by_branch_date", (q) => q.eq("branchId", branchId))
        .order("desc")
        .take(candidateLimit);
    } else if (args.status) {
      rows = await ctx.db
        .query("customerFollowUps")
        .withIndex("by_status_date", (q) => q.eq("status", args.status!))
        .order("desc")
        .take(candidateLimit);
    } else {
      rows = await ctx.db
        .query("customerFollowUps")
        .withIndex("by_date")
        .order("desc")
        .take(candidateLimit);
    }

    return rows
      .filter((row) => !branchId || row.branchId === branchId)
      .filter((row) => !args.sourceType || row.sourceType === args.sourceType)
      .filter((row) => !args.sourceId || row.sourceId === args.sourceId)
      .filter((row) => !args.customerId || row.customerId === args.customerId)
      .filter((row) => !args.assignedToProfileId || row.assignedToProfileId === args.assignedToProfileId)
      .filter((row) => !args.status || row.status === args.status)
      .filter((row) => !fromDate || row.followUpDate >= fromDate)
      .filter((row) => !toDate || row.followUpDate <= toDate)
      .filter((row) => canAccessFollowUp(user, row))
      .slice(0, limit)
      .map((row) => presentFollowUp(row, asOfDate));
  },
});

export const create = mutation({
  args: {
    branchId: v.optional(v.id("branches")),
    sourceType: sourceTypeValidator,
    sourceId: v.optional(v.string()),
    customerId: v.optional(v.id("customers")),
    customerName: v.optional(v.string()),
    phone: v.optional(v.string()),
    followUpType: v.string(),
    followUpDate: v.string(),
    assignedToProfileId: v.optional(v.id("userProfiles")),
    status: v.optional(v.union(v.literal("pending"), v.literal("follow_up_later"))),
    notes: v.optional(v.string()),
    creationRequestId: v.string(),
    repairRejectionParty: v.optional(rejectionPartyValidator),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "manage_follow_ups");
    const creationRequestId = requiredText(args.creationRequestId, "معرف طلب الإنشاء", 120);
    const creationKey = `${user.userId}:${creationRequestId}`;
    const existing = await ctx.db
      .query("customerFollowUps")
      .withIndex("by_creation_key", (q) => q.eq("creationKey", creationKey))
      .unique();
    if (existing) {
      assertFollowUpAccess(user, existing);
      return existing._id;
    }

    const branchId = resolveWriteBranch(user, args.branchId);
    if (!branchId) throw new ConvexError("اختر فرع العمل قبل إضافة المتابعة");
    const source = await resolveSourceSnapshot(ctx, user, {
      sourceType: args.sourceType,
      sourceId: args.sourceId,
      repairRejectionParty: args.repairRejectionParty,
    });
    if (source?.branchId && source.branchId !== branchId) {
      throw new ConvexError("مصدر المتابعة لا يتبع فرع العمل المحدد");
    }

    let customerId = source?.customerId ?? args.customerId;
    let customerName = source?.customerName;
    let phone = source?.phone;

    if (args.sourceType === "manual") {
      if (args.customerId) {
        const customer = await ctx.db.get(args.customerId);
        if (!customer) throw new ConvexError("العميل غير موجود");
        if (customer.branchId && customer.branchId !== branchId) {
          throw new ConvexError("العميل لا يتبع فرع العمل المحدد");
        }
        customerId = customer._id;
        customerName = customer.name;
        phone = customer.phone;
      } else {
        customerName = requiredText(args.customerName, "اسم العميل", 200);
        phone = requiredText(args.phone, "هاتف العميل", 60);
      }
    } else if (customerId && (!phone || !customerName)) {
      const customer = await ctx.db.get(customerId);
      if (customer) {
        customerName = customerName || customer.name;
        phone = phone || customer.phone;
      }
    }

    if (!phone) phone = optionalText(args.phone, 60);
    customerName = requiredText(customerName, "اسم العميل", 200);
    phone = requiredText(phone, "هاتف العميل", 60);
    const followUpType = requiredText(args.followUpType, "نوع المتابعة", 200);
    const followUpDate = validDate(args.followUpDate, "تاريخ المتابعة");
    const notes = optionalText(args.notes, 3000);
    const assignee = await resolveAssignee(ctx, user, branchId, args.assignedToProfileId);
    const now = Date.now();
    const status = args.status ?? "pending";

    const id = await ctx.db.insert("customerFollowUps", {
      branchId,
      customerId,
      customerName,
      phone,
      sourceType: args.sourceType,
      sourceId: source?.sourceId,
      sourceNumber: source?.sourceNumber,
      sourceStatus: source?.sourceStatus,
      followUpType,
      followUpDate,
      assignedToProfileId: assignee.assignedToProfileId,
      assignedToName: assignee.assignedToName,
      status,
      notes,
      creationRequestId,
      creationKey,
      createdBy: user.userId,
      createdAt: now,
      updatedBy: user.userId,
      updatedAt: now,
    });

    await logAction(ctx, user, {
      action: "create",
      module: "customer_follow_ups",
      recordId: id,
      recordLabel: `${customerName} - ${followUpType}`,
      details: `إنشاء متابعة للعميل ${customerName}`,
      branchId,
      sourceType: args.sourceType,
      sourceId: source?.sourceId,
      sourceNumber: source?.sourceNumber,
      after: {
        customerName,
        phone,
        followUpType,
        followUpDate,
        assignedTo: assignee.assignedToName,
        status,
        sourceStatus: source?.sourceStatus,
      },
    });
    return id;
  },
});

export const updateDetails = mutation({
  args: {
    id: v.id("customerFollowUps"),
    followUpType: v.optional(v.string()),
    assignedToProfileId: v.optional(v.id("userProfiles")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "manage_follow_ups");
    const followUp = await ctx.db.get(args.id);
    if (!followUp) throw new ConvexError("المتابعة غير موجودة");
    assertFollowUpAccess(user, followUp);
    const followUpType = args.followUpType === undefined
      ? followUp.followUpType
      : requiredText(args.followUpType, "نوع المتابعة", 200);
    const notes = args.notes === undefined ? followUp.notes : optionalText(args.notes, 3000);
    const assignee = args.assignedToProfileId
      ? await resolveAssignee(ctx, user, followUp.branchId, args.assignedToProfileId)
      : { assignedToProfileId: followUp.assignedToProfileId, assignedToName: followUp.assignedToName };
    const now = Date.now();
    await ctx.db.patch(args.id, {
      followUpType,
      notes,
      assignedToProfileId: assignee.assignedToProfileId,
      assignedToName: assignee.assignedToName,
      updatedBy: user.userId,
      updatedAt: now,
    });
    await logAction(ctx, user, {
      action: "update",
      module: "customer_follow_ups",
      recordId: args.id,
      recordLabel: `${followUp.customerName} - ${followUpType}`,
      branchId: followUp.branchId,
      sourceType: followUp.sourceType,
      sourceId: followUp.sourceId,
      sourceNumber: followUp.sourceNumber,
      before: { followUpType: followUp.followUpType, assignedTo: followUp.assignedToName, notes: followUp.notes },
      after: { followUpType, assignedTo: assignee.assignedToName, notes },
    });
  },
});

export const recordContact = mutation({
  args: {
    id: v.id("customerFollowUps"),
    result: v.string(),
    contactedAt: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "manage_follow_ups");
    const followUp = await ctx.db.get(args.id);
    if (!followUp) throw new ConvexError("المتابعة غير موجودة");
    assertFollowUpAccess(user, followUp);
    const result = requiredText(args.result, "نتيجة التواصل", 1000);
    const notes = args.notes === undefined ? followUp.notes : optionalText(args.notes, 3000);
    const contactedAt = args.contactedAt ?? Date.now();
    if (!Number.isFinite(contactedAt) || contactedAt <= 0 || contactedAt > Date.now() + 5 * 60_000) {
      throw new ConvexError("وقت التواصل غير صالح");
    }
    const now = Date.now();
    await ctx.db.patch(args.id, {
      lastContactAt: contactedAt,
      result,
      notes,
      updatedBy: user.userId,
      updatedAt: now,
    });
    await logAction(ctx, user, {
      action: "contact",
      module: "customer_follow_ups",
      recordId: args.id,
      recordLabel: `${followUp.customerName} - ${followUp.followUpType}`,
      branchId: followUp.branchId,
      sourceType: followUp.sourceType,
      sourceId: followUp.sourceId,
      sourceNumber: followUp.sourceNumber,
      before: { lastContactAt: followUp.lastContactAt, result: followUp.result },
      after: { lastContactAt: contactedAt, result },
    });
  },
});

export const reschedule = mutation({
  args: {
    id: v.id("customerFollowUps"),
    followUpDate: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "manage_follow_ups");
    const followUp = await ctx.db.get(args.id);
    if (!followUp) throw new ConvexError("المتابعة غير موجودة");
    assertFollowUpAccess(user, followUp);
    if (followUp.status === "completed") {
      throw new ConvexError("أعد فتح المتابعة المكتملة قبل تحديد متابعة لاحقة");
    }
    const followUpDate = validDate(args.followUpDate, "تاريخ المتابعة");
    const notes = args.notes === undefined ? followUp.notes : optionalText(args.notes, 3000);
    const now = Date.now();
    await ctx.db.patch(args.id, {
      followUpDate,
      status: "follow_up_later",
      notes,
      updatedBy: user.userId,
      updatedAt: now,
    });
    await logAction(ctx, user, {
      action: "reschedule",
      module: "customer_follow_ups",
      recordId: args.id,
      recordLabel: `${followUp.customerName} - ${followUp.followUpType}`,
      branchId: followUp.branchId,
      sourceType: followUp.sourceType,
      sourceId: followUp.sourceId,
      sourceNumber: followUp.sourceNumber,
      before: { followUpDate: followUp.followUpDate, status: followUp.status },
      after: { followUpDate, status: "follow_up_later" },
    });
  },
});

export const complete = mutation({
  args: {
    id: v.id("customerFollowUps"),
    result: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "manage_follow_ups");
    const followUp = await ctx.db.get(args.id);
    if (!followUp) throw new ConvexError("المتابعة غير موجودة");
    assertFollowUpAccess(user, followUp);
    if (followUp.status === "completed") return followUp._id;
    const result = args.result === undefined ? followUp.result : optionalText(args.result, 1000);
    if (!result) throw new ConvexError("اكتب نتيجة المتابعة قبل إكمالها");
    const notes = args.notes === undefined ? followUp.notes : optionalText(args.notes, 3000);
    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "completed",
      result,
      notes,
      completedBy: user.userId,
      completedAt: now,
      updatedBy: user.userId,
      updatedAt: now,
    });
    await logAction(ctx, user, {
      action: "complete",
      module: "customer_follow_ups",
      recordId: args.id,
      recordLabel: `${followUp.customerName} - ${followUp.followUpType}`,
      branchId: followUp.branchId,
      sourceType: followUp.sourceType,
      sourceId: followUp.sourceId,
      sourceNumber: followUp.sourceNumber,
      before: { status: followUp.status, result: followUp.result },
      after: { status: "completed", result, completedAt: now },
    });
    return followUp._id;
  },
});

export const reopen = mutation({
  args: {
    id: v.id("customerFollowUps"),
    followUpDate: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "manage_follow_ups");
    const followUp = await ctx.db.get(args.id);
    if (!followUp) throw new ConvexError("المتابعة غير موجودة");
    assertFollowUpAccess(user, followUp);
    const followUpDate = validDate(args.followUpDate, "تاريخ المتابعة");
    const notes = args.notes === undefined ? followUp.notes : optionalText(args.notes, 3000);
    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "pending",
      followUpDate,
      notes,
      completedBy: undefined,
      completedAt: undefined,
      updatedBy: user.userId,
      updatedAt: now,
    });
    await logAction(ctx, user, {
      action: "reopen",
      module: "customer_follow_ups",
      recordId: args.id,
      recordLabel: `${followUp.customerName} - ${followUp.followUpType}`,
      branchId: followUp.branchId,
      sourceType: followUp.sourceType,
      sourceId: followUp.sourceId,
      sourceNumber: followUp.sourceNumber,
      before: { status: followUp.status, followUpDate: followUp.followUpDate },
      after: { status: "pending", followUpDate },
    });
    return followUp._id;
  },
});
