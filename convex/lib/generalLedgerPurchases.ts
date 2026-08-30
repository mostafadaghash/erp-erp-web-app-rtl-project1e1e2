import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { AuthUser } from "./auth";
import { postJournal, type PostingLine } from "./generalLedger.ts";
import { fromCents, toCents } from "./generalLedgerRules.ts";

type PurchaseSystemKey =
  | "inventory"
  | "accounts_payable"
  | "other_liabilities"
  | "other_revenue"
  | "other_expenses";

type PurchaseReceiptJournalInput = {
  branchId: Id<"branches">;
  date: string;
  requestId: string;
  referenceId: string;
  referenceNumber: string;
  totalLandedCost: number;
  payableAmount: number;
  externalFreightAmount: number;
};

type PurchaseReturnJournalInput = {
  branchId: Id<"branches">;
  date: string;
  requestId: string;
  referenceId: string;
  referenceNumber: string;
  totalCredit: number;
  inventoryValueRemoved: number;
};

type PurchaseReturnReversalInput = {
  branchId: Id<"branches">;
  date: string;
  requestId: string;
  referenceId: string;
  referenceNumber: string;
  originalEntryId?: Id<"journalEntries">;
  reason: string;
  hasAccountingImpact: boolean;
};

async function systemAccount(ctx: MutationCtx, key: PurchaseSystemKey) {
  const account = await ctx.db
    .query("chartOfAccounts")
    .withIndex("by_system_key", (q) => q.eq("systemKey", key))
    .unique();
  if (!account?.isActive || !account.isPosting) {
    throw new ConvexError(`حساب الأستاذ العام غير صالح: ${key}`);
  }
  return account;
}

async function line(
  ctx: MutationCtx,
  key: PurchaseSystemKey,
  debitCents: number,
  creditCents: number,
  description: string,
): Promise<PostingLine | null> {
  if (!debitCents && !creditCents) return null;
  const account = await systemAccount(ctx, key);
  return {
    accountId: account._id,
    debit: fromCents(debitCents),
    credit: fromCents(creditCents),
    description,
  };
}

async function push(
  lines: PostingLine[],
  pending: Promise<PostingLine | null>,
) {
  const resolved = await pending;
  if (resolved) lines.push(resolved);
}

function cents(value: number, label: string) {
  try {
    return toCents(value);
  } catch {
    throw new ConvexError(`${label} يجب أن يكون غير سالب وبدقة قرشين`);
  }
}

async function operationalSettings(ctx: MutationCtx, date: string) {
  const settings = await ctx.db.query("generalLedgerSettings").first();
  if (!settings?.operationalPostingEnabled) return null;
  if (!settings.financialPostingEnabled) {
    throw new ConvexError(
      "يجب تفعيل ربط الخزائن بالأستاذ العام قبل الترحيل التشغيلي",
    );
  }
  const cutoverDate =
    settings.financialPostingCutoverDate ?? settings.cutoverDate;
  if (date < cutoverDate) {
    throw new ConvexError("تاريخ المستند يسبق تاريخ الربط التشغيلي");
  }
  return settings;
}

/**
 * Posts the inventory, supplier-liability, and external-freight legs of a
 * purchase receipt. External freight remains in a dedicated control liability
 * until a carrier-payables cycle owns its settlement.
 */
export async function postPurchaseReceiptJournal(
  ctx: MutationCtx,
  user: AuthUser,
  input: PurchaseReceiptJournalInput,
): Promise<Doc<"journalEntries"> | null> {
  if (!(await operationalSettings(ctx, input.date))) return null;
  const landedCents = cents(input.totalLandedCost, "قيمة المخزون المستلم");
  const payableCents = cents(input.payableAmount, "مديونية المورد");
  const externalFreightCents = cents(
    input.externalFreightAmount,
    "التزام الشحن الخارجي",
  );
  if (landedCents !== payableCents + externalFreightCents) {
    throw new ConvexError(
      "قيمة المخزون لا تساوي مديونية المورد والتزام الشحن الخارجي",
    );
  }
  if (!landedCents) return null;

  const lines: PostingLine[] = [];
  await push(
    lines,
    line(
      ctx,
      "inventory",
      landedCents,
      0,
      `${input.referenceNumber} — مخزون مستلم`,
    ),
  );
  await push(
    lines,
    line(
      ctx,
      "accounts_payable",
      0,
      payableCents,
      `${input.referenceNumber} — مراقبة الموردين`,
    ),
  );
  await push(
    lines,
    line(
      ctx,
      "other_liabilities",
      0,
      externalFreightCents,
      `${input.referenceNumber} — شحن خارجي مستحق`,
    ),
  );

  return postJournal(ctx, user, {
    branchId: input.branchId,
    date: input.date,
    memo: `purchase_receipt: ${input.referenceNumber}`,
    lines,
    requestId: input.requestId,
    sourceType: "operational",
    operationType: "purchase_receipt",
    referenceType: "purchase_receipt",
    referenceId: input.referenceId,
    referenceNumber: input.referenceNumber,
  });
}

