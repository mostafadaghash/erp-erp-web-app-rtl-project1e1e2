import test from "node:test";
import assert from "node:assert/strict";
import {
  CURRENT_ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  ORDER_TRANSITIONS,
  REPAIR_STATUS_LABELS,
  REPAIR_TRANSITIONS,
  canTransition,
  normalizeOrderStatus,
  normalizeRepairStatus,
} from "../shared/businessRules.ts";

test("sales order lifecycle contains every agreed operational status", () => {
  assert.deepEqual(CURRENT_ORDER_STATUSES, [
    "pending",
    "confirmed",
    "preparing",
    "ready",
    "delivered_to_customer",
    "handed_to_shipping",
    "received",
    "cancelled",
  ]);
  assert.deepEqual(ORDER_STATUS_LABELS, {
    pending: "قيد الإنتظار",
    confirmed: "مؤكد",
    preparing: "جاري التجهيز",
    ready: "تم التجهيز",
    delivered_to_customer: "تم التسليم للعميل",
    handed_to_shipping: "تم التسليم لشركة الشحن",
    received: "تم الإستلام",
    cancelled: "ملغي",
  });
  assert.equal(canTransition(ORDER_TRANSITIONS, "pending", "confirmed"), true);
  assert.equal(canTransition(ORDER_TRANSITIONS, "confirmed", "preparing"), true);
  assert.equal(canTransition(ORDER_TRANSITIONS, "preparing", "ready"), true);
  assert.equal(canTransition(ORDER_TRANSITIONS, "ready", "delivered_to_customer"), true);
  assert.equal(canTransition(ORDER_TRANSITIONS, "confirmed", "ready"), false);
  assert.equal(normalizeOrderStatus("delivered"), "received");
});

test("repair lifecycle normalizes raw workflow into the eight agreed operational statuses", () => {
  assert.deepEqual(REPAIR_STATUS_LABELS, {
    pending: "قيد الإنتظار",
    technician_received: "تم الإستلام من الفني",
    in_progress: "جاري الصيانة",
    new_issue: "ظهور مشكلة جديدة",
    repaired: "تم الإصلاح",
    delivered_to_customer: "تم التسليم للعميل",
    rejected_by_customer: "مرفوض من العميل",
    rejected_by_technician: "مرفوض من الفني",
  });
  assert.equal(normalizeRepairStatus("received"), "pending");
  assert.equal(normalizeRepairStatus("under_inspection"), "technician_received");
  assert.equal(normalizeRepairStatus("in_progress"), "in_progress");
  assert.equal(normalizeRepairStatus("awaiting_approval"), "new_issue");
  assert.equal(normalizeRepairStatus("ready"), "repaired");
  assert.equal(normalizeRepairStatus("delivered"), "delivered_to_customer");
  assert.equal(normalizeRepairStatus("cancelled"), "rejected_by_customer");
  assert.equal(normalizeRepairStatus("rejected_by_shipping"), "rejected_by_technician");
  assert.equal(canTransition(REPAIR_TRANSITIONS, "under_inspection", "rejected_by_shipping"), true);
  assert.equal(canTransition(REPAIR_TRANSITIONS, "rejected_by_shipping", "under_inspection"), true);
  assert.equal(canTransition(REPAIR_TRANSITIONS, "ready", "rejected_by_shipping"), false);
});
