import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { assertBranchAccess, requireModulePermission, requirePermission, filterByBranch, resolveWriteBranch, logAction } from "./lib/auth";
import { canTransition, ORDER_TRANSITIONS, roundMoney } from "../shared/businessRules";
import { nextDocumentNumber } from "./lib/documentNumbers";
import { requireActiveBranch, requireActiveCustomer } from "./lib/references";
import { postFinancialTransaction, requireActiveFinancialAccount, assertFinancialAccountBranch, findFinancialTransactionByRequest } from "./lib/finance";
import { postCustomerLedgerEntry } from "./lib/customerLedger.ts";
import { assertOrderNotLockedByDelivery } from "./lib/deliveryLocks.ts";
import { applyOrderStatsChange, getOrderStatsRebuildState, readOrderStats, rebuildOrderStatsBatch } from "./lib/orderStats.ts";

const editableStatuses = new Set(["pending", "confirmed"]);

function normalizeOrderItems(items: Array<{ productName: string; quantity: number; unitPrice: number; notes?: string }>) {
  if (items.length === 0) throw new ConvexError("أضف منتجاً واحداً على الأقل");
  return items.map((item) => {
    const productName = item.productName.trim();
    if (!productName) throw new ConvexError("اسم المنتج مطلوب");
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) throw new ConvexError("الكمية يجب أن تكون عدداً صحيحاً أكبر من صفر");
    if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0) throw new ConvexError("سعر المنتج غير صالح");
    const notes = item.notes?.trim() || undefined;
    return { productName, quantity: item.quantity, unitPrice: roundMoney(item.unitPrice), notes };
  });
}

export const get = query({
  args: { id: v.id("orders") },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "view_orders", "orders");
    const order = await ctx.db.get(args.id);
    if (order) assertBranchAccess(user, order);
    return order;
  },
});

export const details = query({
  args: { id: v.id("orders") },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "view_orders", "orders");
    const order = await ctx.db.get(args.id);
    if (!order) throw new ConvexError("الطلب غير موجود");
    assertBranchAccess(user, order);

    const [invoice, deliveries, transactions, directLedger, appliedLedger] = await Promise.all([
      order.linkedInvoiceId ? ctx.db.get(order.linkedInvoiceId) : null,
      ctx.db.query("deliveries").withIndex("by_order_status", q => q.eq("orderId", order._id)).order("desc").collect(),
      ctx.db.query("financialTransactions").withIndex("by_reference", q => q.eq("referenceType", "order").eq("referenceId", String(order._id))).collect(),
      ctx.db.query("customerLedgerEntries").withIndex("by_reference", q => q.eq("referenceType", "order").eq("referenceId", String(order._id))).collect(),
      ctx.db.query("customerLedgerEntries").withIndex("by_reference", q => q.eq("referenceType", "delivery_deposit").eq("referenceId", String(order._id))).collect(),
    ]);

    if (invoice) assertBranchAccess(user, invoice);

    const timeline = [
      { key: `created:${order._id}`, kind: "created", date: new Date(order._creationTime).toISOString().slice(0, 10), title: "إنشاء الطلب", description: order.orderNumber, createdAt: order._creationTime },
      ...transactions.map((transaction) => ({
        key: `financial:${transaction._id}`,
        kind: transaction.type,
        date: transaction.date,
        title: transaction.type === "order_refund" ? "استرداد عربون" : "تحصيل عربون",
        description: transaction.description,
        amount: transaction.type === "order_refund" ? -transaction.amount : transaction.amount,
        status: transaction.status,
        createdAt: transaction.createdAt,
      })),
      ...[...directLedger, ...appliedLedger].map((entry) => ({
        key: `ledger:${entry._id}`,
        kind: entry.type,
        date: entry.date,
        title: entry.type === "order_deposit_application" ? "تطبيق العربون على الفاتورة" : "حركة دفتر العميل",
        description: entry.description,
        amount: entry.advanceDelta,
        status: entry.status,
        createdAt: entry.createdAt,
      })),
      ...deliveries.map((delivery) => ({
        key: `delivery:${delivery._id}`,
        kind: "delivery",
        date: delivery.deliveredDate ?? delivery.expectedDate ?? new Date(delivery._creationTime).toISOString().slice(0, 10),
        title: `توصيل ${delivery.deliveryNumber}`,
        description: `${delivery.shippingCompany} — ${delivery.status}`,
        status: delivery.status,
        createdAt: delivery._creationTime,
      })),
      ...(order.cancelledAt ? [{
        key: `cancelled:${order._id}`,
        kind: "cancelled",
        date: new Date(order.cancelledAt).toISOString().slice(0, 10),
        title: "إلغاء الطلب",
        description: order.cancellationReason ?? "تم الإلغاء",
        createdAt: order.cancelledAt,
      }] : []),
    ].sort((a, b) => b.createdAt - a.createdAt);

    return {
      order: {
        _id: order._id,
        orderNumber: order.orderNumber,
        customerId: order.customerId,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        items: order.items,
        total: order.total,
        deposit: order.deposit,
        appliedDeposit: order.appliedDeposit ?? 0,
        remaining: order.remaining,
        status: order.status,
        expectedDate: order.expectedDate,
        notes: order.notes,
        branchId: order.branchId,
        cancellationReason: order.cancellationReason,
        linkedInvoiceId: order.linkedInvoiceId,
      },
      invoice: invoice ? {
        _id: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        total: invoice.netTotal ?? invoice.total,
        paid: invoice.paid,
        remaining: invoice.remaining,
        date: invoice.date,
      } : null,
      deliveries: deliveries.map((delivery) => ({
        _id: delivery._id,
        deliveryNumber: delivery.deliveryNumber,
        status: delivery.status,
        shippingCompany: delivery.shippingCompany,
        trackingNumber: delivery.trackingNumber,
        codAmount: delivery.codAmount ?? 0,
        deliveredDate: delivery.deliveredDate,
      })),
      timeline,
    };
  },
});

