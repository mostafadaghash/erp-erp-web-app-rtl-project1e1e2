import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { canTransition, DELIVERY_TRANSITIONS, calculateDeliveryAmounts, roundMoney } from "../shared/businessRules";
import { nextDocumentNumber } from "./lib/documentNumbers";
import { requireActiveBranch, requireActiveCustomer } from "./lib/references";
import { assertBranchAccess, requireModulePermission, filterByBranch, resolveWriteBranch, logAction } from "./lib/auth";

export const list = query({
  args: {
    status: v.optional(v.string()),
    city: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "view_deliveries", "deliveries");
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
    const user = await requireModulePermission(ctx, "view_deliveries", "deliveries");
    const delivery = await ctx.db.get(args.id);
    if (delivery) assertBranchAccess(user, delivery);
    return delivery;
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
    paymentMethod: v.union(v.literal("cod"), v.literal("prepaid"), v.literal("partial")),
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
    const user = await requireModulePermission(ctx, "create_deliveries", "deliveries");
    const branchId = resolveWriteBranch(user, args.branchId);
    await requireActiveBranch(ctx, branchId);
    let trustedOrderNumber = args.orderNumber;
    if (args.orderId) {
      const order = await ctx.db.get(args.orderId);
      if (!order || order.status === "cancelled") throw new ConvexError("الطلب غير موجود أو ملغي");
      assertBranchAccess(user, order);
      if (branchId && order.branchId && order.branchId !== branchId) throw new ConvexError("الطلب لا ينتمي إلى فرع التوصيل");
      const existing = (await ctx.db.query("deliveries").collect()).find(d => d.orderId === args.orderId && !["returned", "cancelled"].includes(d.status));
      if (existing) throw new ConvexError("يوجد توصيل نشط لهذا الطلب بالفعل");
      trustedOrderNumber = order.orderNumber;
    }
    if (args.customerId) {
      const customer = await requireActiveCustomer(ctx, args.customerId, branchId);
      assertBranchAccess(user, customer);
    }
    if (!Number.isFinite(args.shippingCost) || args.shippingCost < 0) throw new ConvexError("تكلفة الشحن غير صالحة");
    const items = args.items.map(item => {
      if (!item.productName.trim()) throw new ConvexError("اسم المنتج مطلوب");
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) throw new ConvexError("الكمية يجب أن تكون عدداً صحيحاً أكبر من صفر");
      if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0) throw new ConvexError("سعر الوحدة غير صالح");
      return { ...item, productName: item.productName.trim(), unitPrice: roundMoney(item.unitPrice) };
    });
    const amounts = calculateDeliveryAmounts(items, args.shippingCost);
    let prepaidAmount = roundMoney(args.prepaidAmount ?? 0), codAmount = roundMoney(args.codAmount ?? 0);
    if (args.paymentMethod === "cod") { prepaidAmount = 0; codAmount = amounts.grandTotal; }
    if (args.paymentMethod === "prepaid") { prepaidAmount = amounts.grandTotal; codAmount = 0; }
    if (args.paymentMethod === "partial" && (prepaidAmount < 0 || codAmount < 0 || roundMoney(prepaidAmount + codAmount) !== amounts.grandTotal)) throw new ConvexError("مجموع المدفوع مقدماً وعند الاستلام يجب أن يساوي الإجمالي");
    const deliveryNumber = await nextDocumentNumber(ctx, "delivery");
    const { totalAmount: _ignoredTotal, orderNumber: _ignoredOrder, ...input } = args;
    const id = await ctx.db.insert("deliveries", {
      ...input, items, ...amounts, prepaidAmount, codAmount, orderNumber: trustedOrderNumber,
      branchId, deliveryNumber, status: "pending",
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
    status: v.union(v.literal("pending"), v.literal("shipped"), v.literal("delivered"), v.literal("returned"), v.literal("cancelled")),
    reason: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "edit_deliveries", "deliveries");
    const delivery = await ctx.db.get(args.id);
    if (!delivery) throw new ConvexError("الشحنة غير موجودة");
    assertBranchAccess(user, delivery);
    if (!canTransition(DELIVERY_TRANSITIONS, delivery.status, args.status)) throw new ConvexError(`لا يمكن تغيير حالة التوصيل من ${delivery.status} إلى ${args.status}`);
    if ((args.status === "cancelled" || args.status === "returned") && !args.reason?.trim()) throw new ConvexError("سبب الإلغاء أو الإرجاع مطلوب");
    const patch: Record<string, unknown> = { status: args.status };
    if (args.status === "delivered") patch.deliveredDate = new Date().toISOString().slice(0, 10);
    if (args.status === "cancelled") { patch.cancelledAt = Date.now(); patch.cancelledBy = user.userId; patch.cancellationReason = args.reason?.trim(); }
    if (args.status === "returned") patch.cancellationReason = args.reason?.trim();
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
    const user = await requireModulePermission(ctx, "edit_deliveries", "deliveries");
    const delivery = await ctx.db.get(args.id);
    if (!delivery) throw new ConvexError("الشحنة غير موجودة");
    assertBranchAccess(user, delivery);
    if (delivery.status === "cancelled" || delivery.status === "returned") throw new ConvexError("لا يمكن تعديل توصيل ملغي أو مرتجع");
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

export const remove = mutation({ args: { id: v.id("deliveries") }, handler: async () => { throw new ConvexError("استخدم تحديث الحالة إلى ملغاة مع إدخال السبب"); } });

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireModulePermission(ctx, "view_deliveries", "deliveries");
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
