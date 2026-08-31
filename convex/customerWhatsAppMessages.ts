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
  type CustomerWhatsAppMessageType,
  type CustomerWhatsAppOperationType,
} from "../shared/customerWhatsAppMessageRules.ts";

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

type FollowUpContext = {
  followUp: Doc<"customerFollowUps">;
  operation: OperationSnapshot;
};

function eligibility(
  operation: OperationSnapshot,
  messageType: CustomerWhatsAppMessageType,
): { eligible: boolean; reason?: string } {
  if (!isCustomerWhatsAppMessageApplicable(operation.operationType, messageType)) {
    return { eligible: false, reason: "نوع الرسالة لا ينطبق على هذه العملية" };
  }

  if (operation.operationType === "order") {
    const delivered = operation.rawStatus === "delivered" || operation.linkedDeliveryStatus === "delivered";
    const shipped = operation.linkedDeliveryStatus === "shipped";
    if (messageType === "order_confirmation") {
      return operation.rawStatus === "confirmed"
        ? { eligible: true }
        : { eligible: false, reason: "تتاح عند تأكيد الطلب" };
    }
    if (messageType === "ready_for_pickup") {
      return operation.rawStatus === "ready" && !shipped && !delivered
        ? { eligible: true }
        : { eligible: false, reason: "تتاح عندما يصبح الطلب جاهزًا للاستلام" };
    }
    if (messageType === "shipped") {
      return shipped
        ? { eligible: true }
        : { eligible: false, reason: "تتاح بعد تسجيل الشحنة كـ «تم الشحن»" };
    }
    if (messageType === "delivered" || messageType === "post_sale_follow_up") {
      return delivered
        ? { eligible: true }
        : { eligible: false, reason: "تتاح بعد اكتمال التسليم" };
    }
  }

  if (operation.operationType === "repair") {
    if (messageType === "ready_for_pickup") {
      return operation.rawStatus === "ready"
        ? { eligible: true }
        : { eligible: false, reason: "تتاح عندما تصبح الصيانة جاهزة للاستلام" };
    }
    if (messageType === "delivered" || messageType === "post_sale_follow_up") {
      return operation.rawStatus === "delivered"
        ? { eligible: true }
        : { eligible: false, reason: "تتاح بعد تسليم جهاز الصيانة" };
    }
  }

  if (operation.operationType === "delivery") {
    if (messageType === "shipped") {
      return operation.rawStatus === "shipped"
        ? { eligible: true }
        : { eligible: false, reason: "تتاح عندما تكون الشحنة في حالة «تم الشحن»" };
    }
    if (messageType === "delivered" || messageType === "post_sale_follow_up") {
      return operation.rawStatus === "delivered"
        ? { eligible: true }
        : { eligible: false, reason: "تتاح بعد تسجيل التسليم" };
    }
  }

  return { eligible: false, reason: "الرسالة غير متاحة للحالة الحالية" };
}

