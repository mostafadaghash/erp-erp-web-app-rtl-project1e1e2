import { query, mutation } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { requirePermission, logAction } from "./lib/auth";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "view_products");
    return await ctx.db.query("categories").collect();
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    icon: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "create_products");
    const id = await ctx.db.insert("categories", args);
    await logAction(ctx, user, {
      action: "create",
      module: "categories",
      recordId: id,
      recordLabel: args.name,
      details: `إضافة فئة جديدة: ${args.name}`,
    });
    return id;
  },
});

export const remove = mutation({
  args: { id: v.id("categories") },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "delete_products");
    const category = await ctx.db.get(args.id);
    if (!category) throw new ConvexError("الفئة غير موجودة");
    const linkedProduct = await ctx.db.query("products").withIndex("by_category", (q) => q.eq("categoryId", args.id)).first();
    if (linkedProduct) throw new ConvexError("لا يمكن حذف فئة مرتبطة بمنتج");
    await ctx.db.delete(args.id);
    await logAction(ctx, user, {
      action: "delete",
      module: "categories",
      recordId: args.id,
      recordLabel: category.name,
      details: `حذف الفئة: ${category.name}`,
    });
  },
});
