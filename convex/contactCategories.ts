import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requirePermission } from "./lib/auth.ts";

const categoryType = v.union(v.literal("customer"), v.literal("supplier"));
const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ar-EG");

export const list = query({
  args: { type: categoryType },
  handler: async (ctx, args) => {
    await requirePermission(ctx, args.type === "customer" ? "view_customers" : "view_suppliers");
    const rows = args.type === "customer" ? await ctx.db.query("customerCategories").collect() : await ctx.db.query("supplierCategories").collect();
    return rows.sort((a, b) => a.name.localeCompare(b.name, "ar"));
  },
});

export const create = mutation({
  args: { type: categoryType, name: v.string() },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, args.type === "customer" ? "edit_customers" : "edit_suppliers");
    const name = args.name.trim().replace(/\s+/g, " ");
    const normalizedName = normalize(name);
    if (!name) throw new ConvexError("اسم التصنيف مطلوب");
    if (args.type === "customer") {
      const existing = await ctx.db.query("customerCategories").withIndex("by_name", q => q.eq("normalizedName", normalizedName)).unique();
      return existing?._id ?? await ctx.db.insert("customerCategories", { name, normalizedName, createdAt: Date.now(), createdBy: user.userId });
    }
    const existing = await ctx.db.query("supplierCategories").withIndex("by_name", q => q.eq("normalizedName", normalizedName)).unique();
    return existing?._id ?? await ctx.db.insert("supplierCategories", { name, normalizedName, createdAt: Date.now(), createdBy: user.userId });
  },
});
