import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { assertBranchAccess, requireModulePermission, filterByBranch, resolveWriteBranch, logAction } from "./lib/auth";
import { canTransition, roundMoney, SHIPMENT_TRANSITIONS } from "../shared/businessRules";
import { changeProductStock } from "./lib/inventory";
import { allocateProportionally, INVENTORY_MOVEMENT_TYPES } from "../shared/inventoryRules";
import { nextDocumentNumber } from "./lib/documentNumbers";
import { requireActiveBranch, requireActiveSupplier } from "./lib/references";

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

/** Least-privilege selector data needed by the shipment creation form. */
export const creationOptions = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireModulePermission(ctx, "create_shipments", "shipments");
    const products = filterByBranch(await ctx.db.query("products").collect(), user).filter((product) => product.isActive);
    const suppliers = (await ctx.db.query("suppliers").collect()).filter(supplier => supplier.isActive !== false);
    return {
      products: products.map(({ _id, name }) => ({ _id, name })),
      suppliers: suppliers.map(({ _id, name }) => ({ _id, name })),
    };
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
    const branchId = resolveWriteBranch(user, args.branchId);
    await requireActiveBranch(ctx, branchId);
    let supplierName = args.supplierName.trim();
    if (args.supplierId) {
      const supplier = await requireActiveSupplier(ctx, args.supplierId);
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
        if (!product || !product.isActive) throw new ConvexError(`المنتج غير موجود أو غير نشط: ${item.productName}`);
        assertBranchAccess(user, product);
        if (branchId && product.branchId && product.branchId !== branchId) throw new ConvexError("المنتج لا ينتمي إلى فرع الشحنة");
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
    const shipmentNumber = await nextDocumentNumber(ctx, "shipment");
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
    status: v.union(v.literal("ordered"), v.literal("in_transit"), v.literal("arrived"), v.literal("cancelled")),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "edit_shipments", "shipments");
    const shipment = await ctx.db.get(args.id);
    if (!shipment) throw new ConvexError("الشحنة غير موجودة");
    assertBranchAccess(user, shipment);
    if (args.status === "cancelled" && !args.reason?.trim()) throw new ConvexError("سبب الإلغاء مطلوب");
    if (!canTransition(SHIPMENT_TRANSITIONS, shipment.status, args.status)) {
      throw new ConvexError(`لا يمكن تغيير حالة الشحنة من ${shipment.status} إلى ${args.status}`);
    }
    const patch: Record<string, string | number> = { status: args.status };
    if (args.status === "cancelled") { patch.cancelledAt = Date.now(); patch.cancelledBy = user.userId; patch.cancellationReason = args.reason?.trim() ?? ""; }
    if (args.status === "arrived") patch.arrivedDate = new Date().toISOString().split("T")[0];
    await ctx.db.patch(args.id, patch);

    // When arrived, update product stock
    if (args.status === "arrived") {
      const eligible = shipment.items.map(item => item.productId ? item.total : 0);
      const allocations = allocateProportionally(shipment.shippingCost, eligible);
      for (const [index, item] of shipment.items.entries()) {
        if (!item.productId) continue;
        const product = await ctx.db.get(item.productId);
        if (!product) throw new ConvexError("منتج الشحنة غير موجود");
        assertBranchAccess(user, product);
        const receivedValue = roundMoney(item.total + allocations[index]);
        await changeProductStock(ctx, user, {
          productId: item.productId, quantityDelta: item.quantity,
          unitCost: receivedValue / item.quantity,
          type: INVENTORY_MOVEMENT_TYPES.shipmentReceipt,
          reason: `استلام الشحنة ${shipment.shipmentNumber}`,
          referenceId: String(args.id), referenceType: "shipment",
        });
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

export const remove = mutation({ args: { id: v.id("shipments") }, handler: async () => { throw new ConvexError("استخدم انتقال حالة الشحنة إلى ملغاة مع إدخال السبب"); } });
