import { query, mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { assertBranchAccess, filterByBranch, requirePermission, resolveWriteBranch, logAction, type AuthUser } from "./lib/auth";
import { changeProductStock } from "./lib/inventory";
import { INVENTORY_MOVEMENT_TYPES } from "../shared/inventoryRules";
import { redactProductFinancials, visibleProductStats } from "./lib/productVisibility";
import { validateOpeningStock, validateProductInput } from "../shared/productRules";

async function assertUniqueSku(ctx: QueryCtx | MutationCtx, sku: string, currentId?: Id<"products">) {
  const existing = await ctx.db.query("products").withIndex("by_sku", (q) => q.eq("sku", sku)).first();
  if (existing && existing._id !== currentId) throw new ConvexError("رمز SKU مستخدم لمنتج آخر");
}

async function validateRelations(ctx: MutationCtx, categoryId?: Id<"categories">, supplierId?: Id<"suppliers">) {
  if (categoryId && !(await ctx.db.get(categoryId))) throw new ConvexError("الفئة المحددة غير موجودة أو تم حذفها");
  if (supplierId && !(await ctx.db.get(supplierId))) throw new ConvexError("المورد المحدد غير موجود أو تم حذفه");
}



export const list = query({
  args: { branchId: v.optional(v.id("branches")), search: v.optional(v.string()), category: v.optional(v.string()), lowStock: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "view_products");
    let products = filterByBranch(await ctx.db.query("products").collect(), user);
    if (args.branchId && user.role === "admin") products = products.filter((p) => p.branchId === args.branchId);
    if (args.category) products = products.filter((p) => p.categoryId === args.category);
    if (args.search) {
      const search = args.search.toLowerCase();
      products = products.filter((p) => p.name.toLowerCase().includes(search) || p.sku.toLowerCase().includes(search) || (p.barcode ?? "").toLowerCase().includes(search));
    }
    if (args.lowStock) products = products.filter((p) => p.stock <= p.minStock);
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

export const create = mutation({
  args: {
    name: v.string(), sku: v.string(), barcode: v.optional(v.string()), categoryId: v.optional(v.id("categories")),
    supplierId: v.optional(v.id("suppliers")), warrantyMonths: v.optional(v.number()), costPrice: v.number(),
    sellPrice: v.number(), stock: v.number(), minStock: v.number(), unit: v.string(), branchId: v.optional(v.id("branches")),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "create_products");
    await requirePermission(ctx, "view_prices");
    await requirePermission(ctx, "view_profits");
    let normalized;
    try { normalized = validateProductInput(args); validateOpeningStock(args.stock); } catch (error) { throw new ConvexError(error instanceof Error ? error.message : "بيانات المنتج غير صالحة"); }
    await assertUniqueSku(ctx, normalized.sku);
    await validateRelations(ctx, args.categoryId, args.supplierId);
    const branchId = resolveWriteBranch(user, args.branchId);
    const id = await ctx.db.insert("products", {
      name: normalized.name, sku: normalized.sku, barcode: args.barcode?.trim() || undefined,
      categoryId: args.categoryId, supplierId: args.supplierId, warrantyMonths: args.warrantyMonths,
      costPrice: args.costPrice, inventoryValue: 0, sellPrice: args.sellPrice, stock: 0, minStock: args.minStock,
      unit: normalized.unit, branchId, description: args.description?.trim() || undefined, isActive: true,
    });
    if (args.stock > 0) await changeProductStock(ctx, user, { productId: id, quantityDelta: args.stock, unitCost: args.costPrice, type: INVENTORY_MOVEMENT_TYPES.openingBalance, reason: "الرصيد الافتتاحي" });
    await logAction(ctx, user, { action: "create", module: "products", recordId: id, recordLabel: normalized.name, details: `إضافة منتج جديد: ${normalized.name}`, branchId, after: { name: normalized.name, sku: normalized.sku, categoryId: args.categoryId ? String(args.categoryId) : null, supplierId: args.supplierId ? String(args.supplierId) : null, minStock: args.minStock, unit: normalized.unit, stock: args.stock, isActive: true } });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("products"), name: v.string(), sku: v.string(), barcode: v.optional(v.string()),
    categoryId: v.optional(v.id("categories")), supplierId: v.optional(v.id("suppliers")), warrantyMonths: v.optional(v.number()),
    costPrice: v.number(), sellPrice: v.number(), minStock: v.number(), unit: v.string(),
    branchId: v.optional(v.id("branches")), description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "edit_products");
    const product = await ctx.db.get(args.id);
    if (!product) throw new ConvexError("المنتج غير موجود");
    assertBranchAccess(user, product);
    if (args.sellPrice !== product.sellPrice) await requirePermission(ctx, "view_prices");
    if (args.costPrice !== product.costPrice) await requirePermission(ctx, "view_profits");
    let normalized;
    try { normalized = validateProductInput(args); } catch (error) { throw new ConvexError(error instanceof Error ? error.message : "بيانات المنتج غير صالحة"); }
    await assertUniqueSku(ctx, normalized.sku, args.id);
    await validateRelations(ctx, args.categoryId, args.supplierId);
    const branchId = resolveWriteBranch(user, args.branchId ?? product.branchId);
    await ctx.db.patch(args.id, {
      name: normalized.name, sku: normalized.sku, barcode: args.barcode?.trim() || undefined,
      categoryId: args.categoryId, supplierId: args.supplierId, warrantyMonths: args.warrantyMonths,
      sellPrice: args.sellPrice, minStock: args.minStock, unit: normalized.unit,
      branchId, description: args.description?.trim() || undefined,
    });
    await logAction(ctx, user, { action: "update", module: "products", recordId: args.id, recordLabel: normalized.name, details: `تعديل المنتج: ${normalized.name}`, branchId, before: { name: product.name, sku: product.sku, categoryId: product.categoryId ? String(product.categoryId) : null, supplierId: product.supplierId ? String(product.supplierId) : null, minStock: product.minStock, unit: product.unit }, after: { name: normalized.name, sku: normalized.sku, categoryId: args.categoryId ? String(args.categoryId) : null, supplierId: args.supplierId ? String(args.supplierId) : null, minStock: args.minStock, unit: normalized.unit } });
  },
});

export const adjustStock = mutation({
  args: { id: v.id("products"), adjustment: v.number(), reason: v.string() },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "edit_products");
    const current = await ctx.db.get(args.id); if (!current) throw new ConvexError("المنتج غير موجود");
    await changeProductStock(ctx, user, { productId: args.id, quantityDelta: args.adjustment, unitCost: current.costPrice, type: INVENTORY_MOVEMENT_TYPES.manualAdjustment, reason: args.reason });
    await logAction(ctx, user, { action: "adjust_stock", module: "products", recordId: args.id, recordLabel: current.name, details: `تعديل يدوي للمخزون: ${args.adjustment > 0 ? "+" : ""}${args.adjustment} - ${args.reason.trim()}`, branchId: current.branchId, before: { stock: current.stock }, after: { stock: current.stock + args.adjustment, adjustment: args.adjustment, reason: args.reason.trim() } });
  },
});

