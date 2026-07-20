import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireAuth, requirePermission, filterByBranch, logAction } from "./lib/auth";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    const all = await ctx.db.query("customers").collect();
    return filterByBranch(all, user);
  },
});

export const get = query({
  args: { id: v.id("customers") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
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
    branchId: v.optional(v.id("branches")),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "create_customers");
    const branchId = args.branchId ?? (user.branchId as any);
    const id = await ctx.db.insert("customers", {
      ...args,
      branchId,
      balance: 0,
      totalPurchases: 0,
    });
    await logAction(ctx, user, {
      action: "create",
      module: "customers",
      recordId: id,
      recordLabel: args.name,
      details: `إضافة عميل جديد: ${args.name} - ${args.phone}`,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("customers"),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "edit_customers");
    const { id, ...rest } = args;
    const customer = await ctx.db.get(id);
    if (!customer) throw new ConvexError("العميل غير موجود");
    await ctx.db.patch(id, rest);
    await logAction(ctx, user, {
      action: "update",
      module: "customers",
      recordId: id,
      recordLabel: customer.name,
      details: `تحديث بيانات العميل: ${customer.name}`,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("customers") },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "delete_customers");
    const customer = await ctx.db.get(args.id);
    if (!customer) throw new ConvexError("العميل غير موجود");
    await ctx.db.delete(args.id);
    await logAction(ctx, user, {
      action: "delete",
      module: "customers",
      recordId: args.id,
      recordLabel: customer.name,
      details: `حذف العميل: ${customer.name}`,
    });
  },
});
