import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { assertBranchAccess, requireModulePermission, filterByBranch, resolveWriteBranch, logAction } from "./lib/auth";

export const list = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "view_orders", "orders");
    let orders;
    if (args.status) {
      orders = await ctx.db
        .query("orders")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .collect();
    } else {
      orders = await ctx.db.query("orders").order("desc").collect();
    }
    return filterByBranch(orders, user);
  },
});

export const get = query({
  args: { id: v.id("orders") },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "view_orders", "orders");
    const order = await ctx.db.get(args.id);
    if (order) assertBranchAccess(user, order);
    return order;
  },
});

export const stats = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireModulePermission(ctx, "view_orders", "orders");
    const all = await ctx.db.query("orders").collect();
    const orders = filterByBranch(all, user);
    const pending = orders.filter((o) => o.status === "pending").length;
    const confirmed = orders.filter((o) => o.status === "confirmed").length;
    const ready = orders.filter((o) => o.status === "ready").length;
    const delivered = orders.filter((o) => o.status === "delivered").length;
    const totalValue = orders.reduce((s, o) => s + o.total, 0);
    const pendingValue = orders
      .filter((o) => o.status !== "delivered" && o.status !== "cancelled")
      .reduce((s, o) => s + o.remaining, 0);
    return { pending, confirmed, ready, delivered, totalValue, pendingValue, total: orders.length };
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
    branchId: v.optional(v.id("branches")),
  },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "create_orders", "orders");
    if (args.customerId) {
      const customer = await ctx.db.get(args.customerId);
      if (!customer) throw new ConvexError("العميل غير موجود");
      assertBranchAccess(user, customer);
    }
    const count = (await ctx.db.query("orders").collect()).length + 1;
    const orderNumber = "ORD-" + String(count).padStart(4, "0");
    const remaining = args.total - args.deposit;
    const branchId = resolveWriteBranch(user, args.branchId);
    const id = await ctx.db.insert("orders", {
      ...args,
      branchId,
      orderNumber,
      remaining,
      status: "pending",
    });
    await logAction(ctx, user, {
      action: "create",
      module: "orders",
      recordId: id,
      recordLabel: orderNumber,
      details: `إنشاء طلب جديد: ${orderNumber} للعميل ${args.customerName}`,
    });
    return id;
  },
});

export const updateStatus = mutation({
  args: { id: v.id("orders"), status: v.string() },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "edit_orders", "orders");
    const order = await ctx.db.get(args.id);
    if (!order) throw new ConvexError("الطلب غير موجود");
    assertBranchAccess(user, order);
    await ctx.db.patch(args.id, { status: args.status });
    await logAction(ctx, user, {
      action: "update",
      module: "orders",
      recordId: args.id,
      recordLabel: order.orderNumber,
      details: `تحديث حالة الطلب ${order.orderNumber} إلى: ${args.status}`,
    });
  },
});

export const addPayment = mutation({
  args: { id: v.id("orders"), amount: v.number() },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "edit_orders", "orders");
    const order = await ctx.db.get(args.id);
    if (!order) throw new ConvexError("الطلب غير موجود");
    assertBranchAccess(user, order);
    const newDeposit = order.deposit + args.amount;
    const newRemaining = order.total - newDeposit;
    if (newRemaining < 0) throw new ConvexError("المبلغ المدفوع أكبر من إجمالي الطلب");
    await ctx.db.patch(args.id, {
      deposit: newDeposit,
      remaining: newRemaining,
      status: newRemaining === 0 ? "delivered" : order.status,
    });
    await logAction(ctx, user, {
      action: "update",
      module: "orders",
      recordId: args.id,
      recordLabel: order.orderNumber,
      details: `دفعة جديدة بقيمة ${args.amount} للطلب ${order.orderNumber}`,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("orders") },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "delete_orders", "orders");
    const order = await ctx.db.get(args.id);
    if (!order) throw new ConvexError("الطلب غير موجود");
    assertBranchAccess(user, order);
    if (order.status === "delivered") throw new ConvexError("لا يمكن حذف طلب تم تسليمه");
    await ctx.db.delete(args.id);
    await logAction(ctx, user, {
      action: "delete",
      module: "orders",
      recordId: args.id,
      recordLabel: order.orderNumber,
      details: `حذف الطلب ${order.orderNumber}`,
    });
  },
});
