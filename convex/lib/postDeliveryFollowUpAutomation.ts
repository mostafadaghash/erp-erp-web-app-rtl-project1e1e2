import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { businessDate } from "../../shared/businessDate.ts";
import {
  POST_DELIVERY_FOLLOW_UP_TYPE,
  addDaysToIsoDate,
  buildPostDeliveryFollowUpCreationKey,
  isPostDeliveryAuditTrigger,
  normalizePostDeliveryFollowUpDays,
  sourceTypeFromDeliveryAuditModule,
  type PostDeliveryFollowUpSourceType,
} from "../../shared/postDeliveryFollowUpRules.ts";
import {
  mapDeliverySourceStatus,
  mapOrderSourceStatus,
  mapRepairSourceStatus,
} from "../../shared/customerFollowUpRules.ts";

type DeliverySourceSnapshot = {
  sourceType: PostDeliveryFollowUpSourceType;
  sourceId: string;
  sourceNumber: string;
  sourceStatus: string;
  branchId: Id<"branches">;
  customerId?: Id<"customers">;
  customerName: string;
  phone: string;
  deliveredDate: string;
};

type AutomationResult =
  | { status: "created"; id: Id<"customerFollowUps">; followUpDate: string; delayDays: number }
  | { status: "exists"; id: Id<"customerFollowUps"> }
  | { status: "skipped"; reason: string };

function snapshotValue(
  snapshot: Array<{ field: string; value: string }> | undefined,
  field: string,
): string | undefined {
  const value = snapshot?.find((row) => row.field === field)?.value;
  return value && value !== "—" && value !== "فارغ" ? value : undefined;
}

function auditBusinessDate(audit: Doc<"auditLogs">): string {
  return businessDate(audit.timestamp ?? audit._creationTime);
}

async function resolveSource(
  ctx: MutationCtx,
  audit: Doc<"auditLogs">,
): Promise<DeliverySourceSnapshot | null> {
  if (
    audit.module !== "orders" &&
    audit.module !== "repairs" &&
    audit.module !== "deliveries"
  ) {
    return null;
  }
  const sourceType = sourceTypeFromDeliveryAuditModule(audit.module);
  const rawId = audit.sourceId ?? audit.recordId;
  if (!rawId) return null;

  if (sourceType === "order") {
    const id = ctx.db.normalizeId("orders", rawId);
    if (!id) return null;
    const order = await ctx.db.get(id);
    if (!order || order.status !== "delivered" || !order.branchId) return null;
    const customer = order.customerId ? await ctx.db.get(order.customerId) : null;
    return {
      sourceType,
      sourceId: String(order._id),
      sourceNumber: order.orderNumber,
      sourceStatus: mapOrderSourceStatus(order.status) ?? "تم تسليم الأوردر",
      branchId: order.branchId,
      customerId: order.customerId,
      customerName: order.customerName,
      phone: order.customerPhone?.trim() || customer?.phone?.trim() || "",
      deliveredDate: auditBusinessDate(audit),
    };
  }

  if (sourceType === "repair") {
    const id = ctx.db.normalizeId("repairs", rawId);
    if (!id) return null;
    const repair = await ctx.db.get(id);
    if (!repair || repair.status !== "delivered" || !repair.branchId) return null;
    return {
      sourceType,
      sourceId: String(repair._id),
      sourceNumber: repair.repairNumber,
      sourceStatus: mapRepairSourceStatus(repair.status) ?? "تم التسليم",
      branchId: repair.branchId,
      customerId: repair.customerId,
      customerName: repair.customerName,
      phone: repair.customerPhone.trim(),
      deliveredDate:
        repair.deliveredDate ??
        snapshotValue(audit.afterSnapshot, "date") ??
        auditBusinessDate(audit),
    };
  }

  const id = ctx.db.normalizeId("deliveries", rawId);
  if (!id) return null;
  const delivery = await ctx.db.get(id);
  if (!delivery || delivery.status !== "delivered" || !delivery.branchId) return null;
  return {
    sourceType,
    sourceId: String(delivery._id),
    sourceNumber: delivery.deliveryNumber,
    sourceStatus: mapDeliverySourceStatus(delivery.status) ?? "تم تسليم الأوردر",
    branchId: delivery.branchId,
    customerId: delivery.customerId,
    customerName: delivery.customerName,
    phone: delivery.customerPhone.trim(),
    deliveredDate:
      delivery.deliveredDate ??
      snapshotValue(audit.afterSnapshot, "date") ??
      auditBusinessDate(audit),
  };
}

