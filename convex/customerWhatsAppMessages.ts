import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { assertBranchAccess, hasPermission, logAction, requireAuth, type AuthUser } from "./lib/auth";
import type { Permission } from "./lib/permissions";
import { roleHasFollowUpWorkspaceAccess } from "../shared/customerFollowUpWorkspaceRules.ts";
import {
  CUSTOMER_WHATSAPP_MESSAGE_TYPES,
  CUSTOMER_WHATSAPP_MESSAGE_TYPE_LABELS,
  buildCustomerWhatsAppMessageBody,
  buildCustomerWhatsAppMessageKey,
  canStartCustomerWhatsAppAttempt,
  isCustomerWhatsAppMessageApplicable,
  type CustomerWhatsAppMessageStatus,
  type CustomerWhatsAppMessageType,
  type CustomerWhatsAppOperationType,
} from "../shared/customerWhatsAppMessageRules.ts";

const MODULE = "customer_whatsapp_messages";
const ACTION_CREATED = "whatsapp_created";
const ACTION_ATTEMPT = "whatsapp_attempt";
const ACTION_SENT = "whatsapp_sent";
const ACTION_SUCCEEDED = "whatsapp_succeeded";
const ACTION_FAILED = "whatsapp_failed";

const messageTypeValidator = v.union(
  v.literal("order_confirmation"),
  v.literal("ready_for_pickup"),
  v.literal("shipped"),
  v.literal("delivered"),
  v.literal("post_sale_follow_up"),
);
const manualResultValidator = v.union(v.literal("sent"), v.literal("failed"));
const providerResultValidator = v.union(v.literal("sent"), v.literal("succeeded"), v.literal("failed"));

async function requireWhatsAppWorkspaceUser(
  ctx: QueryCtx | MutationCtx,
  mode: "view" | "manage",
): Promise<AuthUser> {
  const user = await requireAuth(ctx);
  const permission: Permission = mode === "view" ? "view_follow_ups" : "manage_follow_ups";
  if (!hasPermission(user, permission) && !roleHasFollowUpWorkspaceAccess(user.role)) {
    throw new ConvexError(
      mode === "view"
        ? "ليس لديك صلاحية لعرض رسائل متابعة العملاء"
        : "ليس لديك صلاحية لإدارة رسائل متابعة العملاء",
    );
  }
  return user;
}

type OperationSnapshot = {
  operationType: CustomerWhatsAppOperationType;
  operationId: string;
  operationNumber: string;
  rawStatus: string;
  linkedDeliveryStatus?: string;
  branchId: Id<"branches">;
  customerId?: Id<"customers">;
  customerName: string;
  phone: string;
};

type MessageRecord = {
  messageKey: string;
  messageType: CustomerWhatsAppMessageType;
  status: CustomerWhatsAppMessageStatus;
  attemptCount: number;
  createdAt: number;
  updatedAt: number;
  lastAttemptAt?: number;
  sentAt?: number;
  succeededAt?: number;
  failedAt?: number;
  lastError?: string;
  provider: "manual_whatsapp" | "whatsapp_business_api";
};

function eventTime(event: Doc<"auditLogs">): number {
  return event.timestamp ?? event._creationTime;
}

function snapshotValue(event: Doc<"auditLogs"> | undefined, field: string): string | undefined {
  return event?.afterSnapshot?.find((row) => row.field === field)?.value;
}

function isMessageStatus(value: string | undefined): value is CustomerWhatsAppMessageStatus {
  return value === "prepared" || value === "opened" || value === "sent" || value === "succeeded" || value === "failed";
}

