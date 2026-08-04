import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { AuthUser } from "./auth.ts";
import { logAction } from "./auth.ts";
import { nextDocumentNumber } from "./documentNumbers.ts";
import { isValidIsoDate, roundMoney } from "../../shared/businessRules.ts";

export const CUSTOMER_LEDGER_TYPES = ["opening_balance", "invoice_charge", "invoice_adjustment", "invoice_cancel", "invoice_payment", "invoice_refund", "sales_return", "sales_return_reversal", "order_deposit", "order_deposit_application", "delivery_cod_collection", "delivery_cod_reversal", "order_refund", "repair_charge", "repair_adjustment", "repair_cancel", "repair_payment", "repair_refund", "reversal"] as const;
export type CustomerLedgerType = (typeof CUSTOMER_LEDGER_TYPES)[number];

const precise = (value: number) => Number.isFinite(value) && Math.abs(value * 100 - Math.round(value * 100)) < 1e-7;

export type CustomerLedgerOpeningState = {
  openingState: "not_started" | "posted" | "blocked_by_activity";
  requiresOpeningReview: boolean;
  canInitializeOpening: boolean;
  canPostOperatingEntry: boolean;
  legacyReasons: Array<"legacy_balance" | "legacy_purchases" | "unposted_documents">;
};

/** The single policy boundary for legacy customer-ledger initialization. */
export async function deriveCustomerLedgerOpeningState(
  ctx: QueryCtx | MutationCtx,
  customerId: Id<"customers">,
  branchId: Id<"branches">,
  currentReference?: { type: string; id: string },
): Promise<CustomerLedgerOpeningState> {
  const customer = await ctx.db.get(customerId);
  if (!customer || customer.branchId !== branchId) throw new ConvexError("العميل لا ينتمي إلى الفرع المحدد");
  const balance = await ctx.db.query("customerBalances").withIndex("by_customer_branch", q => q.eq("customerId", customerId).eq("branchId", branchId)).unique();
  const entries = await ctx.db.query("customerLedgerEntries").withIndex("by_customer_branch_date", q => q.eq("customerId", customerId).eq("branchId", branchId)).collect();
  const references = new Set(entries.map(entry => `${entry.referenceType}:${entry.referenceId}`));
  const [invoices, orders, repairs] = await Promise.all([
    ctx.db.query("invoices").withIndex("by_customer", q => q.eq("customerId", customerId)).collect(),
    ctx.db.query("orders").withIndex("by_customer", q => q.eq("customerId", customerId)).collect(),
    ctx.db.query("repairs").withIndex("by_customer", q => q.eq("customerId", customerId)).collect(),
  ]);
  const isUnposted = (type: string, id: string) =>
    !(currentReference?.type === type && currentReference.id === id) && !references.has(`${type}:${id}`);
  const hasUnpostedDocuments = invoices.some(row => isUnposted("invoice", String(row._id)))
    || orders.some(row => isUnposted("order", String(row._id)))
    || repairs.some(row => isUnposted("repair", String(row._id)));
  const legacyReasons: CustomerLedgerOpeningState["legacyReasons"] = [];
  if (customer.balance !== 0) legacyReasons.push("legacy_balance");
  if (customer.totalPurchases !== 0) legacyReasons.push("legacy_purchases");
  if (hasUnpostedDocuments) legacyReasons.push("unposted_documents");
  const posted = balance?.openingBalancePostedAt !== undefined;
  const operatingStarted = entries.some(entry => entry.type !== "opening_balance");
  const requiresOpeningReview = !posted && !operatingStarted && legacyReasons.length > 0;
  return {
    openingState: posted ? "posted" : operatingStarted ? "blocked_by_activity" : "not_started",
    requiresOpeningReview,
    canInitializeOpening: !posted && !operatingStarted,
    canPostOperatingEntry: posted || operatingStarted || !requiresOpeningReview,
    legacyReasons,
  };
}

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
  const openingPolicy = await deriveCustomerLedgerOpeningState(ctx, input.customerId, input.branchId, { type: input.referenceType, id: input.referenceId });
  if (input.openingBalance && !openingPolicy.canInitializeOpening) throw new ConvexError("سبق تسجيل رصيد أو حركة تشغيلية لهذا العميل");
  if (!input.openingBalance && !openingPolicy.canPostOperatingEntry) throw new ConvexError("يجب مراجعة واعتماد الرصيد الافتتاحي للعميل قبل تسجيل حركة تشغيلية جديدة");
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
  await logAction(ctx, user, {
    action: input.type === "reversal" ? "reverse" : "post",
    module: "customer_ledger",
    recordId: String(entryId),
    recordLabel: entryNumber,
    details: input.description + " (" + customer.name + ")",
    branchId: input.branchId,
    sourceType: input.referenceType,
    sourceId: input.referenceId,
    sourceNumber: input.referenceNumber,
    relatedType: "customer",
    relatedId: String(input.customerId),
    reversalOfId: input.originalEntryId ? String(input.originalEntryId) : undefined,
    before: {
      receivableBalance: receivableBefore,
      advanceBalance: advanceBefore,
      totalPurchases: totalPurchasesBefore,
    },
    after: {
      type: input.type,
      status: "posted",
      date: input.date,
      receivableBalance: receivableAfter,
      advanceBalance: advanceAfter,
      totalPurchases: totalPurchasesAfter,
    },
  });
  return { entryId, duplicate: false, entry: await ctx.db.get(entryId) };
}

export async function initializeCustomerBalance(ctx: MutationCtx, user: AuthUser, input: { customerId: Id<"customers">; branchId: Id<"branches">; receivableBalance: number; advanceBalance: number; totalPurchases: number; date: string; requestId: string; notes?: string }) {
  for (const value of [input.receivableBalance, input.advanceBalance, input.totalPurchases]) if (!precise(value) || value < 0) throw new ConvexError("الأرصدة الافتتاحية يجب أن تكون غير سالبة ودقيقة ماليًا");
  return postCustomerLedgerEntry(ctx, user, { type: "opening_balance", requestId: input.requestId, customerId: input.customerId, branchId: input.branchId, date: input.date, receivableDelta: input.receivableBalance, advanceDelta: input.advanceBalance, purchasesDelta: input.totalPurchases, description: input.notes?.trim() || "الرصيد الافتتاحي للعميل", referenceType: "customer", referenceId: String(input.customerId), referenceNumber: "OPENING", openingBalance: true });
}
