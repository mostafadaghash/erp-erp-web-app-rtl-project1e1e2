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

test("sales-order tracking follows the real confirmed/ready/shipped lifecycle", () => {
  assert.equal(publicTrackingStatus("order", "confirmed"), "جاري التجهيز");
  assert.equal(publicTrackingStatus("order", "ready"), "تم التجهيز");
  assert.equal(publicTrackingStatus("order", "ready", "shipped"), "تم التسليم لشركة الشحن");
  assert.equal(publicTrackingStatus("order", "delivered"), "تم تسليم الأوردر");

  const confirmed = buildPublicTrackingSteps("order", "confirmed");
  assert.equal(confirmed.find((step) => step.state === "current")?.key, "confirmed");
  const shipped = buildPublicTrackingSteps("order", "ready", "shipped");
  assert.equal(shipped.find((step) => step.state === "current")?.key, "shipped");
  assert.deepEqual(buildPublicTrackingSteps("order", "cancelled"), [
    { key: "stopped", label: "ملغي", state: "stopped" },
  ]);
});

test("repair and delivery tracking expose customer-facing workflow only", () => {
  assert.equal(publicTrackingStatus("repair", "awaiting_approval"), "في انتظار الموافقة");
  assert.equal(
    buildPublicTrackingSteps("repair", "awaiting_approval").find((step) => step.state === "current")?.key,
    "awaiting_approval",
  );
  assert.equal(publicTrackingStatus("delivery", "shipped"), "تم الشحن");
  assert.equal(
    buildPublicTrackingSteps("delivery", "shipped").find((step) => step.state === "current")?.key,
    "shipped",
  );
  assert.equal(buildPublicTrackingSteps("delivery", "returned")[0]?.state, "stopped");
});
