import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { assertBranchAccess, requireModulePermission, filterByBranch, resolveWriteBranch, logAction } from "./lib/auth";
import { canTransition, ORDER_TRANSITIONS, roundMoney } from "../shared/businessRules";

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
    let customerName = args.customerName.trim();
    let customerPhone = args.customerPhone;
    if (!customerName) throw new ConvexError("اسم العميل مطلوب");
    if (args.customerId) {
      const customer = await ctx.db.get(args.customerId);
      if (!customer) throw new ConvexError("العميل غير موجود");
      assertBranchAccess(user, customer);
      customerName = customer.name;
      customerPhone = customer.phone;
    }
    if (args.items.length === 0) throw new ConvexError("أضف منتجاً واحداً على الأقل");
    const items = args.items.map((item) => {
      if (!item.productName.trim()) throw new ConvexError("اسم المنتج مطلوب");
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) throw new ConvexError("الكمية يجب أن تكون عدداً صحيحاً أكبر من صفر");
      if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0) throw new ConvexError("سعر المنتج غير صالح");
      return { ...item, productName: item.productName.trim(), unitPrice: roundMoney(item.unitPrice) };
    });
    const total = roundMoney(items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0));
    if (!Number.isFinite(args.deposit) || args.deposit < 0 || args.deposit > total) {
      throw new ConvexError("العربون يجب أن يكون بين صفر وإجمالي الطلب");
    }
    const deposit = roundMoney(args.deposit);
    const count = (await ctx.db.query("orders").collect()).length + 1;
    const orderNumber = "ORD-" + String(count).padStart(4, "0");
    const remaining = roundMoney(total - deposit);
    const branchId = resolveWriteBranch(user, args.branchId);
    const id = await ctx.db.insert("orders", {
      customerName,
      customerPhone,
      customerId: args.customerId,
      items,
      total,
      deposit,
      expectedDate: args.expectedDate,
      notes: args.notes,
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
    if (!canTransition(ORDER_TRANSITIONS, order.status, args.status)) {
      throw new ConvexError(`لا يمكن تغيير حالة الطلب من ${order.status} إلى ${args.status}`);
    }
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
    if (order.status === "cancelled") throw new ConvexError("لا يمكن تسجيل دفعة لطلب ملغي");
    if (!Number.isFinite(args.amount) || args.amount <= 0) throw new ConvexError("قيمة الدفعة يجب أن تكون أكبر من صفر");
    const newDeposit = roundMoney(order.deposit + args.amount);
    const newRemaining = roundMoney(order.total - newDeposit);
    if (newRemaining < 0) throw new ConvexError("المبلغ المدفوع أكبر من المتبقي على الطلب");
    await ctx.db.patch(args.id, {
      deposit: newDeposit,
      remaining: newRemaining,
      status: order.status,
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
