import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const reporting = readFileSync(
  new URL("../convex/reporting.ts", import.meta.url),
  "utf8",
);
const schema = readFileSync(
  new URL("../convex/schema.ts", import.meta.url),
  "utf8",
);
const integration = readFileSync(
  new URL("./reportingIntegration.test.ts", import.meta.url),
  "utf8",
);
const matrix = readFileSync(
  new URL("./REPORTING_BACKEND_COVERAGE_MATRIX.md", import.meta.url),
  "utf8",
);

test("reporting guard requires 36 literal ordered executable RPT scenarios", () => {
  const names = [...integration.matchAll(/^test\("RPT-(\d{2}) /gm)].map(
    (match) => Number(match[1]),
  );
  assert.deepEqual(names, Array.from({ length: 36 }, (_, index) => index + 1));
  assert.doesNotMatch(
    integration,
    /exercise\(|Placeholder|case-\d+|\.(?:forEach|map)\([^)]*=>\s*test\(/,
  );
});

test("reporting coverage matrix has one executable row per scenario", () => {
  const rows = [...matrix.matchAll(/^\| RPT-(\d{2}) .*\| EXECUTABLE \|$/gm)];
  assert.equal(rows.length, 36);
  assert.deepEqual(
    rows.map((row) => Number(row[1])),
    Array.from({ length: 36 }, (_, index) => index + 1),
  );
  assert.doesNotMatch(matrix, /PENDING|PLACEHOLDER|TODO/i);
});

test("reporting endpoint enforces report permission and branch isolation", () => {
  assert.match(reporting, /requirePermission\(ctx, "view_reports"\)/);
  assert.match(reporting, /user\.role === "admin" \|\| user\.role === "accountant"/);
  assert.match(reporting, /user\.branchId !== requestedBranchId/);
  assert.match(reporting, /ليس لديك صلاحية لعرض تقارير فرع آخر/);
});

test("profit cost and inventory data require view_profits", () => {
  assert.match(reporting, /hasPermission\(user, "view_profits"\)/);
  assert.match(reporting, /profitability: canViewProfits/);
  assert.match(reporting, /canViewProfits\s*\?\s*\{ inventoryValue:/);
  assert.match(reporting, /canViewProfits[\s\S]*cogs:/);
});

test("large reporting sources use branch and operation-date indexes", () => {
  for (const table of [
    "invoices",
    "salesReturns",
    "expenses",
    "purchaseReceipts",
    "purchaseReturns",
    "supplierPayments",
    "deliveryConfirmations",
    "codSettlements",
    "financialTransactions",
  ]) {
    assert.match(
      reporting,
      new RegExp(`query\\("${table}"\\)[\\s\\S]{0,120}withIndex\\("by_branch_date"`),
      table,
    );
  }
  for (const table of [
    "customerBalances",
    "supplierBalances",
    "financialAccounts",
    "products",
  ]) {
    assert.match(
      reporting,
      new RegExp(`query\\("${table}"\\)[\\s\\S]{0,100}withIndex\\("by_branch"`),
      table,
    );
  }
});

test("reversible documents have and use branch reversal-date indexes", () => {
  for (const table of [
    "salesReturns",
    "purchaseReturns",
    "supplierPayments",
    "deliveryConfirmations",
    "codSettlements",
  ]) {
    assert.match(
      reporting,
      new RegExp(`query\\("${table}"\\)[\\s\\S]{0,140}withIndex\\("by_branch_reversal_date"`),
      table,
    );
  }
  assert.equal(
    (schema.match(/index\("by_branch_reversal_date",\s*\["branchId",\s*"reversalDate"\]\)/g) ?? []).length >= 5,
    true,
  );
});

test("reporting uses operation dates and bounded real date ranges", () => {
  assert.doesNotMatch(reporting, /_creationTime/);
  assert.match(reporting, /validateReportingRange/);
  assert.match(reporting, /366 يوم/);
  assert.match(reporting, /dateBasis: "operation_date"/);
  assert.match(reporting, /monthKeysInRange/);
});

test("missing historical COGS is disclosed and never guessed from current cost", () => {
  assert.match(reporting, /function invoiceCogs/);
  assert.match(reporting, /incompleteCogsInvoices/);
  assert.match(reporting, /cogs: incompleteCogsInvoices === 0 \? netCogs : null/);
  assert.doesNotMatch(reporting, /invoiceCogs[\s\S]{0,200}product\.costPrice/);
});

test("reporting module is read-only and does not touch legacy payments", () => {
  assert.doesNotMatch(reporting, /\bmutation\s*\(/);
  assert.doesNotMatch(reporting, /ctx\.db\.(insert|patch|replace|delete)\(/);
  assert.doesNotMatch(reporting, /query\("payments"\)/);
  assert.doesNotMatch(reporting, /as any|@ts-ignore/);
});

test("reporting DTO exposes explicit aggregates and monthly trend", () => {
  for (const key of [
    "grossSales",
    "salesReturnActivity",
    "netSales",
    "netCogs",
    "grossProfit",
    "netProfit",
    "landedPurchases",
    "supplierLiabilityCreated",
    "codCollected",
    "codSettled",
    "currentCustomerReceivables",
    "currentSupplierPayables",
    "monthlyTrend",
  ]) {
    assert.match(reporting, new RegExp(`\\b${key}\\b`), key);
  }
  assert.doesNotMatch(
    reporting,
    /idempotencyKey:\s*|requestFingerprint:\s*|createdBy:\s*|userId:\s*/,
  );
});
