import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_POST_DELIVERY_FOLLOW_UP_DAYS,
  POST_DELIVERY_FOLLOW_UP_TYPE,
  addDaysToIsoDate,
  buildPostDeliveryFollowUpCreationKey,
  isPostDeliveryAuditTrigger,
  normalizePostDeliveryFollowUpDays,
  sourceTypeFromDeliveryAuditModule,
} from "../shared/postDeliveryFollowUpRules.ts";

test("post-delivery follow-up defaults to two days", () => {
  assert.equal(DEFAULT_POST_DELIVERY_FOLLOW_UP_DAYS, 2);
  assert.equal(normalizePostDeliveryFollowUpDays(), 2);
  assert.equal(POST_DELIVERY_FOLLOW_UP_TYPE, "متابعة ما بعد البيع");
});

test("post-delivery delay accepts configurable calendar days", () => {
  assert.equal(addDaysToIsoDate("2026-08-30", 2), "2026-09-01");
  assert.equal(addDaysToIsoDate("2026-12-31", 3), "2027-01-03");
  assert.equal(addDaysToIsoDate("2028-02-28", 1), "2028-02-29");
  assert.equal(addDaysToIsoDate("2026-08-30", 0), "2026-08-30");
});

test("post-delivery delay rejects invalid configuration", () => {
  for (const value of [-1, 1.5, 366, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => normalizePostDeliveryFollowUpDays(value), /عدد أيام صحيح/);
  }
  assert.throws(() => addDaysToIsoDate("2026-02-30", 2), /تاريخ التسليم غير صالح/);
});

test("only real delivery transitions trigger automatic follow-up", () => {
  assert.equal(isPostDeliveryAuditTrigger({ module: "orders", action: "update_status", status: "delivered" }), true);
  assert.equal(isPostDeliveryAuditTrigger({ module: "repairs", action: "update_status", status: "delivered" }), true);
  assert.equal(isPostDeliveryAuditTrigger({ module: "deliveries", action: "confirm", status: "delivered" }), true);
  assert.equal(isPostDeliveryAuditTrigger({ module: "deliveries", action: "update_status", status: "delivered" }), false);
  assert.equal(isPostDeliveryAuditTrigger({ module: "orders", action: "update_status", status: "ready" }), false);
  assert.equal(isPostDeliveryAuditTrigger({ module: "customer_follow_ups", action: "create", status: "follow_up_later" }), false);
});

test("creation key is stable for repeated updates to the same operation", () => {
  const first = buildPostDeliveryFollowUpCreationKey("repair", "repair-123");
  const repeated = buildPostDeliveryFollowUpCreationKey("repair", "repair-123");
  assert.equal(first, repeated);
  assert.notEqual(first, buildPostDeliveryFollowUpCreationKey("order", "repair-123"));
  assert.notEqual(first, buildPostDeliveryFollowUpCreationKey("repair", "repair-456"));
});

test("audit modules map to the intended follow-up source", () => {
  assert.equal(sourceTypeFromDeliveryAuditModule("orders"), "order");
  assert.equal(sourceTypeFromDeliveryAuditModule("repairs"), "repair");
  assert.equal(sourceTypeFromDeliveryAuditModule("deliveries"), "delivery");
});