export const stats = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireModulePermission(ctx, "view_orders", "orders");
    return readOrderStats(ctx, user);
  },
});

export const statsRebuildState = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "manage_settings");
    return getOrderStatsRebuildState(ctx);
  },
});

export const rebuildStats = mutation({
  args: {
    cursor: v.union(v.string(), v.null()),
    numItems: v.optional(v.number()),
    restart: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "manage_settings");
    return rebuildOrderStatsBatch(ctx, user, {
      cursor: args.cursor,
      numItems: args.numItems ?? 50,
      restart: args.restart ?? false,
    });
  },
});

export const create = mutation({
  args: {
    customerName: v.string(),
    customerPhone: v.optional(v.string()),
    customerId: v.optional(v.id("customers")),
    items: v.array(v.object({
      productName: v.string(),
      quantity: v.number(),
      unitPrice: v.number(),
      notes: v.optional(v.string()),
    })),
    total: v.number(),
    creationRequestId: v.string(),
    initialDeposit: v.optional(v.object({ amount: v.number(), accountId: v.id("financialAccounts"), paymentDate: v.string(), requestId: v.string(), notes: v.optional(v.string()) })),
    expectedDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    branchId: v.optional(v.id("branches")),
  },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "create_orders", "orders");
    const creationRequestId = `${user.userId}:${args.creationRequestId.trim()}`; if (!args.creationRequestId.trim()) throw new ConvexError("معرف طلب إنشاء الطلب مطلوب");
    const existing = await ctx.db.query("orders").withIndex("by_creation_request", q => q.eq("creationRequestId", creationRequestId)).unique(); if (existing) return existing._id;
    const branchId = resolveWriteBranch(user, args.branchId);
    await requireActiveBranch(ctx, branchId);
    let customerName = args.customerName.trim();
    let customerPhone = args.customerPhone?.trim() || undefined;
    if (!customerName) throw new ConvexError("اسم العميل مطلوب");
    if (args.customerId) {
      const customer = await requireActiveCustomer(ctx, args.customerId, branchId);
      assertBranchAccess(user, customer);
      customerName = customer.name;
      customerPhone = customer.phone;
    }
    const items = normalizeOrderItems(args.items);
    const total = roundMoney(items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0));
    const initialAmount = args.initialDeposit?.amount ?? 0;
    if (args.initialDeposit && !args.customerId) throw new ConvexError("العربون يتطلب عميلاً مسجلاً");
    if (args.initialDeposit && initialAmount <= 0) throw new ConvexError("العربون الأولي يجب أن يكون أكبر من صفر");
    if (!Number.isFinite(initialAmount) || initialAmount < 0 || initialAmount > total) throw new ConvexError("العربون يجب أن يكون بين صفر وإجمالي الطلب");
    const deposit = roundMoney(initialAmount);
    let account; if (args.initialDeposit) { await requirePermission(ctx, "record_collections"); account = await requireActiveFinancialAccount(ctx, args.initialDeposit.accountId); assertFinancialAccountBranch(account, branchId!); }
    const orderNumber = await nextDocumentNumber(ctx, "order");
    const remaining = roundMoney(total - deposit);
    const id = await ctx.db.insert("orders", {
      customerName,
      customerPhone,
      customerId: args.customerId,
      items,
      total,
      deposit,
      expectedDate: args.expectedDate?.trim() || undefined,
      notes: args.notes?.trim() || undefined,
      branchId,
      orderNumber,
      remaining,
      status: "pending",
      creationRequestId,
    });
    await applyOrderStatsChange(ctx, undefined, { status: "pending", total, remaining, branchId });
    if (args.initialDeposit && args.customerId) await postCustomerLedgerEntry(ctx, user, { type: "order_deposit", requestId: `${args.initialDeposit.requestId}:ledger`, customerId: args.customerId, branchId: branchId!, date: args.initialDeposit.paymentDate, receivableDelta: 0, advanceDelta: deposit, purchasesDelta: 0, description: `عربون الطلب ${orderNumber}`, referenceType: "order", referenceId: String(id), referenceNumber: orderNumber });
    if (args.initialDeposit && account) await postFinancialTransaction(ctx, user, { type: "order_deposit", requestId: args.initialDeposit.requestId, date: args.initialDeposit.paymentDate, amount: deposit, description: args.initialDeposit.notes?.trim() || `عربون الطلب ${orderNumber}`, branchId: branchId!, referenceType: "order", referenceId: String(id), referenceNumber: orderNumber, customerId: args.customerId, movements: [{ accountId: account._id, signedAmount: deposit }] });
    await logAction(ctx, user, { action: "create", module: "orders", recordId: String(id), recordLabel: orderNumber, details: `إنشاء طلب جديد: ${orderNumber} للعميل ${customerName}`, branchId, sourceType: "order", sourceId: String(id), sourceNumber: orderNumber, relatedType: args.customerId ? "customer" : undefined, relatedId: args.customerId ? String(args.customerId) : undefined, after: { status: "pending", total, deposit, remaining, customerName } });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("orders"),
    customerId: v.optional(v.id("customers")),
    customerName: v.string(),
    customerPhone: v.optional(v.string()),
    items: v.array(v.object({ productName: v.string(), quantity: v.number(), unitPrice: v.number(), notes: v.optional(v.string()) })),
    expectedDate: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "edit_orders", "orders");
    const order = await ctx.db.get(args.id);
    if (!order || !order.branchId) throw new ConvexError("الطلب غير موجود أو غير مرتبط بفرع");
    assertBranchAccess(user, order);
    if (!editableStatuses.has(order.status)) throw new ConvexError("لا يمكن تعديل بيانات الطلب بعد أن يصبح جاهزاً أو نهائياً");
    if (order.linkedInvoiceId) throw new ConvexError("لا يمكن تعديل الطلب بعد ربطه بالفاتورة");
    await assertOrderNotLockedByDelivery(ctx, order._id);

    let customerId = order.customerId;
    let customerName = args.customerName.trim();
    let customerPhone = args.customerPhone?.trim() || undefined;
    if (!customerName) throw new ConvexError("اسم العميل مطلوب");

    if (args.customerId) {
      if (order.deposit > 0 && order.customerId && args.customerId !== order.customerId) throw new ConvexError("لا يمكن تغيير العميل بعد تسجيل عربون");
      const customer = await requireActiveCustomer(ctx, args.customerId, order.branchId);
      assertBranchAccess(user, customer);
      customerId = customer._id;
      customerName = customer.name;
      customerPhone = customer.phone;
    } else if (order.deposit > 0 && order.customerId) {
      const customer = await requireActiveCustomer(ctx, order.customerId, order.branchId);
      customerId = customer._id;
      customerName = customer.name;
      customerPhone = customer.phone;
    }

    const items = normalizeOrderItems(args.items);
    const total = roundMoney(items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0));
    if (total < order.deposit) throw new ConvexError("لا يمكن خفض إجمالي الطلب عن قيمة العربون المسجل");
    const remaining = roundMoney(total - order.deposit);

    await ctx.db.patch(order._id, {
      customerId,
      customerName,
      customerPhone,
      items,
      total,
      remaining,
      expectedDate: args.expectedDate?.trim() || undefined,
      notes: args.notes?.trim() || undefined,
    });
    await applyOrderStatsChange(ctx, order, { ...order, total, remaining });
    await logAction(ctx, user, { action: "update", module: "orders", recordId: String(order._id), recordLabel: order.orderNumber, details: `تعديل بيانات وبنود الطلب ${order.orderNumber}`, branchId: order.branchId, sourceType: "order", sourceId: String(order._id), sourceNumber: order.orderNumber, relatedType: customerId ? "customer" : undefined, relatedId: customerId ? String(customerId) : undefined, before: { status: order.status, total: order.total, deposit: order.deposit, remaining: order.remaining, customerName: order.customerName }, after: { status: order.status, total, deposit: order.deposit, remaining, customerName } });
  },
});

