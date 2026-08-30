import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  assertBranchAccess,
  hasPermission,
  logAction,
  requireAuth,
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
} from "../shared/customerFollowUpRules.ts";
import {
  ACTIVE_DELIVERY_STATUSES,
  ACTIVE_ORDER_STATUSES,
  ACTIVE_REPAIR_STATUSES,
  FOLLOW_UP_ATTENTION_PRIORITY,
  isOperationOverdue,
  roleHasFollowUpWorkspaceAccess,
  shouldSuppressResolvedAttention,
  type FollowUpAttentionKind,
} from "../shared/customerFollowUpWorkspaceRules.ts";

const sourceTypeValidator = v.union(
  v.literal("lead"),
  v.literal("order"),
  v.literal("repair"),
  v.literal("delivery"),
  v.literal("delivered_operation"),
  v.literal("manual"),
);

const attentionSourceTypeValidator = v.union(
  v.literal("order"),
  v.literal("repair"),
  v.literal("delivery"),
);

const listScopeValidator = v.union(
  v.literal("active"),
  v.literal("today"),
  v.literal("overdue"),
  v.literal("later"),
  v.literal("completed"),
  v.literal("all"),
);

const contactChannelValidator = v.union(v.literal("call"), v.literal("whatsapp"));

const SOURCE_VIEW_PERMISSION: Partial<Record<FollowUpSourceType, Permission>> = {
  lead: "view_leads",
  order: "view_orders",
  repair: "view_repairs",
  delivery: "view_deliveries",
  delivered_operation: "view_deliveries",
};

const TIMELINE_ACTIONS = [
  "create",
  "update",
  "contact",
  "reschedule",
  "complete",
  "reopen",
  "note",
  "channel_open",
] as const;

const LEAD_STATUS_LABELS: Record<string, string> = {
  new: "جديد",
  contacted: "تم التواصل",
  interested: "مهتم",
  negotiating: "تفاوض",
  won: "تم البيع",
  lost: "لم تتم العملية",
};

function cleanRequired(value: string | undefined, label: string, maxLength = 500): string {
  const normalized = value?.trim().replace(/\s+/g, " ");
  if (!normalized) throw new ConvexError(`${label} مطلوب`);
  if (normalized.length > maxLength) throw new ConvexError(`${label} أطول من الحد المسموح`);
  return normalized;
}

function cleanOptional(value: string | undefined, maxLength = 3000): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (normalized.length > maxLength) throw new ConvexError("النص أطول من الحد المسموح");
  return normalized;
}

function validIsoDate(value: string, label: string): string {
  if (!isValidIsoDate(value)) throw new ConvexError(`${label} غير صالح`);
  return value;
}

async function requireWorkspaceUser(
  ctx: QueryCtx | MutationCtx,
  mode: "view" | "manage",
): Promise<AuthUser> {
  const user = await requireAuth(ctx);
  const permission: Permission = mode === "view" ? "view_follow_ups" : "manage_follow_ups";
  if (!hasPermission(user, permission) && !roleHasFollowUpWorkspaceAccess(user.role)) {
    throw new ConvexError(
      mode === "view"
        ? "ليس لديك صلاحية لعرض متابعات العملاء"
        : "ليس لديك صلاحية لإدارة متابعات العملاء",
    );
  }
  return user;
}

function canViewSource(user: AuthUser, sourceType: FollowUpSourceType): boolean {
  if (sourceType === "manual" || user.role === "admin") return true;
  if (
    user.role === "customer_service" &&
    (sourceType === "delivery" || sourceType === "delivered_operation")
  ) {
    return true;
  }
  const permission = SOURCE_VIEW_PERMISSION[sourceType];
  return Boolean(permission && hasPermission(user, permission));
}

function canAccessFollowUp(user: AuthUser, followUp: Doc<"customerFollowUps">): boolean {
  if (user.role === "admin") return true;
  if (!user.branchId || followUp.branchId !== user.branchId) return false;
  if (user.role === "manager") return true;
  if (followUp.sourceType === "manual") {
    return (
      followUp.assignedToProfileId === user.employeeId ||
      followUp.createdBy === user.userId ||
      hasPermission(user, "view_customers") ||
      user.role === "customer_service"
    );
  }
  return canViewSource(user, followUp.sourceType);
}

function assertFollowUpAccess(user: AuthUser, followUp: Doc<"customerFollowUps">): void {
  assertBranchAccess(user, followUp);
  if (!canAccessFollowUp(user, followUp)) {
    throw new ConvexError("ليس لديك صلاحية للوصول إلى هذه المتابعة");
  }
}

