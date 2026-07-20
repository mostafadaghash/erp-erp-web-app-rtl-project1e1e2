import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { assertBranchAccess, requireModulePermission, filterByBranch, resolveWriteBranch, logAction } from "./lib/auth";

const SHIPMENT_TRANSITIONS: Record<string, string[]> = {
  ordered: ["in_transit", "cancelled"],
  in_transit: ["arrived", "cancelled"],
  arrived: [],
  cancelled: [],
};

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const list = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "view_shipments", "shipments");
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
    const user = await requireModulePermission(ctx, "view_shipments", "shipments");
    const shipment = await ctx.db.get(args.id);
    if (shipment) assertBranchAccess(user, shipment);
    return shipment;
  },
});

export const stats = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireModulePermission(ctx, "view_shipments", "shipments");
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
    const user = await requireModulePermission(ctx, "create_shipments", "shipments");
    let supplierName = args.supplierName.trim();
    if (args.supplierId) {
      const supplier = await ctx.db.get(args.supplierId);
      if (!supplier) throw new ConvexError("المورد غير موجود");
      supplierName = supplier.name;
    }
    if (!supplierName) throw new ConvexError("اسم المورد مطلوب");
    if (args.items.length === 0) throw new ConvexError("أضف منتجاً واحداً على الأقل");
    const items = [];
    for (const item of args.items) {
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) throw new ConvexError("كمية الشحنة يجب أن تكون عدداً صحيحاً أكبر من صفر");
      if (!Number.isFinite(item.unitCost) || item.unitCost < 0) throw new ConvexError("تكلفة الوحدة غير صالحة");
      let productName = item.productName.trim();
      if (item.productId) {
        const product = await ctx.db.get(item.productId);
        if (!product) throw new ConvexError(`المنتج غير موجود: ${item.productName}`);
        assertBranchAccess(user, product);
        productName = product.name;
      }
      if (!productName) throw new ConvexError("اسم المنتج مطلوب");
      const unitCost = roundMoney(item.unitCost);
      items.push({ ...item, productName, unitCost, total: roundMoney(item.quantity * unitCost) });
    }
    if (!Number.isFinite(args.shippingCost) || args.shippingCost < 0) throw new ConvexError("تكلفة الشحن غير صالحة");
    const totalCost = roundMoney(items.reduce((sum, item) => sum + item.total, 0));
    const shippingCost = roundMoney(args.shippingCost);
    const grandTotal = roundMoney(totalCost + shippingCost);
    const count = (await ctx.db.query("shipments").collect()).length + 1;
    const shipmentNumber = "SHP-" + String(count).padStart(4, "0");
    const branchId = resolveWriteBranch(user, args.branchId);
    const id = await ctx.db.insert("shipments", {
      supplierName,
      supplierId: args.supplierId,
      items,
      totalCost,
      shippingCost,
      grandTotal,
      expectedDate: args.expectedDate,
      notes: args.notes,
      branchId,
      shipmentNumber,
      status: "ordered",
    });
    await logAction(ctx, user, {
      action: "create",
      module: "shipments",
      recordId: id,
      recordLabel: shipmentNumber,
      details: `إنشاء شحنة واردة: ${shipmentNumber} من ${supplierName} بقيمة ${grandTotal}`,
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
    const user = await requireModulePermission(ctx, "edit_shipments", "shipments");
    const shipment = await ctx.db.get(args.id);
    if (!shipment) throw new ConvexError("الشحنة غير موجودة");
    assertBranchAccess(user, shipment);
    if (!(SHIPMENT_TRANSITIONS[shipment.status] ?? []).includes(args.status)) {
      throw new ConvexError(`لا يمكن تغيير حالة الشحنة من ${shipment.status} إلى ${args.status}`);
    }
    const patch: Record<string, string> = { status: args.status };
    if (args.status === "arrived") patch.arrivedDate = new Date().toISOString().split("T")[0];
    await ctx.db.patch(args.id, patch);

    // When arrived, update product stock
    if (args.status === "arrived") {
      for (const item of shipment.items) {
        if (item.productId) {
          const product = await ctx.db.get(item.productId);
          if (product) {
            assertBranchAccess(user, product);
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
    const user = await requireModulePermission(ctx, "delete_shipments", "shipments");
    const shipment = await ctx.db.get(args.id);
    if (!shipment) throw new ConvexError("الشحنة غير موجودة");
    assertBranchAccess(user, shipment);
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
