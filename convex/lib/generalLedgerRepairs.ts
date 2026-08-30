import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { AuthUser } from "./auth";
import { postJournal, type PostingLine } from "./generalLedger.ts";
import {
  assertIsoDate,
  fromCents,
  toCents,
} from "./generalLedgerRules.ts";

type RepairSystemKey =
  | "accounts_receivable"
  | "sales"
  | "inventory"
  | "cogs";

export async function repairPostingState(ctx: MutationCtx) {
  const settings = await ctx.db.query("generalLedgerSettings").first();
  return {
    financial: settings?.financialPostingEnabled === true,
    operational: settings?.operationalPostingEnabled === true,
  };
}

async function operationalSettings(ctx: MutationCtx, dateInput: string) {
  const settings = await ctx.db.query("generalLedgerSettings").first();
  if (!settings?.operationalPostingEnabled) return null;
  if (!settings.financialPostingEnabled) {
    throw new ConvexError(
      "يجب تفعيل ربط الخزائن بالأستاذ العام قبل ترحيل إيراد الصيانة",
    );
  }
  const date = assertIsoDate(dateInput);
  const cutoverDate =
    settings.financialPostingCutoverDate ?? settings.cutoverDate;
  if (date < cutoverDate) {
    throw new ConvexError("تاريخ الصيانة يسبق تاريخ الربط التشغيلي");
  }
  return { settings, date };
}

async function systemAccount(ctx: MutationCtx, key: RepairSystemKey) {
  const account = await ctx.db
    .query("chartOfAccounts")
    .withIndex("by_system_key", (q) => q.eq("systemKey", key))
    .unique();
  if (!account?.isActive || !account.isPosting) {
    throw new ConvexError(`حساب الأستاذ العام غير صالح: ${key}`);
  }
  return account;
}

async function postingLine(
  ctx: MutationCtx,
  key: RepairSystemKey,
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

/**
 * Posts the repair charge and the exact historical inventory/COGS effect of
 * inventory-backed spare parts. Cash collections remain owned by the financial
 * bridge.
 */
export async function postRepairRevenueJournal(
  ctx: MutationCtx,
  user: AuthUser,
  input: {
    branchId: Id<"branches">;
    date: string;
    requestId: string;
    repairId: Id<"repairs">;
    repairNumber: string;
    laborCost: number;
    partsRevenue?: number;
    partsCogs?: number;
  },
): Promise<Doc<"journalEntries"> | null> {
  const state = await operationalSettings(ctx, input.date);
  if (!state) return null;
  const amountCents =
    toCents(input.laborCost) + toCents(input.partsRevenue ?? 0);
  const cogsCents = toCents(input.partsCogs ?? 0);
  if (!amountCents && !cogsCents) return null;

  const lines = (
    await Promise.all([
      postingLine(
        ctx,
        "accounts_receivable",
        amountCents,
        0,
        `${input.repairNumber} — مديونية خدمة الصيانة`,
      ),
      postingLine(
        ctx,
        "sales",
        0,
        amountCents,
        `${input.repairNumber} — إيراد خدمة الصيانة`,
      ),
      postingLine(
        ctx,
        "cogs",
        cogsCents,
        0,
        `${input.repairNumber} — تكلفة قطع غيار الصيانة`,
      ),
      postingLine(
        ctx,
        "inventory",
        0,
        cogsCents,
        `${input.repairNumber} — مخزون قطع غيار الصيانة`,
      ),
    ])
  ).filter((line): line is PostingLine => line !== null);
  return postJournal(ctx, user, {
    branchId: input.branchId,
    date: state.date,
    memo: `repair_charge: ${input.repairNumber}`,
    lines,
    requestId: input.requestId,
    sourceType: "operational",
    operationType: "repair_charge",
    referenceType: "repair",
    referenceId: String(input.repairId),
    referenceNumber: input.repairNumber,
  });
}

export async function reverseRepairRevenueJournal(
  ctx: MutationCtx,
  user: AuthUser,
  input: {
    branchId: Id<"branches">;
    date: string;
    requestId: string;
    repairId: Id<"repairs">;
    repairNumber: string;
    originalEntryId?: Id<"journalEntries">;
    reason: string;
    hasAccountingImpact: boolean;
  },
): Promise<Doc<"journalEntries"> | null> {
  const state = await operationalSettings(ctx, input.date);
  if (!state) return null;
  if (!input.hasAccountingImpact) return null;
  if (!input.originalEntryId) {
    throw new ConvexError(
      "الصيانة القديمة غير مرتبطة بقيد إيراد؛ راجعها قبل الإلغاء",
    );
  }
  const original = await ctx.db.get(input.originalEntryId);
  if (
    !original ||
    original.branchId !== input.branchId ||
    original.referenceType !== "repair" ||
    original.referenceId !== String(input.repairId)
  ) {
    throw new ConvexError("قيد إيراد الصيانة الأصلي غير صالح");
  }
  if (state.date < original.entryDate) {
    throw new ConvexError("تاريخ الإلغاء لا يمكن أن يسبق تاريخ الصيانة");
  }
  const originalLines = await ctx.db
    .query("journalLines")
    .withIndex("by_entry", (q) => q.eq("entryId", original._id))
    .collect();
  if (originalLines.length !== original.lineCount) {
    throw new ConvexError("سطور قيد إيراد الصيانة الأصلي غير مكتملة");
  }
  const reversal = await postJournal(ctx, user, {
    branchId: input.branchId,
    date: state.date,
    memo: `repair_cancel: ${input.repairNumber}`,
    lines: originalLines.map((line) => ({
      accountId: line.accountId,
      debit: line.credit,
      credit: line.debit,
      description: `إلغاء ${line.description ?? input.repairNumber}`,
    })),
    requestId: input.requestId,
    sourceType: "operational_reversal",
    originalEntryId: original._id,
    reversalReason: input.reason,
    operationType: "repair_cancel",
    referenceType: "repair",
    referenceId: String(input.repairId),
    referenceNumber: input.repairNumber,
  });
  await ctx.db.patch(original._id, {
    status: "reversed",
    reversalEntryId: reversal._id,
    reversalDate: state.date,
    reversalReason: input.reason,
    reversedAt: Date.now(),
    reversedBy: user.userId,
  });
  return reversal;
}
