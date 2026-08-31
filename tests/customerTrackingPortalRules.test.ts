import test from "node:test";
import assert from "node:assert/strict";
import {
  CUSTOMER_TRACKING_LOCK_MS,
  CUSTOMER_TRACKING_MAX_FAILED_ATTEMPTS,
  CUSTOMER_TRACKING_TOKEN_BYTES,
  buildPublicTrackingSteps,
  getPhoneLast4,
  isValidCustomerTrackingToken,
  normalizePhoneLast4Input,
  publicTrackingStatus,
} from "../shared/customerTrackingPortalRules.ts";

test("customer tracking tokens require a full 256-bit hex value", () => {
  assert.equal(CUSTOMER_TRACKING_TOKEN_BYTES, 32);
  assert.equal(isValidCustomerTrackingToken("a".repeat(64)), true);
  assert.equal(isValidCustomerTrackingToken("F".repeat(64)), true);
  assert.equal(isValidCustomerTrackingToken("a".repeat(63)), false);
  assert.equal(isValidCustomerTrackingToken("a".repeat(65)), false);
  assert.equal(isValidCustomerTrackingToken(`${"a".repeat(63)}z`), false);
});

test("phone verification accepts exactly four normalized final digits", () => {
  assert.equal(getPhoneLast4("+20 0100 123 ٤٥٦٧"), "4567");
  assert.equal(getPhoneLast4("٠١٠١٢٣٤٥٦٧٨"), "5678");
  assert.equal(normalizePhoneLast4Input("٤٥٦٧"), "4567");
  assert.equal(normalizePhoneLast4Input("۴۵۶۷"), "4567");
  assert.equal(normalizePhoneLast4Input("456"), null);
  assert.equal(normalizePhoneLast4Input("12345"), null);
});

test("verification throttling is bounded", () => {
  assert.equal(CUSTOMER_TRACKING_MAX_FAILED_ATTEMPTS, 5);
  assert.equal(CUSTOMER_TRACKING_LOCK_MS, 15 * 60 * 1000);
});

test("sales-order tracking follows the unified pickup and shipping lifecycles", () => {
  assert.equal(publicTrackingStatus("order", "pending"), "قيد الإنتظار");
  assert.equal(publicTrackingStatus("order", "confirmed"), "مؤكد");
  assert.equal(publicTrackingStatus("order", "preparing"), "جاري التجهيز");
  assert.equal(publicTrackingStatus("order", "ready"), "تم التجهيز");
  assert.equal(publicTrackingStatus("order", "delivered_to_customer"), "تم التسليم للعميل");
  assert.equal(publicTrackingStatus("order", "handed_to_shipping"), "تم التسليم لشركة الشحن");
  assert.equal(publicTrackingStatus("order", "ready", "shipped"), "تم التسليم لشركة الشحن");
  assert.equal(publicTrackingStatus("order", "received"), "تم الإستلام");
  assert.equal(publicTrackingStatus("order", "delivered"), "تم الإستلام");

  const confirmed = buildPublicTrackingSteps("order", "confirmed");
  assert.equal(confirmed.find((step) => step.state === "current")?.key, "confirmed");
  const preparing = buildPublicTrackingSteps("order", "preparing");
  assert.equal(preparing.find((step) => step.state === "current")?.key, "preparing");
  const shipped = buildPublicTrackingSteps("order", "handed_to_shipping", "shipped");
  assert.equal(shipped.find((step) => step.state === "current")?.key, "handed_to_shipping");
  const received = buildPublicTrackingSteps("order", "received", "delivered");
  assert.equal(received.find((step) => step.state === "current")?.key, "received");
  assert.deepEqual(buildPublicTrackingSteps("order", "cancelled"), [
    { key: "stopped", label: "ملغي", state: "stopped" },
  ]);
});

test("repair and delivery tracking expose the unified customer-facing workflow", () => {
  assert.equal(publicTrackingStatus("repair", "received"), "قيد الإنتظار");
  assert.equal(publicTrackingStatus("repair", "in_progress"), "جاري الصيانة");
  assert.equal(publicTrackingStatus("repair", "awaiting_approval"), "ظهور مشكلة جديدة");
  assert.equal(publicTrackingStatus("repair", "ready"), "تم الإصلاح");
  assert.equal(publicTrackingStatus("repair", "delivered"), "تم التسليم للعميل");
  assert.equal(publicTrackingStatus("repair", "cancelled"), "مرفوض من العميل");
  assert.equal(publicTrackingStatus("repair", "rejected_by_shipping"), "مرفوض من شركة الشحن");
  assert.equal(
    buildPublicTrackingSteps("repair", "awaiting_approval").find((step) => step.state === "current")?.key,
    "new_issue",
  );
  assert.equal(buildPublicTrackingSteps("repair", "rejected_by_shipping")[0]?.state, "stopped");

  assert.equal(publicTrackingStatus("delivery", "shipped"), "تم التسليم لشركة الشحن");
  assert.equal(publicTrackingStatus("delivery", "delivered"), "تم الإستلام");
  assert.equal(
    buildPublicTrackingSteps("delivery", "shipped").find((step) => step.state === "current")?.key,
    "shipped",
  );
  assert.equal(buildPublicTrackingSteps("delivery", "returned")[0]?.state, "stopped");
});
