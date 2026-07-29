import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { AuthUser } from "./auth";
import { postJournal, type PostingLine } from "./generalLedger";
import {
  assertIsoDate,
  fingerprint,
  fromCents,
  normalizeRequestId,
  periodKeyOf,
} from "./generalLedgerRules";

type ReadCtx = QueryCtx | MutationCtx;
type SystemKey =
  | "cash"
  | "banks"
  | "wallets"
  | "cod_receivable"
  | "accounts_receivable"
  | "accounts_payable"
  | "other_liabilities"
  | "sales_returns"
  | "general_operating_expenses"
  | "shipping_fees"
  | "opening_equity";

export const FINANCIAL_POSTING_SYSTEM_KEYS: readonly SystemKey[] = [
  "cash",
  "banks",
  "wallets",
  "cod_receivable",
  "accounts_receivable",
  "accounts_payable",
  "other_liabilities",
  "sales_returns",
  "general_operating_expenses",
  "shipping_fees",
  "opening_equity",
];

export function financialAccountSystemKey(
  type: Doc<"financialAccounts">["type"],
): SystemKey {
  if (type === "bank") return "banks";
  if (type === "cod_clearing") return "cod_receivable";
  if (
    [
      "instapay",
      "vodafone_cash",
      "fawry_clearing",
      "paymob_clearing",
      "card_clearing",
    ].includes(type)
  )
    return "wallets";
  return "cash";
}

async function systemAccount(ctx: ReadCtx, key: SystemKey) {
  const account = await ctx.db
    .query("chartOfAccounts")
    .withIndex("by_system_key", (q) => q.eq("systemKey", key))
    .unique();
  if (!account?.isActive || !account.isPosting)
    throw new ConvexError(`حساب الأستاذ العام غير صالح: ${key}`);
  return account;
}

function signedCents(value: number): number {
  if (!Number.isFinite(value) || Math.round(value * 100) !== value * 100)
    throw new ConvexError("حركة الحساب المالي ليست بدقة قرشين");
  return Math.round(value * 100);
}

function assertFlow(actual: number, expected: number, label: string) {
  if (actual !== expected)
    throw new ConvexError(`حركات ${label} لا تطابق مبلغ المعاملة`);
}

async function assetLines(
  ctx: ReadCtx,
  movements: Doc<"financialMovements">[],
  transactionNumber: string,
): Promise<{ lines: PostingLine[]; debitCents: number; creditCents: number }> {
  const lines: PostingLine[] = [];
  let debitCents = 0;
  let creditCents = 0;
  for (const [index, movement] of movements.entries()) {
    const account = await ctx.db.get(movement.accountId);
    if (!account)
      throw new ConvexError("الحساب المالي المرتبط بالحركة غير موجود");
    const cents = signedCents(movement.signedAmount);
    if (!cents) throw new ConvexError("حركة مالية صفرية غير صالحة للترحيل");
    const chart = await systemAccount(
      ctx,
      financialAccountSystemKey(account.type),
    );
    const debit = cents > 0 ? fromCents(cents) : 0;
    const credit = cents < 0 ? fromCents(-cents) : 0;
    debitCents += Math.max(cents, 0);
    creditCents += Math.max(-cents, 0);
    lines.push({
      accountId: chart._id,
      debit,
      credit,
      description: `${transactionNumber} — ${account.name} — حركة ${index + 1}`,
    });
  }
  return { lines, debitCents, creditCents };
}

async function counterpartyLine(
  ctx: ReadCtx,
  key: SystemKey,
  debitCents: number,
  creditCents: number,
  description: string,
): Promise<PostingLine> {
  const account = await systemAccount(ctx, key);
  return {
    accountId: account._id,
    debit: fromCents(debitCents),
    credit: fromCents(creditCents),
    description,
  };
}

