import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";

export const list = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.status) {
      return await ctx.db
        .query("shipments")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .collect();
    }
    return await ctx.db.query("shipments").order("desc").collect();
  },
});

export const get = query({
  args: { id: v.id("shipments") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const stats = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("shipments").collect();
    const ordered = all.filter((s) => s.status === "ordered").length;
    const inTransit = all.filter((s) => s.status === "in_transit").length;
    const arrived = all.filter((s) => s.status === "arrived").length;
    const totalCost = all.reduce((s, sh) => s + sh.grandTotal, 0);
    const pendingCost = all
      .filter((s) => s.status !== "arrived" && s.status !== "cancelled")
      .reduce((s, sh) => s + sh.grandTotal, 0);
    return { ordered, inTransit, arrived, totalCost, pendingCost, total: all.length };
  },
});

export const create = mutation({
  args: {
    supplierName: v.string(),
    supplierId: v.optional(v.id("suppliers")),
    items: v.array(v.object({
      productId: v.optional(v.id("products")),
      productName: v.string(),
      quantity: v.number(),
      unitCost: v.number(),
      total: v.number(),
    })),
    totalCost: v.number(),
    shippingCost: v.number(),
    grandTotal: v.number(),
    expectedDate: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const count = (await ctx.db.query("shipments").collect()).length + 1;
    const shipmentNumber = "SHP-" + String(count).padStart(4, "0");
    return await ctx.db.insert("shipments", {
      ...args,
      shipmentNumber,
      status: "ordered",
    });
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("shipments"),
    status: v.string(),
    arrivedDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const shipment = await ctx.db.get(args.id);
    if (!shipment) throw new ConvexError("الشحنة غير موجودة");
    const patch: Record<string, string> = { status: args.status };
    if (args.arrivedDate) patch.arrivedDate = args.arrivedDate;

    await ctx.db.patch(args.id, patch);

    // When arrived, update product stock
    if (args.status === "arrived") {
      for (const item of shipment.items) {
        if (item.productId) {
          const product = await ctx.db.get(item.productId);
          if (product) {
            await ctx.db.patch(item.productId, {
              stock: product.stock + item.quantity,
            });
          }
        }
      }
    }
  },
});

export const remove = mutation({
  args: { id: v.id("shipments") },
  handler: async (ctx, args) => {
    const shipment = await ctx.db.get(args.id);
    if (!shipment) throw new ConvexError("الشحنة غير موجودة");
    if (shipment.status === "arrived") throw new ConvexError("لا يمكن حذف شحنة تم استلامها");
    await ctx.db.delete(args.id);
  },
});
