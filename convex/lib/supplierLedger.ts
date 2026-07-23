import { ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { AuthUser } from "./auth";
import { logAction } from "./auth";
import { requireActiveBranch, requireActiveSupplier } from "./references";
import { requireFinanceInitialized } from "./finance";
import { nextDocumentNumber } from "./documentNumbers";
import { roundMoney } from "../../shared/businessRules";

function hasAtMostTwoDecimals(value: number): boolean { return Number.isFinite(value) && Math.abs(value * 100 - Math.round(value * 100)) < 1e-7; }

export const SUPPLIER_LEDGER_TYPES = ["opening_balance", "purchase_receipt", "purchase_return", "supplier_payment", "supplier_refund", "adjustment", "reversal"] as const;
type PostingType = "purchase_receipt" | "supplier_payment" | "reversal";

export async function postSupplierBalanceMovement(ctx: MutationCtx, user: AuthUser, input: {
  type: PostingType; requestId: string; supplierId: Id<"suppliers">; branchId: Id<"branches">; date: string; amountDelta: number;
  referenceId: string; referenceNumber: string; referenceType: string; description: string; externalInvoiceNumber?: string; dueDate?: string;
  originalEntryId?: Id<"supplierLedgerEntries">;
}) {
  const requestId = input.requestId.trim();
  if (!requestId || requestId.length > 200) throw new ConvexError("معرف طلب حركة المورد غير صالح");
  if (!Number.isFinite(input.amountDelta) || !hasAtMostTwoDecimals(input.amountDelta)) throw new ConvexError("قيمة حركة المورد يجب أن تكون مقربة إلى منزلتين");
  const amountDelta = roundMoney(input.amountDelta);
  if ((input.type === "purchase_receipt" && amountDelta <= 0) || (input.type === "supplier_payment" && amountDelta >= 0) || (input.type === "reversal" && amountDelta === 0)) throw new ConvexError("اتجاه حركة المورد لا يتوافق مع نوعها");
  await requireFinanceInitialized(ctx, input.date);
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
  if (input.originalEntryId) await ctx.db.patch(input.originalEntryId, { status: "reversed", reversedAt: now, reversedBy: user.userId, reversalEntryId: id });
  await logAction(ctx, user, { action: input.type === "reversal" ? "reverse" : "post", module: "supplier_ledger", recordId: id, recordLabel: entryNumber, details: JSON.stringify({ type: input.type, amountDelta, balanceBefore, balanceAfter, branchId: input.branchId }) });
  const entry = await ctx.db.get(id);
  if (!entry) throw new ConvexError("تعذر إنشاء حركة المورد");
  return entry;
}

export async function postSupplierLedgerEntry(ctx: MutationCtx, user: AuthUser, input: {
  requestId: string; supplierId: Id<"suppliers">; branchId: Id<"branches">; date: string; amount: number;
  referenceId: string; referenceNumber: string; externalInvoiceNumber?: string; dueDate?: string;
}) {
  return await postSupplierBalanceMovement(ctx, user, { ...input, type: "purchase_receipt", amountDelta: input.amount,
    referenceType: "purchase_receipt", description: `استلام شراء ${input.referenceNumber}` });
}
