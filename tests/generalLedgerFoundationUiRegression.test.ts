import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ui = readFileSync("src/components/GeneralLedgerPage.tsx", "utf8");
const backend = readFileSync("convex/generalLedger.ts", "utf8");

test("GLUI-01 renders the complete page in Arabic RTL", () => {
  assert.match(ui, /dir="rtl"/);
  assert.match(ui, /الأستاذ العام/);
});

test("GLUI-02 keeps the Foundation-only warning visible", () => {
  assert.match(ui, /وضع التأسيس Foundation/);
  assert.match(ui, /الترحيل التشغيلي:[\s\S]*غير مفعّل/);
  assert.match(ui, /COD غير مفعّل بعد/);
});

test("GLUI-03 protects every capability with a top-level permission hook", () => {
  for (const permission of [
    "view_general_ledger",
    "initialize_general_ledger",
    "manage_chart_of_accounts",
    "post_manual_journals",
    "reverse_journal_entries",
    "close_accounting_periods",
    "reopen_accounting_periods",
    "print_general_ledger",
  ]) {
    assert.match(ui, new RegExp(`usePermission\\("${permission}"\\)`));
  }
});

test("GLUI-04 blocks the page when view permission is absent", () => {
  assert.match(ui, /if \(!canView\)/);
  assert.match(ui, /لا تملك صلاحية عرض الأستاذ العام/);
});

test("GLUI-05 loads GL branch options through a protected dedicated query", () => {
  assert.match(ui, /generalLedger\.availableBranches/);
  assert.match(ui, /canView \? \{\} : "skip"/);
  assert.match(backend, /availableBranches=query/);
  assert.match(backend, /requirePermission\(ctx,"view_general_ledger"\)/);
});

