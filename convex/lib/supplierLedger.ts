import { ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { AuthUser } from "./auth.ts";
import { logAction } from "./auth.ts";
import { requireActiveBranch, requireActiveSupplier } from "./references.ts";
import { requireFinanceInitialized } from "./finance.ts";
import { nextDocumentNumber } from "./documentNumbers.ts";
import { roundMoney } from "../../shared/businessRules.ts";

function hasAtMostTwoDecimals(value: number): boolean { return Number.isFinite(value) && Math.abs(value * 100 - Math.round(value * 100)) < 1e-7; }

export const SUPPLIER_LEDGER_TYPES = ["opening_balance", "purchase_receipt", "purchase_return", "supplier_payment", "supplier_refund", "adjustment", "reversal"] as const;
type PostingType = "opening_balance" | "purchase_receipt" | "purchase_return" | "supplier_refund" | "supplier_payment" | "reversal";

export async function postSupplierBalanceMovement(ctx: MutationCtx, user: AuthUser, input: {
  type: PostingType; requestId: string; supplierId: Id<"suppliers">; branchId: Id<"branches">; date: string; amountDelta: number;
  referenceId: string; referenceNumber: string; referenceType: string; description: string; externalInvoiceNumber?: string; dueDate?: string;
  originalEntryId?: Id<"supplierLedgerEntries">;
  reversalReason?: string; reversalDate?: string;
}) {
  const requestId = input.requestId.trim();
  if (!requestId || requestId.length > 200) throw new ConvexError("معرف طلب حركة المورد غير صالح");
  if (!Number.isFinite(input.amountDelta) || !hasAtMostTwoDecimals(input.amountDelta)) throw new ConvexError("قيمة حركة المورد يجب أن تكون مقربة إلى منزلتين");
  const amountDelta = roundMoney(input.amountDelta);
  if (input.type === "opening_balance" && amountDelta < 0) throw new ConvexError("الرصيد الافتتاحي للمورد لا يمكن أن يكون سالباً");
  if (((input.type === "purchase_receipt" || input.type === "supplier_refund") && amountDelta <= 0) || ((input.type === "supplier_payment" || input.type === "purchase_return") && amountDelta >= 0) || (input.type === "reversal" && amountDelta === 0)) throw new ConvexError("اتجاه حركة المورد لا يتوافق مع نوعها");
  const financeSettings = await requireFinanceInitialized(ctx, input.date);
  if (input.type === "opening_balance" && input.date !== financeSettings.cutoverDate) throw new ConvexError("تاريخ الرصيد الافتتاحي للمورد يجب أن يساوي تاريخ القطع المالي");
  const supplier = await requireActiveSupplier(ctx, input.supplierId);
  await requireActiveBranch(ctx, input.branchId);
  const idempotencyKey = `${input.type}:${user.userId}:${requestId}`;
  const previous = await ctx.db.query("supplierLedgerEntries").withIndex("by_idempotency_key", q => q.eq("idempotencyKey", idempotencyKey)).unique();
  if (previous) {
    if (previous.supplierId !== input.supplierId || previous.branchId !== input.branchId || previous.amountDelta !== amountDelta || previous.referenceId !== input.referenceId || previous.referenceNumber !== input.referenceNumber || previous.date !== input.date || previous.originalEntryId !== input.originalEntryId) throw new ConvexError("أعيد استخدام معرف طلب حركة المورد ببيانات مختلفة");
    return previous;
  }
  const key = `${input.supplierId}:${input.branchId}`;
  const balanceRow = await ctx.db.query("supplierBalances").withIndex("by_key", q => q.eq("key", key)).unique();
  if (input.type === "opening_balance") {
    const existingEntry = await ctx.db.query("supplierLedgerEntries").withIndex("by_supplier_branch_date", q => q.eq("supplierId", input.supplierId).eq("branchId", input.branchId)).first();
    if (existingEntry || (balanceRow && balanceRow.balance !== 0)) throw new ConvexError("سبق تسجيل رصيد أو حركة تشغيلية لهذا المورد في الفرع");
  }
  const balanceBefore = roundMoney(balanceRow?.balance ?? 0), balanceAfter = roundMoney(balanceBefore + amountDelta);
  if (balanceAfter < 0) throw new ConvexError("رصيد المورد لا يكفي لتسجيل الدفعة");
  const now = Date.now();
  if (balanceRow) await ctx.db.patch(balanceRow._id, { balance: balanceAfter, updatedAt: now });
  else await ctx.db.insert("supplierBalances", { key, supplierId: input.supplierId, branchId: input.branchId, balance: balanceAfter, updatedAt: now });
  const entryNumber = await nextDocumentNumber(ctx, "supplierLedger", new Date(`${input.date}T00:00:00.000Z`));
  const id = await ctx.db.insert("supplierLedgerEntries", { entryNumber, idempotencyKey, supplierId: input.supplierId, supplierName: supplier.name, branchId: input.branchId,
    type: input.type, status: "posted", date: input.date, amountDelta, balanceBefore, balanceAfter, referenceType: input.referenceType,
    referenceId: input.referenceId, referenceNumber: input.referenceNumber, externalInvoiceNumber: input.externalInvoiceNumber, dueDate: input.dueDate,
    description: input.description, userId: user.userId, createdAt: now, originalEntryId: input.originalEntryId });
  if (input.originalEntryId) await ctx.db.patch(input.originalEntryId, { status: "reversed", reversedAt: now, reversedBy: user.userId, reversalReason: input.reversalReason, reversalDate: input.reversalDate, reversalEntryId: id });
  await logAction(ctx, user, {
    action: input.type === "reversal" ? "reverse" : "post",
    module: "supplier_ledger",
    recordId: String(id),
    recordLabel: entryNumber,
    details: input.description,
    branchId: input.branchId,
    sourceType: input.referenceType,
    sourceId: input.referenceId,
    sourceNumber: input.referenceNumber,
    relatedType: "supplier",
    relatedId: String(input.supplierId),
    reversalOfId: input.originalEntryId ? String(input.originalEntryId) : undefined,
    before: { balance: balanceBefore },
    after: {
      type: input.type,
      status: "posted",
      date: input.date,
      amountDelta,
      balance: balanceAfter,
      reversalReason: input.reversalReason ?? null,
    },
  });
  const entry = await ctx.db.get(id);
  if (!entry) throw new ConvexError("تعذر إنشاء حركة المورد");
  return entry;
}

export async function initializeSupplierBalance(ctx: MutationCtx, user: AuthUser, input: {
  requestId: string; supplierId: Id<"suppliers">; branchId: Id<"branches">; date: string; balance: number; notes?: string;
}) {
  if (!hasAtMostTwoDecimals(input.balance) || input.balance < 0) throw new ConvexError("الرصيد الافتتاحي للمورد يجب أن يكون غير سالب ودقيقاً إلى قرشين");
  return await postSupplierBalanceMovement(ctx, user, {
    type: "opening_balance",
    requestId: input.requestId,
    supplierId: input.supplierId,
    branchId: input.branchId,
    date: input.date,
    amountDelta: input.balance,
    referenceType: "supplier",
    referenceId: String(input.supplierId),
    referenceNumber: "OPENING",
    description: input.notes?.trim() || "الرصيد الافتتاحي للمورد",
  });
}

export async function postSupplierLedgerEntry(ctx: MutationCtx, user: AuthUser, input: {
  requestId: string; supplierId: Id<"suppliers">; branchId: Id<"branches">; date: string; amount: number;
  referenceId: string; referenceNumber: string; externalInvoiceNumber?: string; dueDate?: string;
}) {
  return await postSupplierBalanceMovement(ctx, user, { ...input, type: "purchase_receipt", amountDelta: input.amount,
    referenceType: "purchase_receipt", description: `استلام شراء ${input.referenceNumber}` });
}
