import test from "node:test";
import assert from "node:assert/strict";
import { redactProductFinancials, visibleProductStats } from "../convex/lib/productVisibility.ts";

const product = { _id: "product-1", name: "هاتف", stock: 2, sellPrice: 150, costPrice: 100 };

test("view_products alone receives no product financial fields", () => {
  const visible = redactProductFinancials(product, ["view_products"]);
  assert.deepEqual(visible, { _id: "product-1", name: "هاتف", stock: 2 });
  assert.deepEqual(visibleProductStats([product], ["view_products"]), {});
});

test("view_prices receives sell price but not cost or profit", () => {
  const visible = redactProductFinancials(product, ["view_products", "view_prices"]);
  assert.equal(visible.sellPrice, 150);
  assert.equal("costPrice" in visible, false);
  assert.deepEqual(visibleProductStats([product], ["view_prices"]), { totalRetail: 300 });
});

test("view_profits receives cost and profit values", () => {
  const visible = redactProductFinancials(product, ["view_products", "view_profits"]);
  assert.equal(visible.costPrice, 100);
  assert.equal("sellPrice" in visible, false);
  assert.deepEqual(visibleProductStats([product], ["view_profits"]), {
    totalValue: 200,
    potentialProfit: 100,
  });
});
