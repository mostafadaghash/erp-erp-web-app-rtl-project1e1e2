import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const reports = readFileSync(
  new URL("../src/components/ReportsPage.tsx", import.meta.url),
  "utf8",
);
const dashboard = readFileSync(
  new URL("../src/components/Dashboard.tsx", import.meta.url),
  "utf8",
);
const backend = readFileSync(
  new URL("../convex/reporting.ts", import.meta.url),
  "utf8",
);

test("RUI-01 reports query is protected by view_reports and skip", () => {
  assert.match(reports, /usePermission\("view_reports"\)/);
  assert.match(
    reports,
    /api\.reporting\.overview,[\s\S]*canViewReports && !validationMessage[\s\S]*: "skip"/,
  );
});

test("RUI-02 reports loads branch options through reporting permission contract", () => {
  assert.match(reports, /api\.reporting\.availableBranches/);
  assert.match(reports, /canViewReports \? \{\} : "skip"/);
  assert.doesNotMatch(reports, /api\.branches\.list/);
});

test("RUI-03 central roles can select a branch or consolidated scope", () => {
  assert.match(reports, /me\?\.role === "admin" \|\| me\?\.role === "accountant"/);
  assert.match(reports, /كل الفروع — مجمع/);
  assert.match(reports, /branchId: canSelectBranch && branchId \? branchId : undefined/);
});

