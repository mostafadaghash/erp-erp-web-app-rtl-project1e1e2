import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/components/OrdersPage.tsx", "utf8");

test("orders list uses one compact toolbar with search, status and period filters", () => {
  assert.match(page, /data-testid="order-search"/);
  assert.match(page, /data-testid="order-status-filter"/);
  assert.match(page, /data-testid="order-period-filter"/);
  assert.match(page, /مسح الفلاتر/);
});

test("orders rows open details and lifecycle actions live under one action menu", () => {
  assert.match(page, /data-testid="order-row"[\s\S]*setDetailsId\(order\._id\)/);
  assert.match(page, /tabIndex=\{0\}/);
  assert.match(page, /data-testid="order-action-toggle"/);
  assert.match(page, /data-testid="order-actions-menu"/);
  assert.match(page, /تسعير الطلب/);
  assert.match(page, /أمر التجهيز/);
  assert.match(page, /إلغاء الطلب/);
});

test("orders summary uses the compact strip", () => {
  assert.match(page, /data-testid="orders-summary-strip"/);
});