function deriveMessageRecord(
  events: Doc<"auditLogs">[],
  messageKey: string,
  messageType: CustomerWhatsAppMessageType,
): MessageRecord | null {
  if (!events.length) return null;
  const sorted = [...events].sort((a, b) => eventTime(a) - eventTime(b));
  const created = sorted.find((event) => event.action === ACTION_CREATED) ?? sorted[0];
  const latestStatusEvent = [...sorted].reverse().find((event) => isMessageStatus(snapshotValue(event, "status")));
  const rawStatus = snapshotValue(latestStatusEvent, "status");
  const status: CustomerWhatsAppMessageStatus = isMessageStatus(rawStatus) ? rawStatus : "prepared";
  const attempts = sorted.filter((event) => event.action === ACTION_ATTEMPT);
  const sent = sorted.filter((event) => event.action === ACTION_SENT);
  const succeeded = sorted.filter((event) => event.action === ACTION_SUCCEEDED);
  const failed = sorted.filter((event) => event.action === ACTION_FAILED);
  const providerValue = snapshotValue(latestStatusEvent, "provider") ?? snapshotValue(created, "provider");
  return {
    messageKey,
    messageType,
    status,
    attemptCount: attempts.length,
    createdAt: eventTime(created),
    updatedAt: eventTime(sorted[sorted.length - 1]),
    lastAttemptAt: attempts.length ? eventTime(attempts[attempts.length - 1]) : undefined,
    sentAt: sent.length ? eventTime(sent[sent.length - 1]) : undefined,
    succeededAt: succeeded.length ? eventTime(succeeded[succeeded.length - 1]) : undefined,
    failedAt: failed.length ? eventTime(failed[failed.length - 1]) : undefined,
    lastError: failed.length ? failed[failed.length - 1].details : undefined,
    provider: providerValue === "whatsapp_business_api" ? "whatsapp_business_api" : "manual_whatsapp",
  };
}

function orderIsShipped(operation: OperationSnapshot): boolean {
  return operation.rawStatus === "handed_to_shipping" || operation.linkedDeliveryStatus === "shipped";
}

function orderIsDelivered(operation: OperationSnapshot): boolean {
  return operation.rawStatus === "delivered_to_customer" ||
    operation.rawStatus === "received" ||
    operation.rawStatus === "delivered" ||
    operation.linkedDeliveryStatus === "delivered";
}

function eligibility(
  operation: OperationSnapshot,
  messageType: CustomerWhatsAppMessageType,
): { eligible: boolean; reason?: string } {
  if (!isCustomerWhatsAppMessageApplicable(operation.operationType, messageType)) {
    return { eligible: false, reason: "نوع الرسالة لا ينطبق على هذه العملية" };
  }

  if (operation.operationType === "order") {
    const delivered = orderIsDelivered(operation);
    const shipped = orderIsShipped(operation);
    if (messageType === "order_confirmation") {
      return operation.rawStatus === "confirmed"
        ? { eligible: true }
        : { eligible: false, reason: "تتاح عند تأكيد الطلب" };
    }
    if (messageType === "ready_for_pickup") {
      return operation.rawStatus === "ready" && !shipped && !delivered
        ? { eligible: true }
        : { eligible: false, reason: "تتاح عندما يصبح الطلب في حالة «تم التجهيز»" };
    }
    if (messageType === "shipped") {
      return shipped
        ? { eligible: true }
        : { eligible: false, reason: "تتاح بعد «تم التسليم لشركة الشحن»" };
    }
    if (messageType === "delivered" || messageType === "post_sale_follow_up") {
      return delivered
        ? { eligible: true }
        : { eligible: false, reason: "تتاح بعد «تم التسليم للعميل» أو «تم الإستلام»" };
    }
  }

  if (operation.operationType === "repair") {
    if (operation.rawStatus === "cancelled" || operation.rawStatus === "rejected_by_shipping") {
      return { eligible: false, reason: "لا تتاح رسائل الإتمام لأمر صيانة مرفوض" };
    }
    if (messageType === "ready_for_pickup") {
      return operation.rawStatus === "ready"
        ? { eligible: true }
        : { eligible: false, reason: "تتاح عندما تصبح الصيانة في حالة «تم الإصلاح»" };
    }
    if (messageType === "delivered" || messageType === "post_sale_follow_up") {
      return operation.rawStatus === "delivered"
        ? { eligible: true }
        : { eligible: false, reason: "تتاح بعد «تم التسليم للعميل»" };
    }
  }

  if (operation.operationType === "delivery") {
    if (messageType === "shipped") {
      return operation.rawStatus === "shipped"
        ? { eligible: true }
        : { eligible: false, reason: "تتاح عندما تكون الشحنة في حالة «تم التسليم لشركة الشحن»" };
    }
    if (messageType === "delivered" || messageType === "post_sale_follow_up") {
      return operation.rawStatus === "delivered"
        ? { eligible: true }
        : { eligible: false, reason: "تتاح بعد تسجيل «تم الإستلام»" };
    }
  }

  return { eligible: false, reason: "الرسالة غير متاحة للحالة الحالية" };
}

