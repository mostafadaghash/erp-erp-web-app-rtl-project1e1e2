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

test("RUI-01 report queries are protected by view_reports and skip", () => {
  assert.match(reports, /usePermission\("view_reports"\)/);
  assert.match(reports, /api\.reporting\.overview,[\s\S]*canViewReports[\s\S]*: "skip"/);
  assert.match(reports, /api\.reporting\.salesDetails,[\s\S]*canViewReports[\s\S]*: "skip"/);
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
  assert.match(reports, /canSelectBranch \? <select/);
  assert.match(reports, /branches\[0\]\?\.name \?\? "فرع المستخدم"/);
});

test("RUI-05 report presets use explicit operation-date ranges", () => {
  for (const marker of ['"today"', '"week"', '"month"', '"year"', '"custom"']) {
    assert.match(reports, new RegExp(marker));
  }
  assert.match(reports, /startOfPeriod/);
  assert.match(reports, /هذا الشهر/);
});

test("RUI-06 custom dates are validated before either report query", () => {
  assert.match(reports, /validIsoDate/);
  assert.match(reports, /from > to/);
  assert.match(reports, /days > 366/);
  assert.match(reports, /const reportArgs = !validationMessage/);
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
  assert.equal((reports.match(/api\.reporting\.salesDetails/g) ?? []).length, 1);
});

test("RUI-09 sales report consumes detailed invoice rows from the backend", () => {
  assert.match(reports, /salesDetails\?\.invoices/);
  assert.match(reports, /invoice\.invoiceNumber/);
  assert.match(reports, /invoice\.customerName/);
  assert.match(reports, /invoice\.netTotal/);
});

test("RUI-10 detailed sales table exposes financial and document columns", () => {
  for (const label of ["رقم الفاتورة", "الفرع", "العميل", "الأصناف", "المرتجع", "الصافي", "المحصل", "المتبقي", "الدفع", "الحالة"]) {
    assert.match(reports, new RegExp(label));
  }
  assert.match(reports, /data-testid="sales-detail-invoices"/);
});

test("RUI-11 clicking an invoice expands its actual item lines", () => {
  assert.match(reports, /setExpandedInvoiceId/);
  assert.match(reports, /aria-expanded=\{expanded\}/);
  assert.match(reports, /invoice\.items\.map/);
  assert.match(reports, /أصناف الفاتورة/);
});

test("RUI-12 detailed report supports invoice customer product payment and status filters", () => {
  for (const marker of ["customerFilter", "productFilter", "paymentFilter", "statusFilter"]) {
    assert.match(reports, new RegExp(marker));
  }
  assert.match(reports, /رقم الفاتورة أو العميل أو الصنف/);
});

test("RUI-13 sales report can group by invoices items customers and days", () => {
  assert.match(reports, /type SalesView = "invoices" \| "items" \| "customers" \| "days"/);
  for (const label of ["الفواتير", "الأصناف", "العملاء", "الأيام"]) {
    assert.match(reports, new RegExp(label));
  }
});

test("RUI-14 profitability columns are permission gated and never locally guessed", () => {
  assert.match(reports, /usePermission\("view_profits"\)/);
  assert.match(reports, /canViewProfits &&/);
  assert.match(reports, /item\.grossProfit/);
  assert.doesNotMatch(reports, /netProfit\s*=\s*[^;\n]*-/);
});

test("RUI-15 inventory value is rendered only when the DTO exposes it", () => {
  assert.match(reports, /report\.currentBalances\.inventoryValue !== undefined/);
  assert.match(reports, /غير متاحة حسب الصلاحية/);
});

test("RUI-16 report output uses detailed tables instead of metric cards", () => {
  assert.match(reports, /<table className="data-table/);
  assert.match(reports, /function SummaryReport/);
  assert.doesNotMatch(reports, /function MetricCard|<MetricCard/);
});

test("RUI-17 invoice report includes an explicit totals footer", () => {
  assert.match(reports, /<tfoot>/);
  assert.match(reports, /الإجمالي للفواتير المعروضة/);
  assert.match(reports, /totals\.net/);
  assert.match(reports, /totals\.remaining/);
});

test("RUI-18 purchase report separates documents values credits and payments", () => {
  assert.match(reports, /report\.purchases\.receiptCount/);
  assert.match(reports, /report\.purchases\.landedPurchases/);
  assert.match(reports, /report\.purchases\.supplierCredits/);
  assert.match(reports, /report\.purchases\.supplierPayments/);
});

test("RUI-19 treasury report separates collections refunds net and COD outstanding", () => {
  assert.match(reports, /report\.collections\.collections/);
  assert.match(reports, /report\.collections\.refunds/);
  assert.match(reports, /report\.collections\.netCollections/);
  assert.match(reports, /report\.cod\.currentOutstanding/);
});

test("RUI-20 reports have explicit loading invalid-range and unauthorized states", () => {
  assert.match(reports, /salesDetails === undefined/);
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

test("RUI-25 dashboard removes latest invoices and retains useful operational panels", () => {
  assert.doesNotMatch(dashboard, /أحدث فواتير المبيعات|recentInvoices/);
  assert.match(dashboard, /حالة أوامر الصيانة/);
  assert.match(dashboard, /متابعة المخزون/);
  assert.match(dashboard, /العملاء المحتملون/);
});

test("RUI-26 dashboard provides a loading state for accounting overview", () => {
  assert.match(dashboard, /canViewReports && report === undefined/);
  assert.match(dashboard, /animate-pulse/);
});

test("RUI-27 reporting backend protects branch and sales-detail queries", () => {
  assert.match(backend, /export const availableBranches = query/);
  assert.match(backend, /export const salesDetails = query/);
  assert.equal((backend.match(/requirePermission\(ctx, "view_reports"\)/g) ?? []).length >= 3, true);
  assert.match(backend, /user\.role === "admin" \|\| user\.role === "accountant"/);
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
