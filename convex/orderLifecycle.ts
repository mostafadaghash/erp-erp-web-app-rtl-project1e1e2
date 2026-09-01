import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import {
  assertBranchAccess,
  logAction,
  requireModulePermission,
  requirePermission,
  resolveWriteBranch,
  type AuthUser,
} from "./lib/auth.ts";
import { nextDocumentNumber } from "./lib/documentNumbers.ts";
import { requireActiveBranch, requireActiveCustomer } from "./lib/references.ts";
import {
  assertFinancialAccountBranch,
  postFinancialTransaction,
  requireActiveFinancialAccount,
  reversePostedFinancialTransaction,
} from "./lib/finance.ts";
import { postCustomerLedgerEntry } from "./lib/customerLedger.ts";
import { changeProductStock } from "./lib/inventory.ts";
import { assertOrderNotLockedByDelivery } from "./lib/deliveryLocks.ts";
import { applyOrderStatsChange } from "./lib/orderStats.ts";
import { upsertOperationFollowUp } from "./lib/operationFollowUpSync.ts";
import {
  canTransition,
  deriveInvoiceStatus,
  normalizeOrderStatus,
  ORDER_TRANSITIONS,
  roundMoney,
} from "../shared/businessRules.ts";
import { allocateProportionally, INVENTORY_MOVEMENT_TYPES } from "../shared/inventoryRules.ts";
import { businessDate } from "../shared/businessDate.ts";
import { decodeOrderOperationalMeta, encodeOrderOperationalMeta } from "../shared/orderOperationalMeta.ts";

const FINAL_STATUSES = new Set(["delivered_to_customer", "received"]);
const TERMINAL_STATUSES = new Set(["delivered_to_customer", "received", "cancelled"]);
const BACKWARD_TRANSITIONS = new Set(["ready:preparing", "handed_to_shipping:ready"]);

const priceInput = v.array(v.object({ productId: v.id("products"), unitPrice: v.number() }));

function ensureRequestId(value: string, label = "معرف الطلب") {
  const requestId = value.trim();
  if (!requestId || requestId.length > 180) throw new ConvexError(`${label} غير صالح`);
  return requestId;
}

async function syncOrderFollowUp(ctx: MutationCtx, user: AuthUser, order: Doc<"orders">, status = order.status) {
  if (!order.branchId) return;
  await upsertOperationFollowUp(ctx, user, {
    sourceType: "order",
    sourceId: String(order._id),
    sourceNumber: order.orderNumber,
    sourceStatus: normalizeOrderStatus(status) ?? status,
    branchId: order.branchId,
    customerId: order.customerId,
    customerName: order.customerName,
    phone: order.customerPhone,
    terminal: TERMINAL_STATUSES.has(status),
  });
}

async function loadOrderProduct(ctx: MutationCtx, user: AuthUser, productId: Id<"products">, branchId: Id<"branches">) {
  const product = await ctx.db.get(productId);
  if (!product || product.isActive === false) throw new ConvexError("أحد الأصناف غير موجود أو غير نشط");
  assertBranchAccess(user, product);
  if (product.branchId !== branchId) throw new ConvexError("أحد الأصناف لا ينتمي إلى فرع الطلب");
  return product;
}