async function resolveFollowUpContext(
  ctx: QueryCtx | MutationCtx,
  user: AuthUser,
  followUpId: Id<"customerFollowUps">,
): Promise<{ followUp: Doc<"customerFollowUps">; operation: OperationSnapshot }> {
  const followUp = await ctx.db.get(followUpId);
  if (!followUp) throw new ConvexError("المتابعة غير موجودة");
  assertBranchAccess(user, followUp);
  if (
    (followUp.sourceType !== "order" && followUp.sourceType !== "repair" && followUp.sourceType !== "delivery") ||
    !followUp.sourceId
  ) {
    throw new ConvexError("مركز واتساب متاح للطلبات والصيانة والشحن فقط");
  }

  if (followUp.sourceType === "order") {
    const id = ctx.db.normalizeId("orders", followUp.sourceId);
    if (!id) throw new ConvexError("أمر البيع غير صالح");
    const order = await ctx.db.get(id);
    if (!order || !order.branchId) throw new ConvexError("أمر البيع غير موجود أو غير مربوط بفرع");
    if (order.branchId !== followUp.branchId) throw new ConvexError("العملية لا تتبع فرع المتابعة");
    const delivered = await ctx.db
      .query("deliveries")
      .withIndex("by_order_status", (q) => q.eq("orderId", id).eq("status", "delivered"))
      .first();
    const shipped = delivered
      ? null
      : await ctx.db
          .query("deliveries")
          .withIndex("by_order_status", (q) => q.eq("orderId", id).eq("status", "shipped"))
          .first();
    const customer = order.customerId ? await ctx.db.get(order.customerId) : null;
    const phone = (order.customerPhone || customer?.phone || followUp.phone).trim();
    if (!phone) throw new ConvexError("لا يوجد رقم هاتف مسجل للعميل");
    return {
      followUp,
      operation: {
        operationType: "order",
        operationId: String(id),
        operationNumber: order.orderNumber,
        rawStatus: order.status,
        linkedDeliveryStatus: delivered ? "delivered" : shipped ? "shipped" : undefined,
        branchId: order.branchId,
        customerId: order.customerId ?? followUp.customerId,
        customerName: order.customerName || followUp.customerName,
        phone,
      },
    };
  }

  if (followUp.sourceType === "repair") {
    const id = ctx.db.normalizeId("repairs", followUp.sourceId);
    if (!id) throw new ConvexError("أمر الصيانة غير صالح");
    const repair = await ctx.db.get(id);
    if (!repair || !repair.branchId) throw new ConvexError("أمر الصيانة غير موجود أو غير مربوط بفرع");
    if (repair.branchId !== followUp.branchId) throw new ConvexError("العملية لا تتبع فرع المتابعة");
    const phone = (repair.customerPhone || followUp.phone).trim();
    if (!phone) throw new ConvexError("لا يوجد رقم هاتف مسجل للعميل");
    return {
      followUp,
      operation: {
        operationType: "repair",
        operationId: String(id),
        operationNumber: repair.repairNumber,
        rawStatus: repair.status,
        branchId: repair.branchId,
        customerId: repair.customerId ?? followUp.customerId,
        customerName: repair.customerName || followUp.customerName,
        phone,
      },
    };
  }

  const id = ctx.db.normalizeId("deliveries", followUp.sourceId);
  if (!id) throw new ConvexError("الشحنة غير صالحة");
  const delivery = await ctx.db.get(id);
  if (!delivery || !delivery.branchId) throw new ConvexError("الشحنة غير موجودة أو غير مربوطة بفرع");
  if (delivery.branchId !== followUp.branchId) throw new ConvexError("العملية لا تتبع فرع المتابعة");
  const phone = (delivery.customerPhone || followUp.phone).trim();
  if (!phone) throw new ConvexError("لا يوجد رقم هاتف مسجل للعميل");
  return {
    followUp,
    operation: {
      operationType: "delivery",
      operationId: String(id),
      operationNumber: delivery.deliveryNumber,
      rawStatus: delivery.status,
      branchId: delivery.branchId,
      customerId: delivery.customerId ?? followUp.customerId,
      customerName: delivery.customerName || followUp.customerName,
      phone,
    },
  };
}

function messageKey(operation: OperationSnapshot, messageType: CustomerWhatsAppMessageType): string {
  return buildCustomerWhatsAppMessageKey({
    customerId: operation.customerId ? String(operation.customerId) : undefined,
    phone: operation.phone,
    operationType: operation.operationType,
    operationId: operation.operationId,
    messageType,
  });
}

