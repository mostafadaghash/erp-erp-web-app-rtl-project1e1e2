import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { assertBranchAccess, filterByBranch, logAction, requirePermission } from "./lib/auth";
import { assertFinancialAccountBranch, postFinancialTransaction, requireActiveFinancialAccount, requireFinanceInitialized, reversePostedFinancialTransaction } from "./lib/finance";
import { changeProductStock } from "./lib/inventory";
import { nextDocumentNumber } from "./lib/documentNumbers";
import { INVENTORY_MOVEMENT_TYPES } from "../shared/inventoryRules";
import { roundMoney } from "../shared/businessRules";

function redactCosts<T extends { items: Array<Record<string, unknown>>; totalCogsReversed: number }>(note: T, allowed: boolean) {
  if (allowed) return note;
  const { totalCogsReversed: _total, ...rest } = note;
  return { ...rest, items: note.items.map(({ historicalUnitCost: _unit, returnedCostTotal: _cost, ...item }) => item) };
}

export const list = query({ args: { invoiceId: v.optional(v.id("invoices")) }, handler: async (ctx, args) => {
  const user = await requirePermission(ctx, "view_sales_returns");
  let notes = args.invoiceId ? await ctx.db.query("salesReturns").withIndex("by_invoice", q => q.eq("invoiceId", args.invoiceId!)).collect() : await ctx.db.query("salesReturns").collect();
  notes = filterByBranch(notes, user);
  return notes.sort((a, b) => b.createdAt - a.createdAt).map(note => redactCosts(note, user.permissions.includes("view_profits")));
} });

export const getForPrint = query({ args: { id: v.id("salesReturns") }, handler: async (ctx, args) => {
  const user = await requirePermission(ctx, "print_credit_notes"); const note = await ctx.db.get(args.id); if (!note) return null; assertBranchAccess(user, note);
  return redactCosts(note, user.permissions.includes("view_profits"));
} });

export const eligibleInvoices = query({ args: {}, handler: async ctx => {
  const user = await requirePermission(ctx, "create_sales_returns");
  const invoices = filterByBranch(await ctx.db.query("invoices").collect(), user);
  const result = [];
  for (const invoice of invoices) {
    if (invoice.status === "cancelled" || invoice.status === "returned" || !invoice.costingVersion || invoice.items.some(item => item.lineNetTotal === undefined)) continue;
    const notes = await ctx.db.query("salesReturns").withIndex("by_invoice", q => q.eq("invoiceId", invoice._id)).collect();
    const returned = new Map<string, number>();
    for (const note of notes) if (note.status === "posted") for (const item of note.items) returned.set(String(item.productId), (returned.get(String(item.productId)) ?? 0) + item.quantityReturned);
    const items = invoice.items.map(item => ({ productId: item.productId, productName: item.productName, unitPrice: item.unitPrice,
      originalQuantity: item.quantity, returnedQuantity: returned.get(String(item.productId)) ?? 0,
      availableQuantity: item.quantity - (returned.get(String(item.productId)) ?? 0), lineNetTotal: item.lineNetTotal! })).filter(item => item.availableQuantity > 0);
    if (items.length) result.push({ invoiceId: invoice._id, invoiceNumber: invoice.invoiceNumber, customerName: invoice.customerName,
      originalTotal: invoice.total, creditedTotal: invoice.creditedTotal ?? 0, netTotal: invoice.netTotal ?? invoice.total, paid: invoice.paid, remaining: invoice.remaining, items });
  }
  return result;
} });

