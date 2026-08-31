import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ui = readFileSync("src/components/GeneralLedgerPage.tsx", "utf8");
const app = readFileSync("src/components/ERPApp.tsx", "utf8");
const sidebar = readFileSync("src/components/Sidebar.tsx", "utf8");

// Foundation visibility and access.
test("GLUI-01 general ledger is routed and permission protected", () => {
  assert.match(app, /general-ledger/);
  assert.match(app, /view_general_ledger/);
  assert.match(sidebar, /general-ledger/);
});

test("GLUI-02 page exposes foundation state without pretending full operational posting", () => {
  assert.match(ui, /وضع التأسيس Foundation/);
  assert.match(ui, /operationalPostingEnabled/);
  assert.match(ui, /financialPostingEnabled/);
});

test("GLUI-03 page uses protected general-ledger queries and mutations", () => {
  for (const token of [
    "generalLedger.status",
    "generalLedger.chart",
    "generalLedger.periods",
    "generalLedger.openingStatus",
    "generalLedger.entriesPage",
    "generalLedger.ledgerPage",
    "generalLedger.trialBalancePage",
    "generalLedger.initialize",
    "generalLedger.confirmOpening",
    "generalLedger.postManualJournal",
    "generalLedger.reverseJournal",
    "generalLedger.closePeriod",
    "generalLedger.reopenPeriod",
  ]) assert.match(ui, new RegExp(token.replaceAll(".", "\\.")));
});

test("GLUI-04 branch context is explicit for administrators", () => {
  assert.match(ui, /generalLedger\.availableBranches/);
  assert.match(ui, /canSelectBranch/);
  assert.match(ui, /اختر الفرع/);
});

test("GLUI-05 initialization is permission gated and one-time", () => {
  assert.match(ui, /initialize_general_ledger/);
  assert.match(ui, /generalLedger\.initialize/);
  assert.match(ui, /تهيئة الأستاذ العام/);
});

test("GLUI-06 chart supports hierarchy, class labels and deactivation", () => {
  assert.match(ui, /chartChildren/);
  assert.match(ui, /accountClassLabel/);
  assert.match(ui, /renderChart/);
  assert.match(ui, /deactivateAccount/);
});

test("GLUI-07 opening balances require balanced lines or explicit zero opening", () => {
  assert.match(ui, /isZeroOpening/);
  assert.match(ui, /lineValidation/);
  assert.match(ui, /اعتماد افتتاح صفري/);
});

test("GLUI-08 manual journals expose date, memo and dynamic lines", () => {
  assert.match(ui, /post_manual_journals/);
  assert.match(ui, /JournalLinesEditor/);
  assert.match(ui, /وصف السطر/);
});

test("GLUI-09 reversal requires reason and date", () => {
  assert.match(ui, /reverse_journal_entries/);
  assert.match(ui, /reversalReason/);
  assert.match(ui, /reversalDate/);
});

test("GLUI-10 period controls expose close and reopen operations", () => {
  assert.match(ui, /close_accounting_periods/);
  assert.match(ui, /reopen_accounting_periods/);
  assert.match(ui, /إغلاق الفترة/);
  assert.match(ui, /إعادة فتح الفترة/);
});

test("GLUI-11 entries use server pagination instead of client slicing", () => {
  assert.match(ui, /usePaginatedQuery\(\s*api\.generalLedger\.entriesPage/);
  assert.match(ui, /entries\.loadMore/);
  assert.doesNotMatch(ui, /entries\.slice\(/);
});

test("GLUI-12 ledger uses server pagination instead of client slicing", () => {
  assert.match(ui, /usePaginatedQuery\(\s*api\.generalLedger\.ledgerPage/);
  assert.match(ui, /ledger\.loadMore/);
  assert.doesNotMatch(ui, /ledger\.slice\(/);
});

test("GLUI-13 trial balance uses server pagination instead of client slicing", () => {
  assert.match(ui, /usePaginatedQuery\(\s*api\.generalLedger\.trialBalancePage/);
  assert.match(ui, /trial\.loadMore/);
  assert.doesNotMatch(ui, /trial\.slice\(/);
});

test("GLUI-14 printing uses dedicated full queries instead of browser-loaded pages", () => {
  assert.match(ui, /entriesForPrint/);
  assert.match(ui, /ledgerForPrint/);
  assert.match(ui, /trialBalanceForPrint/);
});

test("GLUI-15 print permissions are explicitly enforced", () => {
  assert.match(ui, /print_general_ledger/);
  assert.match(ui, /canPrint/);
});

test("GLUI-16 print popup is isolated from the application DOM", () => {
  assert.match(ui, /window\.open\("", "_blank"/);
  assert.match(ui, /popup\.opener = null/);
  assert.match(ui, /document\.write/);
});

test("GLUI-17 page exposes chart, opening, journal, entries, periods, ledger and trial tabs", () => {
  for (const label of [
    "دليل الحسابات",
    "الأرصدة الافتتاحية",
    "قيد يدوي",
    "القيود",
    "الفترات",
    "دفتر الحساب",
    "ميزان المراجعة",
  ]) assert.match(ui, new RegExp(label));
});

test("GLUI-18 foundation copy keeps unsupported operational posting explicit", () => {
  assert.match(ui, /ربط المبيعات والمخزون والمشتريات غير النقدية ما زال معطلًا/);
  assert.match(ui, /الربط التلقائي للمبيعات والمخزون والمشتريات وCOD غير مفعّل بعد/);
});

test("GLUI-19 opening and journal flows expose idempotency request ids", () => {
  assert.match(ui, /openingRequestId/);
  assert.match(ui, /journalRequestId/);
  assert.match(ui, /newRequestId/);
});

test("GLUI-20 provides a dynamic multi-line manual journal editor", () => {
  assert.match(ui, /onChange\(\[\.\.\.lines, newLine\(\)\]\)/);
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

test("GLUI-22 previews debit credit and difference in the configured base currency", () => {
  assert.match(ui, /إجمالي المدين:/);
  assert.match(ui, /إجمالي الدائن:/);
  assert.match(ui, /الفرق:/);
  assert.match(ui, /useCurrency\(\)/);
  assert.match(ui, /formatCurrency\(totals\.debit\)/);
  assert.match(ui, /currencyCode/);
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

test("GLUI-25 reversal request id is preserved on failure and rotates on success", () => {
  assert.match(ui, /reversalRequestId = useRef\(newRequestId\(\)\)/);
  assert.match(ui, /requestId: reversalRequestId\.current/);
});

test("GLUI-26 branch change rotates request ids so stale requests are not reused", () => {
  assert.match(ui, /openingRequestId\.current = newRequestId\(\)/);
  assert.match(ui, /journalRequestId\.current = newRequestId\(\)/);
  assert.match(ui, /reversalRequestId\.current = newRequestId\(\)/);
});

test("GLUI-27 ledger and trial filters reset pagination deliberately", () => {
  assert.match(ui, /setLedgerAccountId/);
  assert.match(ui, /setLedgerPeriod/);
  assert.match(ui, /setTrialPeriod/);
});

test("GLUI-28 entry print query is bounded by period", () => {
  assert.match(ui, /entriesForPrint/);
  assert.match(ui, /printEntryPeriod/);
});

test("GLUI-29 ledger print query is bounded by account and period", () => {
  assert.match(ui, /ledgerForPrint/);
  assert.match(ui, /ledgerAccountId/);
  assert.match(ui, /ledgerPeriod/);
});

test("GLUI-30 trial print query is bounded by period", () => {
  assert.match(ui, /trialBalanceForPrint/);
  assert.match(ui, /trialPeriod/);
});
