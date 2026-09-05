import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync("src/components/ERPApp.tsx", "utf8");
const sidebar = readFileSync("src/components/Sidebar.tsx", "utf8");
const operational = readFileSync("src/components/OperationalDashboard.tsx", "utf8");
const executive = readFileSync("src/components/Dashboard.tsx", "utf8");
const executiveBackend = readFileSync("convex/executiveDashboard.ts", "utf8");
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
  assert.doesNotMatch(operational, /executiveDashboard\.overview|netProfit|liquidAccounts|supplierPayables|customerReceivables/);
});

test("DBS-04 executive dashboard can render without report-center permission", () => {
  assert.match(executive, /api\.executiveDashboard\.overview, canViewExecutiveDashboard/);
  assert.doesNotMatch(executive, /canViewExecutiveDashboard && canViewReports && reportArgs/);
  assert.match(executive, /disabled=\{!canViewReports \|\| card\.protected\}/);
});

test("DBS-05 executive cards also honor their underlying data permissions", () => {
  for (const permission of ["view_invoices", "view_shipments", "view_expenses", "view_finance", "view_customer_ledger", "view_supplier_ledger", "view_profits", "view_products"]) {
    assert.match(executive, new RegExp(`permissions\\.includes\\("${permission}"\\)`));
    assert.match(executiveBackend, new RegExp(`hasPermission\\(user, "${permission}"\\)`));
  }
  assert.match(executive, /protected: !canViewFinance/);
  assert.match(executive, /protected: !canViewCustomerLedger/);
  assert.match(executive, /protected: !canViewSupplierLedger/);
  assert.match(executiveBackend, /requirePermission\(ctx, "view_executive_dashboard"\)/);
});

test("DBS-06 desktop top bar preserves user identity and logout without horizontal clipping", () => {
  assert.match(main, /import "\.\/topbar-polish\.css"/);
  assert.match(topbar, /\.erp-navigation-inner\s*\{[\s\S]*min-height: 80px/);
  assert.doesNotMatch(topbar, /\.erp-navigation-inner\s*\{[^}]*overflow:\s*hidden/);
  assert.match(topbar, /\.erp-nav-group-button\s*\{[\s\S]*min-height: 48px[\s\S]*font-size: 13px/);
  assert.match(topbar, /@media \(min-width: 1536px\)[\s\S]*\.erp-nav-group-button\s*\{[\s\S]*font-size: 14\.5px/);
  assert.match(topbar, /\.erp-user-panel\s*\{[\s\S]*flex: 0 0 auto/);
  assert.match(topbar, /\.erp-user-panel > div:first-child\s*\{[\s\S]*width: 215px/);
  assert.match(topbar, /p:first-child\s*\{[\s\S]*text-overflow: ellipsis !important[\s\S]*font-size: 16px !important/);
  assert.match(topbar, /@media \(min-width: 1536px\)[\s\S]*p:first-child\s*\{[\s\S]*font-size: 17px !important/);
  assert.match(topbar, /\.erp-user-panel > button\s*\{[\s\S]*width: auto !important[\s\S]*min-height: 44px/);
  assert.match(sidebar, /title=\{userName\}/);
});

test("DBS-07 operational cards auto-fit instead of leaving a broken second row on wide screens", () => {
  assert.match(operational, /grid-cols-\[repeat\(auto-fit,minmax\(230px,1fr\)\)\]/);
  assert.match(operational, /فتح التفاصيل/);
  assert.match(operational, /min-h-\[158px\]/);
  assert.doesNotMatch(operational, /xl:grid-cols-4/);
});

test("DBS-08 workspace context bar has readable desktop scale", () => {
  assert.match(topbar, /\.erp-contextbar\s*\{[\s\S]*min-height: 68px/);
  assert.match(topbar, /\.erp-contextbar > div:first-child h1\s*\{[\s\S]*font-size: 20px/);
  assert.match(topbar, /\.erp-contextbar \.form-input\s*\{[\s\S]*min-height: 46px[\s\S]*font-size: 14px/);
  assert.match(topbar, /select\[data-testid="working-branch-select"\][\s\S]*min-height: 46px/);
  assert.match(topbar, /\.erp-contextbar \.btn-primary\s*\{[\s\S]*min-height: 46px[\s\S]*font-size: 14px/);
});
