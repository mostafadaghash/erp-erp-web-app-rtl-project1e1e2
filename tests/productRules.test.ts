import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSku, validateOpeningStock, validateProductInput } from "../shared/productRules.ts";
const valid = { name: " هاتف ", sku: " ab-1 ", costPrice: 10, sellPrice: 12, minStock: 0, unit: " قطعة ", warrantyMonths: 12 };

test("product input trims text and normalizes SKU consistently", () => {
  assert.deepEqual(validateProductInput(valid), { name: "هاتف", sku: "AB-1", unit: "قطعة" });
  assert.equal(normalizeSku(" ab-1 "), normalizeSku("AB-1"));
});
test("product rules reject blank names, SKU and units", () => {
  assert.throws(() => validateProductInput({...valid,name:" "}), /اسم/);
  assert.throws(() => validateProductInput({...valid,sku:" "}), /SKU/);
  assert.throws(() => validateProductInput({...valid,unit:" "}), /وحدة/);
});
test("product rules reject negative or non-finite prices", () => {
  assert.throws(() => validateProductInput({...valid,costPrice:-1}), /التكلفة/);
  assert.throws(() => validateProductInput({...valid,sellPrice:Number.POSITIVE_INFINITY}), /البيع/);
});
test("product rules reject fractional or negative warranty and stock quantities", () => {
  assert.throws(() => validateProductInput({...valid,warrantyMonths:-1}), /الضمان/);
  assert.throws(() => validateProductInput({...valid,warrantyMonths:1.5}), /صحيحاً/);
  assert.throws(() => validateOpeningStock(-1), /المخزون/);
  assert.throws(() => validateOpeningStock(1.5), /صحيحاً/);
});
