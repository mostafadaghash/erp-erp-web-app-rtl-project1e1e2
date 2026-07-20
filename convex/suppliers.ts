import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireModulePermission, logAction } from "./lib/auth";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireModulePermission(ctx, "view_suppliers", "suppliers");
    return await ctx.db.query("suppliers").collect();
  },
});

export const get = query({
  args: { id: v.id("suppliers") },
  handler: async (ctx, args) => {
    await requireModulePermission(ctx, "view_suppliers", "suppliers");
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    phone: v.string(),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "create_suppliers", "suppliers");
    const id = await ctx.db.insert("suppliers", { ...args, balance: 0 });
    await logAction(ctx, user, {
      action: "create",
      module: "suppliers",
      recordId: id,
      recordLabel: args.name,
      details: `إضافة مورد جديد: ${args.name} - ${args.phone}`,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("suppliers"),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "edit_suppliers", "suppliers");
    const { id, ...rest } = args;
    const supplier = await ctx.db.get(id);
    if (!supplier) throw new ConvexError("المورد غير موجود");
    await ctx.db.patch(id, rest);
    await logAction(ctx, user, {
      action: "update",
      module: "suppliers",
      recordId: id,
      recordLabel: supplier.name,
      details: `تحديث بيانات المورد: ${supplier.name}`,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("suppliers") },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "delete_suppliers", "suppliers");
    const supplier = await ctx.db.get(args.id);
    if (!supplier) throw new ConvexError("المورد غير موجود");
    await ctx.db.delete(args.id);
    await logAction(ctx, user, {
      action: "delete",
      module: "suppliers",
      recordId: args.id,
      recordLabel: supplier.name,
      details: `حذف المورد: ${supplier.name}`,
    });
  },
});