async function createInvoiceForOrder(ctx: MutationCtx, user: AuthUser, order: Doc<"orders">) {
  if (!order.branchId || !order.customerId) throw new ConvexError("تأكيد الطلب يتطلب عميلاً وفرعاً مسجلين");
  if (order.linkedInvoiceId) {
    const linked = await ctx.db.get(order.linkedInvoiceId);
    if (linked) return linked;
  }
  const creationRequestId = `order-invoice:${String(order._id)}`;
  const existing = await ctx.db.query("invoices").withIndex("by_creation_request", q => q.eq("creationRequestId", creationRequestId)).unique();
  if (existing) {
    await ctx.db.patch(order._id, { linkedInvoiceId: existing._id, appliedDeposit: Math.min(order.deposit, existing.total), remaining: existing.remaining });
    return existing;
  }
  if (order.items.length === 0 || order.items.some(item => !item.productId || !Number.isFinite(item.unitPrice) || item.unitPrice < 0)) {
    throw new ConvexError("لا يمكن تأكيد الطلب قبل تسعير جميع الأصناف");
  }

  const settings = await ctx.db.query("settings").first();
  const taxRate = settings?.taxRate ?? 14;
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) throw new ConvexError("نسبة الضريبة في الإعدادات غير صالحة");

  const products = new Map<string, Doc<"products">>();
  const requested = new Map<string, number>();
  const invoiceItems = [];
  for (const item of order.items) {
    const productId = item.productId!;
    const key = String(productId);
    const product = products.get(key) ?? await loadOrderProduct(ctx, user, productId, order.branchId);
    products.set(key, product);
    requested.set(key, (requested.get(key) ?? 0) + item.quantity);
    invoiceItems.push({
      productId,
      productName: product.name,
      quantity: item.quantity,
      unitPrice: roundMoney(item.unitPrice),
      discount: 0,
      total: roundMoney(item.quantity * item.unitPrice),
      unitCost: product.costPrice,
      costTotal: roundMoney(item.quantity * product.costPrice),
      lineNetTotal: 0,
    });
  }
  for (const [key, quantity] of requested) {
    const product = products.get(key)!;
    if (product.stock < quantity) throw new ConvexError(`المخزون غير كافٍ للمنتج: ${product.name}`);
  }

  const subtotal = roundMoney(invoiceItems.reduce((sum, item) => sum + item.total, 0));
  const tax = roundMoney(subtotal * taxRate / 100);
  const total = roundMoney(subtotal + tax);
  if (total !== order.total) throw new ConvexError("إجمالي الطلب تغير؛ أعد تسعير الطلب قبل التأكيد");
  if (order.deposit > total) throw new ConvexError("العربون أكبر من إجمالي الطلب بعد التسعير");
  const appliedDeposit = roundMoney(Math.min(order.deposit, total));
  const remaining = roundMoney(total - appliedDeposit);
  const allocations = allocateProportionally(total, invoiceItems.map(item => item.total));
  invoiceItems.forEach((item, index) => { item.lineNetTotal = allocations[index]; });
  const cogsTotal = roundMoney(invoiceItems.reduce((sum, item) => sum + item.costTotal, 0));
  const invoiceNumber = await nextDocumentNumber(ctx, "invoice");
  const date = businessDate();
  const status = deriveInvoiceStatus({ netTotal: total, creditedTotal: 0, paid: appliedDeposit, remaining });

  const invoiceId = await ctx.db.insert("invoices", {
    invoiceNumber,
    customerId: order.customerId,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    items: invoiceItems,
    subtotal,
    discount: 0,
    tax,
    total,
    cogsTotal,
    creditedTotal: 0,
    netTotal: total,
    costingVersion: 1,
    paid: appliedDeposit,
    remaining,
    paymentMethod: appliedDeposit > 0 ? "order_deposit" : "unpaid",
    status,
    date,
    branchId: order.branchId,
    userId: user.userId,
    type: "sale",
    creationRequestId,
  });

  for (const [key, quantity] of requested) {
    const product = products.get(key)!;
    await changeProductStock(ctx, user, {
      productId: product._id,
      quantityDelta: -quantity,
      unitCost: product.costPrice,
      type: INVENTORY_MOVEMENT_TYPES.sale,
      reason: `بيع عبر طلب ${order.orderNumber} / فاتورة ${invoiceNumber}`,
      referenceId: String(invoiceId),
      referenceType: "invoice",
    });
  }

  await postCustomerLedgerEntry(ctx, user, {
    type: "invoice_charge",
    requestId: `${creationRequestId}:charge`,
    customerId: order.customerId,
    branchId: order.branchId,
    date,
    receivableDelta: total,
    advanceDelta: 0,
    purchasesDelta: total,
    description: `استحقاق فاتورة الطلب ${order.orderNumber} — ${invoiceNumber}`,
    referenceType: "invoice",
    referenceId: String(invoiceId),
    referenceNumber: invoiceNumber,
  });
  if (appliedDeposit > 0) {
    await postCustomerLedgerEntry(ctx, user, {
      type: "order_deposit_application",
      requestId: `${creationRequestId}:deposit-application`,
      customerId: order.customerId,
      branchId: order.branchId,
      date,
      receivableDelta: -appliedDeposit,
      advanceDelta: -appliedDeposit,
      purchasesDelta: 0,
      description: `تطبيق عربون الطلب ${order.orderNumber} على الفاتورة ${invoiceNumber}`,
      referenceType: "delivery_deposit",
      referenceId: String(order._id),
      referenceNumber: order.orderNumber,
    });
  }
  await ctx.db.patch(order._id, { linkedInvoiceId: invoiceId, appliedDeposit, remaining });
  await logAction(ctx, user, {
    action: "create_from_order",
    module: "invoices",
    recordId: String(invoiceId),
    recordLabel: invoiceNumber,
    details: `إنشاء فاتورة واحدة من الطلب ${order.orderNumber}`,
    branchId: order.branchId,
    sourceType: "order",
    sourceId: String(order._id),
    sourceNumber: order.orderNumber,
    relatedType: "invoice",
    relatedId: String(invoiceId),
    relatedNumber: invoiceNumber,
    after: { total, paid: appliedDeposit, remaining, status },
  });
  return (await ctx.db.get(invoiceId))!;
}