async function resolveAssignee(
  ctx: MutationCtx,
  branchId: Id<"branches">,
  auditUserId?: string,
) {
  const branchProfiles = (
    await ctx.db
      .query("userProfiles")
      .withIndex("by_branch", (q) => q.eq("branchId", branchId))
      .collect()
  )
    .filter((profile) => profile.isActive)
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));

  const customerService = branchProfiles.find(
    (profile) => profile.role === "customer_service",
  );
  if (customerService) return customerService;

  const manager = branchProfiles.find((profile) => profile.role === "manager");
  if (manager) return manager;

  const actor = auditUserId
    ? branchProfiles.find(
        (profile) =>
          profile.tokenIdentifier === auditUserId || profile.userId === auditUserId,
      )
    : undefined;
  if (actor) return actor;

  if (branchProfiles[0]) return branchProfiles[0];

  const admins = await ctx.db
    .query("userProfiles")
    .withIndex("by_role", (q) => q.eq("role", "admin"))
    .collect();
  return admins
    .filter((profile) => profile.isActive)
    .sort((a, b) => a.name.localeCompare(b.name, "ar"))[0] ?? null;
}

export async function createPostDeliveryFollowUpFromAudit(
  ctx: MutationCtx,
  auditLogId: Id<"auditLogs">,
): Promise<AutomationResult> {
  const audit = await ctx.db.get(auditLogId);
  if (!audit) return { status: "skipped", reason: "audit_missing" };

  const status = snapshotValue(audit.afterSnapshot, "status");
  if (
    !isPostDeliveryAuditTrigger({
      module: audit.module,
      action: audit.action,
      status,
    })
  ) {
    return { status: "skipped", reason: "not_delivery_event" };
  }

  const source = await resolveSource(ctx, audit);
  if (!source) return { status: "skipped", reason: "source_not_eligible" };

  const creationKey = buildPostDeliveryFollowUpCreationKey(
    source.sourceType,
    source.sourceId,
  );
  const existing = await ctx.db
    .query("customerFollowUps")
    .withIndex("by_creation_key", (q) => q.eq("creationKey", creationKey))
    .unique();
  if (existing) return { status: "exists", id: existing._id };

  const settings = await ctx.db.query("settings").first();
  const delayDays = normalizePostDeliveryFollowUpDays(
    settings?.postDeliveryFollowUpDays,
  );
  const followUpDate = addDaysToIsoDate(source.deliveredDate, delayDays);
  const assignee = await resolveAssignee(ctx, source.branchId, audit.userId);
  if (!assignee) return { status: "skipped", reason: "no_active_assignee" };

  const now = Date.now();
  const systemUserId = "system:post_delivery_follow_up";
  const followUpStatus = delayDays === 0 ? "pending" : "follow_up_later";
  const id = await ctx.db.insert("customerFollowUps", {
    branchId: source.branchId,
    customerId: source.customerId,
    customerName: source.customerName,
    phone: source.phone,
    sourceType: source.sourceType,
    sourceId: source.sourceId,
    sourceNumber: source.sourceNumber,
    sourceStatus: source.sourceStatus,
    followUpType: POST_DELIVERY_FOLLOW_UP_TYPE,
    followUpDate,
    assignedToProfileId: assignee._id,
    assignedToName: assignee.name,
    status: followUpStatus,
    notes: `تم إنشاء المتابعة تلقائيًا بعد التسليم. الموعد بعد ${delayDays} يوم.`,
    creationRequestId: creationKey,
    creationKey,
    createdBy: systemUserId,
    createdAt: now,
    updatedBy: systemUserId,
    updatedAt: now,
  });

  await ctx.db.insert("auditLogs", {
    userId: systemUserId,
    userName: "النظام",
    branchId: source.branchId,
    action: "create",
    module: "customer_follow_ups",
    recordId: String(id),
    recordLabel: `${source.customerName} - ${POST_DELIVERY_FOLLOW_UP_TYPE}`,
    details: `إنشاء تلقائي بعد تسليم ${source.sourceNumber} بموعد ${followUpDate}`,
    afterSnapshot: [
      { field: "status", value: followUpStatus },
      { field: "followUpDate", value: followUpDate },
      { field: "followUpType", value: POST_DELIVERY_FOLLOW_UP_TYPE },
      { field: "assignedTo", value: assignee.name },
      { field: "sourceStatus", value: source.sourceStatus },
      { field: "automation", value: "post_delivery" },
    ],
    changedFields: [
      "status",
      "followUpDate",
      "followUpType",
      "assignedTo",
      "sourceStatus",
      "automation",
    ],
    snapshotVersion: 1,
    sourceType: source.sourceType,
    sourceId: source.sourceId,
    sourceNumber: source.sourceNumber,
    relatedType: source.customerId ? "customer" : undefined,
    relatedId: source.customerId ? String(source.customerId) : undefined,
    timestamp: now,
  });

  return { status: "created", id, followUpDate, delayDays };
}
