import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requirePermission, filterByBranch, logAction } from "./lib/auth";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    const repairs = await ctx.db.query("repairs").order("desc").collect();
    return filterByBranch(repairs, user);
  },
});

export const get = query({
  args: { id: v.id("repairs") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return await ctx.db.get(args.id);
  },
});

export const getByTracking = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db.query("repairs")
      .withIndex("by_tracking", q => q.eq("trackingToken", args.token))
      .first();
  },
});

export const create = mutation({
  args: {
    customerId: v.optional(v.id("customers")),
    customerName: v.string(),
    customerPhone: v.string(),
    deviceType: v.string(),
    deviceBrand: v.string(),
    deviceModel: v.string(),
    problem: v.string(),
    laborCost: v.number(),
    deposit: v.number(),
    expectedDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    branchId: v.optional(v.id("branches")),
    technicianName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "create_repairs");
    const count = await ctx.db.query("repairs").collect();
    const repairNumber = `REP-${String(count.length + 1).padStart(5, "0")}`;
    const trackingToken = Math.random().toString(36).substring(2, 10).toUpperCase();
    const totalCost = args.laborCost;
    const branchId = args.branchId ?? (user.branchId as any);
    const id = await ctx.db.insert("repairs", {
      ...args,
      branchId,
      repairNumber,
      trackingToken,
      parts: [],
      totalCost,
      remaining: totalCost - args.deposit,
      status: "received",
      receivedDate: new Date().toISOString().split("T")[0],
    });
    await logAction(ctx, user, {
      action: "create",
      module: "repairs",
      recordId: id,
      recordLabel: repairNumber,
      details: `استلام جهاز للصيانة: ${repairNumber} - ${args.deviceBrand} ${args.deviceModel} للعميل ${args.customerName}`,
    });
    return id;
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("repairs"),
    status: v.string(),
    diagnosis: v.optional(v.string()),
    deliveredDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "edit_repairs");
    const repair = await ctx.db.get(args.id);
    if (!repair) throw new Error("أمر الصيانة غير موجود");
    const { id, ...rest } = args;
    await ctx.db.patch(id, rest);
    await logAction(ctx, user, {
      action: "update",
      module: "repairs",
      recordId: args.id,
      recordLabel: repair.repairNumber,
      details: `تحديث حالة الصيانة ${repair.repairNumber} إلى: ${args.status}`,
    });
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    const all = await ctx.db.query("repairs").collect();
    const repairs = filterByBranch(all, user);
    return {
      total: repairs.length,
      received: repairs.filter(r => r.status === "received").length,
      inProgress: repairs.filter(r => r.status === "in_progress").length,
      ready: repairs.filter(r => r.status === "ready").length,
      delivered: repairs.filter(r => r.status === "delivered").length,
    };
  },
});
