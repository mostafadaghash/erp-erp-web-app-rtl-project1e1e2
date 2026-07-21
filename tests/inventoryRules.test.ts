import test from "node:test";
import assert from "node:assert/strict";
import { calculateStockAfter, INVENTORY_MOVEMENT_TYPES } from "../shared/inventoryRules.ts";

test("inventory changes calculate an integer non-negative balance", () => {
  assert.equal(calculateStockAfter(5, 3, "استلام"), 8);
  assert.equal(calculateStockAfter(5, -5, "بيع"), 0);
});

test("inventory changes reject zero, fractions, non-finite values, blank reasons and negative balances", () => {
  assert.throws(() => calculateStockAfter(5, 0, "سبب"), /صفراً/);
  assert.throws(() => calculateStockAfter(5, 1.5, "سبب"), /صحيحاً/);
  assert.throws(() => calculateStockAfter(5, Number.NaN, "سبب"), /صحيحاً/);
  assert.throws(() => calculateStockAfter(5, 1, "   "), /سبب/);
  assert.throws(() => calculateStockAfter(5, -6, "بيع"), /سالباً/);
});

test("inventory movement types are centralized and stable", () => {
  assert.deepEqual(Object.values(INVENTORY_MOVEMENT_TYPES), ["opening_balance", "manual_adjustment", "sale", "sale_reversal", "sales_return", "shipment_receipt"]);
});