async function collectRemaining(ctx: MutationCtx, user: AuthUser, order: Doc<"orders">, input: {
  amount: number;
  accountId: Id<"financialAccounts">;
  paymentDate: string;
  requestId: string;
  notes?: string;
}) {
  if (!order.linkedInvoiceId || !order.branchId || !order.customerId) throw new ConvexError("الطلب غير مربوط بفاتورة وعميل صالحين");
  const invoice = await ctx.db.get(order.linkedInvoiceId);
  if (!invoice) throw new ConvexError("فاتورة الطلب غير موجودة");
  if (invoice.status === "cancelled") throw new ConvexError("فاتورة الطلب ملغاة");
  const expected = roundMoney(invoice.remaining);
  if (expected <= 0) return invoice;
  if (!Number.isFinite(input.amount) || roundMoney(input.amount) !== expected) {
    throw new ConvexError(`يجب تحصيل كامل المتبقي (${expected}) قبل إغلاق الطلب`);
  }
  const account = await requireActiveFinancialAccount(ctx, input.accountId);
  assertFinancialAccountBranch(account, order.branchId);
  const requestId = ensureRequestId(input.requestId, "معرف طلب التحصيل");
  const posted = await postFinancialTransaction(ctx, user, {
    type: "invoice_payment",
    requestId,
    date: input.paymentDate,
    amount: expected,
    description: input.notes?.trim() || `التحصيل النهائي للطلب ${order.orderNumber}`,
    branchId: order.branchId,
    referenceType: "invoice",
    referenceId: String(invoice._id),
    referenceNumber: invoice.invoiceNumber,
    customerId: order.customerId,
    movements: [{ accountId: account._id, signedAmount: expected }],
  });
  if (!posted.duplicate) {
    await postCustomerLedgerEntry(ctx, user, {
      type: "invoice_payment",
      requestId: `${requestId}:ledger`,
      customerId: order.customerId,
      branchId: order.branchId,
      date: input.paymentDate,
      receivableDelta: -expected,
      advanceDelta: 0,
      purchasesDelta: 0,
      description: `التحصيل النهائي للفاتورة ${invoice.invoiceNumber} / الطلب ${order.orderNumber}`,
      referenceType: "invoice",
      referenceId: String(invoice._id),
      referenceNumber: invoice.invoiceNumber,
    });
    const paid = roundMoney(invoice.paid + expected);
    await ctx.db.patch(invoice._id, {
      paid,
      remaining: 0,
      status: deriveInvoiceStatus({ netTotal: invoice.netTotal ?? invoice.total, creditedTotal: invoice.creditedTotal ?? 0, paid, remaining: 0 }),
      paymentMethod: account.type,
    });
  }
  return (await ctx.db.get(invoice._id))!;
}