function resolveReadBranch(
  user: AuthUser,
  requested?: Id<"branches">,
): Id<"branches"> | undefined {
  if (user.role === "admin") return requested ?? user.branchId;
  if (!user.branchId) throw new ConvexError("يجب ربط الحساب بفرع قبل عرض المتابعات");
  if (requested && requested !== user.branchId) {
    throw new ConvexError("ليس لديك صلاحية للوصول إلى بيانات هذا الفرع");
  }
  return user.branchId;
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

function snapshotValue(
  snapshot: Array<{ field: string; value: string }> | undefined,
  field: string,
): string | undefined {
  return snapshot?.find((row) => row.field === field)?.value;
}

function sourceKey(sourceType: string, sourceId?: string): string | undefined {
  return sourceId ? `${sourceType}:${sourceId}` : undefined;
}

function activityContent(log: Doc<"auditLogs">): {
  title: string;
  content?: string;
  channel?: "call" | "whatsapp";
} {
  const result = snapshotValue(log.afterSnapshot, "result");
  const note = snapshotValue(log.afterSnapshot, "note");
  const date = snapshotValue(log.afterSnapshot, "followUpDate");
  const channelRaw = snapshotValue(log.afterSnapshot, "channel");
  const channel = channelRaw === "call" || channelRaw === "whatsapp" ? channelRaw : undefined;

  switch (log.action) {
    case "create":
      return { title: "تم إنشاء المتابعة", content: log.details };
    case "channel_open":
      return {
        title: channel === "whatsapp" ? "فتح واتساب" : "بدء اتصال",
        content: log.details,
        channel,
      };
    case "contact":
      return {
        title: channel === "whatsapp" ? "نتيجة واتساب" : channel === "call" ? "نتيجة اتصال" : "نتيجة تواصل",
        content: result || log.details,
        channel,
      };
    case "note":
      return { title: "ملاحظة", content: note || log.details };
    case "reschedule":
      return { title: "تحديد متابعة لاحقة", content: date ? `موعد المتابعة: ${date}` : log.details };
    case "complete":
      return { title: "إتمام المتابعة", content: result || log.details };
    case "reopen":
      return { title: "إعادة فتح المتابعة", content: date ? `موعد المتابعة الجديد: ${date}` : log.details };
    default:
      return { title: "تعديل بيانات المتابعة", content: log.details };
  }
}

type SourceSnapshot = {
  sourceType: "order" | "repair" | "delivery";
  sourceId: string;
  sourceNumber: string;
  sourceStatus: string;
  customerId?: Id<"customers">;
  customerName: string;
  phone: string;
  branchId: Id<"branches">;
};

async function resolveAttentionSource(
  ctx: MutationCtx,
  user: AuthUser,
  sourceType: "order" | "repair" | "delivery",
  rawSourceId: string,
): Promise<SourceSnapshot> {
  if (!canViewSource(user, sourceType)) {
    throw new ConvexError("ليس لديك صلاحية للوصول إلى مصدر هذه المتابعة");
  }
  if (sourceType === "order") {
    const id = ctx.db.normalizeId("orders", rawSourceId);
    if (!id) throw new ConvexError("أمر البيع غير صالح");
    const order = await ctx.db.get(id);
    if (!order || !order.branchId) throw new ConvexError("أمر البيع غير موجود أو غير مربوط بفرع");
    const shippedDelivery = await ctx.db
      .query("deliveries")
      .withIndex("by_order_status", (q) => q.eq("orderId", id).eq("status", "shipped"))
      .first();
    let phone = order.customerPhone;
    if (!phone && order.customerId) phone = (await ctx.db.get(order.customerId))?.phone;
    return {
      sourceType,
      sourceId: String(id),
      sourceNumber: order.orderNumber,
      sourceStatus: mapOrderSourceStatus(order.status, Boolean(shippedDelivery)) ?? order.status,
      customerId: order.customerId,
      customerName: order.customerName,
      phone: cleanRequired(phone, "هاتف العميل", 60),
      branchId: order.branchId,
    };
  }

  if (sourceType === "repair") {
    const id = ctx.db.normalizeId("repairs", rawSourceId);
    if (!id) throw new ConvexError("أمر الصيانة غير صالح");
    const repair = await ctx.db.get(id);
    if (!repair || !repair.branchId) throw new ConvexError("أمر الصيانة غير موجود أو غير مربوط بفرع");
    return {
      sourceType,
      sourceId: String(id),
      sourceNumber: repair.repairNumber,
      sourceStatus:
        mapRepairSourceStatus(repair.status, repair.cancellationReason) ?? repair.status,
      customerId: repair.customerId,
      customerName: repair.customerName,
      phone: cleanRequired(repair.customerPhone, "هاتف العميل", 60),
      branchId: repair.branchId,
    };
  }

  const id = ctx.db.normalizeId("deliveries", rawSourceId);
  if (!id) throw new ConvexError("الشحنة غير صالحة");
  const delivery = await ctx.db.get(id);
  if (!delivery || !delivery.branchId) throw new ConvexError("الشحنة غير موجودة أو غير مربوطة بفرع");
  return {
    sourceType,
    sourceId: String(id),
    sourceNumber: delivery.deliveryNumber,
    sourceStatus: mapDeliverySourceStatus(delivery.status) ?? delivery.status,
    customerId: delivery.customerId,
    customerName: delivery.customerName,
    phone: cleanRequired(delivery.customerPhone, "هاتف العميل", 60),
    branchId: delivery.branchId,
  };
}

async function currentSourceDetails(
  ctx: QueryCtx,
  user: AuthUser,
  followUp: Doc<"customerFollowUps">,
) {
  if (!followUp.sourceId || followUp.sourceType === "manual") {
    return {
      sourceType: "manual" as const,
      sourceNumber: followUp.sourceNumber,
      status: followUp.sourceStatus ?? "متابعة مستقلة",
      updatedAt: followUp.updatedAt,
      expectedDate: undefined,
      description: followUp.followUpType,
    };
  }
  if (!canViewSource(user, followUp.sourceType)) return null;

  if (followUp.sourceType === "lead") {
    const id = ctx.db.normalizeId("leads", followUp.sourceId);
    const lead = id ? await ctx.db.get(id) : null;
    if (!lead) return null;
    return {
      sourceType: "lead" as const,
      sourceNumber: followUp.sourceNumber,
      status: LEAD_STATUS_LABELS[lead.status] ?? lead.status,
      updatedAt: lead._creationTime,
      updatedDate: lead.lastContactDate,
      expectedDate: lead.nextFollowUpDate,
      description: lead.interest ?? "فرصة بيع",
    };
  }

  if (followUp.sourceType === "order") {
    const id = ctx.db.normalizeId("orders", followUp.sourceId);
    const order = id ? await ctx.db.get(id) : null;
    if (!order) return null;
    const shippedDelivery = await ctx.db
      .query("deliveries")
      .withIndex("by_order_status", (q) => q.eq("orderId", id!).eq("status", "shipped"))
      .first();
    return {
      sourceType: "order" as const,
      sourceNumber: order.orderNumber,
      status: mapOrderSourceStatus(order.status, Boolean(shippedDelivery)) ?? order.status,
      updatedAt: Math.max(order._creationTime, shippedDelivery?._creationTime ?? 0),
      expectedDate: order.expectedDate,
      description: `${order.items.length} صنف — إجمالي ${order.total}`,
    };
  }

  if (followUp.sourceType === "repair") {
    const id = ctx.db.normalizeId("repairs", followUp.sourceId);
    const repair = id ? await ctx.db.get(id) : null;
    if (!repair) return null;
    const latestStatus = await ctx.db
      .query("repairStatusHistory")
      .withIndex("by_repair_date", (q) => q.eq("repairId", id!))
      .order("desc")
      .first();
    return {
      sourceType: "repair" as const,
      sourceNumber: repair.repairNumber,
      status:
        mapRepairSourceStatus(repair.status, repair.cancellationReason) ??
        followUp.sourceStatus ??
        repair.status,
      updatedAt: latestStatus?.changedAt ?? repair._creationTime,
      expectedDate: repair.expectedDate,
      description: [repair.deviceBrand, repair.deviceModel, repair.deviceType].filter(Boolean).join(" "),
    };
  }

  const id = ctx.db.normalizeId("deliveries", followUp.sourceId);
  const delivery = id ? await ctx.db.get(id) : null;
  if (!delivery) return null;
  let updatedAt = delivery._creationTime;
  if (delivery.currentConfirmationId) {
    const confirmation = await ctx.db.get(delivery.currentConfirmationId);
    if (confirmation) updatedAt = Math.max(updatedAt, confirmation.createdAt);
  }
  return {
    sourceType: followUp.sourceType,
    sourceNumber: delivery.deliveryNumber,
    status: mapDeliverySourceStatus(delivery.status) ?? delivery.status,
    updatedAt,
    updatedDate: delivery.deliveredDate,
    expectedDate: delivery.expectedDate,
    description: `${delivery.shippingCompany}${delivery.trackingNumber ? ` — ${delivery.trackingNumber}` : ""}`,
  };
}

export const list = query({
  args: {
    branchId: v.optional(v.id("branches")),
    scope: v.optional(listScopeValidator),
    mineOnly: v.optional(v.boolean()),
    asOfDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireWorkspaceUser(ctx, "view");
    const branchId = resolveReadBranch(user, args.branchId);
    if (!branchId) return [];
    const asOfDate = validIsoDate(args.asOfDate ?? businessDate(), "تاريخ التقييم");
    const scope = args.scope ?? "active";
    const rows = args.mineOnly
      ? await ctx.db
          .query("customerFollowUps")
          .withIndex("by_assignee_date", (q) => q.eq("assignedToProfileId", user.employeeId))
          .collect()
      : await ctx.db
          .query("customerFollowUps")
          .withIndex("by_branch_date", (q) => q.eq("branchId", branchId))
          .collect();

    const visible = rows
      .filter((row) => row.branchId === branchId)
      .filter((row) => canAccessFollowUp(user, row))
      .map((row) => presentFollowUp(row, asOfDate))
      .filter((row) => {
        if (scope === "all") return true;
        if (scope === "active") return row.status !== "completed";
        if (scope === "completed") return row.status === "completed";
        if (scope === "today") return row.status !== "completed" && row.followUpDate === asOfDate;
        if (scope === "overdue") return row.status !== "completed" && row.followUpDate < asOfDate;
        return row.status === "follow_up_later" && row.followUpDate > asOfDate;
      });

    const rank: Record<string, number> = {
      overdue: 0,
      today: 1,
      needs_follow_up: 2,
      follow_up_later: 3,
      completed: 4,
    };
    return visible.sort((a, b) => {
      const rankDiff = (rank[a.commercialStatus] ?? 9) - (rank[b.commercialStatus] ?? 9);
      if (rankDiff !== 0) return rankDiff;
      if (a.followUpDate !== b.followUpDate) return a.followUpDate.localeCompare(b.followUpDate);
      return b.updatedAt - a.updatedAt;
    });
  },
});

export const attentionDashboard = query({
  args: {
    branchId: v.optional(v.id("branches")),
    asOfDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireWorkspaceUser(ctx, "view");
    const branchId = resolveReadBranch(user, args.branchId);
    const asOfDate = validIsoDate(args.asOfDate ?? businessDate(), "تاريخ التقييم");
    const emptyCounts = {
      followUpsToday: 0,
      followUpsOverdue: 0,
      overdueOrders: 0,
      readyOrders: 0,
      repairedWaitingCustomer: 0,
      overdueRepairs: 0,
      overdueDeliveries: 0,
    };
    if (!branchId) {
      return { requiresBranchSelection: true, counts: emptyCounts, alerts: [] };
    }

    const [pendingFollowUps, laterFollowUps, completedFollowUps] = await Promise.all([
      ctx.db
        .query("customerFollowUps")
        .withIndex("by_branch_status_date", (q) => q.eq("branchId", branchId).eq("status", "pending"))
        .collect(),
      ctx.db
        .query("customerFollowUps")
        .withIndex("by_branch_status_date", (q) => q.eq("branchId", branchId).eq("status", "follow_up_later"))
        .collect(),
      ctx.db
        .query("customerFollowUps")
        .withIndex("by_branch_status_date", (q) => q.eq("branchId", branchId).eq("status", "completed"))
        .collect(),
    ]);

    const openFollowUps = [...pendingFollowUps, ...laterFollowUps].filter((row) =>
      canAccessFollowUp(user, row),
    );
    const visibleCompleted = completedFollowUps.filter((row) => canAccessFollowUp(user, row));
    const openBySource = new Map<string, Doc<"customerFollowUps">>();
    for (const row of openFollowUps) {
      const key = sourceKey(row.sourceType, row.sourceId);
      if (!key) continue;
      const existing = openBySource.get(key);
      if (!existing || row.updatedAt > existing.updatedAt) openBySource.set(key, row);
    }
    const completedBySource = new Map<string, Doc<"customerFollowUps">>();
    for (const row of visibleCompleted) {
      const key = sourceKey(row.sourceType, row.sourceId);
      if (!key) continue;
      const existing = completedBySource.get(key);
      if (!existing || (row.completedAt ?? row.updatedAt) > (existing.completedAt ?? existing.updatedAt)) {
        completedBySource.set(key, row);
      }
    }

    const orderRows = canViewSource(user, "order")
      ? (
          await Promise.all(
            ACTIVE_ORDER_STATUSES.map((status) =>
              ctx.db
                .query("orders")
                .withIndex("by_branch_status", (q) => q.eq("branchId", branchId).eq("status", status))
                .collect(),
            ),
          )
        ).flat()
      : [];
    const repairRows = canViewSource(user, "repair")
      ? (
          await Promise.all(
            ACTIVE_REPAIR_STATUSES.map((status) =>
              ctx.db
                .query("repairs")
                .withIndex("by_branch_status", (q) => q.eq("branchId", branchId).eq("status", status))
                .collect(),
            ),
          )
        ).flat()
      : [];
    const deliveryRows = canViewSource(user, "delivery")
      ? (
          await Promise.all(
            ACTIVE_DELIVERY_STATUSES.map((status) =>
              ctx.db
                .query("deliveries")
                .withIndex("by_branch_status", (q) => q.eq("branchId", branchId).eq("status", status))
                .collect(),
            ),
          )
        ).flat()
      : [];

    const overdueOrders = orderRows.filter((row) =>
      isOperationOverdue(row.expectedDate, row.status, asOfDate, ACTIVE_ORDER_STATUSES),
    );
    const readyOrders = orderRows.filter((row) => row.status === "ready");
    const overdueRepairs = repairRows.filter((row) =>
      isOperationOverdue(row.expectedDate, row.status, asOfDate, ACTIVE_REPAIR_STATUSES),
    );
    const readyRepairs = repairRows.filter((row) => row.status === "ready");
    const overdueDeliveries = deliveryRows.filter((row) =>
      isOperationOverdue(row.expectedDate, row.status, asOfDate, ACTIVE_DELIVERY_STATUSES),
    );

    type AlertRow = {
      key: string;
      kind: FollowUpAttentionKind;
      priority: number;
      sourceType: "order" | "repair" | "delivery";
      sourceId: string;
      sourceNumber: string;
      customerName: string;
      phone: string;
      sourceStatus: string;
      dueDate?: string;
      reason: string;
      followUpId?: Id<"customerFollowUps">;
    };
    const alerts = new Map<string, AlertRow>();

    const addAlert = (alert: Omit<AlertRow, "key" | "followUpId">) => {
      const key = `${alert.sourceType}:${alert.sourceId}`;
      const open = openBySource.get(key);
      const completed = completedBySource.get(key);
      if (
        shouldSuppressResolvedAttention({
          currentSourceStatus: alert.sourceStatus,
          completedSourceStatus: completed?.sourceStatus,
          hasOpenFollowUp: Boolean(open),
        })
      ) {
        return;
      }
      const candidate: AlertRow = { ...alert, key, followUpId: open?._id };
      const existing = alerts.get(key);
      if (!existing || candidate.priority > existing.priority) alerts.set(key, candidate);
    };

    for (const repair of readyRepairs) {
      addAlert({
        kind: "repair_ready",
        priority: FOLLOW_UP_ATTENTION_PRIORITY.repair_ready,
        sourceType: "repair",
        sourceId: String(repair._id),
        sourceNumber: repair.repairNumber,
        customerName: repair.customerName,
        phone: repair.customerPhone,
        sourceStatus: mapRepairSourceStatus(repair.status, repair.cancellationReason) ?? "تم الإصلاح",
        dueDate: repair.expectedDate,
        reason: "تم الإصلاح — مطلوب التواصل مع العميل لتحديد موعد الاستلام.",
      });
    }
    for (const order of overdueOrders) {
      addAlert({
        kind: "order_overdue",
        priority: FOLLOW_UP_ATTENTION_PRIORITY.order_overdue,
        sourceType: "order",
        sourceId: String(order._id),
        sourceNumber: order.orderNumber,
        customerName: order.customerName,
        phone: order.customerPhone ?? "",
        sourceStatus: mapOrderSourceStatus(order.status) ?? order.status,
        dueDate: order.expectedDate,
        reason: `أمر البيع تجاوز الموعد المتوقع وما زال ${mapOrderSourceStatus(order.status) ?? order.status}.`,
      });
    }
    for (const repair of overdueRepairs) {
      addAlert({
        kind: "repair_overdue",
        priority: FOLLOW_UP_ATTENTION_PRIORITY.repair_overdue,
        sourceType: "repair",
        sourceId: String(repair._id),
        sourceNumber: repair.repairNumber,
        customerName: repair.customerName,
        phone: repair.customerPhone,
        sourceStatus: mapRepairSourceStatus(repair.status, repair.cancellationReason) ?? repair.status,
        dueDate: repair.expectedDate,
        reason: `الصيانة تجاوزت الموعد المتوقع وما زالت ${mapRepairSourceStatus(repair.status, repair.cancellationReason) ?? repair.status}.`,
      });
    }
    for (const delivery of overdueDeliveries) {
      addAlert({
        kind: "delivery_overdue",
        priority: FOLLOW_UP_ATTENTION_PRIORITY.delivery_overdue,
        sourceType: "delivery",
        sourceId: String(delivery._id),
        sourceNumber: delivery.deliveryNumber,
        customerName: delivery.customerName,
        phone: delivery.customerPhone,
        sourceStatus: mapDeliverySourceStatus(delivery.status) ?? delivery.status,
        dueDate: delivery.expectedDate,
        reason: `الشحنة تجاوزت الموعد المتوقع وما زالت ${mapDeliverySourceStatus(delivery.status) ?? delivery.status}.`,
      });
    }
    for (const order of readyOrders) {
      addAlert({
        kind: "order_ready",
        priority: FOLLOW_UP_ATTENTION_PRIORITY.order_ready,
        sourceType: "order",
        sourceId: String(order._id),
        sourceNumber: order.orderNumber,
        customerName: order.customerName,
        phone: order.customerPhone ?? "",
        sourceStatus: "تم التجهيز",
        dueDate: order.expectedDate,
        reason: "تم تجهيز أمر البيع — يحتاج متابعة لتأكيد الشحن أو الاستلام.",
      });
    }

    return {
      requiresBranchSelection: false,
      counts: {
        followUpsToday: openFollowUps.filter((row) => row.followUpDate === asOfDate).length,
        followUpsOverdue: openFollowUps.filter((row) => row.followUpDate < asOfDate).length,
        overdueOrders: overdueOrders.length,
        readyOrders: readyOrders.length,
        repairedWaitingCustomer: readyRepairs.length,
        overdueRepairs: overdueRepairs.length,
        overdueDeliveries: overdueDeliveries.length,
      },
      alerts: [...alerts.values()]
        .sort((a, b) => {
          if (a.priority !== b.priority) return b.priority - a.priority;
          return (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31");
        })
        .slice(0, 50),
    };
  },
});

export const getDetails = query({
  args: { id: v.id("customerFollowUps"), asOfDate: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireWorkspaceUser(ctx, "view");
    const followUp = await ctx.db.get(args.id);
    if (!followUp) return null;
    assertFollowUpAccess(user, followUp);
    const asOfDate = validIsoDate(args.asOfDate ?? businessDate(), "تاريخ التقييم");
    const customer = followUp.customerId ? await ctx.db.get(followUp.customerId) : null;
    const source = await currentSourceDetails(ctx, user, followUp);

    const auditGroups = await Promise.all(
      TIMELINE_ACTIONS.map((action) =>
        ctx.db
          .query("auditLogs")
          .withIndex("by_module_action", (q) =>
            q.eq("module", "customer_follow_ups").eq("action", action),
          )
          .filter((q) => q.eq(q.field("recordId"), String(args.id)))
          .collect(),
      ),
    );
    const auditEvents = auditGroups.flat().map((log) => {
      const rendered = activityContent(log);
      return {
        id: `audit:${log._id}`,
        type: log.action,
        title: rendered.title,
        content: rendered.content,
        channel: rendered.channel,
        performedBy: log.userName ?? "النظام",
        timestamp: log.timestamp ?? log._creationTime,
      };
    });

    let relatedRows: Doc<"customerFollowUps">[] = [];
    if (followUp.customerId) {
      relatedRows = await ctx.db
        .query("customerFollowUps")
        .withIndex("by_customer_date", (q) => q.eq("customerId", followUp.customerId))
        .collect();
    } else {
      relatedRows = (
        await ctx.db
          .query("customerFollowUps")
          .withIndex("by_branch_date", (q) => q.eq("branchId", followUp.branchId))
          .collect()
      ).filter((row) => row.phone === followUp.phone);
    }
    const previousFollowUpEvents = relatedRows
      .filter((row) => row._id !== followUp._id)
      .filter((row) => canAccessFollowUp(user, row))
      .map((row) => ({
        id: `followup:${row._id}`,
        type: "previous_follow_up",
        title: `متابعة سابقة: ${row.followUpType}`,
        content: row.result ?? row.notes ?? FOLLOW_UP_COMMERCIAL_STATUS_LABELS[deriveFollowUpCommercialStatus({
          status: row.status,
          followUpDate: row.followUpDate,
          asOfDate,
        })],
        channel: undefined,
        performedBy: row.assignedToName,
        timestamp: row.completedAt ?? row.updatedAt ?? row.createdAt,
      }));

    let leadEvents: Array<{
      id: string;
      type: string;
      title: string;
      content?: string;
      channel?: "call" | "whatsapp";
      performedBy: string;
      timestamp: number;
    }> = [];
    if (followUp.sourceType === "lead" && followUp.sourceId && canViewSource(user, "lead")) {
      const leadId = ctx.db.normalizeId("leads", followUp.sourceId);
      if (leadId) {
        const activities = await ctx.db
          .query("leadActivities")
          .withIndex("by_lead", (q) => q.eq("leadId", leadId))
          .collect();
        leadEvents = activities.map((activity) => ({
          id: `lead:${activity._id}`,
          type: activity.type,
          title:
            activity.type === "call"
              ? "اتصال سابق"
              : activity.type === "whatsapp"
                ? "واتساب سابق"
                : "نشاط سابق",
          content: activity.outcome ?? activity.notes,
          channel:
            activity.type === "call"
              ? "call"
              : activity.type === "whatsapp"
                ? "whatsapp"
                : undefined,
          performedBy: activity.createdBy ?? "موظف",
          timestamp: activity._creationTime,
        }));
      }
    }

    const contactNumbers = [...new Set([followUp.phone, customer?.phone].filter((phone): phone is string => Boolean(phone?.trim())))];
    const timeline = [...auditEvents, ...previousFollowUpEvents, ...leadEvents]
      .sort((a, b) => b.timestamp - a.timestamp);

    if (!auditEvents.some((event) => event.type === "create")) {
      timeline.push({
        id: `synthetic:${followUp._id}`,
        type: "create",
        title: "تم إنشاء المتابعة",
        content: followUp.notes,
        channel: undefined,
        performedBy: followUp.assignedToName,
        timestamp: followUp.createdAt,
      });
      timeline.sort((a, b) => b.timestamp - a.timestamp);
    }

    return {
      followUp: presentFollowUp(followUp, asOfDate),
      customer: {
        id: followUp.customerId,
        name: customer?.name ?? followUp.customerName,
        contactNumbers,
        email: customer?.email,
        address: customer?.address,
      },
      source,
      timeline,
    };
  },
});

export const createFromAttention = mutation({
  args: {
    branchId: v.optional(v.id("branches")),
    sourceType: attentionSourceTypeValidator,
    sourceId: v.string(),
    reason: v.string(),
    asOfDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireWorkspaceUser(ctx, "manage");
    const branchId = resolveWriteBranch(user, args.branchId);
    if (!branchId) throw new ConvexError("اختر فرع العمل قبل إنشاء المتابعة");
    const asOfDate = validIsoDate(args.asOfDate ?? businessDate(), "تاريخ المتابعة");
    const source = await resolveAttentionSource(ctx, user, args.sourceType, cleanRequired(args.sourceId, "مصدر المتابعة", 200));
    if (source.branchId !== branchId) throw new ConvexError("مصدر المتابعة لا يتبع فرع العمل الحالي");

    const existingOpen = (
      await ctx.db
        .query("customerFollowUps")
        .withIndex("by_source", (q) => q.eq("sourceType", source.sourceType).eq("sourceId", source.sourceId))
        .collect()
    )
      .filter((row) => row.branchId === branchId && row.status !== "completed")
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (existingOpen) {
      assertFollowUpAccess(user, existingOpen);
      return existingOpen._id;
    }

    const reason = cleanRequired(args.reason, "سبب المتابعة", 500);
    const creationRequestId = `attention:${source.sourceType}:${source.sourceId}:${source.sourceStatus}:${asOfDate}`;
    const creationKey = `${user.userId}:${creationRequestId}`;
    const duplicate = await ctx.db
      .query("customerFollowUps")
      .withIndex("by_creation_key", (q) => q.eq("creationKey", creationKey))
      .unique();
    if (duplicate) return duplicate._id;
    const now = Date.now();
    const id = await ctx.db.insert("customerFollowUps", {
      branchId,
      customerId: source.customerId,
      customerName: source.customerName,
      phone: source.phone,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      sourceNumber: source.sourceNumber,
      sourceStatus: source.sourceStatus,
      followUpType: reason,
      followUpDate: asOfDate,
      assignedToProfileId: user.employeeId,
      assignedToName: user.name,
      status: "pending",
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
      recordLabel: `${source.customerName} - ${reason}`,
      details: reason,
      branchId,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      sourceNumber: source.sourceNumber,
      after: {
        customerName: source.customerName,
        phone: source.phone,
        followUpType: reason,
        followUpDate: asOfDate,
        assignedTo: user.name,
        status: "pending",
        sourceStatus: source.sourceStatus,
      },
    });
    return id;
  },
});

export const createManual = mutation({
  args: {
    branchId: v.optional(v.id("branches")),
    customerName: v.string(),
    phone: v.string(),
    followUpType: v.string(),
    followUpDate: v.string(),
    notes: v.optional(v.string()),
    creationRequestId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireWorkspaceUser(ctx, "manage");
    const branchId = resolveWriteBranch(user, args.branchId);
    if (!branchId) throw new ConvexError("اختر فرع العمل قبل إنشاء المتابعة");
    const customerName = cleanRequired(args.customerName, "اسم العميل", 200);
    const phone = cleanRequired(args.phone, "هاتف العميل", 60);
    const followUpType = cleanRequired(args.followUpType, "نوع المتابعة", 300);
    const followUpDate = validIsoDate(args.followUpDate, "تاريخ المتابعة");
    const notes = cleanOptional(args.notes);
    const creationRequestId = cleanRequired(args.creationRequestId, "معرف طلب الإنشاء", 160);
    const creationKey = `${user.userId}:${creationRequestId}`;
    const duplicate = await ctx.db
      .query("customerFollowUps")
      .withIndex("by_creation_key", (q) => q.eq("creationKey", creationKey))
      .unique();
    if (duplicate) return duplicate._id;
    const now = Date.now();
    const id = await ctx.db.insert("customerFollowUps", {
      branchId,
      customerName,
      phone,
      sourceType: "manual",
      followUpType,
      followUpDate,
      assignedToProfileId: user.employeeId,
      assignedToName: user.name,
      status: "pending",
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
      details: notes ?? followUpType,
      branchId,
      sourceType: "manual",
      after: {
        customerName,
        phone,
        followUpType,
        followUpDate,
        assignedTo: user.name,
        status: "pending",
      },
    });
    return id;
  },
});

async function getEditableFollowUp(ctx: MutationCtx, user: AuthUser, id: Id<"customerFollowUps">) {
  const followUp = await ctx.db.get(id);
  if (!followUp) throw new ConvexError("المتابعة غير موجودة");
  assertFollowUpAccess(user, followUp);
  return followUp;
}

export const recordChannelOpen = mutation({
  args: { id: v.id("customerFollowUps"), channel: contactChannelValidator },
  handler: async (ctx, args) => {
    const user = await requireWorkspaceUser(ctx, "manage");
    const followUp = await getEditableFollowUp(ctx, user, args.id);
    if (followUp.status === "completed") throw new ConvexError("أعد فتح المتابعة قبل تسجيل تواصل جديد");
    const now = Date.now();
    await ctx.db.patch(args.id, { lastContactAt: now, updatedBy: user.userId, updatedAt: now });
    await logAction(ctx, user, {
      action: "channel_open",
      module: "customer_follow_ups",
      recordId: args.id,
      recordLabel: `${followUp.customerName} - ${followUp.followUpType}`,
      details: args.channel === "call" ? "تم بدء محاولة اتصال بالعميل" : "تم فتح محادثة واتساب مع العميل",
      branchId: followUp.branchId,
      sourceType: followUp.sourceType,
      sourceId: followUp.sourceId,
      sourceNumber: followUp.sourceNumber,
      after: { channel: args.channel, lastContactAt: now },
    });
  },
});

export const recordContact = mutation({
  args: {
    id: v.id("customerFollowUps"),
    channel: v.optional(contactChannelValidator),
    result: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireWorkspaceUser(ctx, "manage");
    const followUp = await getEditableFollowUp(ctx, user, args.id);
    if (followUp.status === "completed") throw new ConvexError("أعد فتح المتابعة قبل تسجيل تواصل جديد");
    const result = cleanRequired(args.result, "نتيجة التواصل", 1000);
    const now = Date.now();
    await ctx.db.patch(args.id, {
      lastContactAt: now,
      result,
      updatedBy: user.userId,
      updatedAt: now,
    });
    await logAction(ctx, user, {
      action: "contact",
      module: "customer_follow_ups",
      recordId: args.id,
      recordLabel: `${followUp.customerName} - ${followUp.followUpType}`,
      details: result,
      branchId: followUp.branchId,
      sourceType: followUp.sourceType,
      sourceId: followUp.sourceId,
      sourceNumber: followUp.sourceNumber,
      before: { lastContactAt: followUp.lastContactAt, result: followUp.result },
      after: { channel: args.channel, lastContactAt: now, result },
    });
  },
});

export const addNote = mutation({
  args: { id: v.id("customerFollowUps"), note: v.string() },
  handler: async (ctx, args) => {
    const user = await requireWorkspaceUser(ctx, "manage");
    const followUp = await getEditableFollowUp(ctx, user, args.id);
    const note = cleanRequired(args.note, "الملاحظة", 3000);
    const now = Date.now();
    await ctx.db.patch(args.id, { notes: note, updatedBy: user.userId, updatedAt: now });
    await logAction(ctx, user, {
      action: "note",
      module: "customer_follow_ups",
      recordId: args.id,
      recordLabel: `${followUp.customerName} - ${followUp.followUpType}`,
      details: note,
      branchId: followUp.branchId,
      sourceType: followUp.sourceType,
      sourceId: followUp.sourceId,
      sourceNumber: followUp.sourceNumber,
      after: { note },
    });
  },
});

export const reschedule = mutation({
  args: { id: v.id("customerFollowUps"), followUpDate: v.string(), notes: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireWorkspaceUser(ctx, "manage");
    const followUp = await getEditableFollowUp(ctx, user, args.id);
    if (followUp.status === "completed") throw new ConvexError("أعد فتح المتابعة المكتملة أولًا");
    const followUpDate = validIsoDate(args.followUpDate, "تاريخ المتابعة");
    const notes = args.notes === undefined ? followUp.notes : cleanOptional(args.notes);
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
      details: `تم تحديد متابعة لاحقة في ${followUpDate}`,
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
  args: { id: v.id("customerFollowUps"), result: v.string(), notes: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireWorkspaceUser(ctx, "manage");
    const followUp = await getEditableFollowUp(ctx, user, args.id);
    if (followUp.status === "completed") return followUp._id;
    const result = cleanRequired(args.result, "نتيجة المتابعة", 1000);
    const notes = args.notes === undefined ? followUp.notes : cleanOptional(args.notes);
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
      details: result,
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
  args: { id: v.id("customerFollowUps"), followUpDate: v.string(), notes: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireWorkspaceUser(ctx, "manage");
    const followUp = await getEditableFollowUp(ctx, user, args.id);
    const followUpDate = validIsoDate(args.followUpDate, "تاريخ المتابعة");
    const notes = args.notes === undefined ? followUp.notes : cleanOptional(args.notes);
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
      details: `تمت إعادة فتح المتابعة بتاريخ ${followUpDate}`,
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
