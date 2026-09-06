import { query } from "./_generated/server.js";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  ORDER_STATUSES,
  REPAIR_STATUSES,
  normalizeOrderStatus,
  normalizeRepairStatus,
  type CanonicalOrderStatus,
  type RepairLifecycleStatus,
} from "../shared/businessRules.ts";
import { businessDate } from "../shared/businessDate.ts";
import {
  assertBranchAccess,
  requireModulePermission,
  requirePermission,
  type AuthUser,
} from "./lib/auth.ts";

const emptyOrderCounts = (): Record<CanonicalOrderStatus, number> => ({
  pending: 0,
  confirmed: 0,
  preparing: 0,
  ready: 0,
  delivered_to_customer: 0,
  handed_to_shipping: 0,
  received: 0,
  cancelled: 0,
});

const emptyRepairCounts = (): Record<RepairLifecycleStatus, number> => ({
  pending: 0,
  in_progress: 0,
  new_issue: 0,
  repaired: 0,
  delivered_to_customer: 0,
  rejected_by_customer: 0,
  rejected_by_shipping: 0,
});

async function loadOrders(
  ctx: QueryCtx,
  branchId?: Id<"branches">,
): Promise<Doc<"orders">[]> {
  const groups = await Promise.all(
    ORDER_STATUSES.map((status) =>
      branchId
        ? ctx.db
            .query("orders")
            .withIndex("by_branch_status", (q) =>
              q.eq("branchId", branchId).eq("status", status),
            )
            .collect()
        : ctx.db
            .query("orders")
            .withIndex("by_status", (q) => q.eq("status", status))
            .collect(),
    ),
  );
  return groups.flat();
}

async function loadRepairs(
  ctx: QueryCtx,
  branchId?: Id<"branches">,
): Promise<Doc<"repairs">[]> {
  const groups = await Promise.all(
    REPAIR_STATUSES.map((status) =>
      branchId
        ? ctx.db
            .query("repairs")
            .withIndex("by_branch_status", (q) =>
              q.eq("branchId", branchId).eq("status", status),
            )
            .collect()
        : ctx.db
            .query("repairs")
            .withIndex("by_status", (q) => q.eq("status", status))
            .collect(),
    ),
  );
  return groups.flat();
}

function countOrders(rows: Doc<"orders">[]) {
  const counts = emptyOrderCounts();
  for (const row of rows) {
    const status = normalizeOrderStatus(row.status);
    if (status) counts[status] += 1;
  }
  return { ...counts, total: rows.length };
}

function countRepairs(rows: Doc<"repairs">[]) {
  const counts = emptyRepairCounts();
  for (const row of rows) {
    const status = normalizeRepairStatus(row.status);
    if (status) counts[status] += 1;
  }
  return { ...counts, total: rows.length };
}

function accessibleBranch(user: AuthUser, requested?: Id<"branches">) {
  if (requested) {
    assertBranchAccess(user, { branchId: requested });
    return requested;
  }
  if (user.role === "admin" || user.role === "accountant") return undefined;
  return user.branchId;
}

export const orderCounts = query({
  args: {
    branchId: v.optional(v.id("branches")),
    refreshToken: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "view_orders", "orders");
    const branchId = accessibleBranch(user, args.branchId);
    if (user.role !== "admin" && !branchId) return { ...emptyOrderCounts(), total: 0 };
    return countOrders(await loadOrders(ctx, branchId));
  },
});

export const repairCounts = query({
  args: {
    branchId: v.optional(v.id("branches")),
    refreshToken: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "view_repairs", "repairs");
    const branchId = accessibleBranch(user, args.branchId);
    if (user.role !== "admin" && !branchId) return { ...emptyRepairCounts(), total: 0 };
    return countRepairs(await loadRepairs(ctx, branchId));
  },
});

export const reportCounts = query({
  args: {
    branchId: v.optional(v.id("branches")),
    from: v.string(),
    to: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "view_reports");
    const branchId = accessibleBranch(user, args.branchId);
    if (args.from > args.to) throw new Error("الفترة غير صحيحة");
    if (user.role !== "admin" && user.role !== "accountant" && !branchId) {
      return {
        orders: { ...emptyOrderCounts(), total: 0 },
        repairs: { ...emptyRepairCounts(), total: 0 },
      };
    }
    const [orders, repairs] = await Promise.all([
      loadOrders(ctx, branchId),
      loadRepairs(ctx, branchId),
    ]);
    const filteredOrders = orders.filter((row) => {
      const date = businessDate(row._creationTime);
      return date >= args.from && date <= args.to;
    });
    const filteredRepairs = repairs.filter(
      (row) => row.receivedDate >= args.from && row.receivedDate <= args.to,
    );
    return {
      orders: countOrders(filteredOrders),
      repairs: countRepairs(filteredRepairs),
    };
  },
});