export const create = mutation({
  args: {
    customerId: v.id("customers"),
    items: v.array(v.object({ productId: v.id("products"), quantity: v.number(), notes: v.optional(v.string()) })),
    creationRequestId: v.string(),
    initialDeposit: v.optional(v.object({ amount: v.number(), accountId: v.id("financialAccounts"), paymentDate: v.string(), requestId: v.string(), notes: v.optional(v.string()) })),
    expectedDate: v.optional(v.string()),
    internalNotes: v.optional(v.string()),
    customerAddress: v.optional(v.string()),
    deliveryAddress: v.optional(v.string()),
    shippingCompany: v.optional(v.string()),
    deliveryNotes: v.optional(v.string()),
    branchId: v.optional(v.id("branches")),
  },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "create_orders", "orders");
    const request = ensureRequestId(args.creationRequestId, "معرف إنشاء الطلب");
    const creationRequestId = `${user.userId}:${request}`;
    const duplicate = await ctx.db.query("orders").withIndex("by_creation_request", q => q.eq("creationRequestId", creationRequestId)).unique();
    if (duplicate) return duplicate._id;
    const branchId = resolveWriteBranch(user, args.branchId);
    await requireActiveBranch(ctx, branchId);
    const customer = await requireActiveCustomer(ctx, args.customerId, branchId);
    assertBranchAccess(user, customer);
    if (args.items.length === 0) throw new ConvexError("أضف صنفاً واحداً على الأقل");
    const items = [];
    for (const input of args.items) {
      if (!Number.isInteger(input.quantity) || input.quantity <= 0) throw new ConvexError("الكمية يجب أن تكون عدداً صحيحاً أكبر من صفر");
      const product = await loadOrderProduct(ctx, user, input.productId, branchId!);
      items.push({ productId: product._id, productName: product.name, quantity: input.quantity, unitPrice: -1, notes: input.notes?.trim() || undefined });
    }
    const deposit = roundMoney(args.initialDeposit?.amount ?? 0);
    if (!Number.isFinite(deposit) || deposit < 0) throw new ConvexError("العربون غير صالح");
    let account: Doc<"financialAccounts"> | undefined;
    if (args.initialDeposit) {
      await requirePermission(ctx, "record_order_deposits");
      if (deposit <= 0) throw new ConvexError("العربون يجب أن يكون أكبر من صفر");
      account = await requireActiveFinancialAccount(ctx, args.initialDeposit.accountId);
      assertFinancialAccountBranch(account, branchId!);
    }
    const orderNumber = await nextDocumentNumber(ctx, "order");
    const notes = encodeOrderOperationalMeta({
      internalNotes: args.internalNotes,
      customerAddress: args.customerAddress,
      deliveryAddress: args.deliveryAddress,
      shippingCompany: args.shippingCompany,
      deliveryNotes: args.deliveryNotes,
    });
    const orderId = await ctx.db.insert("orders", {
      orderNumber,
      customerId: customer._id,
      customerName: customer.name,
      customerPhone: customer.phone,
      items,
      total: 0,
      deposit,
      remaining: 0,
      status: "pending",
      expectedDate: args.expectedDate?.trim() || undefined,
      notes,
      branchId,
      creationRequestId,
    });
    const order = (await ctx.db.get(orderId))!;
    await applyOrderStatsChange(ctx, undefined, { status: "pending", total: 0, remaining: 0, branchId });
    if (args.initialDeposit && account) {
      await postCustomerLedgerEntry(ctx, user, {
        type: "order_deposit", requestId: `${args.initialDeposit.requestId}:ledger`, customerId: customer._id,
        branchId: branchId!, date: args.initialDeposit.paymentDate, receivableDelta: 0, advanceDelta: deposit,
        purchasesDelta: 0, description: `عربون الطلب ${orderNumber}`, referenceType: "order", referenceId: String(orderId), referenceNumber: orderNumber,
      });
      await postFinancialTransaction(ctx, user, {
        type: "order_deposit", requestId: args.initialDeposit.requestId, date: args.initialDeposit.paymentDate, amount: deposit,
        description: args.initialDeposit.notes?.trim() || `عربون الطلب ${orderNumber}`, branchId: branchId!,
        referenceType: "order", referenceId: String(orderId), referenceNumber: orderNumber, customerId: customer._id,
        movements: [{ accountId: account._id, signedAmount: deposit }],
      });
    }
    await syncOrderFollowUp(ctx, user, order);
    await logAction(ctx, user, {
      action: "create", module: "orders", recordId: String(orderId), recordLabel: orderNumber,
      details: `إنشاء طلب بيع غير مسعر ${orderNumber} للعميل ${customer.name}`,
      branchId, sourceType: "order", sourceId: String(orderId), sourceNumber: orderNumber,
      relatedType: "customer", relatedId: String(customer._id),
      after: { status: "pending", priced: false, deposit, customerName: customer.name },
    });
    return orderId;
  },
});