export const updateStatus = mutation({
  args: { id: v.id("orders"), status: v.union(v.literal("pending"), v.literal("confirmed"), v.literal("ready"), v.literal("delivered"), v.literal("cancelled")), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "edit_orders", "orders");
    const order = await ctx.db.get(args.id);
    if (!order) throw new ConvexError("الطلب غير موجود");
    assertBranchAccess(user, order);
    if (args.status === "cancelled") throw new ConvexError("استخدم مسار إلغاء الطلب المخصص");
    if (args.status === "delivered" && order.linkedInvoiceId) throw new ConvexError("يجب تأكيد التسليم من مسار التوصيل");
    if (args.status === "delivered") await assertOrderNotLockedByDelivery(ctx, order._id);
    if (!canTransition(ORDER_TRANSITIONS, order.status, args.status)) throw new ConvexError(`لا يمكن تغيير حالة الطلب من ${order.status} إلى ${args.status}`);
    await ctx.db.patch(args.id, { status: args.status });
    await applyOrderStatsChange(ctx, order, { ...order, status: args.status });
    await logAction(ctx, user, { action: "update_status", module: "orders", recordId: String(args.id), recordLabel: order.orderNumber, details: `تحديث حالة الطلب ${order.orderNumber} إلى: ${args.status}`, branchId: order.branchId, sourceType: "order", sourceId: String(args.id), sourceNumber: order.orderNumber, relatedType: order.customerId ? "customer" : undefined, relatedId: order.customerId ? String(order.customerId) : undefined, before: { status: order.status }, after: { status: args.status } });
  },
});

