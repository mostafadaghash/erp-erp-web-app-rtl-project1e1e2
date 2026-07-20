import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { requireAuth, requirePermission, filterByBranch, logAction } from "./lib/auth";

export const list = query({
  args: {
    status: v.optional(v.string()),
    city: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    let deliveries;
    if (args.status) {
      deliveries = await ctx.db
        .query("deliveries")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .collect();
    } else {
      deliveries = await ctx.db.query("deliveries").order("desc").collect();
    }
    let filtered = filterByBranch(deliveries, user);
    if (args.city) {
      filtered = filtered.filter((d) => d.city === args.city);
    }
    return filtered;
  },
});

export const get = query({
  args: { id: v.id("deliveries") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
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
    const user = await requirePermission(ctx, "create_orders");
    const deliveryNumber = `DEL-${Date.now().toString().slice(-6)}`;
    const branchId = args.branchId ?? (user.branchId as any);
    const id = await ctx.db.insert("deliveries", {
      ...args,
      branchId,
      deliveryNumber,
      status: "pending",
    });
    await logAction(ctx, user, {
      action: "create",
      module: "deliveries",
      recordId: id,
      recordLabel: deliveryNumber,
      details: `إنشاء شحنة توصيل: ${deliveryNumber} للعميل ${args.customerName} - ${args.city}`,
    });
    return id;
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("deliveries"),
    status: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "edit_shipments");
    const delivery = await ctx.db.get(args.id);
    if (!delivery) throw new ConvexError("الشحنة غير موجودة");
    const patch: Record<string, unknown> = { status: args.status };
    if (args.status === "delivered") patch.deliveredDate = new Date().toISOString().split("T")[0];
    if (args.notes) patch.notes = args.notes;
    await ctx.db.patch(args.id, patch);
    await logAction(ctx, user, {
      action: "update",
      module: "deliveries",
      recordId: args.id,
      recordLabel: delivery.deliveryNumber,
      details: `تحديث حالة التوصيل ${delivery.deliveryNumber} إلى: ${args.status}`,
    });
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
    const user = await requirePermission(ctx, "edit_shipments");
    const delivery = await ctx.db.get(args.id);
    if (!delivery) throw new ConvexError("الشحنة غير موجودة");
    const { id, ...rest } = args;
    await ctx.db.patch(id, rest);
    await logAction(ctx, user, {
      action: "update",
      module: "deliveries",
      recordId: args.id,
      recordLabel: delivery.deliveryNumber,
      details: `تعديل بيانات التوصيل ${delivery.deliveryNumber}`,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("deliveries") },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "delete_all");
    const delivery = await ctx.db.get(args.id);
    if (!delivery) throw new ConvexError("الشحنة غير موجودة");
    await ctx.db.delete(args.id);
    await logAction(ctx, user, {
      action: "delete",
      module: "deliveries",
      recordId: args.id,
      recordLabel: delivery.deliveryNumber,
      details: `حذف شحنة التوصيل ${delivery.deliveryNumber}`,
    });
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    const all = await ctx.db.query("deliveries").collect();
    const d = filterByBranch(all, user);
    const pending   = d.filter(x => x.status === "pending").length;
    const shipped   = d.filter(x => x.status === "shipped").length;
    const delivered = d.filter(x => x.status === "delivered").length;
    const returned  = d.filter(x => x.status === "returned").length;
    const cancelled = d.filter(x => x.status === "cancelled").length;
    const totalCOD  = d
      .filter(x => x.paymentMethod === "cod" && x.status === "delivered")
      .reduce((s, x) => s + (x.codAmount ?? x.totalAmount), 0);
    return { pending, shipped, delivered, returned, cancelled, totalCOD, total: d.length };
  },
});