export const movements = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "view_products");
    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError("المنتج غير موجود");
    assertBranchAccess(user, product);
    const movements = await ctx.db.query("inventoryMovements").withIndex("by_product", (q) => q.eq("productId", args.productId)).order("desc").collect();
    if (user.permissions.includes("view_profits")) return movements;
    return movements.map(({ unitCost: _unit, valueDelta: _delta, inventoryValueBefore: _before, inventoryValueAfter: _after, averageCostBefore: _averageBefore, averageCostAfter: _averageAfter, ...movement }) => movement);
  },
});

async function applyActiveState(ctx: MutationCtx, user: AuthUser, id: Id<"products">, isActive: boolean) {
  const product = await ctx.db.get(id);
  if (!product) throw new ConvexError("المنتج غير موجود");
  assertBranchAccess(user, product);
  await ctx.db.patch(id, { isActive });
  await logAction(ctx, user, { action: isActive ? "activate" : "deactivate", module: "products", recordId: id, recordLabel: product.name, details: `${isActive ? "إعادة تفعيل" : "تعطيل"} المنتج: ${product.name}`, branchId: product.branchId, before: { isActive: product.isActive ?? true }, after: { isActive } });
}

export const setActive = mutation({
  args: { id: v.id("products"), isActive: v.boolean() },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "edit_products");
    await applyActiveState(ctx, user, args.id, args.isActive);
  },
});

export const remove = mutation({
  args: { id: v.id("products") },
  handler: async (ctx) => {
    await requirePermission(ctx, "delete_products");
    throw new ConvexError("الحذف النهائي للمنتجات غير مسموح؛ استخدم تعطيل المنتج بدلاً منه");
  },
});

export const stats = query({
  args: {},
  handler: async (ctx) => {
    const user = await requirePermission(ctx, "view_products");
    const products = filterByBranch(await ctx.db.query("products").collect(), user);
    return { total: products.length, ...visibleProductStats(products, user.permissions), lowStock: products.filter((p) => p.stock <= p.minStock).length, outOfStock: products.filter((p) => p.stock === 0).length };
  },
});
