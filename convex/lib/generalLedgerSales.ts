import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { AuthUser } from "./auth";
import { postJournal, type PostingLine } from "./generalLedger.ts";
import { fromCents, toCents } from "./generalLedgerRules.ts";

type SalesSystemKey =
  | "accounts_receivable"
  | "sales"
  | "sales_returns"
  | "inventory"
  | "cogs";

type SalesJournalOperation =
  | "invoice_create"
  | "invoice_adjustment"
  | "invoice_cancel"
  | "sales_return"
  | "sales_return_reversal";

type SalesJournalInput = {
  operation: SalesJournalOperation;
  branchId: Id<"branches">;
  date: string;
  requestId: string;
  referenceId: string;
  referenceNumber: string;
  salesAmount?: number;
  cogsAmount?: number;
  debtReduction?: number;
  originalEntryId?: Id<"journalEntries">;
};

async function systemAccount(ctx: MutationCtx, key: SalesSystemKey) {
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
  key: SalesSystemKey,
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

async function pushLine(
  lines: PostingLine[],
  line: Promise<PostingLine | null>,
) {
  const resolved = await line;
  if (resolved) lines.push(resolved);
}

function signedCents(value: number | undefined, label: string) {
  try {
    return toCents(Math.abs(value ?? 0)) * Math.sign(value ?? 0);
  } catch {
    throw new ConvexError(`${label} يجب أن يكون بدقة قرشين`);
  }
}

async function invoiceLines(
  ctx: MutationCtx,
  input: SalesJournalInput,
  salesCents: number,
  cogsCents: number,
) {
  const lines: PostingLine[] = [];
  const label = `${input.referenceNumber} — ${input.operation}`;
  await pushLine(
    lines,
    postingLine(
      ctx,
      "accounts_receivable",
      Math.max(salesCents, 0),
      Math.max(-salesCents, 0),
      `${label} — مراقبة العملاء`,
    ),
  );
  await pushLine(
    lines,
    postingLine(
      ctx,
      "sales",
      Math.max(-salesCents, 0),
      Math.max(salesCents, 0),
      `${label} — المبيعات`,
    ),
  );
  await pushLine(
    lines,
    postingLine(
      ctx,
      "cogs",
      Math.max(cogsCents, 0),
      Math.max(-cogsCents, 0),
      `${label} — تكلفة المبيعات`,
    ),
  );
  await pushLine(
    lines,
    postingLine(
      ctx,
      "inventory",
      Math.max(-cogsCents, 0),
      Math.max(cogsCents, 0),
      `${label} — المخزون`,
    ),
  );
  return lines;
}

async function returnLines(
  ctx: MutationCtx,
  input: SalesJournalInput,
  returnCents: number,
  reversedCogsCents: number,
) {
  const lines: PostingLine[] = [];
  const label = `${input.referenceNumber} — ${input.operation}`;
  await pushLine(
    lines,
    postingLine(
      ctx,
      "sales_returns",
      Math.max(returnCents, 0),
      Math.max(-returnCents, 0),
      `${label} — مردودات المبيعات`,
    ),
  );
  await pushLine(
    lines,
    postingLine(
      ctx,
      "accounts_receivable",
      Math.max(-returnCents, 0),
      Math.max(returnCents, 0),
      `${label} — مراقبة العملاء`,
    ),
  );
  await pushLine(
    lines,
    postingLine(
      ctx,
      "inventory",
      Math.max(reversedCogsCents, 0),
      Math.max(-reversedCogsCents, 0),
      `${label} — المخزون`,
    ),
  );
  await pushLine(
    lines,
    postingLine(
      ctx,
      "cogs",
      Math.max(-reversedCogsCents, 0),
      Math.max(reversedCogsCents, 0),
      `${label} — تكلفة المبيعات`,
    ),
  );
  return lines;
}

/**
 * Posts the sales, receivable, inventory, and COGS legs of a document.
 *
 * This hook deliberately remains dormant until the final operational cutover.
 * Cash/refund legs are owned by the already-audited finance bridge, so sales
 * returns post only their debt-reduction portion here.
 */
export async function postSalesInventoryJournal(
  ctx: MutationCtx,
  user: AuthUser,
  input: SalesJournalInput,
): Promise<Doc<"journalEntries"> | null> {
  const settings = await ctx.db.query("generalLedgerSettings").first();
  if (!settings?.operationalPostingEnabled) return null;
  if (!settings.financialPostingEnabled) {
    throw new ConvexError(
      "يجب تفعيل ربط الخزائن بالأستاذ العام قبل الترحيل التشغيلي",
    );
  }
  const cutoverDate =
    settings.financialPostingCutoverDate ?? settings.cutoverDate;
  if (input.date < cutoverDate) {
    throw new ConvexError("تاريخ المستند يسبق تاريخ الربط التشغيلي");
  }
  if (
    input.operation === "sales_return_reversal" &&
    !input.originalEntryId
  ) {
    throw new ConvexError(
      "لا يمكن عكس مرتجع غير مرتبط بقيده التشغيلي الأصلي",
    );
  }

  const salesCents = signedCents(input.salesAmount, "صافي المبيعات");
  const cogsCents = signedCents(input.cogsAmount, "تكلفة المبيعات");
  const debtReductionCents = signedCents(
    input.debtReduction,
    "تخفيض مديونية العميل",
  );
  const lines =
    input.operation === "sales_return" ||
    input.operation === "sales_return_reversal"
      ? await returnLines(ctx, input, debtReductionCents, cogsCents)
      : await invoiceLines(ctx, input, salesCents, cogsCents);
  if (lines.length === 0) return null;

  const sourceType =
    input.operation === "sales_return_reversal"
      ? ("operational_reversal" as const)
      : ("operational" as const);
  const entry = await postJournal(ctx, user, {
    branchId: input.branchId,
    date: input.date,
    memo: `${input.operation}: ${input.referenceNumber}`,
    lines,
    requestId: input.requestId,
    sourceType,
    originalEntryId: input.originalEntryId,
    operationType: input.operation,
    referenceType:
      input.operation === "sales_return" ||
      input.operation === "sales_return_reversal"
        ? "sales_return"
        : "invoice",
    referenceId: input.referenceId,
    referenceNumber: input.referenceNumber,
  });

  if (input.originalEntryId) {
    await ctx.db.patch(input.originalEntryId, {
      status: "reversed",
      reversalEntryId: entry._id,
      reversalDate: input.date,
      reversalReason: `عكس المستند ${input.referenceNumber}`,
      reversedAt: Date.now(),
      reversedBy: user.userId,
    });
  }
  return entry;
}
