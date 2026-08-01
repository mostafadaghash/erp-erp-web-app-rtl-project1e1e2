import test from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema.ts";
import type { Id } from "../convex/_generated/dataModel";
import {
  applyOrderStatsChange,
  readOrderStats,
  rebuildOrderStatsBatch,
  type OrderStatsSnapshot,
} from "../convex/lib/orderStats.ts";
import type { AuthUser } from "../convex/lib/auth.ts";

const modules = {};

async function fixture() {
  const raw = convexTest(schema, modules);
  const ids = await raw.run(async ctx => {
    const branchA = await ctx.db.insert("branches", { name: "أ", address: "القاهرة", isActive: true });
    const branchB = await ctx.db.insert("branches", { name: "ب", address: "الجيزة", isActive: true });
    const adminProfile = await ctx.db.insert("userProfiles", { userId: "admin", tokenIdentifier: "admin", name: "مدير", role: "admin", branchId: branchA, permissions: [], isActive: true });
    const branchProfile = await ctx.db.insert("userProfiles", { userId: "branch", tokenIdentifier: "branch", name: "فرع", role: "manager", branchId: branchA, permissions: [], isActive: true });
    return { branchA, branchB, adminProfile, branchProfile };
  });
  const admin: AuthUser = { userId: "admin", employeeId: ids.adminProfile, name: "مدير", role: "admin", branchId: ids.branchA, isActive: true, permissions: [] };
  const branchUser: AuthUser = { userId: "branch", employeeId: ids.branchProfile, name: "فرع", role: "manager", branchId: ids.branchA, isActive: true, permissions: [] };
  return { raw, admin, branchUser, ...ids };
}

async function insertOrder(e: Awaited<ReturnType<typeof fixture>>, input: { number: string; branchId?: Id<"branches">; status: string; total: number; remaining: number }) {
  return e.raw.run(ctx => ctx.db.insert("orders", {
    orderNumber: input.number,
    customerName: input.number,
    items: [],
    total: input.total,
    deposit: input.total - input.remaining,
    remaining: input.remaining,
    status: input.status,
    branchId: input.branchId,
  }));
}

async function rebuild(e: Awaited<ReturnType<typeof fixture>>, numItems = 2) {
  let cursor: string | null = null;
  let restart = true;
  while (true) {
    const result = await e.raw.run(ctx => rebuildOrderStatsBatch(ctx, e.admin, { cursor, numItems, restart }));
    if (result.isDone) return result;
    cursor = result.continueCursor;
    restart = false;
  }
}

const pick = (value: Awaited<ReturnType<typeof readOrderStats>>) => ({
  pending: value.pending,
  confirmed: value.confirmed,
  ready: value.ready,
  delivered: value.delivered,
  totalValue: value.totalValue,
  pendingValue: value.pendingValue,
  total: value.total,
});

test("OST-01 uninitialized stats are explicit and never guessed", async () => {
  const e = await fixture();
  const stats = await e.raw.run(ctx => readOrderStats(ctx, e.admin));
  assert.equal(stats.isReady, false);
  assert.equal(stats.rebuildStatus, "uninitialized");
  assert.deepEqual(pick(stats), { pending: 0, confirmed: 0, ready: 0, delivered: 0, totalValue: 0, pendingValue: 0, total: 0 });
});

test("OST-02 paginated rebuild preserves legacy global and branch formulas", async () => {
  const e = await fixture();
  await insertOrder(e, { number: "A-P", branchId: e.branchA, status: "pending", total: 100, remaining: 80 });
  await insertOrder(e, { number: "A-D", branchId: e.branchA, status: "delivered", total: 200, remaining: 0 });
  await insertOrder(e, { number: "B-C", branchId: e.branchB, status: "confirmed", total: 50, remaining: 30 });
  await insertOrder(e, { number: "LEGACY-X", status: "cancelled", total: 10, remaining: 10 });
  const result = await rebuild(e, 2);
  assert.equal(result.processedCount, 4);
  const admin = await e.raw.run(ctx => readOrderStats(ctx, e.admin));
  const branch = await e.raw.run(ctx => readOrderStats(ctx, e.branchUser));
  assert.deepEqual(pick(admin), { pending: 1, confirmed: 1, ready: 0, delivered: 1, totalValue: 360, pendingValue: 110, total: 4 });
  assert.deepEqual(pick(branch), { pending: 1, confirmed: 0, ready: 0, delivered: 1, totalValue: 300, pendingValue: 80, total: 2 });
  assert.equal(admin.isReady, true);
});

test("OST-03 atomic deltas cover create, value, payment, status and branch changes", async () => {
  const e = await fixture();
  await rebuild(e);
  const created: OrderStatsSnapshot = { status: "pending", total: 100, remaining: 100, branchId: e.branchA };
  await e.raw.run(async ctx => { await ctx.db.insert("orders", { orderNumber: "LIVE", customerName: "Live", items: [], total: 100, deposit: 0, remaining: 100, status: "pending", branchId: e.branchA }); await applyOrderStatsChange(ctx, undefined, created); });
  const paid = { ...created, remaining: 70 };
  await e.raw.run(ctx => applyOrderStatsChange(ctx, created, paid));
  const ready = { ...paid, status: "ready" };
  await e.raw.run(ctx => applyOrderStatsChange(ctx, paid, ready));
  const moved = { ...ready, branchId: e.branchB };
  await e.raw.run(ctx => applyOrderStatsChange(ctx, ready, moved));
  const global = await e.raw.run(ctx => readOrderStats(ctx, e.admin));
  const branch = await e.raw.run(ctx => readOrderStats(ctx, e.branchUser));
  assert.deepEqual(pick(global), { pending: 0, confirmed: 0, ready: 1, delivered: 0, totalValue: 100, pendingValue: 70, total: 1 });
  assert.deepEqual(pick(branch), { pending: 0, confirmed: 0, ready: 0, delivered: 0, totalValue: 0, pendingValue: 0, total: 0 });
});

test("OST-04 rebuild cursor is durable and operational writes fail closed while building", async () => {
  const e = await fixture();
  await insertOrder(e, { number: "1", branchId: e.branchA, status: "pending", total: 10, remaining: 10 });
  await insertOrder(e, { number: "2", branchId: e.branchA, status: "pending", total: 20, remaining: 20 });
  const first = await e.raw.run(ctx => rebuildOrderStatsBatch(ctx, e.admin, { cursor: null, numItems: 1, restart: true }));
  assert.equal(first.isDone, false);
  await assert.rejects(e.raw.run(ctx => applyOrderStatsChange(ctx, undefined, { status: "pending", total: 1, remaining: 1, branchId: e.branchA })), /قيد إعادة البناء/);
  await assert.rejects(e.raw.run(ctx => rebuildOrderStatsBatch(ctx, e.admin, { cursor: "wrong", numItems: 1, restart: false })), /Cursor/);
  const done = await e.raw.run(ctx => rebuildOrderStatsBatch(ctx, e.admin, { cursor: first.continueCursor, numItems: 10, restart: false }));
  assert.equal(done.isDone, true);
});