export const price = mutation({
  args: { id: v.id("orders"), prices: priceInput, requestId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "price_orders", "orders");
    ensureRequestId(args.requestId, "معرف عملية التسعير");
    const order = await ctx.db.get(args.id);
    if (!order || !order.branchId) throw new ConvexError("الطلب غير موجود أو غير مرتبط بفرع");
    assertBranchAccess(user, order);
    if (normalizeOrderStatus(order.status) !== "pending" || order.linkedInvoiceId) throw new ConvexError("التسعير مسموح فقط للطلب قيد الانتظار قبل التأكيد");
    const priceMap = new Map(args.prices.map(row => [String(row.productId), row.unitPrice]));
    if (priceMap.size !== args.prices.length) throw new ConvexError("لا تكرر الصنف في قائمة التسعير");
    const pricedItems = [];
    for (const item of order.items) {
      if (!item.productId) throw new ConvexError("الطلب يحتوي صنفاً قديماً غير مربوط ببطاقة صنف؛ أصلحه قبل التأكيد");
      const unitPrice = priceMap.get(String(item.productId));
      if (unitPrice === undefined || !Number.isFinite(unitPrice) || unitPrice < 0) throw new ConvexError(`يجب تسعير الصنف: ${item.productName}`);
      await loadOrderProduct(ctx, user, item.productId, order.branchId);
      pricedItems.push({ ...item, unitPrice: roundMoney(unitPrice) });
    }
    if (priceMap.size !== new Set(pricedItems.map(item => String(item.productId))).size) throw new ConvexError("قائمة التسعير لا تطابق أصناف الطلب");
    const settings = await ctx.db.query("settings").first();
    const taxRate = settings?.taxRate ?? 14;
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) throw new ConvexError("نسبة الضريبة في الإعدادات غير صالحة");
    const subtotal = roundMoney(pricedItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0));
    const total = roundMoney(subtotal + roundMoney(subtotal * taxRate / 100));
    if (total < order.deposit) throw new ConvexError("إجمالي الطلب بعد التسعير أقل من العربون المسجل");
    const remaining = roundMoney(total - order.deposit);
    await ctx.db.patch(order._id, { items: pricedItems, total, remaining });
    await applyOrderStatsChange(ctx, order, { ...order, total, remaining });
    await logAction(ctx, user, {
      action: "price", module: "orders", recordId: String(order._id), recordLabel: order.orderNumber,
      details: `اكتمال تسعير الطلب ${order.orderNumber}`,
      branchId: order.branchId, sourceType: "order", sourceId: String(order._id), sourceNumber: order.orderNumber,
      relatedType: order.customerId ? "customer" : undefined, relatedId: order.customerId ? String(order.customerId) : undefined,
      before: { total: order.total, remaining: order.remaining }, after: { total, remaining, priced: true },
    });
    return { total, remaining };
  },
});

