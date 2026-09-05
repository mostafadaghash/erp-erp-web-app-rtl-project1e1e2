from pathlib import Path

path = Path("tests/dashboardOperationalLifecycle.test.ts")
path.write_text(r'''import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  canTransition,
  ORDER_STATUSES,
  REPAIR_TRANSITIONS,
  normalizeRepairStatus,
  repairStatusLabel,
} from "../shared/businessRules.ts";

const repairsSource = readFileSync(new URL("../convex/repairs.ts", import.meta.url), "utf8");
const followUpRulesSource = readFileSync(new URL("../shared/customerFollowUpRules.ts", import.meta.url), "utf8");
const statusDashboardSource = readFileSync(new URL("../convex/operationStatusDashboard.ts", import.meta.url), "utf8");

test("repair lifecycle requires technician receipt and has technician rejection only", () => {
  assert.equal(canTransition(REPAIR_TRANSITIONS, "received", "received_by_technician"), true);
  assert.equal(canTransition(REPAIR_TRANSITIONS, "received", "under_inspection"), false);
  assert.equal(canTransition(REPAIR_TRANSITIONS, "received", "in_progress"), false);
  assert.equal(canTransition(REPAIR_TRANSITIONS, "received_by_technician", "under_inspection"), true);
  assert.equal(normalizeRepairStatus("received_by_technician"), "technician_received");
  assert.equal(repairStatusLabel("received_by_technician"), "تم الاستلام من الفني");
  assert.equal(repairStatusLabel("rejected_by_technician"), "مرفوض من الفني");
  assert.doesNotMatch(repairsSource, /rejected_by_shipping/);
  assert.doesNotMatch(repairsSource, /مرفوض من شركة الشحن/);
  assert.doesNotMatch(followUpRulesSource, /rejected_by_shipping|مرفوض من شركة الشحن/);
});

test("technician rejection uses the protected accounting reversal path", () => {
  assert.match(repairsSource, /isRejection = args\.status === "cancelled" \|\| args\.status === "rejected_by_technician"/);
  assert.match(repairsSource, /يجب استرداد عربون الصيانة بالكامل قبل الرفض/);
  assert.match(repairsSource, /repairPartReversal/);
  assert.match(repairsSource, /type: "repair_cancel"/);
  assert.match(repairsSource, /reverseRepairRevenueJournal/);
  assert.deepEqual(REPAIR_TRANSITIONS.rejected_by_technician, []);
});

test("operational status dashboard is backend permission-aware", () => {
  assert.match(statusDashboardSource, /requireModulePermission/);
  assert.match(statusDashboardSource, /requirePermission/);
  assert.match(statusDashboardSource, /"view_orders"/);
  assert.match(statusDashboardSource, /"view_repairs"/);
  assert.match(statusDashboardSource, /"view_reports"/);
  assert.match(statusDashboardSource, /ORDER_STATUSES/);
  assert.match(statusDashboardSource, /REPAIR_STATUSES/);
  assert.match(statusDashboardSource, /normalizeOrderStatus/);
  assert.match(statusDashboardSource, /normalizeRepairStatus/);
});

test("order dashboard business buckets retain internal workflow states", () => {
  assert.equal(ORDER_STATUSES.includes("pending"), true);
  assert.equal(ORDER_STATUSES.includes("preparing"), true);
  assert.equal(ORDER_STATUSES.includes("ready"), true);
  assert.equal(ORDER_STATUSES.includes("handed_to_shipping"), true);
});
''', encoding="utf-8")