export const addPayment = mutation({
  args: { id: v.id("orders"), amount: v.number(), accountId: v.id("financialAccounts"), paymentDate: v.string(), requestId: v.string(), notes: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "record_collections", "orders");
    const order = await ctx.db.get(args.id);
    if (!order) throw new ConvexError("الطلب غير موجود");
    assertBranchAccess(user, order);
    if (order.linkedInvoiceId) throw new ConvexError("لا يمكن إضافة عربون بعد ربط الطلب بالفاتورة");
    if (order.status === "cancelled" || order.status === "delivered") throw new ConvexError("لا يمكن تسجيل دفعة لطلب ملغي أو مسلم");
    if (!Number.isFinite(args.amount) || args.amount <= 0) throw new ConvexError("قيمة الدفعة يجب أن تكون أكبر من صفر");
    const newDeposit = roundMoney(order.deposit + args.amount);
    const newRemaining = roundMoney(order.total - newDeposit);
    if (newRemaining < 0) throw new ConvexError("المبلغ المدفوع أكبر من المتبقي على الطلب");
    const account = await requireActiveFinancialAccount(ctx, args.accountId); if (!order.branchId) throw new ConvexError("الطلب غير مرتبط بفرع"); assertFinancialAccountBranch(account, order.branchId);
    const posted = await postFinancialTransaction(ctx, user, { type: "order_deposit", requestId: args.requestId, date: args.paymentDate, amount: args.amount, description: args.notes?.trim() || `تحصيل الطلب ${order.orderNumber}`, branchId: order.branchId, referenceType: "order", referenceId: String(order._id), referenceNumber: order.orderNumber, customerId: order.customerId, movements: [{ accountId: account._id, signedAmount: args.amount }] });
    if (posted.duplicate) return posted.transactionId;
    if (!order.customerId) throw new ConvexError("دفعة الطلب تتطلب عميلاً مسجلاً");
    await postCustomerLedgerEntry(ctx, user, { type: "order_deposit", requestId: `${args.requestId}:ledger`, customerId: order.customerId, branchId: order.branchId, date: args.paymentDate, receivableDelta: 0, advanceDelta: args.amount, purchasesDelta: 0, description: `دفعة الطلب ${order.orderNumber}`, referenceType: "order", referenceId: String(order._id), referenceNumber: order.orderNumber });
    await ctx.db.patch(args.id, { deposit: newDeposit, remaining: newRemaining, status: order.status });
    await applyOrderStatsChange(ctx, order, { ...order, remaining: newRemaining });
    await logAction(ctx, user, { action: "record_payment", module: "orders", recordId: String(args.id), recordLabel: order.orderNumber, details: `دفعة جديدة بقيمة ${args.amount} للطلب ${order.orderNumber}`, branchId: order.branchId, sourceType: "order", sourceId: String(args.id), sourceNumber: order.orderNumber, relatedType: "customer", relatedId: String(order.customerId), financialTransactionId: String(posted.transactionId), before: { status: order.status, deposit: order.deposit, remaining: order.remaining }, after: { status: order.status, deposit: newDeposit, remaining: newRemaining, amount: args.amount, accountName: account.name } });
    return posted.transactionId;
  },
});