export const transition = mutation({
  args: {
    id: v.id("orders"),
    status: v.union(v.literal("pending"), v.literal("confirmed"), v.literal("preparing"), v.literal("ready"), v.literal("handed_to_shipping"), v.literal("delivered_to_customer"), v.literal("received")),
    reason: v.optional(v.string()),
    requestId: v.optional(v.string()),
    collection: v.optional(v.object({ amount: v.number(), accountId: v.id("financialAccounts"), paymentDate: v.string(), requestId: v.string(), notes: v.optional(v.string()) })),
  },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "manage_order_lifecycle", "orders");
    let order = await ctx.db.get(args.id);
    if (!order || !order.branchId) throw new ConvexError("الطلب غير موجود أو غير مرتبط بفرع");
    assertBranchAccess(user, order);
    const current = normalizeOrderStatus(order.status);
    if (!current) throw new ConvexError("حالة الطلب الحالية غير معروفة وتحتاج مراجعة Legacy");
    if (current === args.status) return { orderId: order._id, invoiceId: order.linkedInvoiceId };
    if (!canTransition(ORDER_TRANSITIONS, current, args.status)) throw new ConvexError(`الانتقال من ${current} إلى ${args.status} غير مسموح`);
    if (BACKWARD_TRANSITIONS.has(`${current}:${args.status}`) && !args.reason?.trim()) throw new ConvexError("سبب الرجوع للحالة السابقة مطلوب");
    if (args.status === "confirmed") {
      await requirePermission(ctx, "price_orders");
      if (order.items.some(item => !item.productId || item.unitPrice < 0)) throw new ConvexError("لا يمكن تأكيد الطلب قبل تسعير جميع الأصناف");
      const invoice = await createInvoiceForOrder(ctx, user, order);
      order = (await ctx.db.get(order._id))!;
      if (invoice.remaining !== order.remaining) throw new ConvexError("رصيد الطلب لا يطابق الفاتورة");
    }
    if (FINAL_STATUSES.has(args.status)) {
      if (order.remaining > 0) {
        await requirePermission(ctx, "record_collections");
        if (!args.collection) throw new ConvexError("يجب تحصيل المتبقي قبل إغلاق الطلب");
        await collectRemaining(ctx, user, order, args.collection);
        order = (await ctx.db.get(order._id))!;
        await ctx.db.patch(order._id, { remaining: 0 });
      } else if (args.collection) {
        throw new ConvexError("لا يوجد مبلغ متبقٍ يحتاج تحصيلاً");
      }
    }
    if (args.status === "delivered_to_customer") await assertOrderNotLockedByDelivery(ctx, order._id);
    await ctx.db.patch(order._id, { status: args.status, ...(FINAL_STATUSES.has(args.status) ? { remaining: 0 } : {}) });
    await applyOrderStatsChange(ctx, order, { ...order, status: args.status, ...(FINAL_STATUSES.has(args.status) ? { remaining: 0 } : {}) });
    const updated = (await ctx.db.get(order._id))!;
    await syncOrderFollowUp(ctx, user, updated, args.status);
    await logAction(ctx, user, {
      action: "update_status", module: "orders", recordId: String(order._id), recordLabel: order.orderNumber,
      details: `تغيير حالة الطلب ${order.orderNumber} من ${current} إلى ${args.status}${args.reason?.trim() ? ` — ${args.reason.trim()}` : ""}`,
      branchId: order.branchId, sourceType: "order", sourceId: String(order._id), sourceNumber: order.orderNumber,
      relatedType: order.customerId ? "customer" : undefined, relatedId: order.customerId ? String(order.customerId) : undefined,
      before: { status: current, remaining: order.remaining }, after: { status: args.status, remaining: updated.remaining },
    });
    return { orderId: order._id, invoiceId: updated.linkedInvoiceId };
  },
});

