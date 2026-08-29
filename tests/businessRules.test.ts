import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateInvoiceTotals,
  canTransition,
  ORDER_TRANSITIONS,
  roundMoney,
  SHIPMENT_TRANSITIONS,
  REPAIR_TRANSITIONS,
  DELIVERY_TRANSITIONS,
  calculateDeliveryAmounts,
  isValidIsoDate,
  isRepairStatus,
} from "../shared/businessRules.ts";
import { formatDocumentNumber, nextValueAfterLegacy } from "../convex/lib/documentNumbers.ts";
import { normalizeEgyptPhoneForWhatsApp } from "../src/lib/utils.ts";
import { isPermission, ROLE_PERMISSIONS } from "../convex/lib/permissions.ts";

test("money is rounded to two decimal places", () => {
  assert.equal(roundMoney(10.005), 10.01);
  assert.equal(roundMoney(4.444), 4.44);
});

test("document number formats are separated by type and year", () => {
  assert.equal(formatDocumentNumber("invoice", 2026, 1), "INV-2026-00001");
  assert.equal(formatDocumentNumber("order", 2026, 1), "ORD-2026-00001");
  assert.equal(formatDocumentNumber("shipment", 2027, 2), "SHP-2027-00002");
  assert.equal(formatDocumentNumber("repair", 2026, 10), "REP-2026-00010");
  assert.equal(formatDocumentNumber("delivery", 2026, 11), "DEL-2026-00011");
  assert.equal(nextValueAfterLegacy("invoice", 2026, ["INV-2026-00007", "INV-2025-00999"]), 8);
  assert.equal(nextValueAfterLegacy("invoice", 2027, ["INV-2026-00007"]), 1);
});

test("repair and delivery state machines enforce terminal states", () => {
  assert.equal(canTransition(REPAIR_TRANSITIONS, "received", "under_inspection"), true);
  assert.equal(canTransition(REPAIR_TRANSITIONS, "received", "in_progress"), false);
  assert.equal(canTransition(REPAIR_TRANSITIONS, "delivered", "ready"), false);
  assert.equal(canTransition(DELIVERY_TRANSITIONS, "shipped", "returned"), true);
  assert.equal(canTransition(DELIVERY_TRANSITIONS, "cancelled", "pending"), false);
});

test("repair transitions expose only approved next states", () => {
  assert.deepEqual(REPAIR_TRANSITIONS.received, ["under_inspection", "cancelled"]);
  assert.deepEqual(REPAIR_TRANSITIONS.under_inspection, ["awaiting_approval", "in_progress", "cancelled"]);
  assert.deepEqual(REPAIR_TRANSITIONS.awaiting_approval, ["in_progress", "cancelled"]);
  assert.deepEqual(REPAIR_TRANSITIONS.in_progress, ["ready", "awaiting_approval", "cancelled"]);
  assert.deepEqual(REPAIR_TRANSITIONS.ready, ["delivered", "in_progress", "cancelled"]);
  assert.deepEqual(REPAIR_TRANSITIONS.delivered, []);
  assert.deepEqual(REPAIR_TRANSITIONS.cancelled, []);
  assert.equal(isRepairStatus("ready"), true);
  assert.equal(isRepairStatus("unknown"), false);
});

test("delivery totals are calculated and rounded on the server", () => {
  assert.deepEqual(calculateDeliveryAmounts([{ quantity: 2, unitPrice: 10.005 }], 5.005), {
    totalAmount: 20.01, shippingCost: 5.01, grandTotal: 25.02,
  });
});

test("ISO date validation rejects impossible calendar dates", () => {
  assert.equal(isValidIsoDate("2026-02-28"), true);
  assert.equal(isValidIsoDate("2026-02-30"), false);
  assert.equal(isValidIsoDate("20-02-01"), false);
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
