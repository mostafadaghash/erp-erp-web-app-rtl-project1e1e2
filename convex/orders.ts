import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { assertBranchAccess, requireModulePermission, filterByBranch, resolveWriteBranch, logAction } from "./lib/auth";
import { canTransition, ORDER_TRANSITIONS, roundMoney } from "../shared/businessRules";
import { nextDocumentNumber } from "./lib/documentNumbers";
import { requireActiveBranch, requireActiveCustomer } from "./lib/references";

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
    const branchId = resolveWriteBranch(user, args.branchId);
    await requireActiveBranch(ctx, branchId);
    let customerName = args.customerName.trim();
    let customerPhone = args.customerPhone;
    if (!customerName) throw new ConvexError("اسم العميل مطلوب");
    if (args.customerId) {
      const customer = await requireActiveCustomer(ctx, args.customerId, branchId);
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
    const orderNumber = await nextDocumentNumber(ctx, "order");
    const remaining = roundMoney(total - deposit);
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
  args: { id: v.id("orders"), status: v.union(v.literal("pending"), v.literal("confirmed"), v.literal("ready"), v.literal("delivered"), v.literal("cancelled")), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "edit_orders", "orders");
    const order = await ctx.db.get(args.id);
    if (!order) throw new ConvexError("الطلب غير موجود");
    assertBranchAccess(user, order);
    if (args.status === "cancelled" && !args.reason?.trim()) throw new ConvexError("سبب الإلغاء مطلوب");
    if (args.status === "cancelled" && order.deposit > 0) throw new ConvexError("الطلب يحتوي عربوناً ويحتاج معالجة استرداد مالي قبل الإلغاء");
    if (!canTransition(ORDER_TRANSITIONS, order.status, args.status)) {
      throw new ConvexError(`لا يمكن تغيير حالة الطلب من ${order.status} إلى ${args.status}`);
    }
    await ctx.db.patch(args.id, { status: args.status, ...(args.status === "cancelled" ? { cancelledAt: Date.now(), cancelledBy: user.userId, cancellationReason: args.reason?.trim() } : {}) });
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
    if (order.status === "cancelled" || order.status === "delivered") throw new ConvexError("لا يمكن تسجيل دفعة لطلب ملغي أو مسلم");
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

export const cancel = mutation({
  args: { id: v.id("orders"), reason: v.string() },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "delete_orders", "orders");
    const order = await ctx.db.get(args.id);
    if (!order) throw new ConvexError("الطلب غير موجود");
    assertBranchAccess(user, order);
    const reason = args.reason.trim();
    if (!reason) throw new ConvexError("سبب الإلغاء مطلوب");
    if (order.status === "cancelled") throw new ConvexError("الطلب ملغي بالفعل");
    if (order.status === "delivered") throw new ConvexError("لا يمكن إلغاء طلب تم تسليمه");
    if (order.deposit > 0) throw new ConvexError("الطلب يحتوي عربوناً ويحتاج معالجة استرداد مالي");
    await ctx.db.patch(args.id, { status: "cancelled", cancelledAt: Date.now(), cancelledBy: user.userId, cancellationReason: reason });
    await logAction(ctx, user, { action: "cancel", module: "orders", recordId: args.id, recordLabel: order.orderNumber, details: `إلغاء الطلب ${order.orderNumber}: ${reason}` });
  },
});
export const remove = mutation({ args: { id: v.id("orders") }, handler: async () => { throw new ConvexError("استخدم مسار إلغاء الطلب مع إدخال السبب"); } });
