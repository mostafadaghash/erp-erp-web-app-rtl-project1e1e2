import { mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requirePermission } from "./lib/auth.ts";
import { upsertOperationFollowUp } from "./lib/operationFollowUpSync.ts";
import { normalizeOrderStatus, normalizeRepairStatus } from "../shared/businessRules.ts";

const OPEN_ORDER_STATUSES = ["pending", "confirmed", "preparing", "ready", "handed_to_shipping"] as const;
const OPEN_REPAIR_STATUSES = ["received", "under_inspection", "awaiting_approval", "in_progress", "ready", "rejected_by_shipping"] as const;
const ORDER_TERMINAL = new Set(["delivered_to_customer", "received", "delivered", "cancelled"]);
const REPAIR_TERMINAL = new Set(["delivered", "cancelled"]);

async function loadOpenOrders(ctx: MutationCtx, branchId?: Id<"branches">) {
  const rows = [];
  for (const status of OPEN_ORDER_STATUSES) {
    const batch = branchId
      ? await ctx.db.query("orders").withIndex("by_branch_status", q => q.eq("branchId", branchId).eq("status", status)).take(75)
      : await ctx.db.query("orders").withIndex("by_status", q => q.eq("status", status)).take(75);
    rows.push(...batch);
  }
  return rows;
}

async function loadOpenRepairs(ctx: MutationCtx, branchId?: Id<"branches">) {
  const rows = [];
  for (const status of OPEN_REPAIR_STATUSES) {
    const batch = branchId
      ? await ctx.db.query("repairs").withIndex("by_branch_status", q => q.eq("branchId", branchId).eq("status", status)).take(75)
      : await ctx.db.query("repairs").withIndex("by_status", q => q.eq("status", status)).take(75);
    rows.push(...batch);
  }
  return rows;
}

/**
 * Reconciles operational follow-ups from source records. Repeated calls are
 * idempotent because each operation is keyed by source type + source id.
 */
export const syncOpenOperations = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requirePermission(ctx, "view_follow_ups");
    const [orders, repairs, existingActive] = await Promise.all([
      loadOpenOrders(ctx, user.branchId),
      loadOpenRepairs(ctx, user.branchId),
      user.branchId
        ? ctx.db.query("customerFollowUps").withIndex("by_branch_status_date", q => q.eq("branchId", user.branchId!).eq("status", "pending")).take(250)
        : ctx.db.query("customerFollowUps").withIndex("by_status_date", q => q.eq("status", "pending")).take(250),
    ]);

    let created = 0;
    let updated = 0;
    for (const order of orders) {
      if (!order.branchId) continue;
      const result = await upsertOperationFollowUp(ctx, user, {
        sourceType: "order",
        sourceId: String(order._id),
        sourceNumber: order.orderNumber,
        sourceStatus: normalizeOrderStatus(order.status) ?? order.status,
        branchId: order.branchId,
        customerId: order.customerId,
        customerName: order.customerName,
        phone: order.customerPhone,
        terminal: ORDER_TERMINAL.has(order.status),
      });
      result.created ? created++ : updated++;
    }
    for (const repair of repairs) {
      if (!repair.branchId) continue;
      const result = await upsertOperationFollowUp(ctx, user, {
        sourceType: "repair",
        sourceId: String(repair._id),
        sourceNumber: repair.repairNumber,
        sourceStatus: normalizeRepairStatus(repair.status) ?? repair.status,
        branchId: repair.branchId,
        customerId: repair.customerId,
        customerName: repair.customerName,
        phone: repair.customerPhone,
        terminal: REPAIR_TERMINAL.has(repair.status),
      });
      result.created ? created++ : updated++;
    }

    // Close terminal operations that were active on the previous sync.
    for (const followUp of existingActive) {
      if (!followUp.sourceId) continue;
      if (followUp.sourceType === "order") {
        const order = await ctx.db.get(followUp.sourceId as Id<"orders">);
        if (order && ORDER_TERMINAL.has(order.status) && order.branchId) {
          await upsertOperationFollowUp(ctx, user, {
            sourceType: "order", sourceId: String(order._id), sourceNumber: order.orderNumber,
            sourceStatus: normalizeOrderStatus(order.status) ?? order.status,
            branchId: order.branchId, customerId: order.customerId,
            customerName: order.customerName, phone: order.customerPhone, terminal: true,
          });
        }
      } else if (followUp.sourceType === "repair") {
        const repair = await ctx.db.get(followUp.sourceId as Id<"repairs">);
        if (repair && REPAIR_TERMINAL.has(repair.status) && repair.branchId) {
          await upsertOperationFollowUp(ctx, user, {
            sourceType: "repair", sourceId: String(repair._id), sourceNumber: repair.repairNumber,
            sourceStatus: normalizeRepairStatus(repair.status) ?? repair.status,
            branchId: repair.branchId, customerId: repair.customerId,
            customerName: repair.customerName, phone: repair.customerPhone, terminal: true,
          });
        }
      }
    }
    return { created, updated, scannedOrders: orders.length, scannedRepairs: repairs.length };
  },
});
