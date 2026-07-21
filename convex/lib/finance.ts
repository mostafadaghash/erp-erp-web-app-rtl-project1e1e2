import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { ConvexError } from "convex/values";
import { roundMoney } from "../../shared/businessRules";
import { nextDocumentNumber } from "./documentNumbers";
import type { AuthUser } from "./auth";

export type FinancialTransactionType = Doc<"financialTransactions">["type"];
export type MovementInput = { accountId: Id<"financialAccounts">; signedAmount: number };

export function financialIdempotencyKey(type: string, userId: string, requestId: string): string {
  const request = requestId.trim();
  if (!request || request.length > 200) throw new ConvexError("معرف الطلب غير صالح");
  return `${type}:${userId}:${request}`;
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

function availableAt(date: string, account: Doc<"financialAccounts">, signedAmount: number): string | undefined {
  if (signedAmount <= 0 || !["paymob_clearing", "fawry_clearing", "card_clearing"].includes(account.type)) return undefined;
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
  referenceType?: string; referenceId?: string; referenceNumber?: string; customerId?: Id<"customers">;
  movements: MovementInput[]; originalTransactionId?: Id<"financialTransactions">;
}): Promise<{ transactionId: Id<"financialTransactions">; duplicate: boolean }> {
  const idempotencyKey = financialIdempotencyKey(input.type, user.userId, input.requestId);
  const duplicate = await ctx.db.query("financialTransactions").withIndex("by_idempotency_key", q => q.eq("idempotencyKey", idempotencyKey)).unique();
  if (duplicate) return { transactionId: duplicate._id, duplicate: true };
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
    transactionNumber, idempotencyKey, type: input.type, status: "posted", date: input.date,
    amount, feeAmount, netAmount: roundMoney(amount - feeAmount), description: input.description,
    referenceType: input.referenceType, referenceId: input.referenceId, referenceNumber: input.referenceNumber,
    customerId: input.customerId, branchId: input.branchId, destinationBranchId: input.destinationBranchId,
    userId: user.userId, createdAt: Date.now(), originalTransactionId: input.originalTransactionId,
  });
  for (const movement of prepared) {
    await ctx.db.patch(movement.account._id, { currentBalance: movement.after, updatedAt: Date.now() });
    await ctx.db.insert("financialMovements", { transactionId, accountId: movement.account._id, signedAmount: movement.signedAmount,
      balanceBefore: movement.before, balanceAfter: movement.after, branchId: movement.account.branchId, date: input.date,
      availableAt: availableAt(input.date, movement.account, movement.signedAmount), createdAt: Date.now() });
  }
  await ctx.db.insert("auditLogs", { userId: user.userId, userName: user.name, action: "post", module: "finance",
    recordId: String(transactionId), recordLabel: transactionNumber, details: input.description, branchId: input.branchId, timestamp: Date.now() });
  return { transactionId, duplicate: false };
}