export const cancel = mutation({
  args: {
    id: v.id("orders"), reason: v.string(), disposition: v.optional(v.union(v.literal("customer_credit"), v.literal("refund"))),
    date: v.optional(v.string()), requestId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "manage_order_lifecycle", "orders");
    const requestId = ensureRequestId(args.requestId, "معرف إلغاء الطلب");
    const order = await ctx.db.get(args.id);
    if (!order || !order.branchId) throw new ConvexError("الطلب غير موجود أو غير مرتبط بفرع");
    assertBranchAccess(user, order);
    const reason = args.reason.trim();
    if (!reason) throw new ConvexError("سبب الإلغاء مطلوب");
    const current = normalizeOrderStatus(order.status);
    if (current === "cancelled") return order._id;
    if (current === "delivered_to_customer" || current === "received") throw new ConvexError("لا يمكن إلغاء طلب مكتمل التسليم");
    await assertOrderNotLockedByDelivery(ctx, order._id);
    const disposition = order.deposit > 0 || order.linkedInvoiceId ? args.disposition : undefined;
    if ((order.deposit > 0 || order.linkedInvoiceId) && !disposition) throw new ConvexError("حدد هل المدفوع سيبقى رصيداً للعميل أم سيتم رده");
    const date = args.date ?? businessDate();
    const invoice = order.linkedInvoiceId ? await ctx.db.get(order.linkedInvoiceId) : null;
    let refundablePaid = order.deposit;

    const orderTransactions = await ctx.db.query("financialTransactions")
      .withIndex("by_reference", q => q.eq("referenceType", "order").eq("referenceId", String(order._id)))
      .collect();
    const invoiceTransactions = invoice
      ? await ctx.db.query("financialTransactions")
        .withIndex("by_reference", q => q.eq("referenceType", "invoice").eq("referenceId", String(invoice._id)))
        .collect()
      : [];
    const hasPreviousRefund = [...orderTransactions, ...invoiceTransactions].some(tx =>
      tx.status === "posted" && (tx.type === "order_refund" || tx.type === "invoice_refund"),
    );
    if (hasPreviousRefund) {
      throw new ConvexError("الطلب يحتوي استرداداً سابقاً؛ راجع التسوية المالية قبل الإلغاء لتجنب رد المبلغ مرتين");
    }

    if (invoice) {
      if (!order.customerId) throw new ConvexError("فاتورة الطلب غير مرتبطة بعميل صالح");
      const invoiceReturns = await ctx.db.query("salesReturns").withIndex("by_invoice", q => q.eq("invoiceId", invoice._id)).collect();
      if (invoiceReturns.some(salesReturn => salesReturn.status === "posted")) {
        throw new ConvexError("لا يمكن إلغاء طلب لفاتورته مرتجع مبيعات نشط؛ عالج أو اعكس المرتجع أولاً");
      }
      refundablePaid = roundMoney(invoice.paid);
      for (const item of invoice.items) {
        const product = await ctx.db.get(item.productId);
        if (!product) throw new ConvexError("تعذر استرجاع مخزون أحد أصناف الفاتورة");
        await changeProductStock(ctx, user, {
          productId: item.productId, quantityDelta: item.quantity,
          unitCost: item.unitCost ?? product.costPrice,
          type: INVENTORY_MOVEMENT_TYPES.saleReversal,
          reason: `إلغاء طلب ${order.orderNumber} / فاتورة ${invoice.invoiceNumber}`,
          referenceId: String(invoice._id), referenceType: "invoice",
          valueDelta: item.costTotal,
        });
      }
      await postCustomerLedgerEntry(ctx, user, {
        type: "invoice_cancel", requestId: `${requestId}:invoice-cancel-ledger`, customerId: order.customerId,
        branchId: order.branchId, date, receivableDelta: -roundMoney(invoice.remaining), advanceDelta: refundablePaid,
        purchasesDelta: -roundMoney(invoice.total), description: `إلغاء فاتورة الطلب ${order.orderNumber}: ${reason}`,
        referenceType: "invoice", referenceId: String(invoice._id), referenceNumber: invoice.invoiceNumber,
      });
      await ctx.db.patch(invoice._id, {
        status: "cancelled", remaining: 0, cancelledAt: Date.now(), cancelledBy: user.userId, cancellationReason: reason,
      });
    }

    if (disposition === "refund" && refundablePaid > 0) {
      await requirePermission(ctx, "reverse_financial_transactions");
      await requirePermission(ctx, "refund_collections");
      const originals = [...orderTransactions, ...invoiceTransactions].filter(tx =>
        tx.status === "posted" && (tx.type === "order_deposit" || tx.type === "invoice_payment"),
      );
      for (const tx of originals) {
        await reversePostedFinancialTransaction(ctx, user, {
          transactionId: tx._id, reason: `رد مدفوعات الطلب ${order.orderNumber}: ${reason}`, date,
          requestId: `${requestId}:finance:${String(tx._id)}`, referenceType: "order", referenceId: String(order._id), referenceNumber: order.orderNumber,
        });
      }
      if (order.customerId) {
        await postCustomerLedgerEntry(ctx, user, {
          type: "order_refund", requestId: `${requestId}:refund-ledger`, customerId: order.customerId,
          branchId: order.branchId, date, receivableDelta: 0, advanceDelta: -refundablePaid, purchasesDelta: 0,
          description: invoice
            ? `رد مدفوعات الطلب الملغي ${order.orderNumber}: ${reason}`
            : `رد عربون الطلب ${order.orderNumber}: ${reason}`,
          referenceType: "order", referenceId: String(order._id), referenceNumber: order.orderNumber,
        });
      }
    }

    await ctx.db.patch(order._id, { status: "cancelled", remaining: 0, cancelledAt: Date.now(), cancelledBy: user.userId, cancellationReason: reason });
    await applyOrderStatsChange(ctx, order, { ...order, status: "cancelled", remaining: 0 });
    const updated = (await ctx.db.get(order._id))!;
    await syncOrderFollowUp(ctx, user, updated, "cancelled");
    await logAction(ctx, user, {
      action: "cancel", module: "orders", recordId: String(order._id), recordLabel: order.orderNumber,
      details: `إلغاء الطلب ${order.orderNumber}: ${reason} — ${disposition ?? "بدون مدفوعات"}`,
      branchId: order.branchId, sourceType: "order", sourceId: String(order._id), sourceNumber: order.orderNumber,
      relatedType: order.customerId ? "customer" : undefined, relatedId: order.customerId ? String(order.customerId) : undefined,
      before: { status: order.status, total: order.total, deposit: order.deposit, remaining: order.remaining },
      after: { status: "cancelled", remaining: 0, disposition: disposition ?? "none" },
    });
    return order._id;
  },
});

