import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { ConvexError } from "convex/values";
import { roundMoney } from "../../shared/businessRules.ts";
import { nextDocumentNumber } from "./documentNumbers.ts";
import { logAction, type AuthUser } from "./auth.ts";
import { isValidIsoDate } from "../../shared/businessRules.ts";
import { postFinancialTransactionJournal } from "./generalLedgerOperations.ts";

export type FinancialTransactionType = Doc<"financialTransactions">["type"];
export type MovementInput = { accountId: Id<"financialAccounts">; signedAmount: number };

export function financialIdempotencyKey(type: string, userId: string, requestId: string): string {
  const request = requestId.trim();
  if (!request || request.length > 200) throw new ConvexError("معرف الطلب غير صالح");
  return `${type}:${userId}:${request}`;
}

export async function findFinancialTransactionByRequest(
  ctx: QueryCtx | MutationCtx,
  type: FinancialTransactionType,
  userId: string,
  requestId: string,
) {
  const idempotencyKey = financialIdempotencyKey(type, userId, requestId);
  return await ctx.db
    .query("financialTransactions")
    .withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", idempotencyKey))
    .unique();
}

export async function requireActiveFinancialAccount(ctx: QueryCtx | MutationCtx, accountId: Id<"financialAccounts">) {
  const account = await ctx.db.get(accountId);
  if (!account) throw new ConvexError("الحساب المالي غير موجود");
  if (!account.isActive) throw new ConvexError("الحساب المالي معطل");
  return account;
}

export function assertFinancialAccountBranch(account: Doc<"financialAccounts">, branchId: Id<"branches">): void {
  if (account.branchId !== branchId) throw new ConvexError("الحساب المالي لا ينتمي إلى فرع المستند");
}

export async function requireFinanceInitialized(ctx: QueryCtx | MutationCtx, date: string) {
  if (!isValidIsoDate(date)) throw new ConvexError("تاريخ المعاملة غير صالح");
  const settings = await ctx.db.query("financeSettings").first();
  if (!settings?.isInitialized) throw new ConvexError("النظام المالي غير مهيأ");
  if (date < settings.cutoverDate) throw new ConvexError("تاريخ المعاملة يسبق تاريخ القطع");
  return settings;
}

function availableAt(date: string, account: Doc<"financialAccounts">, signedAmount: number): string | undefined {
  if (signedAmount <= 0 || !["paymob_clearing", "fawry_clearing", "card_clearing", "cod_clearing"].includes(account.type)) return undefined;
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + account.settlementDelayDays);
  return value.toISOString().slice(0, 10);
}

export async function calculateAvailableBalance(ctx: QueryCtx | MutationCtx, accountId: Id<"financialAccounts">, onDate: string): Promise<number> {
  const movements = await ctx.db.query("financialMovements").withIndex("by_account_date", q => q.eq("accountId", accountId).lte("date", onDate)).collect();
  return roundMoney(movements.reduce((sum, movement) => sum + (movement.signedAmount < 0 || !movement.availableAt || movement.availableAt <= onDate ? movement.signedAmount : 0), 0));
}