async function resolveFollowUpContext(
  ctx: QueryCtx | MutationCtx,
  user: AuthUser,
  followUpId: Id<"customerFollowUps">,
): Promise<FollowUpContext> {
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

export const getCenter = query({
  args: { followUpId: v.id("customerFollowUps") },
  handler: async (ctx, args) => {
    const user = await requireWhatsAppWorkspaceUser(ctx, "view");
    let context: FollowUpContext;
    try {
      context = await resolveFollowUpContext(ctx, user, args.followUpId);
    } catch (error) {
      if (error instanceof ConvexError && String(error.data).includes("متاح للطلبات والصيانة والشحن فقط")) {
        return { supported: false as const, reason: String(error.data) };
      }
      throw error;
    }
    const { operation } = context;
    const records = await ctx.db
      .query("customerWhatsAppMessages")
      .withIndex("by_source", (q) =>
        q.eq("operationType", operation.operationType).eq("operationId", operation.operationId),
      )
      .collect();
    records.sort((a, b) => b.updatedAt - a.updatedAt);
    const byType = new Map(records.map((record) => [record.messageType, record]));

    return {
      supported: true as const,
      customerName: operation.customerName,
      phone: operation.phone,
      operationType: operation.operationType,
      operationNumber: operation.operationNumber,
      messages: CUSTOMER_WHATSAPP_MESSAGE_TYPES.map((messageType) => {
        const availability = eligibility(operation, messageType);
        const record = byType.get(messageType);
        return {
          messageType,
          label: CUSTOMER_WHATSAPP_MESSAGE_TYPE_LABELS[messageType],
          applicable: isCustomerWhatsAppMessageApplicable(operation.operationType, messageType),
          eligible: availability.eligible,
          reason: availability.reason,
          record: record
            ? {
                id: record._id,
                status: record.status,
                attemptCount: record.attemptCount,
                createdAt: record.createdAt,
                updatedAt: record.updatedAt,
                lastAttemptAt: record.lastAttemptAt,
                sentAt: record.sentAt,
                succeededAt: record.succeededAt,
                failedAt: record.failedAt,
                lastError: record.lastError,
                provider: record.provider,
              }
            : null,
        };
      }),
      records: records.map((record) => ({
        id: record._id,
        createdAt: record.createdAt,
        customerName: record.customerName,
        operationType: record.operationType,
        operationNumber: record.operationNumber,
        messageType: record.messageType,
        status: record.status,
        attemptCount: record.attemptCount,
        lastAttemptAt: record.lastAttemptAt,
        sentAt: record.sentAt,
        succeededAt: record.succeededAt,
        failedAt: record.failedAt,
        lastError: record.lastError,
        provider: record.provider,
      })),
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

    const idempotencyKey = messageKey(operation, args.messageType);
    const existing = await ctx.db
      .query("customerWhatsAppMessages")
      .withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", idempotencyKey))
      .unique();
    if (existing && !canStartCustomerWhatsAppAttempt(existing.status)) {
      const reason = existing.status === "opened"
        ? "هناك محاولة مفتوحة بالفعل. سجّل نتيجتها قبل إعادة المحاولة."
        : "تم إرسال هذه الرسالة من قبل، ولذلك تم منع الإرسال المكرر.";
      return {
        blocked: true as const,
        reason,
        messageId: existing._id,
        status: existing.status,
        attemptCount: existing.attemptCount,
      };
    }

    const now = Date.now();
    const messageBody = buildCustomerWhatsAppMessageBody({
      customerName: operation.customerName,
      operationType: operation.operationType,
      operationNumber: operation.operationNumber,
      messageType: args.messageType,
    });
    const messageId = existing?._id ?? await ctx.db.insert("customerWhatsAppMessages", {
      branchId: operation.branchId,
      customerId: operation.customerId,
      customerName: operation.customerName,
      phone: operation.phone,
      operationType: operation.operationType,
      operationId: operation.operationId,
      operationNumber: operation.operationNumber,
      messageType: args.messageType,
      messageBody,
      idempotencyKey,
      provider: "manual_whatsapp",
      status: "opened",
      attemptCount: 1,
      lastAttemptAt: now,
      lastStatusAt: now,
      createdBy: user.userId,
      createdAt: now,
      updatedBy: user.userId,
      updatedAt: now,
    });

    if (existing) {
      await ctx.db.patch(existing._id, {
        customerName: operation.customerName,
        phone: operation.phone,
        operationNumber: operation.operationNumber,
        messageBody,
        provider: "manual_whatsapp",
        status: "opened",
        attemptCount: existing.attemptCount + 1,
        lastAttemptAt: now,
        lastStatusAt: now,
        lastError: undefined,
        failedAt: undefined,
        updatedBy: user.userId,
        updatedAt: now,
      });
    }

    const attemptCount = existing ? existing.attemptCount + 1 : 1;
    await logAction(ctx, user, {
      action: "whatsapp_attempt",
      module: "customer_whatsapp_messages",
      recordId: String(messageId),
      recordLabel: `${operation.customerName} - ${CUSTOMER_WHATSAPP_MESSAGE_TYPE_LABELS[args.messageType]}`,
      details: `فتح واتساب للمحاولة رقم ${attemptCount}`,
      branchId: operation.branchId,
      sourceType: operation.operationType,
      sourceId: operation.operationId,
      sourceNumber: operation.operationNumber,
      after: {
        messageType: args.messageType,
        status: "opened",
        attemptCount,
      },
    });

    return {
      blocked: false as const,
      messageId,
      phone: operation.phone,
      messageBody,
      status: "opened" as const,
      attemptCount,
    };
  },
});

export const markManualResult = mutation({
  args: {
    messageId: v.id("customerWhatsAppMessages"),
    result: manualResultValidator,
    failureReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireWhatsAppWorkspaceUser(ctx, "manage");
    const record = await ctx.db.get(args.messageId);
    if (!record) throw new ConvexError("سجل الرسالة غير موجود");
    assertBranchAccess(user, record);
    if (record.status === args.result) return record._id;
    if (record.status !== "opened") {
      throw new ConvexError("لا يمكن تغيير نتيجة رسالة ليست في محاولة إرسال مفتوحة");
    }
    const now = Date.now();
    const failureReason = args.failureReason?.trim().slice(0, 500);
    await ctx.db.patch(record._id, {
      status: args.result,
      sentAt: args.result === "sent" ? now : record.sentAt,
      failedAt: args.result === "failed" ? now : undefined,
      lastError: args.result === "failed" ? failureReason || "تعذر الإرسال يدويًا" : undefined,
      lastStatusAt: now,
      updatedBy: user.userId,
      updatedAt: now,
    });
    await logAction(ctx, user, {
      action: args.result === "sent" ? "whatsapp_sent" : "whatsapp_failed",
      module: "customer_whatsapp_messages",
      recordId: String(record._id),
      recordLabel: `${record.customerName} - ${CUSTOMER_WHATSAPP_MESSAGE_TYPE_LABELS[record.messageType]}`,
      details: args.result === "sent" ? "تم تأكيد إرسال الرسالة يدويًا" : failureReason || "تم تسجيل فشل الإرسال",
      branchId: record.branchId,
      sourceType: record.operationType,
      sourceId: record.operationId,
      sourceNumber: record.operationNumber,
      before: { status: record.status },
      after: { status: args.result, attemptCount: record.attemptCount },
    });
    return record._id;
  },
});

// نقطة الربط المستقبلية مع WhatsApp Business API: مزود الرسائل يستطيع تحديث نفس السجل
// إلى sent / succeeded / failed دون تغيير الواجهة أو مفتاح منع التكرار.
export const applyProviderResult = internalMutation({
  args: {
    messageId: v.id("customerWhatsAppMessages"),
    status: providerResultValidator,
    providerMessageId: v.optional(v.string()),
    providerStatus: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.messageId);
    if (!record) throw new ConvexError("سجل الرسالة غير موجود");
    const now = Date.now();
    await ctx.db.patch(record._id, {
      provider: "whatsapp_business_api",
      providerMessageId: args.providerMessageId?.trim().slice(0, 300),
      providerStatus: args.providerStatus?.trim().slice(0, 120),
      status: args.status,
      sentAt: args.status === "sent" ? now : record.sentAt,
      succeededAt: args.status === "succeeded" ? now : record.succeededAt,
      failedAt: args.status === "failed" ? now : record.failedAt,
      lastError: args.status === "failed" ? args.error?.trim().slice(0, 500) || "فشل مزود واتساب" : undefined,
      lastStatusAt: now,
      updatedAt: now,
      updatedBy: "system:whatsapp_business_api",
    });
  },
});