test("GLUI-06 lets Admin and Accountant choose a branch", () => {
  assert.match(ui, /me\?\.role === "admin" \|\| me\?\.role === "accountant"/);
  assert.match(ui, /الفرع النشط/);
  assert.match(ui, /onChange=\{\(event\) => changeBranch/);
});

test("GLUI-07 pins non-central users to their available branch", () => {
  assert.match(ui, /canSelectBranch \?/);
  assert.match(ui, /فرع المستخدم/);
  assert.match(backend, /if\(!user\.branchId\)throw new ConvexError/);
});

test("GLUI-08 rotates scoped request ids and selections on branch change", () => {
  assert.match(
    ui,
    /useEffect\(\(\) => \{[\s\S]*openingRequestId\.current = newRequestId\(\)/,
  );
  assert.match(ui, /journalRequestId\.current = newRequestId\(\)/);
  assert.match(ui, /reversalRequestId\.current = newRequestId\(\)/);
  assert.match(ui, /setSelectedEntryId\(null\)/);
});

test("GLUI-09 reads and displays the server cutover date", () => {
  assert.match(backend, /cutoverDate:s\.cutoverDate/);
  assert.match(ui, /status\?\.initialized/);
  assert.match(ui, /setOpeningDate\(status\.cutoverDate\)/);
  assert.match(ui, /تاريخ القطع: \{status\.cutoverDate\}/);
});

test("GLUI-10 initializes the GL with a stable request id and busy guard", () => {
  assert.match(ui, /generalLedger\.initialize/);
  assert.match(ui, /initializeRequestId = useRef\(newRequestId\(\)\)/);
  assert.match(ui, /requestId: initializeRequestId\.current/);
  assert.match(ui, /if \(busy\) return/);
});

test("GLUI-11 exposes all eight functional tabs", () => {
  for (const label of [
    "الملخص",
    "دليل الحسابات",
    "الأرصدة الافتتاحية",
    "قيد يدوي",
    "القيود",
    "الفترات",
    "دفتر الحساب",
    "ميزان المراجعة",
  ]) {
    assert.match(ui, new RegExp(label));
  }
});

test("GLUI-12 renders a hierarchical chart from parent relationships", () => {
  assert.match(ui, /chartChildren = useMemo/);
  assert.match(ui, /renderChart\(/);
  assert.match(ui, /renderChart\(account\._id, depth \+ 1\)/);
});

test("GLUI-13 creates only posting children under active grouping accounts", () => {
  assert.match(ui, /generalLedger\.createAccount/);
  assert.match(ui, /!account\.isPosting && account\.isActive/);
  assert.match(ui, /اختر الحساب التجميعي الأب/);
});

test("GLUI-14 derives account normal side and supports contra accounts", () => {
  assert.match(ui, /newAccountNormalSide/);
  assert.match(ui, /newAccount\.isContra/);
  assert.match(ui, /حساب مقابل Contra/);
});

test("GLUI-15 deactivates accounts through a confirmation modal", () => {
  assert.match(ui, /generalLedger\.deactivateAccount/);
  assert.match(ui, /modal === "deactivate"/);
  assert.match(ui, /ستظل القيود التاريخية محفوظة/);
  assert.doesNotMatch(ui, /window\.confirm/);
});

test("GLUI-16 reads branch opening state with skip protection", () => {
  assert.match(ui, /generalLedger\.openingStatus/);
  assert.match(
    ui,
    /canView && effectiveBranch \? \{ branchId: effectiveBranch \} : "skip"/,
  );
  assert.match(backend, /openingStatus=query/);
});

test("GLUI-17 supports an explicit zero opening without journal lines", () => {
  assert.match(ui, /اعتماد رصيد افتتاحي صفري/);
  assert.match(ui, /lines: zeroOpening \? \[\] : journalArgs\(openingLines\)/);
});

test("GLUI-18 supports a balanced non-zero opening with dynamic lines", () => {
  assert.match(ui, /JournalLinesEditor/);
  assert.match(ui, /openingTotals\.valid/);
  assert.match(ui, /generalLedger\.confirmOpening/);
});

test("GLUI-19 preserves the opening request id across failed retries", () => {
  assert.match(ui, /openingRequestId = useRef\(newRequestId\(\)\)/);
  assert.match(ui, /requestId: openingRequestId\.current/);
  assert.match(
    ui,
    /run\([\s\S]*"تم اعتماد افتتاح الفرع",[\s\S]*openingRequestId/,
  );
});

test("GLUI-20 provides a dynamic multi-line manual journal editor", () => {
  assert.match(ui, /قيد يومية يدوي متعدد السطور/);
  assert.match(ui, /setJournalLines/);
  assert.match(ui, /إضافة سطر/);
  assert.match(ui, /حذف السطر/);
});

test("GLUI-21 prevents one-sided, duplicate, zero, or unbalanced journals", () => {
  assert.match(ui, /duplicateAccounts/);
  assert.match(ui, /Number\.isFinite\(value\)/);
  assert.match(ui, /Math\.round\(value \* 100\)/);
  assert.match(ui, /parsed\.length >= 2/);
  assert.match(ui, /debit > 0/);
  assert.match(ui, /debit === credit/);
});

test("GLUI-22 previews debit credit and difference in EGP", () => {
  assert.match(ui, /إجمالي المدين:/);
  assert.match(ui, /إجمالي الدائن:/);
  assert.match(ui, /الفرق:/);
  assert.match(ui, /currency: "EGP"/);
});

test("GLUI-23 posts journals only after branch opening", () => {
  assert.match(ui, /generalLedger\.postManualJournal/);
  assert.match(ui, /!openingStatus\?\.confirmed/);
  assert.match(ui, /يجب اعتماد افتتاح الفرع قبل ترحيل قيود يدوية/);
});

test("GLUI-24 preserves the journal request id on failure and rotates it on success", () => {
  assert.match(ui, /journalRequestId = useRef\(newRequestId\(\)\)/);
  assert.match(ui, /requestId: journalRequestId\.current/);
  assert.match(ui, /"تم ترحيل القيد",[\s\S]*journalRequestId/);
});

test("GLUI-25 paginates journal entries with real Convex pagination", () => {
  assert.match(ui, /usePaginatedQuery\([\s\S]*generalLedger\.entriesPaginated/);
  assert.match(ui, /entries\.status === "CanLoadMore"/);
  assert.match(ui, /entries\.loadMore\(15\)/);
});

test("GLUI-26 loads entry details only for a selected entry", () => {
  assert.match(ui, /generalLedger\.entryDetails/);
  assert.match(
    ui,
    /canView && selectedEntryId \? \{ entryId: selectedEntryId \} : "skip"/,
  );
  assert.match(ui, /تفاصيل \{entryDetails\.entryNumber\}/);
});

test("GLUI-27 reverses a posted non-reversal journal through a modal", () => {
  assert.match(ui, /entry\.status === "posted"/);
  assert.match(ui, /entry\.sourceType !== "reversal"/);
  assert.match(ui, /modal === "reverse"/);
  assert.match(ui, /generalLedger\.reverseJournal/);
});

test("GLUI-28 requires reversal date reason and stable idempotency", () => {
  assert.match(ui, /سبب العكس الإلزامي/);
  assert.match(ui, /!reversalReason\.trim\(\)/);
  assert.match(ui, /requestId: reversalRequestId\.current/);
});

test("GLUI-29 creates or opens a valid monthly accounting period", () => {
  assert.match(ui, /generalLedger\.createOrOpenPeriod/);
  assert.match(ui, /type="month"/);
  assert.match(ui, /\^\\d\{4\}-\(0\[1-9\]\|1\[0-2\]\)\$/);
});

test("GLUI-30 closes periods only with permission and a reason", () => {
  assert.match(ui, /generalLedger\.closePeriod/);
  assert.match(ui, /periodAction === "close"/);
  assert.match(ui, /!periodReason\.trim\(\)/);
  assert.match(ui, /canClose/);
});

test("GLUI-31 reopens periods through a separate permission path", () => {
  assert.match(ui, /generalLedger\.reopenPeriod/);
  assert.match(ui, /setPeriodAction\("reopen"\)/);
  assert.match(ui, /canReopen/);
});

test("GLUI-32 paginates the account ledger using the indexed public query", () => {
  assert.match(
    ui,
    /usePaginatedQuery\([\s\S]*generalLedger\.accountLedgerPaginated/,
  );
  assert.match(ui, /ledger\.status === "CanLoadMore"/);
  assert.match(ui, /ledger\.loadMore\(20\)/);
});

test("GLUI-33 displays opening and continuous running balances", () => {
  assert.match(ui, /ledgerOpeningPage\?\.openingBalance/);
  assert.match(ui, /الرصيد الافتتاحي قبل الفترة/);
  assert.match(ui, /row\.runningBalance/);
});

test("GLUI-34 loads trial balance only with branch and period", () => {
  assert.match(ui, /generalLedger\.trialBalance/);
  assert.match(ui, /canView && effectiveBranch && trialPeriod/);
  assert.match(ui, /periodKey: trialPeriod/);
});

test("GLUI-35 renders opening movement and closing debit-credit columns", () => {
  assert.match(ui, /row\.openingDebit/);
  assert.match(ui, /row\.openingCredit/);
  assert.match(ui, /row\.periodDebit/);
  assert.match(ui, /row\.periodCredit/);
  assert.match(ui, /row\.closingDebit/);
  assert.match(ui, /row\.closingCredit/);
});

test("GLUI-36 prints an entry from the protected DTO after awaiting Convex", () => {
  assert.match(ui, /await convex\.query\(api\.generalLedger\.entryForPrint/);
  assert.match(ui, /if \(busy \|\| !canPrint\) return/);
  assert.match(ui, /قيد يومية \$\{dto\.entryNumber\}/);
});

test("GLUI-37 prints trial balance from its protected print query", () => {
  assert.match(
    ui,
    /await convex\.query\([\s\S]*generalLedger\.trialBalanceForPrint/,
  );
  assert.match(ui, /طباعة ميزان المراجعة/);
  assert.match(ui, /إعداد: __________/);
  assert.match(ui, /مراجعة: __________/);
  assert.match(ui, /اعتماد: __________/);
});

test("GLUI-38 escapes printable database text before document.write", () => {
  assert.match(ui, /const escapeHtml/);
  assert.match(ui, /escapeHtml\(dto\.memo\)/);
  assert.match(ui, /escapeHtml\(row\.nameAr\)/);
});

test("GLUI-39 surfaces real Convex errors and blocks double submission", () => {
  assert.match(ui, /getErrorMessage\(error, "تعذر تنفيذ العملية"\)/);
  assert.match(ui, /disabled=\{busy/);
  assert.match(ui, /if \(busy\) return/);
});

test("GLUI-40 forbids unsafe escapes prompts and fake print hooks", () => {
  assert.doesNotMatch(ui, /\bas\s+any\b|@ts-ign[o]re/);
  assert.doesNotMatch(ui, /window\.prompt|prompt\(/);
  assert.doesNotMatch(ui, /__generalLedgerPrint|setTimeout\([^)]*print/);
  assert.match(ui, /window\.open\("", "_blank"\)/);
});

test("FGBUI-01 financial readiness query is permission and state gated", () => {
  assert.match(ui, /api\.generalLedger\.financialPostingReadinessStatus/);
  assert.match(
    ui,
    /canInitialize[\s\S]*status\?\.initialized[\s\S]*!status\.financialPostingEnabled/,
  );
  assert.match(ui, /: "skip"/);
});

test("FGBUI-02 activation uses the dedicated backend mutation", () => {
  assert.match(
    ui,
    /useMutation\(\s*api\.generalLedger\.enableFinancialPosting/,
  );
  assert.match(ui, /enableFinancialPosting\(\{/);
  assert.match(ui, /cutoverDate: financialCutoverDate/);
});

test("FGBUI-03 activation request id remains stable across failure", () => {
  assert.match(
    ui,
    /const financialPostingRequestId = useRef\(newRequestId\(\)\)/,
  );
  assert.match(ui, /requestId: financialPostingRequestId\.current/);
  assert.match(ui, /financialPostingRequestId,\s*\)/);
});

test("FGBUI-04 activation button requires successful reconciliation", () => {
  assert.match(ui, /!financialReadiness\?\.ready/);
  assert.match(ui, /financialReadiness\.issues\.map/);
  assert.match(ui, /المطابقة ناجحة وجاهزة للتفعيل/);
});

test("FGBUI-05 UI distinguishes financial bridge from full operational posting", () => {
  assert.match(ui, /ربط الخزائن بالأستاذ العام/);
  assert.match(ui, /status\.financialPostingEnabled/);
  assert.match(ui, /status\.operationalPostingEnabled/);
  assert.match(
    ui,
    /ربط المبيعات والمخزون والمشتريات غير النقدية ما زال معطلًا/,
  );
});

test("FGBUI-06 financial journal sources have explicit Arabic labels", () => {
  assert.match(ui, /financial: "تشغيلي مالي"/);
  assert.match(ui, /financial_reversal: "عكس تشغيلي مالي"/);
});

test("SIBUI-01 sales and inventory journals have explicit Arabic labels", () => {
  assert.match(ui, /operational: "قيد مستند تشغيلي"/);
  assert.match(ui, /operational_reversal: "عكس مستند تشغيلي"/);
});

test("SIBUI-02 full operational posting remains visibly disabled", () => {
  assert.match(ui, /status\.operationalPostingEnabled/);
  assert.match(ui, /غير مفعّل/);
  assert.match(
    ui,
    /ربط المبيعات والمخزون والمشتريات غير النقدية ما زال معطلًا/,
  );
});
