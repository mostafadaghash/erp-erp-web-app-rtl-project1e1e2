import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { assertBranchAccess, filterByBranch, requirePermission, resolveWriteBranch, logAction } from "./lib/auth";
import { redactProductFinancials, visibleProductStats } from "./lib/productVisibility";

function assertNonNegativeNumber(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new ConvexError(`${label} يجب أن يكون رقماً موجباً أو صفراً`);
  }
}

async function assertUniqueSku(ctx: any, sku: string, currentId?: string) {
  if (!sku) return;
  const existing = await ctx.db
    .query("products")
    .withIndex("by_sku", (q: any) => q.eq("sku", sku))
    .first();
  if (existing && existing._id !== currentId) {
    throw new ConvexError("رمز SKU مستخدم لمنتج آخر");
  }
}

export const list = query({
  args: {
    branchId: v.optional(v.id("branches")),
    search: v.optional(v.string()),
    category: v.optional(v.string()),
    lowStock: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "view_products");
    let products = await ctx.db.query("products").collect();
    products = filterByBranch(products, user);
    if (args.branchId && user.role === "admin") {
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
    return products.map((product) => redactProductFinancials(product, user.permissions));
  },
});

export const get = query({
  args: { id: v.id("products") },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "view_products");
    const product = await ctx.db.get(args.id);
    if (product) assertBranchAccess(user, product);
    return product ? redactProductFinancials(product, user.permissions) : null;
  },
});

export const categories = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "view_products");
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
    const user = await requirePermission(ctx, "create_products");
    if (!args.name.trim()) throw new ConvexError("اسم المنتج مطلوب");
    assertNonNegativeNumber(args.cost, "سعر التكلفة");
    assertNonNegativeNumber(args.price, "سعر البيع");
    assertNonNegativeNumber(args.stock, "المخزون");
    assertNonNegativeNumber(args.minStock ?? 0, "الحد الأدنى للمخزون");
    if (!Number.isInteger(args.stock)) throw new ConvexError("المخزون يجب أن يكون عدداً صحيحاً");
    const sku = args.sku?.trim() ?? "";
    await assertUniqueSku(ctx, sku);
    const branchId = resolveWriteBranch(user, args.branchId);
    const id = await ctx.db.insert("products", {
      name: args.name.trim(),
      sku,
      barcode: args.barcode,
      categoryId: args.category ? args.category as any : undefined,
      costPrice: args.cost,
      sellPrice: args.price,
      stock: args.stock,
      minStock: args.minStock ?? 0,
      unit: args.unit ?? "قطعة",
      branchId,
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
    const user = await requirePermission(ctx, "edit_products");
    const { id, ...data } = args;
    const prod = await ctx.db.get(id);
    if (!prod) throw new ConvexError("المنتج غير موجود");
    assertBranchAccess(user, prod);
    if (!args.name.trim()) throw new ConvexError("اسم المنتج مطلوب");
    assertNonNegativeNumber(args.cost, "سعر التكلفة");
    assertNonNegativeNumber(args.price, "سعر البيع");
    assertNonNegativeNumber(args.stock, "المخزون");
    assertNonNegativeNumber(args.minStock ?? 0, "الحد الأدنى للمخزون");
    if (!Number.isInteger(args.stock)) throw new ConvexError("المخزون يجب أن يكون عدداً صحيحاً");
    const sku = args.sku?.trim() ?? "";
    await assertUniqueSku(ctx, sku, String(id));
    const branchId = resolveWriteBranch(user, data.branchId);
    await ctx.db.patch(id, {
      name: args.name.trim(),
      sku,
      barcode: args.barcode,
      categoryId: args.category ? args.category as any : undefined,
      costPrice: args.cost,
      sellPrice: args.price,
      stock: args.stock,
      minStock: args.minStock ?? 0,
      unit: args.unit ?? "قطعة",
      branchId,
      description: args.description,
    });
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
    const user = await requirePermission(ctx, "delete_products");
    const prod = await ctx.db.get(args.id);
    if (!prod) throw new ConvexError("المنتج غير موجود");
    assertBranchAccess(user, prod);
    const referencedInvoice = await ctx.db
      .query("invoices")
      .filter((q) => q.eq(q.field("branchId"), prod.branchId))
      .collect();
    if (referencedInvoice.some((invoice) => invoice.items.some((item) => item.productId === args.id))) {
      throw new ConvexError("لا يمكن حذف منتج مستخدم في فاتورة");
    }
    const referencedShipment = await ctx.db
      .query("shipments")
      .filter((q) => q.eq(q.field("branchId"), prod.branchId))
      .collect();
    if (referencedShipment.some((shipment) => shipment.items.some((item) => item.productId === args.id))) {
      throw new ConvexError("لا يمكن حذف منتج مستخدم في شحنة واردة");
    }
    if (prod.stock !== 0) throw new ConvexError("يجب تصفير مخزون المنتج قبل حذفه");
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
    const user = await requirePermission(ctx, "edit_products");
    const prod = await ctx.db.get(args.id);
    if (!prod) throw new ConvexError("المنتج غير موجود");
    assertBranchAccess(user, prod);
    const newStock = prod.stock + args.adjustment;
    if (!Number.isFinite(args.adjustment) || !Number.isInteger(args.adjustment)) {
      throw new ConvexError("تعديل المخزون يجب أن يكون عدداً صحيحاً");
    }
    if (newStock < 0) throw new ConvexError("لا يمكن أن يصبح المخزون سالباً");
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
    const user = await requirePermission(ctx, "view_products");
    let products = await ctx.db.query("products").collect();
    products = filterByBranch(products, user);
    const lowStock = products.filter(p => p.stock <= (p.minStock ?? 0)).length;
    return {
      total: products.length,
      ...visibleProductStats(products, user.permissions),
      lowStock,
      outOfStock: products.filter(p => p.stock === 0).length,
    };
  },
});
