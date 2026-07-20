import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";

export const list = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.status) {
      return await ctx.db
        .query("orders")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .collect();
    }
    return await ctx.db.query("orders").order("desc").collect();
  },
});

export const get = query({
  args: { id: v.id("orders") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const stats = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("orders").collect();
    const pending = all.filter((o) => o.status === "pending").length;
    const confirmed = all.filter((o) => o.status === "confirmed").length;
    const ready = all.filter((o) => o.status === "ready").length;
    const delivered = all.filter((o) => o.status === "delivered").length;
    const totalValue = all.reduce((s, o) => s + o.total, 0);
    const pendingValue = all
      .filter((o) => o.status !== "delivered" && o.status !== "cancelled")
      .reduce((s, o) => s + o.remaining, 0);
    return { pending, confirmed, ready, delivered, totalValue, pendingValue, total: all.length };
  },
});

export const create = mutation({
  args: {
    customerName: v.string(),
    customerPhone: v.optional(v.string()),
    customerId: v.optional(v.id("customers")),
    items: v.array(v.object({
      productName: v.string(),
      quantity: v.number(),
      unitPrice: v.number(),
      notes: v.optional(v.string()),
    })),
    total: v.number(),
    deposit: v.number(),
    expectedDate: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const count = (await ctx.db.query("orders").collect()).length + 1;
    const orderNumber = "ORD-" + String(count).padStart(4, "0");
    const remaining = args.total - args.deposit;
    return await ctx.db.insert("orders", {
      ...args,
      orderNumber,
      remaining,
      status: "pending",
    });
  },
});

export const updateStatus = mutation({
  args: { id: v.id("orders"), status: v.string() },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.id);
    if (!order) throw new ConvexError("الطلب غير موجود");
    await ctx.db.patch(args.id, { status: args.status });
  },
});

export const addPayment = mutation({
  args: { id: v.id("orders"), amount: v.number() },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.id);
    if (!order) throw new ConvexError("الطلب غير موجود");
    const newDeposit = order.deposit + args.amount;
    const newRemaining = order.total - newDeposit;
    if (newRemaining < 0) throw new ConvexError("المبلغ المدفوع أكبر من إجمالي الطلب");
    await ctx.db.patch(args.id, {
      deposit: newDeposit,
      remaining: newRemaining,
      status: newRemaining === 0 ? "delivered" : order.status,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("orders") },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.id);
    if (!order) throw new ConvexError("الطلب غير موجود");
    if (order.status === "delivered") throw new ConvexError("لا يمكن حذف طلب تم تسليمه");
    await ctx.db.delete(args.id);
  },
});
