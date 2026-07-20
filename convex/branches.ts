import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireAuth, requireAdmin, requirePermission, logAction } from "./lib/auth";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "view_branches");
    return await ctx.db.query("branches").collect();
  },
});

export const get = query({
  args: { id: v.id("branches") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "view_branches");
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    address: v.string(),
    phone: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx);
    const existing = await ctx.db.query("branches")
      .filter(q => q.eq(q.field("name"), args.name)).first();
    if (existing) throw new ConvexError("يوجد فرع بهذا الاسم بالفعل");
    const id = await ctx.db.insert("branches", {
      name: args.name,
      address: args.address,
      phone: args.phone,
      isActive: args.isActive ?? true,
    });
    await logAction(ctx, user, {
      action: "create",
      module: "branches",
      recordId: id,
      recordLabel: args.name,
      details: `إضافة فرع جديد: ${args.name} - ${args.address}`,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("branches"),
    name: v.string(),
    address: v.string(),
    phone: v.optional(v.string()),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx);
    const { id, ...data } = args;
    const branch = await ctx.db.get(id);
    if (!branch) throw new ConvexError("الفرع غير موجود");
    await ctx.db.patch(id, data);
    await logAction(ctx, user, {
      action: "update",
      module: "branches",
      recordId: id,
      recordLabel: args.name,
      details: `تحديث بيانات الفرع: ${args.name}`,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("branches") },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx);
    const branch = await ctx.db.get(args.id);
    if (!branch) throw new ConvexError("الفرع غير موجود");
    const employees = await ctx.db.query("userProfiles")
      .filter(q => q.eq(q.field("branchId"), args.id)).first();
    if (employees) throw new ConvexError("لا يمكن حذف فرع يحتوي على موظفين");
    await ctx.db.delete(args.id);
    await logAction(ctx, user, {
      action: "delete",
      module: "branches",
      recordId: args.id,
      recordLabel: branch.name,
      details: `حذف الفرع: ${branch.name}`,
    });
  },
});

export const stats = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "view_branches");
    const branches = await ctx.db.query("branches").collect();
    const employees = await ctx.db.query("userProfiles").collect();
    return {
      total: branches.length,
      active: branches.filter(b => b.isActive).length,
      inactive: branches.filter(b => !b.isActive).length,
      totalEmployees: employees.length,
    };
  },
});