export async function postFinancialTransaction(ctx: MutationCtx, user: AuthUser, input: {
  type: FinancialTransactionType; requestId: string; date: string; amount: number; feeAmount?: number;
  description: string; branchId: Id<"branches">; destinationBranchId?: Id<"branches">;
  referenceType?: string; referenceId?: string; referenceNumber?: string; customerId?: Id<"customers">; supplierId?: Id<"suppliers">;
  movements: MovementInput[]; originalTransactionId?: Id<"financialTransactions">; allowBeforeInitialization?: boolean;
}): Promise<{ transactionId: Id<"financialTransactions">; duplicate: boolean }> {
  if (!isValidIsoDate(input.date)) throw new ConvexError("تاريخ المعاملة غير صالح");
  if (!input.allowBeforeInitialization) await requireFinanceInitialized(ctx, input.date);
  const idempotencyKey = financialIdempotencyKey(input.type, user.userId, input.requestId);
  const description = input.description.trim().replace(/\s+/g, " ");
  const requestFingerprint = JSON.stringify({
    type: input.type,
    date: input.date,
    amount: roundMoney(input.amount),
    feeAmount: roundMoney(input.feeAmount ?? 0),
    description,
    branchId: String(input.branchId),
    destinationBranchId: input.destinationBranchId ? String(input.destinationBranchId) : undefined,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    referenceNumber: input.referenceNumber,
    customerId: input.customerId ? String(input.customerId) : undefined,
    supplierId: input.supplierId ? String(input.supplierId) : undefined,
    originalTransactionId: input.originalTransactionId ? String(input.originalTransactionId) : undefined,
    movements: input.movements
      .map(movement => ({ accountId: String(movement.accountId), signedAmount: roundMoney(movement.signedAmount) }))
      .sort((left, right) => `${left.accountId}:${left.signedAmount}`.localeCompare(`${right.accountId}:${right.signedAmount}`)),
  });
  const duplicate = await ctx.db.query("financialTransactions").withIndex("by_idempotency_key", q => q.eq("idempotencyKey", idempotencyKey)).unique();
  if (duplicate) {
    if (duplicate.requestFingerprint && duplicate.requestFingerprint !== requestFingerprint) {
      throw new ConvexError("معرف الطلب مستخدم بحركة مالية مختلفة");
    }
    return { transactionId: duplicate._id, duplicate: true };
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new ConvexError("المبلغ يجب أن يكون أكبر من صفر");
  const amount = roundMoney(input.amount), feeAmount = roundMoney(input.feeAmount ?? 0);
  if (!Number.isFinite(feeAmount) || feeAmount < 0 || feeAmount > amount) throw new ConvexError("قيمة الرسوم غير صالحة");
  if (input.movements.length === 0) throw new ConvexError("المعاملة المالية بلا حركات");
  const prepared: Array<{ account: Doc<"financialAccounts">; signedAmount: number; before: number; after: number }> = [];
  const balances = new Map<string, number>();
  for (const movement of input.movements) {
    if (!Number.isFinite(movement.signedAmount) || movement.signedAmount === 0) throw new ConvexError("قيمة الحركة غير صالحة");
    const account = await requireActiveFinancialAccount(ctx, movement.accountId);
    const before = balances.get(String(account._id)) ?? account.currentBalance;
    const signedAmount = roundMoney(movement.signedAmount), after = roundMoney(before + signedAmount);
    if (after < 0 && !account.allowNegative) throw new ConvexError("الرصيد غير كافٍ");
    balances.set(String(account._id), after);
    prepared.push({ account, signedAmount, before, after });
  }
  const transactionNumber = await nextDocumentNumber(ctx, "finance");
  const transactionId = await ctx.db.insert("financialTransactions", {
    transactionNumber, idempotencyKey, requestFingerprint, type: input.type, status: "posted", date: input.date,
    amount, feeAmount, netAmount: roundMoney(amount - feeAmount), description,
    referenceType: input.referenceType, referenceId: input.referenceId, referenceNumber: input.referenceNumber,
    customerId: input.customerId, supplierId: input.supplierId, branchId: input.branchId, destinationBranchId: input.destinationBranchId,
    userId: user.userId, createdAt: Date.now(), originalTransactionId: input.originalTransactionId,
  });
  for (const movement of prepared) {
    await ctx.db.patch(movement.account._id, { currentBalance: movement.after, updatedAt: Date.now() });
    await ctx.db.insert("financialMovements", { transactionId, accountId: movement.account._id, signedAmount: movement.signedAmount,
      balanceBefore: movement.before, balanceAfter: movement.after, branchId: movement.account.branchId, date: input.date,
      availableAt: availableAt(input.date, movement.account, movement.signedAmount), createdAt: Date.now() });
  }
  const journalEntry = await postFinancialTransactionJournal(ctx, user, transactionId);
  await logAction(ctx, user, {
    action: input.type === "reversal" ? "reverse" : "post",
    module: "finance",
    recordId: String(transactionId),
    recordLabel: transactionNumber,
    details: input.description,
    branchId: input.branchId,
    sourceType: input.referenceType ?? "financial_transaction",
    sourceId: input.referenceId ?? String(transactionId),
    sourceNumber: input.referenceNumber ?? transactionNumber,
    relatedType: input.originalTransactionId ? "financial_transaction" : undefined,
    relatedId: input.originalTransactionId ? String(input.originalTransactionId) : undefined,
    financialTransactionId: String(transactionId),
    journalEntryId: journalEntry?._id ? String(journalEntry._id) : undefined,
    reversalOfId: input.originalTransactionId ? String(input.originalTransactionId) : undefined,
    after: {
      type: input.type,
      status: "posted",
      date: input.date,
      amount,
      feeAmount,
      branchId: String(input.branchId),
      referenceType: input.referenceType ?? null,
      referenceNumber: input.referenceNumber ?? null,
    },
  });
  return { transactionId, duplicate: false };
}

/** Reverses a posted transaction and maintains both sides of the relationship. */
export async function reversePostedFinancialTransaction(ctx: MutationCtx, user: AuthUser, input: {
  transactionId: Id<"financialTransactions">; reason: string; date: string; requestId: string;
  referenceType?: string; referenceId?: string; referenceNumber?: string;
}) {
  const original = await ctx.db.get(input.transactionId);
  if (!original) throw new ConvexError("المعاملة الأصلية غير موجودة");
  const existing = await findFinancialTransactionByRequest(ctx, "reversal", user.userId, input.requestId);
  if (existing) {
    if (existing.originalTransactionId !== original._id) throw new ConvexError("معرف طلب العكس مستخدم لعملية أخرى");
    return existing._id;
  }
  if (original.status === "reversed" || original.reversalTransactionId) throw new ConvexError("تم عكس المعاملة سابقاً بطلب مختلف");
  const movements = await ctx.db.query("financialMovements").withIndex("by_transaction", q => q.eq("transactionId", original._id)).collect();
  const posted = await postFinancialTransaction(ctx, user, { type: "reversal", requestId: input.requestId, date: input.date, amount: original.amount,
    description: `عكس ${original.transactionNumber}: ${input.reason}`, branchId: original.branchId, originalTransactionId: original._id,
    referenceType: input.referenceType ?? "financial_transaction", referenceId: input.referenceId ?? String(original._id), referenceNumber: input.referenceNumber ?? original.transactionNumber,
    customerId: original.customerId, supplierId: original.supplierId, movements: movements.map(movement => ({ accountId: movement.accountId, signedAmount: -movement.signedAmount })) });
  await ctx.db.patch(original._id, { status: "reversed", reversedAt: Date.now(), reversedBy: user.userId, reversalReason: input.reason, reversalTransactionId: posted.transactionId });
  return posted.transactionId;
}
