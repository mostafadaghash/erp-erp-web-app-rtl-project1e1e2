import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync("src/components/ERPApp.tsx", "utf8");
const sidebar = readFileSync("src/components/Sidebar.tsx", "utf8");
const operational = readFileSync("src/components/OperationalDashboard.tsx", "utf8");
const repairsPage = readFileSync("src/components/RepairsPage.tsx", "utf8");
const businessRules = readFileSync("shared/businessRules.ts", "utf8");
const executive = readFileSync("src/components/Dashboard.tsx", "utf8");
const executiveBackend = readFileSync("convex/executiveDashboard.ts", "utf8");
const operationStatusBackend = readFileSync("convex/operationStatusDashboard.ts", "utf8");
const globalSearch = readFileSync("src/components/GlobalSearch.tsx", "utf8");
const internetConnectivity = readFileSync("src/lib/internetConnectivity.ts", "utf8");
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

test("DBS-06 desktop top bar preserves user identity and targets primary label text at 18px", () => {
  assert.match(main, /import "\.\/topbar-polish\.css"/);
  assert.doesNotMatch(topbar, /\.erp-navigation-inner\s*\{[^}]*overflow:\s*hidden/);
  assert.match(topbar, /@media \(min-width: 1024px\)[\s\S]*\.erp-nav-group-button\s*\{[\s\S]*min-height: 48px[\s\S]*font-size: 18px/);
  assert.match(topbar, /\.erp-nav-group-button > span\s*\{[\s\S]*font-size: 18px !important/);
  assert.match(topbar, /@media \(min-width: 1280px\)[\s\S]*\.erp-nav-groups\s*\{[\s\S]*justify-content: space-between/);
  assert.match(topbar, /\.erp-user-panel\s*\{[\s\S]*flex: 0 0 auto/);
  assert.match(sidebar, /title=\{userName\}/);
});

test("DBS-07 operational dashboard separates all eight order and repair lifecycle statuses", () => {
  assert.match(operational, /طلبات البيع/);
  assert.match(operational, /أوامر الصيانة/);
  assert.match(operational, /ORDER_STATUS_LABELS\[status\.key\]/);
  assert.match(operational, /REPAIR_STATUS_LABELS\[status\.key\]/);
  for (const orderStatus of ["pending", "confirmed", "preparing", "ready", "handed_to_shipping", "delivered_to_customer", "received", "cancelled"]) {
    assert.match(operational, new RegExp(`key: "${orderStatus}"`));
  }
  for (const repairStatus of ["pending", "technician_received", "in_progress", "new_issue", "repaired", "delivered_to_customer", "rejected_by_customer", "rejected_by_technician"]) {
    assert.match(operational, new RegExp(`key: "${repairStatus}"`));
  }
  assert.match(operational, /xl:grid-cols-4/);
  assert.match(operational, /surfaceClass/);
  assert.match(operational, /bg-amber-50\/65/);
  assert.match(operational, /فتح التفاصيل/);
  assert.doesNotMatch(operational, /customerFollowUps|lowStock|متابعات مطلوبة|تنبيهات المخزون|المتابعات والتنبيهات/);
});

test("DBS-08 workspace context bar has readable desktop scale", () => {
  assert.match(topbar, /\.erp-contextbar\s*\{[\s\S]*min-height: 68px/);
  assert.match(topbar, /\.erp-contextbar > div:first-child h1\s*\{[\s\S]*font-size: 20px/);
  assert.match(topbar, /\.erp-contextbar \.form-input\s*\{[\s\S]*min-height: 46px[\s\S]*font-size: 14px/);
  assert.match(topbar, /select\[data-testid="working-branch-select"\][\s\S]*min-height: 46px/);
});

test("DBS-09 live refresh is an actual button backed by fresh query arguments", () => {
  assert.match(operational, /data-testid="operational-dashboard-refresh"/);
  assert.match(operational, /onClick=\{requestRefresh\}/);
  assert.match(operational, /setRefreshToken\(Date\.now\(\)\)/);
  assert.match(operational, /orderCounts,[\s\S]*\{ refreshToken \}/);
  assert.match(operational, /repairCounts,[\s\S]*\{ refreshToken \}/);
  assert.match(operationStatusBackend, /orderCounts = query\([\s\S]*refreshToken: v\.optional\(v\.number\(\)\)/);
  assert.match(operationStatusBackend, /repairCounts = query\([\s\S]*refreshToken: v\.optional\(v\.number\(\)\)/);
  assert.doesNotMatch(operational, /حسب الصلاحيات/);
});

test("DBS-10 notification center clears unread immediately and cannot resurrect it on tab return", () => {
  assert.match(globalSearch, /NOTIFICATION_SEEN_STORAGE_PREFIX/);
  assert.match(globalSearch, /normalizeSeenNotificationKeys/);
  assert.match(globalSearch, /writeSeenNotificationKeys/);
  assert.match(globalSearch, /previousBelongsToCurrentUser/);
  assert.match(globalSearch, /visibilitychange/);
  assert.match(globalSearch, /header-notification-unread-count/);
  assert.match(globalSearch, /if \(nextOpen\) markCurrentNotificationsRead\(\)/);
  assert.match(globalSearch, /\.\.\.\(previousBelongsToCurrentUser \? previous : \[\]\),[\s\S]*\.\.\.stored/);
  assert.doesNotMatch(globalSearch, /notificationSignature intentionally retriggers/);
  assert.match(topbar, /button\[title\$="تنبيه مخزون"\][\s\S]*display: none !important/);
});

test("DBS-11 internet indicator ignores raw browser online events until a real probe succeeds", () => {
  assert.match(main, /import "\.\/lib\/internetConnectivity"/);
  assert.match(internetConnectivity, /PROBE_URLS/);
  assert.match(internetConnectivity, /fetch\(/);
  assert.match(internetConnectivity, /mode: "no-cors"/);
  assert.match(internetConnectivity, /AbortController/);
  assert.match(internetConnectivity, /PROBE_INTERVAL_MS/);
  assert.match(internetConnectivity, /publishConnectivity\("offline"\)/);
  assert.match(internetConnectivity, /publishingSyntheticNativeEvent/);
  assert.match(internetConnectivity, /dispatchAuthoritativeNativeEvent/);
  assert.match(internetConnectivity, /event\.stopImmediatePropagation\(\)/);
  assert.match(internetConnectivity, /handleNativeOnline[\s\S]*publishConnectivity\("checking"\)[\s\S]*checkInternetConnectivity/);
  assert.match(app, /window\.addEventListener\("online", online\)/);
  assert.match(app, /window\.addEventListener\("offline", offline\)/);
});

test("DBS-12 repair lifecycle is identical in shared rules and original repairs page", () => {
  const orderedLabels = [
    "قيد الإنتظار",
    "تم الإستلام من الفني",
    "جاري الصيانة",
    "ظهور مشكلة جديدة",
    "تم الإصلاح",
    "تم التسليم للعميل",
    "مرفوض من العميل",
    "مرفوض من الفني",
  ];
  let previousIndex = -1;
  for (const label of orderedLabels) {
    const index = repairsPage.indexOf(`label: "${label}"`, previousIndex + 1);
    assert.ok(index > previousIndex, `${label} must appear in lifecycle order`);
    previousIndex = index;
    assert.match(businessRules, new RegExp(label));
  }
  assert.match(repairsPage, /under_inspection: \{ label: "تم الإستلام من الفني"/);
  assert.match(repairsPage, /rejected_by_shipping: \{ label: "مرفوض من الفني"/);
  assert.match(repairsPage, /repairCounts\.technician_received/);
  assert.match(repairsPage, /repairCounts\.rejected_by_technician/);
  assert.doesNotMatch(repairsPage, /مرفوض من شركة الشحن|سبب رفض شركة الشحن/);
});
