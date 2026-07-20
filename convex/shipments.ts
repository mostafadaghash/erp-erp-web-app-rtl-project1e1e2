import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { requireAuth, requirePermission, filterByBranch, logAction } from "./lib/auth";

export const list = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "view_shipments");
    let shipments;
    if (args.status) {
      shipments = await ctx.db
        .query("shipments")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .collect();
    } else {
      shipments = await ctx.db.query("shipments").order("desc").collect();
    }
    return filterByBranch(shipments, user);
  },
});

export const get = query({
  args: { id: v.id("shipments") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "view_shipments");
    return await ctx.db.get(args.id);
  },
});

export const stats = query({
  args: {},
  handler: async (ctx) => {
    const user = await requirePermission(ctx, "view_shipments");
    const all = await ctx.db.query("shipments").collect();
    const s = filterByBranch(all, user);
    const ordered = s.filter((x) => x.status === "ordered").length;
    const inTransit = s.filter((x) => x.status === "in_transit").length;
    const arrived = s.filter((x) => x.status === "arrived").length;
    const totalCost = s.reduce((sum, sh) => sum + sh.grandTotal, 0);
    const pendingCost = s
      .filter((x) => x.status !== "arrived" && x.status !== "cancelled")
      .reduce((sum, sh) => sum + sh.grandTotal, 0);
    return { ordered, inTransit, arrived, totalCost, pendingCost, total: s.length };
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
    branchId: v.optional(v.id("branches")),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "create_shipments");
    const count = (await ctx.db.query("shipments").collect()).length + 1;
    const shipmentNumber = "SHP-" + String(count).padStart(4, "0");
    const branchId = args.branchId ?? (user.branchId as any);
    const id = await ctx.db.insert("shipments", {
      ...args,
      branchId,
      shipmentNumber,
      status: "ordered",
    });
    await logAction(ctx, user, {
      action: "create",
      module: "shipments",
      recordId: id,
      recordLabel: shipmentNumber,
      details: `إنشاء شحنة واردة: ${shipmentNumber} من ${args.supplierName} بقيمة ${args.grandTotal}`,
    });
    return id;
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("shipments"),
    status: v.string(),
    arrivedDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "edit_shipments");
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
    await logAction(ctx, user, {
      action: "update",
      module: "shipments",
      recordId: args.id,
      recordLabel: shipment.shipmentNumber,
      details: `تحديث حالة الشحنة ${shipment.shipmentNumber} إلى: ${args.status}`,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("shipments") },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "delete_shipments");
    const shipment = await ctx.db.get(args.id);
    if (!shipment) throw new ConvexError("الشحنة غير موجودة");
    if (shipment.status === "arrived") throw new ConvexError("لا يمكن حذف شحنة تم استلامها");
    await ctx.db.delete(args.id);
    await logAction(ctx, user, {
      action: "delete",
      module: "shipments",
      recordId: args.id,
      recordLabel: shipment.shipmentNumber,
      details: `حذف الشحنة ${shipment.shipmentNumber}`,
    });
  },
});
