import { ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { AuthUser } from "./auth";
import { logAction } from "./auth";
import { nextDocumentNumber } from "./documentNumbers";
import { isValidIsoDate, roundMoney } from "../../shared/businessRules";

export const CUSTOMER_LEDGER_TYPES = ["opening_balance", "invoice_charge", "invoice_adjustment", "invoice_cancel", "invoice_payment", "invoice_refund", "sales_return", "sales_return_reversal", "order_deposit", "order_refund", "repair_charge", "repair_adjustment", "repair_cancel", "repair_payment", "repair_refund", "reversal"] as const;
export type CustomerLedgerType = (typeof CUSTOMER_LEDGER_TYPES)[number];

const precise = (value: number) => Number.isFinite(value) && Math.abs(value * 100 - Math.round(value * 100)) < 1e-7;

export async function postCustomerLedgerEntry(ctx: MutationCtx, user: AuthUser, input: {
  type: CustomerLedgerType; requestId: string; customerId: Id<"customers">; branchId: Id<"branches">; date: string;
  receivableDelta: number; advanceDelta: number; purchasesDelta: number; description: string;
  referenceType: string; referenceId: string; referenceNumber: string; openingBalance?: boolean;
  originalEntryId?: Id<"customerLedgerEntries">;
}) {
  const requestId = input.requestId.trim();
  if (!requestId || requestId.length > 200) throw new ConvexError("معرف طلب دفتر العميل غير صالح");
  for (const value of [input.receivableDelta, input.advanceDelta, input.purchasesDelta]) if (!precise(value)) throw new ConvexError("قيم دفتر العميل يجب أن تكون finite ومقربة إلى قرشين");
  if (!isValidIsoDate(input.date)) throw new ConvexError("تاريخ دفتر العميل غير صالح");
  const normalized = { ...input, description: input.description.trim(), referenceType: input.referenceType.trim(), referenceId: input.referenceId.trim(), referenceNumber: input.referenceNumber.trim() };
  const customer = await ctx.db.get(input.customerId);
  const branch = await ctx.db.get(input.branchId);
  if (!customer) throw new ConvexError("العميل غير موجود");
  if (!branch || !branch.isActive) throw new ConvexError("الفرع غير موجود أو معطل");
  if (customer.branchId !== input.branchId) throw new ConvexError("العميل لا ينتمي إلى الفرع المحدد");
  const settings = await ctx.db.query("financeSettings").first();
  if (!settings?.isInitialized) throw new ConvexError("يجب تهيئة النظام المالي أولاً");
  if (input.date < settings.cutoverDate) throw new ConvexError("لا يمكن التسجيل قبل تاريخ القطع المالي");
  if (input.openingBalance && input.date !== settings.cutoverDate) throw new ConvexError("تاريخ الرصيد الافتتاحي يجب أن يساوي تاريخ القطع المالي");
  const fingerprint = JSON.stringify({ ...normalized, requestId: undefined, originalEntryId: input.originalEntryId ? String(input.originalEntryId) : undefined });
  const idempotencyKey = `customer-ledger:${user.userId}:${requestId}`;
  const prior = await ctx.db.query("customerLedgerEntries").withIndex("by_idempotency_key", q => q.eq("idempotencyKey", idempotencyKey)).unique();
  if (prior) {
    if (prior.requestFingerprint !== fingerprint) throw new ConvexError("أعيد استخدام requestId ببيانات مختلفة");
    return { entryId: prior._id, duplicate: true, entry: prior };
  }
  const key = `${input.customerId}:${input.branchId}`;
  const snapshot = await ctx.db.query("customerBalances").withIndex("by_key", q => q.eq("key", key)).unique();
  const existingEntries = await ctx.db.query("customerLedgerEntries").withIndex("by_customer_branch_date", q => q.eq("customerId", input.customerId).eq("branchId", input.branchId)).first();
  if (input.openingBalance && (snapshot?.openingBalancePostedAt !== undefined || existingEntries)) throw new ConvexError("سبق تسجيل رصيد أو حركة تشغيلية لهذا العميل");
  const receivableBefore = snapshot?.receivableBalance ?? 0, advanceBefore = snapshot?.advanceBalance ?? 0, totalPurchasesBefore = snapshot?.totalPurchases ?? 0;
  const receivableAfter = roundMoney(receivableBefore + input.receivableDelta), advanceAfter = roundMoney(advanceBefore + input.advanceDelta), totalPurchasesAfter = roundMoney(totalPurchasesBefore + input.purchasesDelta);
  if (receivableAfter < 0) throw new ConvexError("لا يمكن أن تصبح مديونية العميل سالبة");
  if (advanceAfter < 0) throw new ConvexError("لا يمكن أن يصبح الرصيد المقدم سالبًا");
  if (totalPurchasesAfter < 0) throw new ConvexError("لا يمكن أن يصبح إجمالي المشتريات سالبًا");
  const now = Date.now();
  const entryNumber = await nextDocumentNumber(ctx, "customerLedger", new Date(`${input.date}T00:00:00Z`));
  const entryId = await ctx.db.insert("customerLedgerEntries", { entryNumber, idempotencyKey, requestId, requestFingerprint: fingerprint, type: normalized.type, status: "posted", customerId: normalized.customerId, customerName: customer.name, branchId: normalized.branchId, date: normalized.date, receivableDelta: roundMoney(normalized.receivableDelta), advanceDelta: roundMoney(normalized.advanceDelta), purchasesDelta: roundMoney(normalized.purchasesDelta), receivableBefore, receivableAfter, advanceBefore, advanceAfter, totalPurchasesBefore, totalPurchasesAfter, description: normalized.description, referenceType: normalized.referenceType, referenceId: normalized.referenceId, referenceNumber: normalized.referenceNumber, createdBy: user.userId, createdAt: now, originalEntryId: normalized.originalEntryId });
  const values = { receivableBalance: receivableAfter, advanceBalance: advanceAfter, totalPurchases: totalPurchasesAfter, updatedAt: now, ...(input.openingBalance ? { openingBalancePostedAt: now } : {}) };
  if (snapshot) await ctx.db.patch(snapshot._id, values);
  else await ctx.db.insert("customerBalances", { key, customerId: input.customerId, branchId: input.branchId, ...values });
  await logAction(ctx, user, { action: "post", module: "customer_ledger", recordId: entryId, recordLabel: entryNumber, details: `${input.description} (${customer.name})` });
  return { entryId, duplicate: false, entry: await ctx.db.get(entryId) };
}

export async function initializeCustomerBalance(ctx: MutationCtx, user: AuthUser, input: { customerId: Id<"customers">; branchId: Id<"branches">; receivableBalance: number; advanceBalance: number; totalPurchases: number; date: string; requestId: string; notes?: string }) {
  for (const value of [input.receivableBalance, input.advanceBalance, input.totalPurchases]) if (!precise(value) || value < 0) throw new ConvexError("الأرصدة الافتتاحية يجب أن تكون غير سالبة ودقيقة ماليًا");
  return postCustomerLedgerEntry(ctx, user, { type: "opening_balance", requestId: input.requestId, customerId: input.customerId, branchId: input.branchId, date: input.date, receivableDelta: input.receivableBalance, advanceDelta: input.advanceBalance, purchasesDelta: input.totalPurchases, description: input.notes?.trim() || "الرصيد الافتتاحي للعميل", referenceType: "customer", referenceId: String(input.customerId), referenceNumber: "OPENING", openingBalance: true });
}