export const refundDeposit = mutation({
  args: { id: v.id("orders"), amount: v.number(), accountId: v.id("financialAccounts"), date: v.string(), reason: v.string(), requestId: v.string() },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "refund_collections");
    const order = await ctx.db.get(args.id);
    if (!order || !order.branchId) throw new ConvexError("الطلب غير موجود");
    assertBranchAccess(user, order);
    if (order.linkedInvoiceId) throw new ConvexError("لا يمكن استرداد عربون بعد ربط الطلب بالفاتورة");
    if ((order.appliedDeposit ?? 0) > 0) throw new ConvexError("لا يمكن استرداد عربون طُبق على فاتورة");
    const duplicate = await findFinancialTransactionByRequest(ctx, "order_refund", user.userId, args.requestId);
    if (duplicate) return duplicate._id;
    const reason = args.reason.trim();
    if (!reason) throw new ConvexError("سبب الاسترداد مطلوب");
    if (!Number.isFinite(args.amount) || args.amount <= 0 || args.amount > order.deposit) throw new ConvexError("مبلغ الاسترداد غير صالح");
    const account = await requireActiveFinancialAccount(ctx, args.accountId);
    assertFinancialAccountBranch(account, order.branchId);
    const posted = await postFinancialTransaction(ctx, user, { type: "order_refund", requestId: args.requestId, date: args.date, amount: args.amount, description: reason, branchId: order.branchId, referenceType: "order", referenceId: String(order._id), referenceNumber: order.orderNumber, customerId: order.customerId, movements: [{ accountId: account._id, signedAmount: -args.amount }] });
    if (!order.customerId) throw new ConvexError("الطلب غير مرتبط بعميل مسجل");
    await postCustomerLedgerEntry(ctx, user, { type: "order_refund", requestId: `${args.requestId}:ledger`, customerId: order.customerId, branchId: order.branchId, date: args.date, receivableDelta: 0, advanceDelta: -args.amount, purchasesDelta: 0, description: reason, referenceType: "order", referenceId: String(order._id), referenceNumber: order.orderNumber });
    const nextRemaining = roundMoney(order.remaining + args.amount);
    await ctx.db.patch(order._id, { deposit: roundMoney(order.deposit - args.amount), remaining: nextRemaining });
    await applyOrderStatsChange(ctx, order, { ...order, remaining: nextRemaining });
    await logAction(ctx, user, { action: "refund", module: "orders", recordId: String(order._id), recordLabel: order.orderNumber, details: `استرداد عربون بقيمة ${args.amount}: ${reason}`, branchId: order.branchId, sourceType: "order", sourceId: String(order._id), sourceNumber: order.orderNumber, relatedType: "customer", relatedId: String(order.customerId), financialTransactionId: String(posted.transactionId), before: { status: order.status, deposit: order.deposit, remaining: order.remaining }, after: { status: order.status, deposit: roundMoney(order.deposit - args.amount), remaining: nextRemaining, amount: args.amount, accountName: account.name, reversalReason: reason } });
    return posted.transactionId;
  },
});

