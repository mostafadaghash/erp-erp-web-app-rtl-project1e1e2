import { mutation } from "./_generated/server";
import { requirePermission } from "./lib/auth.ts";
import { upsertOperationFollowUp } from "./lib/operationFollowUpSync.ts";
import { normalizeOrderStatus, normalizeRepairStatus } from "../shared/businessRules.ts";

const OPEN_ORDER_STATUSES = ["pending", "confirmed", "preparing", "ready", "handed_to_shipping"] as const;
const OPEN_REPAIR_STATUSES = ["received", "under_inspection", "awaiting_approval", "in_progress", "ready", "rejected_by_shipping"] as const;
const ORDER_TERMINAL = new Set(["delivered_to_customer", "received", "delivered", "cancelled"]);
const REPAIR_TERMINAL = new Set(["delivered", "cancelled"]);

async function loadByStatus(ctx: Parameters<Parameters<typeof mutation>[0]["handler"]>[0], table: "orders" | "repairs", statuses: readonly string[], branchId?: string) {
  const rows: any[] = [];
  for (const status of statuses) {
    const query = branchId
      ? ctx.db.query(table).withIndex("by_branch_status" as never, (q: any) => q.eq("branchId", branchId).eq("status", status))
      : ctx.db.query(table).withIndex("by_status" as never, (q: any) => q.eq("status", status));
    rows.push(...await query.take(75));
  }
  return rows;
}

/**
 * Reconciles operational follow-ups from source records. This mutation is safe
 * to call repeatedly; source identity and creationKey prevent duplicate live rows.
 */
export const syncOpenOperations = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requirePermission(ctx, "view_follow_ups");
    const branchId = user.branchId ? String(user.branchId) : undefined;
    const [orders, repairs, existingActive] = await Promise.all([
      loadByStatus(ctx as any, "orders", OPEN_ORDER_STATUSES, branchId),
      loadByStatus(ctx as any, "repairs", OPEN_REPAIR_STATUSES, branchId),
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

    // Close active follow-ups whose source has already reached a terminal state.
    // This pass is bounded and only touches existing live operational rows.
    for (const followUp of existingActive) {
      if (followUp.sourceType !== "order" && followUp.sourceType !== "repair") continue;
      if (!followUp.sourceId) continue;
      if (followUp.sourceType === "order") {
        const order = await ctx.db.get(followUp.sourceId as any);
        if (order && ORDER_TERMINAL.has((order as any).status) && (order as any).branchId) {
          await upsertOperationFollowUp(ctx, user, {
            sourceType: "order", sourceId: followUp.sourceId, sourceNumber: (order as any).orderNumber,
            sourceStatus: normalizeOrderStatus((order as any).status) ?? (order as any).status,
            branchId: (order as any).branchId, customerId: (order as any).customerId,
            customerName: (order as any).customerName, phone: (order as any).customerPhone, terminal: true,
          });
        }
      } else {
        const repair = await ctx.db.get(followUp.sourceId as any);
        if (repair && REPAIR_TERMINAL.has((repair as any).status) && (repair as any).branchId) {
          await upsertOperationFollowUp(ctx, user, {
            sourceType: "repair", sourceId: followUp.sourceId, sourceNumber: (repair as any).repairNumber,
            sourceStatus: normalizeRepairStatus((repair as any).status) ?? (repair as any).status,
            branchId: (repair as any).branchId, customerId: (repair as any).customerId,
            customerName: (repair as any).customerName, phone: (repair as any).customerPhone, terminal: true,
          });
        }
      }
    }
    return { created, updated, scannedOrders: orders.length, scannedRepairs: repairs.length };
  },
});
