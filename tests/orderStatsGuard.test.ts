import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = await Promise.all([
  readFile(new URL("../convex/orders.ts", import.meta.url), "utf8"),
  readFile(new URL("../convex/deliveries.ts", import.meta.url), "utf8"),
  readFile(new URL("../convex/branches.ts", import.meta.url), "utf8"),
  readFile(new URL("../convex/lib/orderStats.ts", import.meta.url), "utf8"),
]);
const [orders, deliveries, branches, helper] = files;

test("OST-G01 orders.stats has no Orders full scan", () => {
  const stats = orders.slice(orders.indexOf("export const stats"), orders.indexOf("export const statsRebuildState"));
  assert.doesNotMatch(stats, /query\("orders"\).*collect\(/s);
  assert.match(stats, /readOrderStats/);
});

test("OST-G02 every operational order mutation updates the aggregate", () => {
  for (const marker of [
    /applyOrderStatsChange\(ctx, undefined, \{ status: "pending"/,
    /applyOrderStatsChange\(ctx, order, \{ \.\.\.order, total, remaining \}\)/,
    /applyOrderStatsChange\(ctx, order, \{ \.\.\.order, status: args\.status \}\)/,
    /applyOrderStatsChange\(ctx, order, \{ \.\.\.order, remaining: newRemaining \}\)/,
    /applyOrderStatsChange\(ctx, order, \{ \.\.\.order, remaining: nextRemaining \}\)/,
    /applyOrderStatsChange\(ctx, order, \{ \.\.\.order, status: "cancelled" \}\)/,
  ]) assert.match(orders, marker);
});

test("OST-G03 delivery confirmation, reversal and legacy branch assignment stay synchronized", () => {
  assert.match(deliveries, /applyOrderStatsChange\(ctx,order,\{\.\.\.order,status:"received"\}\)/);
  assert.match(deliveries, /applyOrderStatsChange\(ctx,order,\{\.\.\.order,status:"ready"\}\)/);
  assert.match(branches, /applyOrderStatsChange\(ctx, item, \{ \.\.\.item, branchId: args\.branchId \}\)/);
});

test("OST-G04 rebuild uses cursor pagination and generation isolation", () => {
  assert.match(helper, /query\("orders"\)\.order\("asc"\)\.paginate/);
  assert.match(helper, /activeGeneration/);
  assert.match(helper, /buildingGeneration/);
  assert.doesNotMatch(helper, /query\("orders"\).*collect\(/s);
});
