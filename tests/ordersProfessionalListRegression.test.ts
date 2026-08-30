import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/components/OrdersPage.tsx", "utf8");

test("orders list uses one compact toolbar with search, status and period filters", () => {
  assert.match(page, /data-testid="orders-toolbar"/);
  assert.match(page, /data-testid="order-status-filter"/);
  assert.match(page, /data-testid="order-period-filter"/);
  assert.match(page, /مسح الفلاتر/);
});

test("orders rows open details and secondary actions live under more menu", () => {
  assert.match(page, /data-testid="order-row"[\s\S]*setDetailsTarget\(order\._id\)/);
  assert.match(page, /data-testid="order-more-actions"/);
  assert.match(page, /data-testid="order-actions-menu"/);
  assert.match(page, /تسجيل دفعة/);
  assert.match(page, /طباعة أمر البيع/);
});

test("orders summary uses the compact strip", () => {
  assert.match(page, /data-testid="orders-summary-strip"/);
});
