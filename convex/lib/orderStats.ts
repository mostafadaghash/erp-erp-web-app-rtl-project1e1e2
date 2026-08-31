import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { AuthUser } from "./auth.ts";
import { normalizeOrderStatus, roundMoney } from "../../shared/businessRules.ts";

export type OrderStatsSnapshot = Pick<Doc<"orders">, "status" | "total" | "remaining" | "branchId">;
export type OrderStatsValues = {
  pending: number;
  confirmed: number;
  ready: number;
  delivered: number;
  totalValue: number;
  pendingValue: number;
  total: number;
};

const ZERO: OrderStatsValues = {
  pending: 0,
  confirmed: 0,
  ready: 0,
  delivered: 0,
  totalValue: 0,
  pendingValue: 0,
  total: 0,
};

const stateKey = "orders" as const;
const aggregateKey = (generation: number, branchId?: Id<"branches">) =>
  branchId ? `${generation}:branch:${branchId}` : `${generation}:global`;

/**
 * The materialized aggregate is kept as a coarse compatibility summary.
 * The Orders page now uses the exact operational status query instead.
 */
export function orderStatsContribution(order?: OrderStatsSnapshot | null): OrderStatsValues {
  if (!order) return { ...ZERO };
  const status = normalizeOrderStatus(order.status);
  const pending = status === "pending";
  const confirmed = status === "confirmed" || status === "preparing";
  const ready = status === "ready" || status === "handed_to_shipping";
  const delivered = status === "delivered_to_customer" || status === "received";
  const terminal = delivered || status === "cancelled";
  return {
    pending: pending ? 1 : 0,
    confirmed: confirmed ? 1 : 0,
    ready: ready ? 1 : 0,
    delivered: delivered ? 1 : 0,
    totalValue: roundMoney(order.total),
    pendingValue: terminal ? 0 : roundMoney(order.remaining),
    total: 1,
  };
}

function difference(after: OrderStatsValues, before: OrderStatsValues): OrderStatsValues {
  return {
    pending: after.pending - before.pending,
    confirmed: after.confirmed - before.confirmed,
    ready: after.ready - before.ready,
    delivered: after.delivered - before.delivered,
    totalValue: roundMoney(after.totalValue - before.totalValue),
    pendingValue: roundMoney(after.pendingValue - before.pendingValue),
    total: after.total - before.total,
  };
}

const emptyDelta = (delta: OrderStatsValues) =>
  delta.pending === 0 && delta.confirmed === 0 && delta.ready === 0 && delta.delivered === 0
  && delta.totalValue === 0 && delta.pendingValue === 0 && delta.total === 0;

async function addDelta(
  ctx: MutationCtx,
  generation: number,
  branchId: Id<"branches"> | undefined,
  delta: OrderStatsValues,
) {
  if (emptyDelta(delta)) return;
  const key = aggregateKey(generation, branchId);
  const row = await ctx.db.query("orderStatsAggregates").withIndex("by_key", q => q.eq("key", key)).unique();
  const next = {
    pending: (row?.pending ?? 0) + delta.pending,
    confirmed: (row?.confirmed ?? 0) + delta.confirmed,
    ready: (row?.ready ?? 0) + delta.ready,
    delivered: (row?.delivered ?? 0) + delta.delivered,
    totalValue: roundMoney((row?.totalValue ?? 0) + delta.totalValue),
    pendingValue: roundMoney((row?.pendingValue ?? 0) + delta.pendingValue),
    total: (row?.total ?? 0) + delta.total,
  };
  if ([next.pending, next.confirmed, next.ready, next.delivered, next.total].some(value => value < 0)) {
    throw new ConvexError("تعذر تحديث إحصائيات الطلبات بسبب رصيد عددي غير صالح");
  }
  const values = { ...next, updatedAt: Date.now() };
  if (row) await ctx.db.patch(row._id, values);
  else await ctx.db.insert("orderStatsAggregates", {
    key,
    generation,
    scope: branchId ? "branch" : "global",
    branchId,
    ...values,
  });
}

export async function applyOrderStatsChange(
  ctx: MutationCtx,
  before?: OrderStatsSnapshot | null,
  after?: OrderStatsSnapshot | null,
) {
  const state = await ctx.db.query("orderStatsState").withIndex("by_key", q => q.eq("key", stateKey)).unique();
  if (!state) return;
  if (state.status === "building") {
    throw new ConvexError("إحصائيات الطلبات قيد إعادة البناء؛ أعد المحاولة بعد اكتمالها");
  }
  if (state.activeGeneration === undefined) return;
  const generation = state.activeGeneration;
  await addDelta(ctx, generation, undefined, difference(orderStatsContribution(after), orderStatsContribution(before)));

  const beforeBranch = before?.branchId;
  const afterBranch = after?.branchId;
  if (beforeBranch === afterBranch) {
    if (beforeBranch) await addDelta(ctx, generation, beforeBranch, difference(orderStatsContribution(after), orderStatsContribution(before)));
    return;
  }
  if (beforeBranch) await addDelta(ctx, generation, beforeBranch, difference(ZERO, orderStatsContribution(before)));
  if (afterBranch) await addDelta(ctx, generation, afterBranch, difference(orderStatsContribution(after), ZERO));
}

