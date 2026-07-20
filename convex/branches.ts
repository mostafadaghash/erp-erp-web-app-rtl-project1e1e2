import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("branches").collect();
  },
});

export const get = query({
  args: { id: v.id("branches") },
  handler: async (ctx, args) => {
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
    const existing = await ctx.db.query("branches")
      .filter(q => q.eq(q.field("name"), args.name)).first();
    if (existing) throw new ConvexError("يوجد فرع بهذا الاسم بالفعل");
    return await ctx.db.insert("branches", {
      name: args.name,
      address: args.address,
      phone: args.phone,
      isActive: args.isActive ?? true,
    });
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
    const { id, ...data } = args;
    const branch = await ctx.db.get(id);
    if (!branch) throw new ConvexError("الفرع غير موجود");
    await ctx.db.patch(id, data);
  },
});

export const remove = mutation({
  args: { id: v.id("branches") },
  handler: async (ctx, args) => {
    const branch = await ctx.db.get(args.id);
    if (!branch) throw new ConvexError("الفرع غير موجود");
    // Check if branch has employees
    const employees = await ctx.db.query("userProfiles")
      .filter(q => q.eq(q.field("branchId"), args.id)).first();
    if (employees) throw new ConvexError("لا يمكن حذف فرع يحتوي على موظفين");
    await ctx.db.delete(args.id);
  },
});

export const stats = query({
  args: {},
  handler: async (ctx) => {
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
