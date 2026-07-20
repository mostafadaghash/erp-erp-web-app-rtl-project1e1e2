import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { assertBranchAccess, requireModuleEnabled, requireModulePermission, filterByBranch, resolveWriteBranch, logAction } from "./lib/auth";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireModulePermission(ctx, "view_repairs", "repairs");
    const repairs = await ctx.db.query("repairs").order("desc").collect();
    return filterByBranch(repairs, user);
  },
});

export const get = query({
  args: { id: v.id("repairs") },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "view_repairs", "repairs");
    const repair = await ctx.db.get(args.id);
    if (repair) assertBranchAccess(user, repair);
    return repair;
  },
});

export const getByTracking = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireModuleEnabled(ctx, "repairs");
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
    const user = await requireModulePermission(ctx, "create_repairs", "repairs");
    if (args.customerId) {
      const customer = await ctx.db.get(args.customerId);
      if (!customer) throw new ConvexError("العميل غير موجود");
      assertBranchAccess(user, customer);
    }
    const count = await ctx.db.query("repairs").collect();
    const repairNumber = `REP-${String(count.length + 1).padStart(5, "0")}`;
    const trackingToken = Math.random().toString(36).substring(2, 10).toUpperCase();
    const totalCost = args.laborCost;
    const branchId = resolveWriteBranch(user, args.branchId);
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
    const user = await requireModulePermission(ctx, "edit_repairs", "repairs");
    const repair = await ctx.db.get(args.id);
    if (!repair) throw new Error("أمر الصيانة غير موجود");
    assertBranchAccess(user, repair);
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
    const user = await requireModulePermission(ctx, "view_repairs", "repairs");
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