export const create = mutation({ args: {
  invoiceId: v.id("invoices"), items: v.array(v.object({ productId: v.id("products"), quantity: v.number() })),
  reason: v.string(), date: v.string(), requestId: v.string(), accountId: v.optional(v.id("financialAccounts")),
}, handler: async (ctx, args) => {
  const user = await requirePermission(ctx, "create_sales_returns");
  const requestKey = `${user.userId}:${args.requestId.trim()}`; if (!args.requestId.trim()) throw new ConvexError("معرف الطلب مطلوب");
  const duplicate = await ctx.db.query("salesReturns").withIndex("by_creation_request", q => q.eq("creationRequestId", requestKey)).unique(); if (duplicate) return duplicate._id;
  const invoice = await ctx.db.get(args.invoiceId); if (!invoice || !invoice.branchId) throw new ConvexError("الفاتورة غير موجودة أو بلا فرع"); assertBranchAccess(user, invoice);
  if (invoice.status === "cancelled") throw new ConvexError("لا يمكن إنشاء مرتجع لفاتورة ملغاة");
  if (!args.reason.trim()) throw new ConvexError("سبب المرتجع مطلوب"); await requireFinanceInitialized(ctx, args.date);
  if (!invoice.costingVersion || invoice.items.some(item => item.unitCost === undefined || item.lineNetTotal === undefined)) throw new ConvexError("هذه فاتورة قديمة بلا تكلفة تاريخية؛ يلزم إجراء معالجة يدوية موثقة ولا يجوز تخمين التكلفة");
  const prior = (await ctx.db.query("salesReturns").withIndex("by_invoice", q => q.eq("invoiceId", invoice._id)).collect()).filter(note => note.status === "posted");
  if (args.items.length === 0) throw new ConvexError("اختر صنفاً واحداً على الأقل");
  const returned = new Map<string, number>(); for (const note of prior) for (const item of note.items) returned.set(String(item.productId), (returned.get(String(item.productId)) ?? 0) + item.quantityReturned);
  const normalized = []; const seen = new Set<string>();
  for (const requested of args.items) {
    const key = String(requested.productId); if (seen.has(key)) throw new ConvexError("لا يجوز تكرار الصنف"); seen.add(key);
    if (!Number.isInteger(requested.quantity) || requested.quantity <= 0) throw new ConvexError("كمية المرتجع يجب أن تكون عدداً صحيحاً أكبر من صفر");
    const original = invoice.items.find(item => item.productId === requested.productId); if (!original || original.unitCost === undefined || original.lineNetTotal === undefined) throw new ConvexError("الصنف غير موجود في الفاتورة");
    const before = returned.get(key) ?? 0, after = before + requested.quantity; if (after > original.quantity) throw new ConvexError(`الكمية المرتجعة تتجاوز المتاح للصنف ${original.productName}`);
    const cumulativeBefore = roundMoney(original.lineNetTotal * before / original.quantity), cumulativeAfter = after === original.quantity ? original.lineNetTotal : roundMoney(original.lineNetTotal * after / original.quantity);
    normalized.push({ productId: original.productId, productName: original.productName, quantityReturned: requested.quantity, unitPrice: original.unitPrice, creditAmount: roundMoney(cumulativeAfter - cumulativeBefore), historicalUnitCost: original.unitCost, returnedCostTotal: roundMoney(original.unitCost * requested.quantity) });
  }
  const totalCredit = roundMoney(normalized.reduce((sum, item) => sum + item.creditAmount, 0)); const debtReduction = Math.min(invoice.remaining, totalCredit); const cashRefund = roundMoney(totalCredit - debtReduction);
  let account; if (cashRefund > 0) { await requirePermission(ctx, "refund_collections"); if (!args.accountId) throw new ConvexError("حساب الاسترداد مطلوب"); account = await requireActiveFinancialAccount(ctx, args.accountId); assertFinancialAccountBranch(account, invoice.branchId); }
  const creditNoteNumber = await nextDocumentNumber(ctx, "creditNote");
  const id = await ctx.db.insert("salesReturns", { creditNoteNumber, invoiceId: invoice._id, invoiceNumber: invoice.invoiceNumber, customerId: invoice.customerId, customerName: invoice.customerName, items: normalized, subtotal: totalCredit, totalCredit, totalCogsReversed: roundMoney(normalized.reduce((sum, item) => sum + item.returnedCostTotal, 0)), debtReduction, cashRefund, reason: args.reason.trim(), date: args.date, branchId: invoice.branchId, status: "posted", creationRequestId: requestKey, createdBy: user.userId, createdAt: Date.now() });
  for (const item of normalized) await changeProductStock(ctx, user, { productId: item.productId, quantityDelta: item.quantityReturned, unitCost: item.historicalUnitCost, type: INVENTORY_MOVEMENT_TYPES.salesReturn, reason: `مرتجع بيع ${creditNoteNumber}`, referenceId: String(id), referenceType: "sales_return" });
  let transactionId; if (cashRefund > 0 && account) { const posted = await postFinancialTransaction(ctx, user, { type: "sales_return_refund", requestId: args.requestId, date: args.date, amount: cashRefund, description: `رد نقدي للإشعار ${creditNoteNumber}`, branchId: invoice.branchId, referenceType: "sales_return", referenceId: String(id), referenceNumber: creditNoteNumber, customerId: invoice.customerId, movements: [{ accountId: account._id, signedAmount: -cashRefund }] }); transactionId = posted.transactionId; await ctx.db.patch(id, { financialTransactionId: transactionId }); }
  const creditedTotal = roundMoney((invoice.creditedTotal ?? 0) + totalCredit), netTotal = roundMoney(invoice.total - creditedTotal), paid = roundMoney(invoice.paid - cashRefund), remaining = roundMoney(invoice.remaining - debtReduction);
  await ctx.db.patch(invoice._id, { creditedTotal, netTotal, paid, remaining, status: netTotal === 0 ? "returned" : remaining === 0 ? "paid_returned_partial" : "partial_return" });
  if (invoice.customerId) { const customer = await ctx.db.get(invoice.customerId); if (!customer) throw new ConvexError("العميل غير موجود"); if (customer.balance < debtReduction || customer.totalPurchases < totalCredit) throw new ConvexError("رصيد العميل غير متسق"); await ctx.db.patch(customer._id, { balance: roundMoney(customer.balance - debtReduction), totalPurchases: roundMoney(customer.totalPurchases - totalCredit) }); }
  await logAction(ctx, user, { action: "create", module: "sales_returns", recordId: id, recordLabel: creditNoteNumber, details: `إنشاء إشعار دائن ${creditNoteNumber} بقيمة ${totalCredit} وإعادة المخزون` });
  return id;
} });

