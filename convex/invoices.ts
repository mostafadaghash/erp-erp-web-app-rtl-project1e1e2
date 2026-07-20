import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("invoices").order("desc").collect();
  },
});

export const get = query({
  args: { id: v.id("invoices") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
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
    remaining: v.number(),
    paymentMethod: v.string(),
    notes: v.optional(v.string()),
    branchId: v.optional(v.id("branches")),
    type: v.string(),
  },
  handler: async (ctx, args) => {
    const count = await ctx.db.query("invoices").collect();
    const invoiceNumber = `INV-${String(count.length + 1).padStart(5, "0")}`;
    const invoiceId = await ctx.db.insert("invoices", {
      ...args,
      invoiceNumber,
      status: args.remaining > 0 ? "partial" : "paid",
      userId: undefined,
    });

    // تحديث المخزون
    for (const item of args.items) {
      const product = await ctx.db.get(item.productId);
      if (product) {
        await ctx.db.patch(item.productId, {
          stock: Math.max(0, product.stock - item.quantity),
        });
      }
    }

    // تحديث رصيد العميل
    if (args.customerId && args.remaining > 0) {
      const customer = await ctx.db.get(args.customerId);
      if (customer) {
        await ctx.db.patch(args.customerId, {
          balance: customer.balance + args.remaining,
          totalPurchases: customer.totalPurchases + args.total,
        });
      }
    }

    return invoiceId;
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const invoices = await ctx.db.query("invoices").collect();
    const today = new Date().toDateString();
    const todayInvoices = invoices.filter(i =>
      new Date(i._creationTime).toDateString() === today
    );
    return {
      totalSales: invoices.reduce((s, i) => s + i.total, 0),
      todaySales: todayInvoices.reduce((s, i) => s + i.total, 0),
      totalInvoices: invoices.length,
      todayInvoices: todayInvoices.length,
      pendingPayments: invoices.filter(i => i.remaining > 0).reduce((s, i) => s + i.remaining, 0),
    };
  },
});