async function loadMessageEvents(
  ctx: QueryCtx | MutationCtx,
  key: string,
): Promise<Doc<"auditLogs">[]> {
  return ctx.db
    .query("auditLogs")
    .withIndex("by_record", (q) => q.eq("module", MODULE).eq("recordId", key))
    .collect();
}

export const getCenter = query({
  args: { followUpId: v.id("customerFollowUps") },
  handler: async (ctx, args) => {
    const user = await requireWhatsAppWorkspaceUser(ctx, "view");
    const followUp = await ctx.db.get(args.followUpId);
    if (!followUp) return { supported: false as const, reason: "المتابعة غير موجودة" };
    assertBranchAccess(user, followUp);
    if (
      (followUp.sourceType !== "order" && followUp.sourceType !== "repair" && followUp.sourceType !== "delivery") ||
      !followUp.sourceId
    ) {
      return { supported: false as const, reason: "مركز واتساب متاح للطلبات والصيانة والشحن فقط" };
    }
    const { operation } = await resolveFollowUpContext(ctx, user, args.followUpId);
    const messages = await Promise.all(
      CUSTOMER_WHATSAPP_MESSAGE_TYPES.map(async (messageType) => {
        const key = messageKey(operation, messageType);
        const events = await loadMessageEvents(ctx, key);
        const availability = eligibility(operation, messageType);
        return {
          messageType,
          label: CUSTOMER_WHATSAPP_MESSAGE_TYPE_LABELS[messageType],
          applicable: isCustomerWhatsAppMessageApplicable(operation.operationType, messageType),
          eligible: availability.eligible,
          reason: availability.reason,
          record: deriveMessageRecord(events, key, messageType),
        };
      }),
    );
    const records = messages
      .map((message) => message.record)
      .filter((record): record is MessageRecord => Boolean(record))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    return {
      supported: true as const,
      customerName: operation.customerName,
      phone: operation.phone,
      operationType: operation.operationType,
      operationNumber: operation.operationNumber,
      messages,
      records,
    };
  },
});

export const openManualAttempt = mutation({
  args: {
    followUpId: v.id("customerFollowUps"),
    messageType: messageTypeValidator,
  },
  handler: async (ctx, args) => {
    const user = await requireWhatsAppWorkspaceUser(ctx, "manage");
    const { operation } = await resolveFollowUpContext(ctx, user, args.followUpId);
    const availability = eligibility(operation, args.messageType);
    if (!availability.eligible) throw new ConvexError(availability.reason ?? "الرسالة غير متاحة للحالة الحالية");
    const key = messageKey(operation, args.messageType);
    const events = await loadMessageEvents(ctx, key);
    const existing = deriveMessageRecord(events, key, args.messageType);
    if (existing && !canStartCustomerWhatsAppAttempt(existing.status)) {
      return {
        blocked: true as const,
        reason: existing.status === "opened"
          ? "هناك محاولة مفتوحة بالفعل. سجّل نتيجتها قبل إعادة المحاولة."
          : "تم إرسال هذه الرسالة من قبل، ولذلك تم منع الإرسال المكرر.",
        messageKey: key,
        status: existing.status,
        attemptCount: existing.attemptCount,
      };
    }

    const messageBody = buildCustomerWhatsAppMessageBody({
      customerName: operation.customerName,
      operationType: operation.operationType,
      operationNumber: operation.operationNumber,
      messageType: args.messageType,
    });
    if (!existing) {
      await logAction(ctx, user, {
        action: ACTION_CREATED,
        module: MODULE,
        recordId: key,
        recordLabel: `${operation.customerName} - ${CUSTOMER_WHATSAPP_MESSAGE_TYPE_LABELS[args.messageType]}`,
        details: messageBody,
        branchId: operation.branchId,
        sourceType: operation.operationType,
        sourceId: operation.operationId,
        sourceNumber: operation.operationNumber,
        after: { messageType: args.messageType, status: "prepared", provider: "manual_whatsapp" },
      });
    }
    const attemptCount = (existing?.attemptCount ?? 0) + 1;
    await logAction(ctx, user, {
      action: ACTION_ATTEMPT,
      module: MODULE,
      recordId: key,
      recordLabel: `${operation.customerName} - ${CUSTOMER_WHATSAPP_MESSAGE_TYPE_LABELS[args.messageType]}`,
      details: `فتح واتساب للمحاولة رقم ${attemptCount}`,
      branchId: operation.branchId,
      sourceType: operation.operationType,
      sourceId: operation.operationId,
      sourceNumber: operation.operationNumber,
      after: { messageType: args.messageType, status: "opened", provider: "manual_whatsapp", attemptCount },
    });
    return {
      blocked: false as const,
      messageKey: key,
      phone: operation.phone,
      messageBody,
      status: "opened" as const,
      attemptCount,
    };
  },
});

