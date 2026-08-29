import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const regression = readFileSync(
  new URL("./reportingUiRegression.test.ts", import.meta.url),
  "utf8",
);
const matrix = readFileSync(
  new URL("./REPORTING_UI_COVERAGE_MATRIX.md", import.meta.url),
  "utf8",
);
const reports = readFileSync(
  new URL("../src/components/ReportsPage.tsx", import.meta.url),
  "utf8",
);
const home = readFileSync(
  new URL("../src/components/Dashboard.tsx", import.meta.url),
  "utf8",
);

test("reporting UI guard requires 30 ordered literal RUI tests", () => {
  const names = [...regression.matchAll(/^test\("RUI-(\d{2}) /gm)].map(
    (match) => Number(match[1]),
  );
  assert.deepEqual(names, Array.from({ length: 30 }, (_, index) => index + 1));
  assert.doesNotMatch(
    regression,
    /exercise\(|Placeholder|case-\d+|\.(?:map|forEach)\([^)]*=>\s*test\(/,
  );
});

test("reporting UI coverage matrix has 30 unique executable rows", () => {
  const rows = [...matrix.matchAll(/^\| RUI-(\d{2}) .*\| EXECUTABLE \|$/gm)];
  assert.deepEqual(
    rows.map((row) => Number(row[1])),
    Array.from({ length: 30 }, (_, index) => index + 1),
  );
  assert.doesNotMatch(matrix, /PENDING|PLACEHOLDER|TODO/i);
});

test("accounting reports cannot regress to client-side list aggregation", () => {
  assert.doesNotMatch(reports, /_creationTime|filterByPeriod|allInvoices|allExpenses|totalRevenue/);
  assert.doesNotMatch(
    reports,
    /api\.(?:invoices|expenses|products|customers|repairs)\.(?:list|stats|getStats)/,
  );
  assert.match(reports, /api\.reporting\.overview/);
});

test("dashboard remains a compact reporting summary", () => {
  assert.match(home, /api\.reporting\.overview/);
  assert.equal((home.match(/key: "/g) ?? []).length, 8);
  assert.match(home, /erp-dashboard-card-grid/);
  assert.doesNotMatch(home, /أحدث فواتير المبيعات|<table/);
});

test("profit inventory and report access remain permission aware", () => {
  assert.match(reports, /canViewProfits/);
  assert.match(reports, /profitabilityAvailable/);
  assert.match(reports, /inventoryValue !== undefined/);
  assert.match(home, /canViewProfits = permissions\.includes\("view_profits"\)/);
  assert.match(home, /canViewProducts = permissions\.includes\("view_products"\)/);
  assert.match(home, /canViewReports = permissions\.includes\("view_reports"\)/);
});

test("reporting UI and home launcher remain read-only and typed", () => {
  for (const source of [reports, home]) {
    assert.doesNotMatch(source, /useMutation|as any|@ts-ignore/);
  }
});
