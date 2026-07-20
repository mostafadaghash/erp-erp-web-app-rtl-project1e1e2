import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateInvoiceTotals,
  canTransition,
  ORDER_TRANSITIONS,
  roundMoney,
  SHIPMENT_TRANSITIONS,
} from "../shared/businessRules.ts";
import { normalizeEgyptPhoneForWhatsApp } from "../src/lib/utils.ts";
import { isPermission, ROLE_PERMISSIONS } from "../convex/lib/permissions.ts";

test("money is rounded to two decimal places", () => {
  assert.equal(roundMoney(10.005), 10.01);
  assert.equal(roundMoney(4.444), 4.44);
});

test("invoice totals are calculated on trusted inputs", () => {
  assert.deepEqual(calculateInvoiceTotals([100, 50], 10, 14, 70), {
    subtotal: 150,
    discount: 10,
    tax: 19.6,
    total: 159.6,
    paid: 70,
    remaining: 89.6,
    status: "partial",
  });
  assert.equal(calculateInvoiceTotals([100], 0, 14, 114).status, "paid");
});

test("invoice totals reject impossible discounts and payments", () => {
  assert.throws(() => calculateInvoiceTotals([100], 101, 14, 0), /invalid discount/);
  assert.throws(() => calculateInvoiceTotals([100], 0, 14, 115), /invalid paid amount/);
  assert.throws(() => calculateInvoiceTotals([100], 0, 101, 0), /invalid tax rate/);
});

test("order and shipment transitions are one-way and terminal-safe", () => {
  assert.equal(canTransition(ORDER_TRANSITIONS, "pending", "confirmed"), true);
  assert.equal(canTransition(ORDER_TRANSITIONS, "pending", "delivered"), false);
  assert.equal(canTransition(ORDER_TRANSITIONS, "delivered", "pending"), false);
  assert.equal(canTransition(SHIPMENT_TRANSITIONS, "in_transit", "arrived"), true);
  assert.equal(canTransition(SHIPMENT_TRANSITIONS, "arrived", "arrived"), false);
});

test("Egyptian WhatsApp numbers normalize to country code 20", () => {
  assert.equal(normalizeEgyptPhoneForWhatsApp("010 1234 5678"), "201012345678");
  assert.equal(normalizeEgyptPhoneForWhatsApp("+20 10 1234 5678"), "201012345678");
  assert.equal(normalizeEgyptPhoneForWhatsApp("00201012345678"), "201012345678");
});

test("all role permissions are known and legacy wildcards stay invalid", () => {
  for (const permissions of Object.values(ROLE_PERMISSIONS)) {
    assert.equal(permissions.every(isPermission), true);
  }
  for (const legacy of ["view_all", "create_all", "edit_all", "delete_all", "print_all"]) {
    assert.equal(isPermission(legacy), false);
  }
});
