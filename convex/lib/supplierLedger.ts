import { ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { AuthUser } from "./auth";
import { logAction } from "./auth";
import { requireActiveBranch, requireActiveSupplier } from "./references";
import { requireFinanceInitialized } from "./finance";
import { nextDocumentNumber } from "./documentNumbers";
import { roundMoney } from "../../shared/businessRules";

export const SUPPLIER_LEDGER_TYPES = ["opening_balance", "purchase_receipt", "purchase_return", "supplier_payment", "supplier_refund", "adjustment", "reversal"] as const;

export async function postSupplierLedgerEntry(ctx: MutationCtx, user: AuthUser, input: {
  requestId: string; supplierId: Id<"suppliers">; branchId: Id<"branches">; date: string; amount: number;
  referenceId: string; referenceNumber: string; externalInvoiceNumber?: string; dueDate?: string;
}) {
  const requestId = input.requestId.trim();
  if (!requestId || requestId.length > 200) throw new ConvexError("معرف طلب الاستلام غير صالح");
  const idempotencyKey = `purchase_receipt:${input.supplierId}:${input.branchId}:${requestId}`;
  const amount = roundMoney(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new ConvexError("قيمة مديونية المورد يجب أن تكون أكبر من صفر");
  await requireFinanceInitialized(ctx, input.date);
  const supplier = await requireActiveSupplier(ctx, input.supplierId);
  await requireActiveBranch(ctx, input.branchId);
  const previous = await ctx.db.query("supplierLedgerEntries").withIndex("by_idempotency_key", q => q.eq("idempotencyKey", idempotencyKey)).unique();
  if (previous) {
    if (previous.amountDelta !== amount || previous.referenceId !== input.referenceId || previous.date !== input.date) throw new ConvexError("أعيد استخدام معرف الطلب ببيانات مختلفة");
    return previous;
  }
  const key = `${input.supplierId}:${input.branchId}`;
  const balanceRow = await ctx.db.query("supplierBalances").withIndex("by_key", q => q.eq("key", key)).unique();
  const balanceBefore = roundMoney(balanceRow?.balance ?? 0);
  const balanceAfter = roundMoney(balanceBefore + amount);
  const now = Date.now();
  if (balanceRow) await ctx.db.patch(balanceRow._id, { balance: balanceAfter, updatedAt: now });
  else await ctx.db.insert("supplierBalances", { key, supplierId: input.supplierId, branchId: input.branchId, balance: balanceAfter, updatedAt: now });
  const entryNumber = await nextDocumentNumber(ctx, "supplierLedger", new Date(`${input.date}T00:00:00.000Z`));
  const id = await ctx.db.insert("supplierLedgerEntries", { entryNumber, idempotencyKey, supplierId: input.supplierId, supplierName: supplier.name, branchId: input.branchId,
    type: "purchase_receipt", status: "posted", date: input.date, amountDelta: amount, balanceBefore, balanceAfter, referenceType: "purchase_receipt",
    referenceId: input.referenceId, referenceNumber: input.referenceNumber, externalInvoiceNumber: input.externalInvoiceNumber, dueDate: input.dueDate,
    description: `استلام شراء ${input.referenceNumber}`, userId: user.userId, createdAt: now });
  await logAction(ctx, user, { action: "post", module: "supplier_ledger", recordId: id, recordLabel: entryNumber, details: JSON.stringify({ type: "purchase_receipt", amount, balanceBefore, balanceAfter, branchId: input.branchId }) });
  const entry = await ctx.db.get(id);
  if (!entry) throw new ConvexError("تعذر إنشاء حركة المورد");
  return entry;
}
