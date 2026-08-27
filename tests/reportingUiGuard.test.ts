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
const dashboard = readFileSync(
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

test("dashboard accounting cannot regress to legacy duplicate statistics", () => {
  assert.doesNotMatch(dashboard, /invoiceStats|expenseStats|إجمالي المبيعات المدفوعة/);
  assert.equal((dashboard.match(/api\.reporting\.overview/g) ?? []).length, 1);
  assert.match(dashboard, /report\.cod\.currentOutstanding/);
  assert.match(dashboard, /report\.cod\.settled/);
});

test("profit and inventory presentation remains permission aware", () => {
  assert.match(reports, /canViewProfits/);
  assert.match(reports, /profitabilityAvailable/);
  assert.match(reports, /inventoryValue !== undefined/);
  assert.match(dashboard, /canViewProfits \? report\?\.profitability : undefined/);
  assert.match(dashboard, /lowStockProducts/);
});

test("reporting UI and backend branch picker remain read-only and typed", () => {
  for (const source of [reports, dashboard]) {
    assert.doesNotMatch(source, /useMutation|as any|@ts-ignore/);
  }
});
