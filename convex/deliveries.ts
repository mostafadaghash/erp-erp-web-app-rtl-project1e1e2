import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";

export const list = query({
  args: {
    status: v.optional(v.string()),
    city: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.status) {
      return await ctx.db
        .query("deliveries")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .collect();
    }
    return await ctx.db.query("deliveries").order("desc").collect();
  },
});

export const get = query({
  args: { id: v.id("deliveries") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    customerName: v.string(),
    customerPhone: v.string(),
    city: v.string(),
    address: v.string(),
    items: v.array(v.object({
      productName: v.string(),
      quantity: v.number(),
      unitPrice: v.number(),
    })),
    totalAmount: v.number(),
    paymentMethod: v.string(),
    codAmount: v.optional(v.number()),
    prepaidAmount: v.optional(v.number()),
    shippingCompany: v.string(),
    trackingNumber: v.optional(v.string()),
    shippingCost: v.number(),
    expectedDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    orderId: v.optional(v.id("orders")),
    orderNumber: v.optional(v.string()),
    customerId: v.optional(v.id("customers")),
    branchId: v.optional(v.id("branches")),
  },
  handler: async (ctx, args) => {
    const deliveryNumber = `DEL-${Date.now().toString().slice(-6)}`;
    return await ctx.db.insert("deliveries", {
      ...args,
      deliveryNumber,
      status: "pending",
    });
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("deliveries"),
    status: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get(args.id);
    if (!delivery) throw new ConvexError("الشحنة غير موجودة");
    const patch: Record<string, unknown> = { status: args.status };
    if (args.status === "delivered") patch.deliveredDate = new Date().toISOString().split("T")[0];
    if (args.notes) patch.notes = args.notes;
    await ctx.db.patch(args.id, patch);
  },
});

export const update = mutation({
  args: {
    id: v.id("deliveries"),
    customerName: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
    city: v.optional(v.string()),
    address: v.optional(v.string()),
    shippingCompany: v.optional(v.string()),
    trackingNumber: v.optional(v.string()),
    shippingCost: v.optional(v.number()),
    codAmount: v.optional(v.number()),
    prepaidAmount: v.optional(v.number()),
    expectedDate: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...rest } = args;
    await ctx.db.patch(id, rest);
  },
});

export const remove = mutation({
  args: { id: v.id("deliveries") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("deliveries").collect();
    const pending   = all.filter(d => d.status === "pending").length;
    const shipped   = all.filter(d => d.status === "shipped").length;
    const delivered = all.filter(d => d.status === "delivered").length;
    const returned  = all.filter(d => d.status === "returned").length;
    const cancelled = all.filter(d => d.status === "cancelled").length;
    const totalCOD  = all
      .filter(d => d.paymentMethod === "cod" && d.status === "delivered")
      .reduce((s, d) => s + (d.codAmount ?? d.totalAmount), 0);
    return { pending, shipped, delivered, returned, cancelled, totalCOD, total: all.length };
  },
});