export const cancel = mutation({
  args: { id: v.id("orders"), reason: v.string() },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "delete_orders", "orders");
    const order = await ctx.db.get(args.id);
    if (!order) throw new ConvexError("الطلب غير موجود");
    assertBranchAccess(user, order);
    const reason = args.reason.trim();
    if (!reason) throw new ConvexError("سبب الإلغاء مطلوب");
    if (order.status === "cancelled") throw new ConvexError("الطلب ملغي بالفعل");
    if (order.status === "delivered") throw new ConvexError("لا يمكن إلغاء طلب تم تسليمه");
    if (order.linkedInvoiceId) throw new ConvexError("لا يمكن إلغاء الطلب بعد ربطه بالفاتورة؛ عالج الفاتورة والتوصيل أولاً");
    await assertOrderNotLockedByDelivery(ctx, order._id);
    if (order.deposit > 0) throw new ConvexError("الطلب يحتوي عربوناً ويحتاج معالجة استرداد مالي");
    await ctx.db.patch(args.id, { status: "cancelled", cancelledAt: Date.now(), cancelledBy: user.userId, cancellationReason: reason });
    await applyOrderStatsChange(ctx, order, { ...order, status: "cancelled" });
    await logAction(ctx, user, { action: "cancel", module: "orders", recordId: String(args.id), recordLabel: order.orderNumber, details: `إلغاء الطلب ${order.orderNumber}: ${reason}`, branchId: order.branchId, sourceType: "order", sourceId: String(args.id), sourceNumber: order.orderNumber, relatedType: order.customerId ? "customer" : undefined, relatedId: order.customerId ? String(order.customerId) : undefined, before: { status: order.status, total: order.total, deposit: order.deposit, remaining: order.remaining }, after: { status: "cancelled", cancellationReason: reason } });
  },
});

export const remove = mutation({ args: { id: v.id("orders") }, handler: async () => { throw new ConvexError("استخدم مسار إلغاء الطلب مع إدخال السبب"); } });