/**
 * Posts the supplier credit in full. The financial bridge separately posts a
 * cash supplier refund (Dr cash / Cr AP), so the combined AP movement equals
 * only the debt-reduction amount. Current inventory valuation differences are
 * explicit other income/expense rather than hidden in inventory or AP.
 */
export async function postPurchaseReturnJournal(
  ctx: MutationCtx,
  user: AuthUser,
  input: PurchaseReturnJournalInput,
): Promise<Doc<"journalEntries"> | null> {
  if (!(await operationalSettings(ctx, input.date))) return null;
  const creditCents = cents(input.totalCredit, "إجمالي إشعار الخصم");
  const inventoryCents = cents(
    input.inventoryValueRemoved,
    "قيمة المخزون المرتجع",
  );
  const differenceCents = creditCents - inventoryCents;
  if (!creditCents && !inventoryCents) return null;

  const lines: PostingLine[] = [];
  await push(
    lines,
    line(
      ctx,
      "accounts_payable",
      creditCents,
      0,
      `${input.referenceNumber} — تخفيض مراقبة الموردين`,
    ),
  );
  await push(
    lines,
    line(
      ctx,
      "inventory",
      0,
      inventoryCents,
      `${input.referenceNumber} — مخزون مرتجع`,
    ),
  );
  await push(
    lines,
    line(
      ctx,
      "other_revenue",
      0,
      Math.max(differenceCents, 0),
      `${input.referenceNumber} — مكسب فرق تقييم مرتجع`,
    ),
  );
  await push(
    lines,
    line(
      ctx,
      "other_expenses",
      Math.max(-differenceCents, 0),
      0,
      `${input.referenceNumber} — خسارة فرق تقييم مرتجع`,
    ),
  );

  return postJournal(ctx, user, {
    branchId: input.branchId,
    date: input.date,
    memo: `purchase_return: ${input.referenceNumber}`,
    lines,
    requestId: input.requestId,
    sourceType: "operational",
    operationType: "purchase_return",
    referenceType: "purchase_return",
    referenceId: input.referenceId,
    referenceNumber: input.referenceNumber,
  });
}

export async function reversePurchaseReturnJournal(
  ctx: MutationCtx,
  user: AuthUser,
  input: PurchaseReturnReversalInput,
): Promise<Doc<"journalEntries"> | null> {
  if (!(await operationalSettings(ctx, input.date))) return null;
  if (!input.originalEntryId) {
    if (input.hasAccountingImpact) {
      throw new ConvexError(
        "لا يمكن إلغاء مرتجع غير مرتبط بقيده التشغيلي الأصلي",
      );
    }
    return null;
  }
  const original = await ctx.db.get(input.originalEntryId);
  if (
    !original ||
    original.referenceType !== "purchase_return" ||
    original.referenceId !== input.referenceId
  ) {
    throw new ConvexError("قيد مرتجع الشراء الأصلي غير صالح");
  }
  const originalLines = await ctx.db
    .query("journalLines")
    .withIndex("by_entry", (q) => q.eq("entryId", original._id))
    .collect();
  const reversal = await postJournal(ctx, user, {
    branchId: input.branchId,
    date: input.date,
    memo: `purchase_return_reversal: ${input.referenceNumber}`,
    lines: originalLines.map((item) => ({
      accountId: item.accountId,
      debit: item.credit,
      credit: item.debit,
      description: `إلغاء: ${item.description ?? input.referenceNumber}`,
    })),
    requestId: input.requestId,
    sourceType: "operational_reversal",
    originalEntryId: original._id,
    reversalReason: input.reason,
    operationType: "purchase_return_reversal",
    referenceType: "purchase_return",
    referenceId: input.referenceId,
    referenceNumber: input.referenceNumber,
  });
  await ctx.db.patch(original._id, {
    status: "reversed",
    reversalEntryId: reversal._id,
    reversalDate: input.date,
    reversalReason: input.reason,
    reversedAt: Date.now(),
    reversedBy: user.userId,
  });
  return reversal;
}