export const reverse = mutation({ args: { id: v.id("salesReturns"), reason: v.string(), date: v.string(), requestId: v.string() }, handler: async (ctx, args) => {
  const user = await requirePermission(ctx, "create_sales_returns"); await requirePermission(ctx, "reverse_financial_transactions");
  const note = await ctx.db.get(args.id); if (!note) throw new ConvexError("الإشعار الدائن غير موجود"); assertBranchAccess(user, note);
  const requestKey = `${user.userId}:${args.requestId.trim()}`; if (!args.requestId.trim()) throw new ConvexError("معرف طلب العكس مطلوب");
  if (note.status === "reversed") { if (note.reversalRequestId === requestKey) return note._id; throw new ConvexError("تم عكس الإشعار الدائن بالفعل بطلب مختلف"); }
  if (!args.reason.trim()) throw new ConvexError("سبب العكس مطلوب"); await requireFinanceInitialized(ctx, args.date);
  const invoice = await ctx.db.get(note.invoiceId); if (!invoice) throw new ConvexError("الفاتورة غير موجودة");
  for (const item of note.items) await changeProductStock(ctx, user, { productId: item.productId, quantityDelta: -item.quantityReturned, unitCost: item.historicalUnitCost, type: INVENTORY_MOVEMENT_TYPES.sale, reason: `عكس مرتجع ${note.creditNoteNumber}`, referenceId: String(note._id), referenceType: "sales_return_reversal" });
  let reversalTransactionId; if (note.financialTransactionId) reversalTransactionId = await reversePostedFinancialTransaction(ctx, user, { transactionId: note.financialTransactionId, reason: args.reason.trim(), date: args.date, requestId: args.requestId, referenceType: "sales_return_reversal", referenceId: String(note._id), referenceNumber: note.creditNoteNumber });
  await ctx.db.patch(invoice._id, { creditedTotal: roundMoney((invoice.creditedTotal ?? 0) - note.totalCredit), netTotal: roundMoney((invoice.netTotal ?? invoice.total) + note.totalCredit), paid: roundMoney(invoice.paid + note.cashRefund), remaining: roundMoney(invoice.remaining + note.debtReduction), status: invoice.remaining + note.debtReduction === 0 ? "paid" : invoice.paid + note.cashRefund > 0 ? "partial" : "unpaid" });
  if (note.customerId) { const customer = await ctx.db.get(note.customerId); if (!customer) throw new ConvexError("العميل غير موجود"); await ctx.db.patch(customer._id, { balance: roundMoney(customer.balance + note.debtReduction), totalPurchases: roundMoney(customer.totalPurchases + note.totalCredit) }); }
  await ctx.db.patch(note._id, { status: "reversed", reversedAt: Date.now(), reversedBy: user.userId, reversalReason: args.reason.trim(), reversalDate: args.date, reversalRequestId: requestKey, reversalTransactionId });
  await logAction(ctx, user, { action: "reverse", module: "sales_returns", recordId: note._id, recordLabel: note.creditNoteNumber, details: `عكس الإشعار الدائن: ${args.reason.trim()}` }); return note._id;
} });
