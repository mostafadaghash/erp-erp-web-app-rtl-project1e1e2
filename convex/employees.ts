import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";

// Role definitions with Arabic labels and permissions
export const ROLES = {
  admin:            { label: "مدير النظام",      color: "purple" },
  manager:          { label: "مدير فرع",          color: "indigo" },
  sales:            { label: "موظف مبيعات",       color: "blue" },
  customer_service: { label: "خدمة العملاء",      color: "cyan" },
  technician:       { label: "فني صيانة",         color: "amber" },
  accountant:       { label: "محاسب",             color: "emerald" },
  shipping:         { label: "موظف شحن",          color: "orange" },
  viewer:           { label: "مشاهد فقط",         color: "slate" },
} as const;

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: [
    "view_all", "create_all", "edit_all", "delete_all",
    "view_prices", "view_profits", "manage_users",
    "export_data", "print_all", "manage_settings",
    "view_reports", "manage_branches",
  ],
  manager: [
    "view_all", "create_all", "edit_all",
    "view_prices", "view_profits",
    "export_data", "print_all", "view_reports",
  ],
  sales: [
    "view_products", "view_customers", "view_orders", "view_invoices",
    "create_orders", "create_invoices", "edit_orders",
    "view_prices", "print_invoices",
  ],
  customer_service: [
    "view_customers", "view_orders", "view_repairs",
    "create_customers", "edit_customers",
    "create_orders", "edit_orders",
    "view_prices",
  ],
  technician: [
    "view_repairs", "edit_repairs", "create_repairs",
    "view_products", "view_prices",
    "print_repairs",
  ],
  accountant: [
    "view_all", "view_prices", "view_profits",
    "view_reports", "export_data",
    "create_expenses", "edit_expenses",
  ],
  shipping: [
    "view_orders", "view_shipments",
    "edit_shipments", "create_shipments",
    "print_shipping",
  ],
  viewer: [
    "view_products", "view_customers", "view_orders",
    "view_repairs", "view_invoices",
  ],
};

export const list = query({
  args: { branchId: v.optional(v.id("branches")) },
  handler: async (ctx, args) => {
    const employees = await ctx.db.query("userProfiles").collect();
    if (args.branchId) {
      return employees.filter(e => e.branchId === args.branchId);
    }
    return employees;
  },
});

export const get = query({
  args: { id: v.id("userProfiles") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getByUserId = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db.query("userProfiles")
      .withIndex("by_user", q => q.eq("userId", args.userId))
      .first();
  },
});

export const stats = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("userProfiles").collect();
    const byRole: Record<string, number> = {};
    for (const e of all) {
      byRole[e.role] = (byRole[e.role] ?? 0) + 1;
    }
    return {
      total: all.length,
      active: all.filter(e => e.isActive).length,
      inactive: all.filter(e => !e.isActive).length,
      byRole,
    };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    phone: v.optional(v.string()),
    role: v.string(),
    branchId: v.optional(v.id("branches")),
    permissions: v.optional(v.array(v.string())),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Auto-assign permissions based on role if not provided
    const permissions = args.permissions ?? ROLE_PERMISSIONS[args.role] ?? [];
    // Generate a placeholder userId (in real app, linked to auth user)
    const userId = "emp_" + Date.now().toString();
    return await ctx.db.insert("userProfiles", {
      userId,
      name: args.name,
      phone: args.phone,
      role: args.role,
      branchId: args.branchId,
      permissions,
      isActive: args.isActive ?? true,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("userProfiles"),
    name: v.string(),
    phone: v.optional(v.string()),
    role: v.string(),
    branchId: v.optional(v.id("branches")),
    permissions: v.array(v.string()),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { id, ...data } = args;
    const emp = await ctx.db.get(id);
    if (!emp) throw new ConvexError("الموظف غير موجود");
    await ctx.db.patch(id, data);
  },
});

export const toggleActive = mutation({
  args: { id: v.id("userProfiles") },
  handler: async (ctx, args) => {
    const emp = await ctx.db.get(args.id);
    if (!emp) throw new ConvexError("الموظف غير موجود");
    await ctx.db.patch(args.id, { isActive: !emp.isActive });
  },
});

export const remove = mutation({
  args: { id: v.id("userProfiles") },
  handler: async (ctx, args) => {
    const emp = await ctx.db.get(args.id);
    if (!emp) throw new ConvexError("الموظف غير موجود");
    await ctx.db.delete(args.id);
  },
});

export const updatePermissions = mutation({
  args: {
    id: v.id("userProfiles"),
    permissions: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const emp = await ctx.db.get(args.id);
    if (!emp) throw new ConvexError("الموظف غير موجود");
    await ctx.db.patch(args.id, { permissions: args.permissions });
  },
});
