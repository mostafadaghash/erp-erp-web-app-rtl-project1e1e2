import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const reports = readFileSync(
  new URL("../src/components/ReportsPage.tsx", import.meta.url),
  "utf8",
);
const home = readFileSync(
  new URL("../src/components/Dashboard.tsx", import.meta.url),
  "utf8",
);
const backend = readFileSync(
  new URL("../convex/reporting.ts", import.meta.url),
  "utf8",
);

test("RUI-01 report queries are protected by view_reports and skip", () => {
  assert.match(reports, /usePermission\("view_reports"\)/);
  assert.match(reports, /usePermission\("view_invoices"\)/);
  assert.match(reports, /usePaginatedQuery\(/);
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
  assert.match(reports, /salesDetails\.results/);
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
  assert.match(reports, /invoice\.customerId \?\?/);
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
  assert.match(reports, /الإجمالي المحتسب — دون الفواتير الملغاة/);
  assert.match(reports, /invoice\.status !== "cancelled"/);
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
  assert.match(reports, /salesDetails\.status === "LoadingFirstPage"/);
  assert.match(reports, /تحميل المزيد من الفواتير/);
  assert.match(reports, /report === undefined/);
  assert.match(reports, /validationMessage &&/);
  assert.match(reports, /لا تملك صلاحية عرض التقارير/);
});

test("RUI-21 executive dashboard loads its summary through its own permission", () => {
  assert.match(home, /api\.reporting\.overview/);
  assert.match(home, /permissions\.includes\("view_executive_dashboard"\)/);
  assert.match(home, /api\.reporting\.overview, canViewExecutiveDashboard/);
  assert.match(home, /api\.products\.list, canViewExecutiveDashboard && canViewProducts/);
  assert.doesNotMatch(home, /canViewExecutiveDashboard && canViewReports && reportArgs/);
  assert.doesNotMatch(home, /api\.(?:invoices|expenses|customers|repairs)\.(?:list|stats|getStats)/);
});

test("RUI-22 executive dashboard exposes exactly the eight approved management indicators", () => {
  for (const label of ["إجمالي المبيعات", "إجمالي المشتريات", "صافي الربح", "إجمالي المصروفات", "أرصدة الخزائن", "مديونيات العملاء", "مستحقات الموردين", "قيمة المخزون"]) {
    assert.match(home, new RegExp(label));
  }
  assert.equal((home.match(/key: "/g) ?? []).length, 8);
  assert.match(home, /erp-dashboard-card-grid/);
});

test("RUI-23 executive dashboard exposes period branch comparison and refresh controls", () => {
  assert.match(home, /aria-label="اختيار الفترة"/);
  assert.match(home, /aria-label="اختيار الفرع"/);
  assert.match(home, /مقارنة بالفترة السابقة/);
  assert.match(home, /تحديث البيانات/);
});

test("RUI-24 executive dashboard keeps drill-down profit and inventory permissions independent", () => {
  assert.match(home, /permissions\.includes\("view_executive_dashboard"\)/);
  assert.match(home, /permissions\.includes\("view_reports"\)/);
  assert.match(home, /permissions\.includes\("view_profits"\)/);
  assert.match(home, /permissions\.includes\("view_products"\)/);
  assert.match(home, /disabled=\{!canViewReports\}/);
  assert.match(home, /التقرير التفصيلي غير متاح حسب الصلاحية/);
  assert.match(home, /لا تملك صلاحية عرض لوحة التحكم التنفيذية/);
});

test("RUI-25 each executive indicator opens its detailed report only with report permission", () => {
  assert.match(home, /onOpenReport: \(report: ReportKind\) => void/);
  assert.match(home, /if \(canViewReports\) onOpenReport\(card\.report\)/);
  assert.match(home, /فتح التقرير التفصيلي/);
});

test("RUI-26 executive dashboard uses full cards and an explicit executive title", () => {
  assert.match(home, /data-testid=\{`dashboard-card-\$\{card\.key\}`\}/);
  assert.match(home, /<button/);
  assert.match(home, /اللوحة التنفيذية/);
  assert.doesNotMatch(home, /erp-home-quick-grid|erp-home-doc-grid/);
});

test("RUI-27 backend separates executive summary access from detailed report access", () => {
  assert.match(backend, /export const availableBranches = query/);
  assert.match(backend, /export const salesDetails = query/);
  assert.match(backend, /async function requireReportingOrExecutive/);
  assert.match(backend, /hasPermission\(user, "view_executive_dashboard"\)/);
  assert.equal((backend.match(/requireReportingOrExecutive\(ctx\)/g) ?? []).length >= 2, true);
  assert.match(backend, /export const salesDetails[\s\S]*requirePermission\(ctx, "view_reports"\)/);
  assert.match(backend, /requireModulePermission\(ctx, "view_invoices", "invoices"\)/);
  assert.match(backend, /paginationOptsValidator/);
  assert.match(backend, /\.paginate\(args\.paginationOpts\)/);
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

test("RUI-29 reporting and executive UIs perform no direct financial write", () => {
  assert.doesNotMatch(reports, /useMutation|ctx\.db|api\.[\w.]+\.(?:create|update|remove|reverse)/);
  assert.doesNotMatch(home, /useMutation|ctx\.db/);
});

test("RUI-30 reporting and executive UIs contain no unsafe TypeScript escape", () => {
  assert.doesNotMatch(reports, /as any|@ts-ignore/);
  assert.doesNotMatch(home, /as any|@ts-ignore/);
});
