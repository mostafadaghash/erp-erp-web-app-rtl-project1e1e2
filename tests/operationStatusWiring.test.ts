import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("order and repair screens use live indexed status summaries instead of uninitialized legacy aggregates", async () => {
  const [orders, repairs, dashboard] = await Promise.all([
    readFile("src/components/OrdersPage.tsx", "utf8"),
    readFile("src/components/RepairsPage.tsx", "utf8"),
    readFile("convex/operationStatusDashboard.ts", "utf8"),
  ]);
  assert.match(orders, /api\.operationStatusDashboard\.orderCounts/);
  assert.doesNotMatch(orders, /api\.orders\.stats\b/);
  assert.match(repairs, /api\.operationStatusDashboard\.repairCounts/);
  assert.match(dashboard, /withIndex\("by_status"/);
  assert.match(dashboard, /withIndex\("by_branch_status"/);
  assert.doesNotMatch(dashboard, /ctx\.db\.query\("orders"\)\.collect\(\)/);
  assert.doesNotMatch(dashboard, /ctx\.db\.query\("repairs"\)\.collect\(\)/);
});

test("shipping workflow synchronizes the linked sales order lifecycle", async () => {
  const deliveries = await readFile("convex/deliveries.ts", "utf8");
  assert.match(deliveries, /status:\s*"handed_to_shipping"/);
  assert.match(deliveries, /status:\s*"received"/);
  assert.match(deliveries, /applyOrderStatsChange/);
});

test("repair UI exposes the eight agreed commercial statuses including technician receipt and rejection", async () => {
  const repairs = await readFile("src/components/RepairsPage.tsx", "utf8");
  for (const label of [
    "قيد الإنتظار",
    "تم الإستلام من الفني",
    "جاري الصيانة",
    "ظهور مشكلة جديدة",
    "تم الإصلاح",
    "تم التسليم للعميل",
    "مرفوض من العميل",
    "مرفوض من الفني",
  ]) {
    assert.match(repairs, new RegExp(label));
  }
  assert.doesNotMatch(repairs, /مرفوض من شركة الشحن/);
  assert.match(repairs, /rejected_by_shipping/);
  assert.match(repairs, /repairs-summary-strip/);
});

test("reports, tracking, WhatsApp, and automatic follow-up consume the unified lifecycle", async () => {
  const [reports, reportCards, tracking, whatsapp, automation] = await Promise.all([
    readFile("src/components/ReportsPage.tsx", "utf8"),
    readFile("src/components/OperationStatusReportCards.tsx", "utf8"),
    readFile("shared/customerTrackingPortalRules.ts", "utf8"),
    readFile("convex/customerWhatsAppMessages.ts", "utf8"),
    readFile("shared/postDeliveryFollowUpRules.ts", "utf8"),
  ]);
  assert.match(reports, /OperationStatusReportCards/);
  assert.match(reportCards, /api\.operationStatusDashboard\.reportCounts/);
  assert.match(tracking, /handed_to_shipping/);
  assert.match(tracking, /rejected_by_shipping/);
  assert.match(whatsapp, /operation\.rawStatus === "handed_to_shipping"/);
  assert.match(whatsapp, /operation\.rawStatus === "delivered_to_customer"/);
  assert.match(automation, /delivered_to_customer/);
  assert.match(automation, /received/);
});
