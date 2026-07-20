import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { requireAuth, requirePermission, logAction } from "./lib/auth";

export const list = query({
  args: {
    branchId: v.optional(v.id("branches")),
    search: v.optional(v.string()),
    category: v.optional(v.string()),
    lowStock: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    let products = await ctx.db.query("products").collect();
    // Branch isolation
    if (user.role !== "admin" && user.branchId) {
      products = products.filter(p => !p.branchId || p.branchId === user.branchId);
    }
    if (args.branchId) {
      products = products.filter(p => p.branchId === args.branchId);
    }
    if (args.category) {
      products = products.filter(p => p.categoryId === args.category);
    }
    if (args.search) {
      const s = args.search.toLowerCase();
      products = products.filter(p =>
        p.name.toLowerCase().includes(s) ||
        (p.sku ?? "").toLowerCase().includes(s) ||
        (p.barcode ?? "").toLowerCase().includes(s)
      );
    }
    if (args.lowStock) {
      products = products.filter(p => p.stock <= (p.minStock ?? 0));
    }
    return products;
  },
});

export const get = query({
  args: { id: v.id("products") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return await ctx.db.get(args.id);
  },
});

export const categories = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const all = await ctx.db.query("products").collect();
    const cats = new Set<string>();
    for (const p of all) {
      if (p.categoryId) cats.add(p.categoryId);
    }
    return Array.from(cats).sort();
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    sku: v.optional(v.string()),
    barcode: v.optional(v.string()),
    category: v.optional(v.string()),
    brand: v.optional(v.string()),
    cost: v.number(),
    price: v.number(),
    stock: v.number(),
    minStock: v.optional(v.number()),
    unit: v.optional(v.string()),
    branchId: v.optional(v.id("branches")),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "create_all");
    const id = await ctx.db.insert("products", {
      name: args.name,
      sku: args.sku ?? "",
      barcode: args.barcode,
      categoryId: args.category ? args.category as any : undefined,
      costPrice: args.cost,
      sellPrice: args.price,
      stock: args.stock,
      minStock: args.minStock ?? 0,
      unit: args.unit ?? "قطعة",
      branchId: args.branchId,
      description: args.description,
      isActive: true,
    });
    await logAction(ctx, user, {
      action: "create",
      module: "products",
      recordId: id,
      recordLabel: args.name,
      details: `إضافة منتج جديد: ${args.name}`,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("products"),
    name: v.string(),
    sku: v.optional(v.string()),
    barcode: v.optional(v.string()),
    category: v.optional(v.string()),
    brand: v.optional(v.string()),
    cost: v.number(),
    price: v.number(),
    stock: v.number(),
    minStock: v.optional(v.number()),
    unit: v.optional(v.string()),
    branchId: v.optional(v.id("branches")),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "edit_all");
    const { id, ...data } = args;
    const prod = await ctx.db.get(id);
    if (!prod) throw new ConvexError("المنتج غير موجود");
    await ctx.db.patch(id, data);
    await logAction(ctx, user, {
      action: "update",
      module: "products",
      recordId: id,
      recordLabel: args.name,
      details: `تعديل المنتج: ${args.name}`,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("products") },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "delete_all");
    const prod = await ctx.db.get(args.id);
    if (!prod) throw new ConvexError("المنتج غير موجود");
    await ctx.db.delete(args.id);
    await logAction(ctx, user, {
      action: "delete",
      module: "products",
      recordId: args.id,
      recordLabel: prod.name,
      details: `حذف المنتج: ${prod.name}`,
    });
  },
});

export const adjustStock = mutation({
  args: {
    id: v.id("products"),
    adjustment: v.number(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "edit_all");
    const prod = await ctx.db.get(args.id);
    if (!prod) throw new ConvexError("المنتج غير موجود");
    const newStock = prod.stock + args.adjustment;
    await ctx.db.patch(args.id, { stock: newStock });
    await logAction(ctx, user, {
      action: "update",
      module: "products",
      recordId: args.id,
      recordLabel: prod.name,
      details: `تعديل مخزون ${prod.name}: ${args.adjustment > 0 ? "+" : ""}${args.adjustment} (${args.reason ?? "بدون سبب"})`,
    });
  },
});

export const stats = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    let products = await ctx.db.query("products").collect();
    if (user.role !== "admin" && user.branchId) {
      products = products.filter(p => !p.branchId || p.branchId === user.branchId);
    }
    const totalValue = products.reduce((sum, p) => sum + p.costPrice * p.stock, 0);
    const totalRetail = products.reduce((sum, p) => sum + p.sellPrice * p.stock, 0);
    const lowStock = products.filter(p => p.stock <= (p.minStock ?? 0)).length;
    return {
      total: products.length,
      totalValue,
      totalRetail,
      potentialProfit: totalRetail - totalValue,
      lowStock,
      outOfStock: products.filter(p => p.stock === 0).length,
    };
  },
});