export const preparationOrder = query({
  args: { id: v.id("orders") },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "print_orders", "orders");
    const order = await ctx.db.get(args.id);
    if (!order || !order.branchId) throw new ConvexError("الطلب غير موجود");
    assertBranchAccess(user, order);
    const status = normalizeOrderStatus(order.status);
    if (status === "pending" || status === "cancelled") throw new ConvexError("أمر التجهيز متاح بعد تأكيد الطلب فقط");
    const meta = decodeOrderOperationalMeta(order.notes);
    const items = [];
    for (const item of order.items) {
      const product = item.productId ? await ctx.db.get(item.productId) : null;
      items.push({ name: item.productName, sku: product?.sku ?? "", quantity: item.quantity, notes: item.notes });
    }
    // Security boundary: no price, cost, profit, total, deposit, remaining or invoice values are returned.
    return {
      orderId: order._id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      expectedDate: order.expectedDate,
      customerAddress: meta.customerAddress,
      deliveryAddress: meta.deliveryAddress,
      shippingCompany: meta.shippingCompany,
      deliveryNotes: meta.deliveryNotes,
      internalNotes: meta.internalNotes,
      items,
    };
  },
});

export const pendingNotifications = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireModulePermission(ctx, "view_orders", "orders");
    const orders = user.branchId
      ? await ctx.db.query("orders").withIndex("by_branch_status", q => q.eq("branchId", user.branchId).eq("status", "pending")).order("desc").take(20)
      : await ctx.db.query("orders").withIndex("by_status", q => q.eq("status", "pending")).order("desc").take(20);
    return orders.map(order => ({
      id: order._id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      createdAt: order._creationTime,
      message: `طلب بيع جديد ${order.orderNumber} بانتظار المراجعة`,
    }));
  },
});
