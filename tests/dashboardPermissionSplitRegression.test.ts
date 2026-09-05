import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync("src/components/ERPApp.tsx", "utf8");
const sidebar = readFileSync("src/components/Sidebar.tsx", "utf8");
const operational = readFileSync("src/components/OperationalDashboard.tsx", "utf8");
const executive = readFileSync("src/components/Dashboard.tsx", "utf8");
const topbar = readFileSync("src/topbar-polish.css", "utf8");
const main = readFileSync("src/main.tsx", "utf8");

test("DBS-01 operational and executive dashboards are separate workspace pages", () => {
  assert.match(app, /\| "dashboard" \| "executive-dashboard"/);
  assert.match(app, /dashboard: "view_operational_dashboard"/);
  assert.match(app, /"executive-dashboard": "view_executive_dashboard"/);
  assert.match(app, /tab\.page === "dashboard" && <OperationalDashboard/);
  assert.match(app, /tab\.page === "executive-dashboard" && <Dashboard/);
});

test("DBS-02 navigation exposes each dashboard only through its own permission", () => {
  assert.match(sidebar, /id: "dashboard"[\s\S]*permission: "view_operational_dashboard"/);
  assert.match(sidebar, /id: "executive-dashboard"[\s\S]*permission: "view_executive_dashboard"/);
  assert.match(sidebar, /items: group\.items\.filter\([\s\S]*permissions\.includes\(item\.permission\)/);
});

test("DBS-03 operational dashboard contains no executive financial summary", () => {
  assert.match(operational, /view_operational_dashboard/);
  assert.match(operational, /operationStatusDashboard\.orderCounts/);
  assert.match(operational, /operationStatusDashboard\.repairCounts/);
  assert.doesNotMatch(operational, /reporting\.overview|netProfit|liquidAccounts|supplierPayables|customerReceivables/);
});

test("DBS-04 executive dashboard can render without report-center permission", () => {
  assert.match(executive, /api\.reporting\.overview, canViewExecutiveDashboard/);
  assert.doesNotMatch(executive, /canViewExecutiveDashboard && canViewReports && reportArgs/);
  assert.match(executive, /disabled=\{!canViewReports \|\| card\.protected\}/);
});

test("DBS-05 executive cards also honor their underlying data permissions", () => {
  for (const permission of ["view_invoices", "view_shipments", "view_expenses", "view_finance", "view_customer_ledger", "view_supplier_ledger", "view_profits", "view_products"]) {
    assert.match(executive, new RegExp(`permissions\\.includes\\("${permission}"\\)`));
  }
  assert.match(executive, /protected: !canViewFinance/);
  assert.match(executive, /protected: !canViewCustomerLedger/);
  assert.match(executive, /protected: !canViewSupplierLedger/);
});

test("DBS-06 desktop top bar is enlarged and user identity has reserved space", () => {
  assert.match(main, /import "\.\/topbar-polish\.css"/);
  assert.match(topbar, /\.erp-navigation-inner\s*\{[\s\S]*min-height: 68px/);
  assert.match(topbar, /\.erp-user-panel\s*\{[\s\S]*min-width: 260px/);
  assert.match(sidebar, /max-w-48 truncate text-sm font-black/);
  assert.match(sidebar, /title=\{userName\}/);
});