async function financialLines(
  ctx: ReadCtx,
  transaction: Doc<"financialTransactions">,
  movements: Doc<"financialMovements">[],
): Promise<PostingLine[]> {
  const assets = await assetLines(
    ctx,
    movements,
    transaction.transactionNumber,
  );
  const amount = signedCents(transaction.amount);
  const fee = signedCents(transaction.feeAmount);
  const lines = [...assets.lines];
  const add = async (
    key: SystemKey,
    debit: number,
    credit: number,
    label: string,
  ) => {
    if (debit || credit)
      lines.push(
        await counterpartyLine(
          ctx,
          key,
          debit,
          credit,
          `${transaction.transactionNumber} — ${label}`,
        ),
      );
  };

  switch (transaction.type) {
    case "opening_balance":
      assertFlow(assets.debitCents, amount, "الرصيد الافتتاحي");
      assertFlow(assets.creditCents, 0, "الرصيد الافتتاحي");
      await add("opening_equity", 0, amount, "مقابل الرصيد الافتتاحي");
      break;
    case "invoice_payment":
    case "repair_payment":
      assertFlow(assets.debitCents, amount, "التحصيل");
      assertFlow(assets.creditCents, 0, "التحصيل");
      await add("accounts_receivable", 0, amount, "تخفيض مديونية العميل");
      break;
    case "invoice_refund":
    case "repair_refund":
      assertFlow(assets.creditCents, amount, "استرداد التحصيل");
      assertFlow(assets.debitCents, 0, "استرداد التحصيل");
      await add("accounts_receivable", amount, 0, "إعادة مديونية العميل");
      break;
    case "order_deposit":
      assertFlow(assets.debitCents, amount, "عربون الطلب");
      assertFlow(assets.creditCents, 0, "عربون الطلب");
      await add("other_liabilities", 0, amount, "مقدمات العملاء");
      break;
    case "order_refund":
      assertFlow(assets.creditCents, amount, "استرداد العربون");
      assertFlow(assets.debitCents, 0, "استرداد العربون");
      await add("other_liabilities", amount, 0, "تخفيض مقدمات العملاء");
      break;
    case "expense_payment":
      assertFlow(assets.creditCents, amount, "صرف المصروف");
      assertFlow(assets.debitCents, 0, "صرف المصروف");
      await add("general_operating_expenses", amount, 0, "مصروف تشغيلي");
      break;
    case "supplier_payment":
      assertFlow(assets.creditCents, amount, "دفع المورد");
      assertFlow(assets.debitCents, 0, "دفع المورد");
      await add("accounts_payable", amount, 0, "تخفيض مديونية المورد");
      break;
    case "supplier_refund":
      assertFlow(assets.debitCents, amount, "رد المورد");
      assertFlow(assets.creditCents, 0, "رد المورد");
      await add("accounts_payable", 0, amount, "رد نقدي من المورد");
      break;
    case "delivery_cod_collection":
      assertFlow(assets.debitCents, amount, "تحصيل COD");
      assertFlow(assets.creditCents, 0, "تحصيل COD");
      await add("accounts_receivable", 0, amount, "تخفيض مديونية العميل");
      break;
    case "sales_return_refund":
      assertFlow(assets.creditCents, amount, "رد مرتجع المبيعات");
      assertFlow(assets.debitCents, 0, "رد مرتجع المبيعات");
      await add("sales_returns", amount, 0, "مردودات المبيعات النقدية");
      break;
    case "account_transfer":
      assertFlow(assets.debitCents, amount, "التحويل");
      assertFlow(assets.creditCents, amount, "التحويل");
      break;
    case "paymob_settlement":
    case "clearing_settlement":
    case "cod_settlement":
      assertFlow(assets.creditCents, amount, "التسوية");
      assertFlow(assets.debitCents, amount - fee, "صافي التسوية");
      await add("shipping_fees", fee, 0, "رسوم التسوية");
      break;
    case "reversal":
      throw new ConvexError("يجب اشتقاق قيد العكس من المعاملة الأصلية");
  }
  return lines;
}