export const markManualResult = mutation({
  args: {
    followUpId: v.id("customerFollowUps"),
    messageType: messageTypeValidator,
    result: manualResultValidator,
    failureReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireWhatsAppWorkspaceUser(ctx, "manage");
    const { operation } = await resolveFollowUpContext(ctx, user, args.followUpId);
    const key = messageKey(operation, args.messageType);
    const events = await loadMessageEvents(ctx, key);
    const record = deriveMessageRecord(events, key, args.messageType);
    if (!record) throw new ConvexError("سجل الرسالة غير موجود");
    if (record.status === args.result) return key;
    if (record.status !== "opened") throw new ConvexError("لا يمكن تغيير نتيجة رسالة ليست في محاولة إرسال مفتوحة");
    const failureReason = args.failureReason?.trim().slice(0, 500);
    await logAction(ctx, user, {
      action: args.result === "sent" ? ACTION_SENT : ACTION_FAILED,
      module: MODULE,
      recordId: key,
      recordLabel: `${operation.customerName} - ${CUSTOMER_WHATSAPP_MESSAGE_TYPE_LABELS[args.messageType]}`,
      details: args.result === "sent" ? "تم تأكيد إرسال الرسالة يدويًا" : failureReason || "تم تسجيل فشل الإرسال",
      branchId: operation.branchId,
      sourceType: operation.operationType,
      sourceId: operation.operationId,
      sourceNumber: operation.operationNumber,
      before: { status: record.status },
      after: {
        messageType: args.messageType,
        status: args.result,
        provider: "manual_whatsapp",
        attemptCount: record.attemptCount,
      },
    });
    return key;
  },
});

// نقطة الربط المستقبلية مع WhatsApp Business API: يكتب المزود إلى نفس السجل
// ونفس messageKey، لذلك يبقى منع التكرار وبطاقة العميل دون إعادة تصميم.
export const applyProviderResult = internalMutation({
  args: {
    messageKey: v.string(),
    status: providerResultValidator,
    providerMessageId: v.optional(v.string()),
    providerStatus: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const key = args.messageKey.trim();
    if (!key) throw new ConvexError("مفتاح الرسالة مطلوب");
    const events = await loadMessageEvents(ctx, key);
    if (!events.length) throw new ConvexError("سجل الرسالة غير موجود");
    const sorted = [...events].sort((a, b) => eventTime(a) - eventTime(b));
    const origin = sorted[0];
    const messageType = snapshotValue(origin, "messageType") ?? "unknown";
    const action = args.status === "sent" ? ACTION_SENT : args.status === "succeeded" ? ACTION_SUCCEEDED : ACTION_FAILED;
    const afterSnapshot = [
      { field: "messageType", value: messageType },
      { field: "status", value: args.status },
      { field: "provider", value: "whatsapp_business_api" },
      ...(args.providerMessageId ? [{ field: "providerMessageId", value: args.providerMessageId.trim().slice(0, 300) }] : []),
      ...(args.providerStatus ? [{ field: "providerStatus", value: args.providerStatus.trim().slice(0, 120) }] : []),
    ];
    await ctx.db.insert("auditLogs", {
      userId: "system:whatsapp_business_api",
      userName: "WhatsApp Business API",
      action,
      module: MODULE,
      recordId: key.slice(0, 200),
      recordLabel: origin.recordLabel,
      details: args.status === "failed"
        ? args.error?.trim().slice(0, 500) || "فشل مزود واتساب"
        : args.providerStatus?.trim().slice(0, 500) || `WhatsApp Business API: ${args.status}`,
      afterSnapshot,
      changedFields: ["status", "provider"],
      snapshotVersion: 1,
      sourceType: origin.sourceType,
      sourceId: origin.sourceId,
      sourceNumber: origin.sourceNumber,
      branchId: origin.branchId,
      timestamp: Date.now(),
    });
  },
});
