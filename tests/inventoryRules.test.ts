import test from "node:test";
import assert from "node:assert/strict";
import { calculateInventoryChange, calculateStockAfter, INVENTORY_MOVEMENT_TYPES } from "../shared/inventoryRules.ts";

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

test("exact inventory value direction accepts zero and rejects reversed or imprecise values", () => {
  assert.deepEqual(calculateInventoryChange(1, 5, 5, 1, 0, 0), { stockAfter: 2, inventoryValueBefore: 5, inventoryValueAfter: 5, valueDelta: 0, averageCostAfter: 2.5 });
  assert.deepEqual(calculateInventoryChange(2, 5, 10, -1, 0, 0), { stockAfter: 1, inventoryValueBefore: 10, inventoryValueAfter: 10, valueDelta: 0, averageCostAfter: 10 });
  assert.throws(() => calculateInventoryChange(1, 5, 5, 1, 1, -1), /الدقيقة/);
  assert.throws(() => calculateInventoryChange(2, 5, 10, -1, 1, 1), /الدقيقة/);
  assert.throws(() => calculateInventoryChange(1, 5, 5, 1, 1, Number.POSITIVE_INFINITY), /الدقيقة/);
  assert.throws(() => calculateInventoryChange(1, 5, 5, 1, 1, 1.001), /الدقيقة/);
});
