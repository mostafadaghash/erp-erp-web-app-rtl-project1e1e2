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

export const list = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "view_orders", "orders");
    let orders;
    if (args.status) {
      orders = await ctx.db
        .query("orders")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .collect();
    } else {
      orders = await ctx.db.query("orders").order("desc").collect();
    }
    return filterByBranch(orders, user);
  },
});

export const get = query({
  args: { id: v.id("orders") },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "view_orders", "orders");
    const order = await ctx.db.get(args.id);
    if (order) assertBranchAccess(user, order);
    return order;
  },
});

export const stats = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireModulePermission(ctx, "view_orders", "orders");
    const all = await ctx.db.query("orders").collect();
    const orders = filterByBranch(all, user);
    const pending = orders.filter((o) => o.status === "pending").length;
    const confirmed = orders.filter((o) => o.status === "confirmed").length;
    const ready = orders.filter((o) => o.status === "ready").length;
    const delivered = orders.filter((o) => o.status === "delivered").length;
    const totalValue = orders.reduce((s, o) => s + o.total, 0);
    const pendingValue = orders
      .filter((o) => o.status !== "delivered" && o.status !== "cancelled")
      .reduce((s, o) => s + o.remaining, 0);
    return { pending, confirmed, ready, delivered, totalValue, pendingValue, total: orders.length };
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
    let customerPhone = args.customerPhone;
    if (!customerName) throw new ConvexError("اسم العميل مطلوب");
    if (args.customerId) {
      const customer = await requireActiveCustomer(ctx, args.customerId, branchId);
      assertBranchAccess(user, customer);
      customerName = customer.name;
      customerPhone = customer.phone;
    }
    if (args.items.length === 0) throw new ConvexError("أضف منتجاً واحداً على الأقل");
    const items = args.items.map((item) => {
      if (!item.productName.trim()) throw new ConvexError("اسم المنتج مطلوب");
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) throw new ConvexError("الكمية يجب أن تكون عدداً صحيحاً أكبر من صفر");
      if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0) throw new ConvexError("سعر المنتج غير صالح");
      return { ...item, productName: item.productName.trim(), unitPrice: roundMoney(item.unitPrice) };
    });
    const total = roundMoney(items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0));
    const initialAmount = args.initialDeposit?.amount ?? 0;
    if (args.initialDeposit && !args.customerId) throw new ConvexError("العربون يتطلب عميلاً مسجلاً");
    if (args.initialDeposit && initialAmount <= 0) throw new ConvexError("العربون الأولي يجب أن يكون أكبر من صفر");
    if (!Number.isFinite(initialAmount) || initialAmount < 0 || initialAmount > total) {
      throw new ConvexError("العربون يجب أن يكون بين صفر وإجمالي الطلب");
    }
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
      expectedDate: args.expectedDate,
      notes: args.notes,
      branchId,
      orderNumber,
      remaining,
      status: "pending",
      creationRequestId,
    });
    if (args.initialDeposit && args.customerId) await postCustomerLedgerEntry(ctx, user, { type: "order_deposit", requestId: `${args.initialDeposit.requestId}:ledger`, customerId: args.customerId, branchId: branchId!, date: args.initialDeposit.paymentDate, receivableDelta: 0, advanceDelta: deposit, purchasesDelta: 0, description: `عربون الطلب ${orderNumber}`, referenceType: "order", referenceId: String(id), referenceNumber: orderNumber });
    if (args.initialDeposit && account) await postFinancialTransaction(ctx, user, { type: "order_deposit", requestId: args.initialDeposit.requestId, date: args.initialDeposit.paymentDate, amount: deposit, description: args.initialDeposit.notes?.trim() || `عربون الطلب ${orderNumber}`, branchId: branchId!, referenceType: "order", referenceId: String(id), referenceNumber: orderNumber, customerId: args.customerId, movements: [{ accountId: account._id, signedAmount: deposit }] });
    await logAction(ctx, user, {
      action: "create",
      module: "orders",
      recordId: id,
      recordLabel: orderNumber,
      details: `إنشاء طلب جديد: ${orderNumber} للعميل ${args.customerName}`,
    });
    return id;
  },
});

