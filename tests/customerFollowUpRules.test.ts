import test from "node:test";
import assert from "node:assert/strict";
import {
  FOLLOW_UP_COMMERCIAL_STATUS_LABELS,
  FOLLOW_UP_SOURCE_TYPES,
  REPAIR_SOURCE_STATUS_LABELS,
  SALES_ORDER_SOURCE_STATUS_LABELS,
  deriveFollowUpCommercialStatus,
  mapOrderSourceStatus,
  mapRepairSourceStatus,
} from "../shared/customerFollowUpRules.ts";
import { ROLE_PERMISSIONS } from "../convex/lib/permissions.ts";

test("follow-up sources cover all six requested business origins", () => {
  assert.deepEqual(FOLLOW_UP_SOURCE_TYPES, [
    "lead",
    "order",
    "repair",
    "delivery",
    "delivered_operation",
    "manual",
  ]);
});

test("commercial follow-up statuses are derived from workflow state and date", () => {
  assert.equal(deriveFollowUpCommercialStatus({ status: "pending", followUpDate: "2026-08-31", asOfDate: "2026-08-30" }), "needs_follow_up");
  assert.equal(deriveFollowUpCommercialStatus({ status: "pending", followUpDate: "2026-08-30", asOfDate: "2026-08-30" }), "today");
  assert.equal(deriveFollowUpCommercialStatus({ status: "follow_up_later", followUpDate: "2026-08-29", asOfDate: "2026-08-30" }), "overdue");
  assert.equal(deriveFollowUpCommercialStatus({ status: "follow_up_later", followUpDate: "2026-09-05", asOfDate: "2026-08-30" }), "follow_up_later");
  assert.equal(deriveFollowUpCommercialStatus({ status: "completed", followUpDate: "2026-08-20", asOfDate: "2026-08-30" }), "completed");
  assert.deepEqual(FOLLOW_UP_COMMERCIAL_STATUS_LABELS, {
    needs_follow_up: "مطلوب متابعة",
    today: "اليوم",
    overdue: "متأخر",
    completed: "مكتمل",
    follow_up_later: "متابعة لاحقة",
  });
});

test("sales order source statuses match the unified requested Arabic workflow", () => {
  assert.deepEqual(SALES_ORDER_SOURCE_STATUS_LABELS, [
    "قيد الإنتظار",
    "مؤكد",
    "جاري التجهيز",
    "تم التجهيز",
    "تم التسليم للعميل",
    "تم التسليم لشركة الشحن",
    "تم الإستلام",
    "ملغي",
  ]);
  assert.equal(mapOrderSourceStatus("pending"), "قيد الإنتظار");
  assert.equal(mapOrderSourceStatus("confirmed"), "مؤكد");
  assert.equal(mapOrderSourceStatus("preparing"), "جاري التجهيز");
  assert.equal(mapOrderSourceStatus("ready"), "تم التجهيز");
  assert.equal(mapOrderSourceStatus("delivered_to_customer"), "تم التسليم للعميل");
  assert.equal(mapOrderSourceStatus("handed_to_shipping"), "تم التسليم لشركة الشحن");
  assert.equal(mapOrderSourceStatus("ready", true), "تم التسليم لشركة الشحن");
  assert.equal(mapOrderSourceStatus("received"), "تم الإستلام");
  assert.equal(mapOrderSourceStatus("delivered"), "تم الإستلام");
  assert.equal(mapOrderSourceStatus("cancelled", true), "ملغي");
});

test("repair source statuses match the agreed eight-state workflow", () => {
  assert.deepEqual(REPAIR_SOURCE_STATUS_LABELS, [
    "قيد الإنتظار",
    "تم الإستلام من الفني",
    "جاري الصيانة",
    "ظهور مشكلة جديدة",
    "تم الإصلاح",
    "تم التسليم للعميل",
    "مرفوض من العميل",
    "مرفوض من الفني",
  ]);
  assert.equal(mapRepairSourceStatus("received"), "قيد الإنتظار");
  assert.equal(mapRepairSourceStatus("under_inspection"), "تم الإستلام من الفني");
  assert.equal(mapRepairSourceStatus("in_progress"), "جاري الصيانة");
  assert.equal(mapRepairSourceStatus("awaiting_approval"), "ظهور مشكلة جديدة");
  assert.equal(mapRepairSourceStatus("ready"), "تم الإصلاح");
  assert.equal(mapRepairSourceStatus("delivered"), "تم التسليم للعميل");
  assert.equal(mapRepairSourceStatus("cancelled", "رفض العميل السعر"), "مرفوض من العميل");
  assert.equal(mapRepairSourceStatus("cancelled", "رفض الفني الجهاز"), "مرفوض من الفني");
  assert.equal(mapRepairSourceStatus("cancelled"), "مرفوض من العميل");
  assert.equal(mapRepairSourceStatus("cancelled", undefined, "customer"), "مرفوض من العميل");
  assert.equal(mapRepairSourceStatus("cancelled", undefined, "shipping"), "مرفوض من الفني");
  assert.equal(mapRepairSourceStatus("rejected_by_shipping"), "مرفوض من الفني");
});

test("operational roles receive follow-up permissions without widening unrelated roles", () => {
  for (const role of ["manager", "sales", "customer_service", "technician", "shipping"]) {
    assert.equal(ROLE_PERMISSIONS[role]?.includes("view_follow_ups"), true, role);
    assert.equal(ROLE_PERMISSIONS[role]?.includes("manage_follow_ups"), true, role);
  }
  assert.equal(ROLE_PERMISSIONS.accountant?.includes("manage_follow_ups"), false);
  assert.equal(ROLE_PERMISSIONS.viewer?.includes("manage_follow_ups"), false);
});
