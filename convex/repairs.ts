import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("repairs").order("desc").collect();
  },
});

export const get = query({
  args: { id: v.id("repairs") },
  handler: async (ctx, args) => {
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
    const count = await ctx.db.query("repairs").collect();
    const repairNumber = `REP-${String(count.length + 1).padStart(5, "0")}`;
    const trackingToken = Math.random().toString(36).substring(2, 10).toUpperCase();
    const totalCost = args.laborCost;
    return await ctx.db.insert("repairs", {
      ...args,
      repairNumber,
      trackingToken,
      parts: [],
      totalCost,
      remaining: totalCost - args.deposit,
      status: "received",
      receivedDate: new Date().toISOString().split("T")[0],
    });
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
    const { id, ...rest } = args;
    await ctx.db.patch(id, rest);
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const repairs = await ctx.db.query("repairs").collect();
    return {
      total: repairs.length,
      received: repairs.filter(r => r.status === "received").length,
      inProgress: repairs.filter(r => r.status === "in_progress").length,
      ready: repairs.filter(r => r.status === "ready").length,
      delivered: repairs.filter(r => r.status === "delivered").length,
    };
  },
});