export async function readOrderStats(ctx: QueryCtx, user: AuthUser) {
  const state = await ctx.db.query("orderStatsState").withIndex("by_key", q => q.eq("key", stateKey)).unique();
  const readiness = state?.status ?? "uninitialized";
  if (state?.status !== "ready" || state.activeGeneration === undefined) {
    return { ...ZERO, isReady: false, rebuildStatus: readiness };
  }
  if (user.role !== "admin" && !user.branchId) {
    return { ...ZERO, isReady: true, rebuildStatus: "ready" as const };
  }
  const key = aggregateKey(state.activeGeneration, user.role === "admin" ? undefined : user.branchId);
  const row = await ctx.db.query("orderStatsAggregates").withIndex("by_key", q => q.eq("key", key)).unique();
  return {
    pending: row?.pending ?? 0,
    confirmed: row?.confirmed ?? 0,
    ready: row?.ready ?? 0,
    delivered: row?.delivered ?? 0,
    totalValue: row?.totalValue ?? 0,
    pendingValue: row?.pendingValue ?? 0,
    total: row?.total ?? 0,
    isReady: true,
    rebuildStatus: "ready" as const,
  };
}

export async function getOrderStatsRebuildState(ctx: QueryCtx) {
  return ctx.db.query("orderStatsState").withIndex("by_key", q => q.eq("key", stateKey)).unique();
}

export async function rebuildOrderStatsBatch(
  ctx: MutationCtx,
  user: AuthUser,
  input: { cursor: string | null; numItems: number; restart: boolean },
) {
  if (!Number.isInteger(input.numItems) || input.numItems < 1 || input.numItems > 100) {
    throw new ConvexError("حجم دفعة إعادة بناء الإحصائيات يجب أن يكون بين 1 و100");
  }
  let state = await ctx.db.query("orderStatsState").withIndex("by_key", q => q.eq("key", stateKey)).unique();
  let generation: number;
  let processedCount: number;

  if (input.restart) {
    if (input.cursor !== null) throw new ConvexError("إعادة البناء الجديدة يجب أن تبدأ دون Cursor");
    generation = Math.max(state?.activeGeneration ?? 0, state?.buildingGeneration ?? 0) + 1;
    processedCount = 0;
    const values = {
      status: "building" as const,
      buildingGeneration: generation,
      rebuildCursor: undefined,
      processedCount: 0,
      startedAt: Date.now(),
      updatedAt: Date.now(),
      completedAt: undefined,
      startedBy: user.userId,
    };
    if (state) await ctx.db.patch(state._id, values);
    else {
      const id = await ctx.db.insert("orderStatsState", { key: stateKey, ...values });
      state = await ctx.db.get(id);
    }
  } else {
    if (!state || state.status !== "building" || state.buildingGeneration === undefined) {
      throw new ConvexError("لا توجد إعادة بناء جارية لإحصائيات الطلبات");
    }
    const expectedCursor = state.rebuildCursor ?? null;
    if (input.cursor !== expectedCursor) throw new ConvexError("Cursor إعادة بناء إحصائيات الطلبات غير متطابق");
    generation = state.buildingGeneration;
    processedCount = state.processedCount;
  }

  const page = await ctx.db.query("orders").order("asc").paginate({ numItems: input.numItems, cursor: input.cursor });
  for (const order of page.page) {
    const contribution = orderStatsContribution(order);
    await addDelta(ctx, generation, undefined, contribution);
    if (order.branchId) await addDelta(ctx, generation, order.branchId, contribution);
  }
  processedCount += page.page.length;
  const now = Date.now();
  if (!state) throw new ConvexError("تعذر إنشاء حالة إعادة بناء إحصائيات الطلبات");
  if (page.isDone) {
    await ctx.db.patch(state._id, {
      status: "ready",
      activeGeneration: generation,
      buildingGeneration: undefined,
      rebuildCursor: undefined,
      processedCount,
      updatedAt: now,
      completedAt: now,
    });
  } else {
    await ctx.db.patch(state._id, {
      status: "building",
      buildingGeneration: generation,
      rebuildCursor: page.continueCursor,
      processedCount,
      updatedAt: now,
    });
  }
  return {
    generation,
    processedCount,
    isDone: page.isDone,
    continueCursor: page.isDone ? null : page.continueCursor,
  };
}
