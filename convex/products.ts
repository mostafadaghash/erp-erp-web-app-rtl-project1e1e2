import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: { branchId: v.optional(v.id("branches")) },
  handler: async (ctx, args) => {
    let q = ctx.db.query("products");
    const products = await q.collect();
    return products.filter(p => p.isActive);
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("products").collect();
  },
});

export const get = query({
  args: { id: v.id("products") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    sku: v.string(),
    barcode: v.optional(v.string()),
    categoryId: v.optional(v.id("categories")),
    supplierId: v.optional(v.id("suppliers")),
    costPrice: v.number(),
    sellPrice: v.number(),
    stock: v.number(),
    minStock: v.number(),
    unit: v.string(),
    description: v.optional(v.string()),
    branchId: v.optional(v.id("branches")),
    warrantyMonths: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("products", { ...args, isActive: true });
  },
});

export const update = mutation({
  args: {
    id: v.id("products"),
    name: v.optional(v.string()),
    costPrice: v.optional(v.number()),
    sellPrice: v.optional(v.number()),
    stock: v.optional(v.number()),
    minStock: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
    description: v.optional(v.string()),
    warrantyMonths: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...rest } = args;
    await ctx.db.patch(id, rest);
  },
});

export const adjustStock = mutation({
  args: {
    id: v.id("products"),
    quantity: v.number(),
    operation: v.string(),
  },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.id);
    if (!product) throw new Error("المنتج غير موجود");
    const newStock = args.operation === "add"
      ? product.stock + args.quantity
      : product.stock - args.quantity;
    await ctx.db.patch(args.id, { stock: Math.max(0, newStock) });
  },
});

export const getLowStock = query({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db.query("products").collect();
    return products.filter(p => p.isActive && p.stock <= p.minStock);
  },
});