export async function financialPostingReadiness(
  ctx: ReadCtx,
  cutoverDateInput: string,
) {
  const cutoverDate = assertIsoDate(cutoverDateInput);
  const settings = await ctx.db.query("generalLedgerSettings").first();
  const financeSettings = await ctx.db.query("financeSettings").first();
  const issues: string[] = [];
  if (!settings) issues.push("لم تتم تهيئة الأستاذ العام");
  if (!financeSettings?.isInitialized) issues.push("لم تتم تهيئة دفتر الخزائن");
  const period = await ctx.db
    .query("accountingPeriods")
    .withIndex("by_key", (q) => q.eq("periodKey", periodKeyOf(cutoverDate)))
    .unique();
  if (!period || period.status !== "open")
    issues.push("فترة تاريخ الربط ليست مفتوحة");

  const accounts = new Map<SystemKey, Doc<"chartOfAccounts">>();
  for (const key of FINANCIAL_POSTING_SYSTEM_KEYS) {
    try {
      accounts.set(key, await systemAccount(ctx, key));
    } catch {
      issues.push(`حساب النظام غير جاهز: ${key}`);
    }
  }

  const branches = (await ctx.db.query("branches").collect()).filter(
    (branch) => branch.isActive,
  );
  for (const branch of branches) {
    const opening = await ctx.db
      .query("generalLedgerOpenings")
      .withIndex("by_branch", (q) => q.eq("branchId", branch._id))
      .unique();
    if (!opening || opening.openingDate !== cutoverDate) {
      issues.push(
        `افتتاح الأستاذ العام للفرع ${branch.name} يجب أن يطابق تاريخ الربط`,
      );
      continue;
    }
    const financeAccounts = await ctx.db
      .query("financialAccounts")
      .withIndex("by_branch", (q) => q.eq("branchId", branch._id))
      .collect();
    for (const key of ["cash", "banks", "wallets", "cod_receivable"] as const) {
      const chart = accounts.get(key);
      if (!chart) continue;
      const expected = financeAccounts
        .filter((account) => financialAccountSystemKey(account.type) === key)
        .reduce((sum, account) => sum + signedCents(account.currentBalance), 0);
      const balance = await ctx.db
        .query("generalLedgerAccountBalances")
        .withIndex("by_key", (q) => q.eq("key", `${branch._id}:${chart._id}`))
        .unique();
      const actual = signedCents(balance?.netDebitBalance ?? 0);
      if (actual !== expected)
        issues.push(`رصيد ${key} غير مطابق في الفرع ${branch.name}`);
    }
    const unposted = await ctx.db
      .query("financialTransactions")
      .withIndex("by_branch_date", (q) =>
        q.eq("branchId", branch._id).gte("date", cutoverDate),
      )
      .collect();
    if (unposted.some((transaction) => transaction.type !== "opening_balance"))
      issues.push(
        `توجد حركات مالية تشغيلية غير مرحلة بعد تاريخ الربط في الفرع ${branch.name}`,
      );
  }

  return {
    ready: issues.length === 0,
    cutoverDate,
    issues,
    branchCount: branches.length,
    requiredSystemAccounts: FINANCIAL_POSTING_SYSTEM_KEYS.length,
  };
}

export async function activateFinancialPosting(
  ctx: MutationCtx,
  user: AuthUser,
  input: { cutoverDate: string; requestId: string },
) {
  const settings = await ctx.db.query("generalLedgerSettings").first();
  if (!settings) throw new ConvexError("لم تتم تهيئة الأستاذ العام");
  const requestId = normalizeRequestId(input.requestId);
  const cutoverDate = assertIsoDate(input.cutoverDate);
  const activationFingerprint = fingerprint({ cutoverDate });
  if (settings.financialPostingEnabled) {
    if (
      settings.financialPostingRequestId !== requestId ||
      settings.financialPostingFingerprint !== activationFingerprint
    ) {
      throw new ConvexError("تم تفعيل الربط المالي بطلب مختلف");
    }
    return settings;
  }
  const readiness = await financialPostingReadiness(ctx, cutoverDate);
  if (!readiness.ready)
    throw new ConvexError(
      `تعذر تفعيل الربط المالي: ${readiness.issues.join("؛ ")}`,
    );
  await ctx.db.patch(settings._id, {
    financialPostingEnabled: true,
    financialPostingCutoverDate: cutoverDate,
    financialPostingRequestId: requestId,
    financialPostingFingerprint: activationFingerprint,
    financialPostingActivatedAt: Date.now(),
    financialPostingActivatedBy: user.userId,
  });
  const activated = await ctx.db.get(settings._id);
  if (!activated) throw new ConvexError("تعذر حفظ تفعيل الربط المالي");
  return activated;
}

