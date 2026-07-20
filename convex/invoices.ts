import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { assertBranchAccess, filterByBranch, requireModulePermission, resolveWriteBranch, logAction } from "./lib/auth";

export const list = query({
  args: {
    status: v.optional(v.string()),
    customerId: v.optional(v.id("customers")),
    branchId: v.optional(v.id("branches")),
  },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "view_invoices", "invoices");
    let invoices = await ctx.db.query("invoices").collect();
    invoices = filterByBranch(invoices, user);
    if (args.branchId && user.role === "admin") {
      invoices = invoices.filter(i => i.branchId === args.branchId);
    }
    if (args.status) {
      invoices = invoices.filter(i => i.status === args.status);
    }
    if (args.customerId) {
      invoices = invoices.filter(i => i.customerId === args.customerId);
    }
    return invoices.sort((a, b) => b._creationTime - a._creationTime);
  },
});

export const get = query({
  args: { id: v.id("invoices") },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "view_invoices", "invoices");
    const invoice = await ctx.db.get(args.id);
    if (invoice) assertBranchAccess(user, invoice);
    return invoice;
  },
});

export const create = mutation({
  args: {
    invoiceNumber: v.optional(v.string()),
    customerId: v.optional(v.id("customers")),
    customerName: v.string(),
    customerPhone: v.optional(v.string()),
    items: v.array(v.object({
      productId: v.id("products"),
      productName: v.string(),
      quantity: v.number(),
      unitPrice: v.number(),
      discount: v.number(),
      total: v.number(),
    })),
    subtotal: v.number(),
    discount: v.number(),
    tax: v.number(),
    total: v.number(),
    paid: v.number(),
    paymentMethod: v.optional(v.string()),
    notes: v.optional(v.string()),
    branchId: v.optional(v.id("branches")),
  },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "create_invoices", "invoices");
    const branchId = resolveWriteBranch(user, args.branchId);

    if (args.customerId) {
      const customer = await ctx.db.get(args.customerId);
      if (!customer) throw new ConvexError("العميل غير موجود");
      assertBranchAccess(user, customer);
    }
    for (const item of args.items) {
      const product = await ctx.db.get(item.productId);
      if (!product) throw new ConvexError(`المنتج غير موجود: ${item.productName}`);
      assertBranchAccess(user, product);
    }

    // Generate invoice number if not provided
    let invoiceNumber = args.invoiceNumber;
    if (!invoiceNumber) {
      const count = await ctx.db.query("invoices").collect();
      const year = new Date().getFullYear();
      invoiceNumber = `INV-${year}-${String(count.length + 1).padStart(5, "0")}`;
    }

    const id = await ctx.db.insert("invoices", {
      invoiceNumber,
      customerId: args.customerId,
      customerName: args.customerName,
      customerPhone: args.customerPhone,
      items: args.items,
      subtotal: args.subtotal,
      discount: args.discount,
      tax: args.tax,
      total: args.total,
      paid: args.paid,
      remaining: args.total - args.paid,
      paymentMethod: args.paymentMethod ?? "cash",
      status: args.paid >= args.total ? "paid" : args.paid > 0 ? "partial" : "unpaid",
      notes: args.notes,
      branchId,
      userId: user.userId,
      type: "sale",
    });

    // Decrement product stock
    for (const item of args.items) {
      const prod = await ctx.db.get(item.productId);
      if (prod) {
        await ctx.db.patch(item.productId, {
          stock: Math.max(0, prod.stock - item.quantity),
        });
      }
    }

    // Update customer balance if applicable
    if (args.customerId && args.paid < args.total) {
      const customer = await ctx.db.get(args.customerId);
      if (customer) {
        await ctx.db.patch(args.customerId, {
          balance: (customer.balance ?? 0) + (args.total - args.paid),
        });
      }
    }

    await logAction(ctx, user, {
      action: "create",
      module: "invoices",
      recordId: id,
      recordLabel: invoiceNumber,
      details: `إنشاء فاتورة ${invoiceNumber} بقيمة ${args.total} للعميل ${args.customerName}`,
    });

    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("invoices"),
    customerId: v.optional(v.id("customers")),
    customerName: v.string(),
    customerPhone: v.optional(v.string()),
    items: v.array(v.object({
      productId: v.id("products"),
      productName: v.string(),
      quantity: v.number(),
      unitPrice: v.number(),
      discount: v.number(),
      total: v.number(),
    })),
    subtotal: v.number(),
    discount: v.number(),
    tax: v.number(),
    total: v.number(),
    paid: v.number(),
    paymentMethod: v.optional(v.string()),
    notes: v.optional(v.string()),
    branchId: v.optional(v.id("branches")),
  },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "edit_invoices", "invoices");
    const { id, ...data } = args;
    const inv = await ctx.db.get(id);
    if (!inv) throw new ConvexError("الفاتورة غير موجودة");
    assertBranchAccess(user, inv);
    if (data.customerId) {
      const customer = await ctx.db.get(data.customerId);
      if (!customer) throw new ConvexError("العميل غير موجود");
      assertBranchAccess(user, customer);
    }
    for (const item of data.items) {
      const product = await ctx.db.get(item.productId);
      if (!product) throw new ConvexError(`المنتج غير موجود: ${item.productName}`);
      assertBranchAccess(user, product);
    }
    const branchId = resolveWriteBranch(user, data.branchId ?? inv.branchId);
    await ctx.db.patch(id, {
      customerId: data.customerId,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      items: data.items,
      subtotal: data.subtotal,
      discount: data.discount,
      tax: data.tax,
      total: data.total,
      paid: data.paid,
      remaining: data.total - data.paid,
      paymentMethod: data.paymentMethod ?? "cash",
      status: data.paid >= data.total ? "paid" : data.paid > 0 ? "partial" : "unpaid",
      notes: data.notes,
      branchId,
    });
    await logAction(ctx, user, {
      action: "update",
      module: "invoices",
      recordId: id,
      recordLabel: inv.invoiceNumber,
      details: `تعديل الفاتورة ${inv.invoiceNumber}`,
    });
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("invoices"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "edit_invoices", "invoices");
    const inv = await ctx.db.get(args.id);
    if (!inv) throw new ConvexError("الفاتورة غير موجودة");
    assertBranchAccess(user, inv);
    await ctx.db.patch(args.id, { status: args.status });
    await logAction(ctx, user, {
      action: "update",
      module: "invoices",
      recordId: args.id,
      recordLabel: inv.invoiceNumber,
      details: `تغيير حالة الفاتورة ${inv.invoiceNumber} إلى ${args.status}`,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("invoices") },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "delete_invoices", "invoices");
    const inv = await ctx.db.get(args.id);
    if (!inv) throw new ConvexError("الفاتورة غير موجودة");
    assertBranchAccess(user, inv);
    await ctx.db.delete(args.id);
    await logAction(ctx, user, {
      action: "delete",
      module: "invoices",
      recordId: args.id,
      recordLabel: inv.invoiceNumber,
      details: `حذف الفاتورة ${inv.invoiceNumber}`,
    });
  },
});

export const stats = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireModulePermission(ctx, "view_invoices", "invoices");
    let invoices = await ctx.db.query("invoices").collect();
    invoices = filterByBranch(invoices, user);
    const totalRevenue = invoices.filter(i => i.status === "paid").reduce((s, i) => s + i.total, 0);
    const totalOutstanding = invoices.reduce((s, i) => s + (i.remaining ?? 0), 0);
    return {
      total: invoices.length,
      paid: invoices.filter(i => i.status === "paid").length,
      partial: invoices.filter(i => i.status === "partial").length,
      unpaid: invoices.filter(i => i.status === "unpaid").length,
      totalRevenue,
      totalOutstanding,
    };
  },
});