export const updateStatus = mutation({
  args: { id: v.id("orders"), status: v.union(v.literal("pending"), v.literal("confirmed"), v.literal("ready"), v.literal("delivered"), v.literal("cancelled")), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "edit_orders", "orders");
    const order = await ctx.db.get(args.id);
    if (!order) throw new ConvexError("الطلب غير موجود");
    assertBranchAccess(user, order);
    if ((args.status === "delivered" || args.status === "cancelled") && order.linkedInvoiceId) await assertOrderNotLockedByDelivery(ctx, order._id);
    if (args.status === "delivered" && order.linkedInvoiceId) throw new ConvexError("يجب تأكيد التسليم من مسار التوصيل");
    if (args.status === "cancelled" && !args.reason?.trim()) throw new ConvexError("سبب الإلغاء مطلوب");
    if (args.status === "cancelled" && order.deposit > 0) throw new ConvexError("الطلب يحتوي عربوناً ويحتاج معالجة استرداد مالي قبل الإلغاء");
    if (!canTransition(ORDER_TRANSITIONS, order.status, args.status)) {
      throw new ConvexError(`لا يمكن تغيير حالة الطلب من ${order.status} إلى ${args.status}`);
    }
    await ctx.db.patch(args.id, { status: args.status, ...(args.status === "cancelled" ? { cancelledAt: Date.now(), cancelledBy: user.userId, cancellationReason: args.reason?.trim() } : {}) });
    await logAction(ctx, user, {
      action: "update",
      module: "orders",
      recordId: args.id,
      recordLabel: order.orderNumber,
      details: `تحديث حالة الطلب ${order.orderNumber} إلى: ${args.status}`,
    });
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
    await ctx.db.patch(args.id, {
      deposit: newDeposit,
      remaining: newRemaining,
      status: order.status,
    });
    await logAction(ctx, user, {
      action: "update",
      module: "orders",
      recordId: args.id,
      recordLabel: order.orderNumber,
      details: `دفعة جديدة بقيمة ${args.amount} للطلب ${order.orderNumber}`,
    });
    return posted.transactionId;
  },
});

export const refundDeposit = mutation({ args: { id: v.id("orders"), amount: v.number(), accountId: v.id("financialAccounts"), date: v.string(), reason: v.string(), requestId: v.string() }, handler: async (ctx, args) => { const user = await requirePermission(ctx, "refund_collections"); const order = await ctx.db.get(args.id); if (!order || !order.branchId) throw new ConvexError("الطلب غير موجود"); assertBranchAccess(user, order); if (order.linkedInvoiceId) throw new ConvexError("لا يمكن استرداد عربون بعد ربط الطلب بالفاتورة"); if ((order.appliedDeposit ?? 0) > 0) throw new ConvexError("لا يمكن استرداد عربون طُبق على فاتورة"); const duplicate = await findFinancialTransactionByRequest(ctx, "order_refund", user.userId, args.requestId); if (duplicate) return duplicate._id; const reason = args.reason.trim(); if (!reason) throw new ConvexError("سبب الاسترداد مطلوب"); if (!Number.isFinite(args.amount) || args.amount <= 0 || args.amount > order.deposit) throw new ConvexError("مبلغ الاسترداد غير صالح"); const account = await requireActiveFinancialAccount(ctx, args.accountId); assertFinancialAccountBranch(account, order.branchId); const posted = await postFinancialTransaction(ctx, user, { type: "order_refund", requestId: args.requestId, date: args.date, amount: args.amount, description: reason, branchId: order.branchId, referenceType: "order", referenceId: String(order._id), referenceNumber: order.orderNumber, movements: [{ accountId: account._id, signedAmount: -args.amount }] }); if (!order.customerId) throw new ConvexError("الطلب غير مرتبط بعميل مسجل"); await postCustomerLedgerEntry(ctx, user, { type: "order_refund", requestId: `${args.requestId}:ledger`, customerId: order.customerId, branchId: order.branchId, date: args.date, receivableDelta: 0, advanceDelta: -args.amount, purchasesDelta: 0, description: reason, referenceType: "order", referenceId: String(order._id), referenceNumber: order.orderNumber }); await ctx.db.patch(order._id, { deposit: roundMoney(order.deposit - args.amount), remaining: roundMoney(order.remaining + args.amount) }); return posted.transactionId; } });

export const cancel = mutation({
  args: { id: v.id("orders"), reason: v.string() },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "delete_orders", "orders");
    const order = await ctx.db.get(args.id);
    if (!order) throw new ConvexError("الطلب غير موجود");
    assertBranchAccess(user, order);
    if (order.linkedInvoiceId) await assertOrderNotLockedByDelivery(ctx, order._id);
    const reason = args.reason.trim();
    if (!reason) throw new ConvexError("سبب الإلغاء مطلوب");
    if (order.status === "cancelled") throw new ConvexError("الطلب ملغي بالفعل");
    if (order.status === "delivered") throw new ConvexError("لا يمكن إلغاء طلب تم تسليمه");
    if (order.deposit > 0) throw new ConvexError("الطلب يحتوي عربوناً ويحتاج معالجة استرداد مالي");
    await ctx.db.patch(args.id, { status: "cancelled", cancelledAt: Date.now(), cancelledBy: user.userId, cancellationReason: reason });
    await logAction(ctx, user, { action: "cancel", module: "orders", recordId: args.id, recordLabel: order.orderNumber, details: `إلغاء الطلب ${order.orderNumber}: ${reason}` });
  },
});
export const remove = mutation({ args: { id: v.id("orders") }, handler: async () => { throw new ConvexError("استخدم مسار إلغاء الطلب مع إدخال السبب"); } });