export async function postFinancialTransactionJournal(
  ctx: MutationCtx,
  user: AuthUser,
  transactionId: Id<"financialTransactions">,
) {
  const settings = await ctx.db.query("generalLedgerSettings").first();
  if (!settings?.financialPostingEnabled) return null;
  const transaction = await ctx.db.get(transactionId);
  if (!transaction)
    throw new ConvexError("المعاملة المالية غير موجودة للترحيل المحاسبي");
  const cutoverDate = settings.financialPostingCutoverDate;
  if (!cutoverDate || transaction.date < cutoverDate)
    throw new ConvexError(
      "تاريخ المعاملة يسبق تاريخ ربط الخزائن بالأستاذ العام",
    );
  const existing = await ctx.db
    .query("journalEntries")
    .withIndex("by_financial_transaction", (q) =>
      q.eq("financialTransactionId", transaction._id),
    )
    .unique();
  if (existing) return existing;
  const movements = await ctx.db
    .query("financialMovements")
    .withIndex("by_transaction", (q) => q.eq("transactionId", transaction._id))
    .collect();
  if (
    movements.some((movement) => movement.branchId !== transaction.branchId)
  ) {
    throw new ConvexError(
      "التحويلات بين الفروع تحتاج حسابات وسيطة مستقلة قبل تفعيل ترحيلها",
    );
  }

  if (transaction.type === "reversal") {
    if (!transaction.originalTransactionId)
      throw new ConvexError("معاملة العكس غير مرتبطة بأصل");
    const original = await ctx.db.get(transaction.originalTransactionId);
    if (!original) throw new ConvexError("المعاملة الأصلية للعكس غير موجودة");
    const originalMovements = await ctx.db
      .query("financialMovements")
      .withIndex("by_transaction", (q) => q.eq("transactionId", original._id))
      .collect();
    const originalLines = await financialLines(
      ctx,
      original,
      originalMovements,
    );
    const originalJournal = await ctx.db
      .query("journalEntries")
      .withIndex("by_financial_transaction", (q) =>
        q.eq("financialTransactionId", original._id),
      )
      .unique();
    const reversal = await postJournal(ctx, user, {
      branchId: transaction.branchId,
      date: transaction.date,
      memo: transaction.description,
      lines: originalLines.map((line) => ({
        ...line,
        debit: line.credit,
        credit: line.debit,
        description: `عكس: ${line.description ?? original.transactionNumber}`,
      })),
      requestId: `financial:${transaction._id}`,
      sourceType: "financial_reversal",
      originalEntryId: originalJournal?._id,
      reversalReason: transaction.description,
      operationType: transaction.type,
      referenceType: transaction.referenceType ?? "financial_transaction",
      referenceId: transaction.referenceId ?? String(original._id),
      referenceNumber:
        transaction.referenceNumber ?? original.transactionNumber,
      financialTransactionId: transaction._id,
    });
    if (originalJournal) {
      await ctx.db.patch(originalJournal._id, {
        status: "reversed",
        reversalEntryId: reversal._id,
        reversalReason: transaction.description,
        reversalDate: transaction.date,
        reversedAt: Date.now(),
        reversedBy: user.userId,
      });
    }
    return reversal;
  }

  const lines = await financialLines(ctx, transaction, movements);
  return await postJournal(ctx, user, {
    branchId: transaction.branchId,
    date: transaction.date,
    memo: transaction.description,
    lines,
    requestId: `financial:${transaction._id}`,
    sourceType: "financial",
    operationType: transaction.type,
    referenceType: transaction.referenceType ?? "financial_transaction",
    referenceId: transaction.referenceId ?? String(transaction._id),
    referenceNumber:
      transaction.referenceNumber ?? transaction.transactionNumber,
    financialTransactionId: transaction._id,
  });
}