test("RUI-04 non-central reports show the pinned branch without a selector", () => {
  assert.match(reports, /canSelectBranch \? \(/);
  assert.match(reports, /branches\[0\]\?\.name \?\? "فرع المستخدم"/);
});

test("RUI-05 report presets use explicit operation-date ranges", () => {
  for (const marker of ['"today"', '"week"', '"month"', '"year"', '"custom"']) {
    assert.match(reports, new RegExp(marker));
  }
  assert.match(reports, /startOfPeriod/);
  assert.match(reports, /هذا الشهر/);
});

test("RUI-06 custom dates are validated before the query", () => {
  assert.match(reports, /validIsoDate/);
  assert.match(reports, /from > to/);
  assert.match(reports, /days > 366/);
  assert.match(reports, /!validationMessage/);
});

test("RUI-07 reports never use creation time as an accounting date", () => {
  assert.doesNotMatch(reports, /_creationTime|filterByPeriod/);
  assert.match(reports, /أساس التاريخ: تاريخ العملية/);
});

test("RUI-08 reports do not download operational lists to calculate totals", () => {
  assert.doesNotMatch(
    reports,
    /api\.(?:invoices|expenses|products|customers|repairs)\.(?:list|stats|getStats)/,
  );
  assert.equal((reports.match(/api\.reporting\.overview/g) ?? []).length, 1);
});

test("RUI-09 sales cards consume backend gross returns and net values", () => {
  assert.match(reports, /report\.sales\.netSales/);
  assert.match(reports, /report\.sales\.grossSales/);
  assert.match(reports, /report\.sales\.salesReturns/);
});

test("RUI-10 collection cards consume net and reversal aggregates", () => {
  assert.match(reports, /report\.collections\.netCollections/);
  assert.match(reports, /report\.collections\.reversedCollections/);
  assert.match(reports, /report\.collections\.reversedRefunds/);
});

test("RUI-11 expenses include operating expenses and carrier fees", () => {
  assert.match(reports, /report\.expenses\.totalExpenses/);
  assert.match(reports, /report\.expenses\.operatingExpenses/);
  assert.match(reports, /report\.expenses\.carrierFees/);
});

test("RUI-12 current customer and supplier balances remain distinct", () => {
  assert.match(reports, /report\.currentBalances\.customerReceivables/);
  assert.match(reports, /report\.currentBalances\.customerAdvances/);
  assert.match(reports, /report\.currentBalances\.supplierPayables/);
});

test("RUI-13 profitability is gated and never locally guessed", () => {
  assert.match(reports, /usePermission\("view_profits"\)/);
  assert.match(reports, /report\.profitability &&/);
  assert.doesNotMatch(reports, /netProfit\s*=\s*[^;\n]*-/);
});

test("RUI-14 incomplete historical COGS produces a visible warning", () => {
  assert.match(reports, /!report\.completeness\.profitabilityAvailable/);
  assert.match(reports, /incompleteCogsInvoices/);
  assert.match(reports, /لن يعرض النظام ربحًا تقديريًا/);
});

test("RUI-15 inventory value is rendered only when the DTO exposes it", () => {
  assert.match(reports, /report\.currentBalances\.inventoryValue !== undefined/);
  assert.match(reports, /legacyInventoryValueProducts/);
});

test("RUI-16 trend chart uses backend monthly rows", () => {
  assert.match(reports, /report\.trend\.map/);
  assert.match(reports, /row\.month/);
  assert.match(reports, /row\.netSales/);
  assert.match(reports, /row\.operatingExpenses \+ row\.carrierFees/);
});

test("RUI-17 top products use backend net sales and optional gross profit", () => {
  assert.match(reports, /report\.topProducts\.map/);
  assert.match(reports, /product\.netSales/);
  assert.match(reports, /product\.grossProfit !== null/);
});

test("RUI-18 purchase section separates landed cost liability credits and payments", () => {
  assert.match(reports, /report\.purchases\.landedPurchases/);
  assert.match(reports, /report\.purchases\.supplierLiabilityCreated/);
  assert.match(reports, /report\.purchases\.supplierCredits/);
  assert.match(reports, /report\.purchases\.supplierPayments/);
});

test("RUI-19 COD section separates collected settled movement and outstanding", () => {
  assert.match(reports, /report\.cod\.collected/);
  assert.match(reports, /report\.cod\.settled/);
  assert.match(reports, /report\.cod\.netPeriodMovement/);
  assert.match(reports, /report\.cod\.currentOutstanding/);
});

test("RUI-20 reports have explicit loading invalid-range and unauthorized states", () => {
  assert.match(reports, /report === undefined/);
  assert.match(reports, /validationMessage &&/);
  assert.match(reports, /لا تملك صلاحية عرض التقارير/);
});

test("RUI-21 dashboard accounting cards use the reporting overview", () => {
  assert.match(dashboard, /api\.reporting\.overview/);
  assert.match(dashboard, /canViewReports \? \{ from: monthFrom, to: today \} : "skip"/);
});

test("RUI-22 dashboard does not use legacy invoice or expense stats for accounting", () => {
  assert.doesNotMatch(dashboard, /invoiceStats|expenseStats|api\.invoices\.stats|api\.expenses\.getStats/);
  assert.match(dashboard, /report\.sales\.netSales/);
  assert.match(dashboard, /report\.expenses\.totalExpenses/);
});

test("RUI-23 dashboard separates sales collections receivables expenses and COD", () => {
  for (const label of [
    "صافي مبيعات الشهر",
    "صافي التحصيل",
    "مستحقات العملاء",
    "مصروفات الشهر",
    "قيد التحصيل لدى شركات الشحن",
  ]) assert.match(dashboard, new RegExp(label));
  assert.match(dashboard, /report\.cod\.currentOutstanding/);
  assert.match(dashboard, /report\.cod\.settled/);
});

test("RUI-24 dashboard profit card respects permission and completeness", () => {
  assert.match(dashboard, /canViewProfits && report\.profitability/);
  assert.match(dashboard, /report\.profitability\.netProfit === null/);
  assert.match(dashboard, /!report\.completeness\.profitabilityAvailable/);
});

test("RUI-25 dashboard keeps operational lists outside accounting calculations", () => {
  assert.match(dashboard, /أحدث فواتير المبيعات/);
  assert.match(dashboard, /حالة أوامر الصيانة/);
  assert.match(dashboard, /متابعة المخزون/);
  assert.doesNotMatch(dashboard, /recentInvoices[\s\S]{0,120}\.(?:reduce|filter)\(/);
});

test("RUI-26 dashboard provides a loading state for accounting overview", () => {
  assert.match(dashboard, /canViewReports && report === undefined/);
  assert.match(dashboard, /animate-pulse/);
});

test("RUI-27 branch options backend uses view_reports and central-role policy", () => {
  assert.match(backend, /export const availableBranches = query/);
  assert.match(backend, /requirePermission\(ctx, "view_reports"\)/);
  assert.match(backend, /user\.role === "admin" \|\| user\.role === "accountant"/);
  assert.match(backend, /branch\?\.isActive/);
});

test("RUI-28 branch options expose a minimal DTO and no financial balances", () => {
  assert.match(backend, /\{ _id: branch\._id, name: branch\.name \}/);
  const branchQuery = backend.slice(
    backend.indexOf("export const availableBranches"),
    backend.indexOf("async function resolveReportBranches"),
  );
  assert.doesNotMatch(branchQuery, /balance|inventoryValue|currentBalance/);
});

test("RUI-29 reporting UI performs no mutation or financial write", () => {
  assert.doesNotMatch(reports, /useMutation|ctx\.db|api\.[\w.]+\.(?:create|update|remove|reverse)/);
  assert.doesNotMatch(dashboard, /useMutation|ctx\.db/);
});

test("RUI-30 reporting UI contains no unsafe TypeScript escape", () => {
  assert.doesNotMatch(reports, /as any|@ts-ignore/);
  assert.doesNotMatch(dashboard, /as any|@ts-ignore/);
});
