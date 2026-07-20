import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { hasPermission, requireModulePermission, logAction } from "./lib/auth";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireModulePermission(ctx, "view_branches", "branches");
    return await ctx.db.query("branches").collect();
  },
});

export const get = query({
  args: { id: v.id("branches") },
  handler: async (ctx, args) => {
    await requireModulePermission(ctx, "view_branches", "branches");
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
    const user = await requireModulePermission(ctx, "manage_branches", "branches");
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
    const user = await requireModulePermission(ctx, "manage_branches", "branches");
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

export const setActive = mutation({
  args: { id: v.id("branches"), isActive: v.boolean() },
  handler: async (ctx, args) => { const user = await requireModulePermission(ctx, "manage_branches", "branches"); const branch = await ctx.db.get(args.id); if (!branch) throw new ConvexError("الفرع غير موجود"); if (!args.isActive) { const employees = (await ctx.db.query("userProfiles").collect()).filter(profile => profile.branchId === args.id && profile.isActive); if (employees.length) throw new ConvexError("لا يمكن تعطيل فرع يحتوي على موظفين نشطين"); } await ctx.db.patch(args.id, { isActive: args.isActive }); await logAction(ctx, user, { action: args.isActive ? "activate" : "deactivate", module: "branches", recordId: args.id, recordLabel: branch.name, details: `${args.isActive ? "تفعيل" : "تعطيل"} الفرع ${branch.name}` }); },
});
export const remove = mutation({ args: { id: v.id("branches") }, handler: async () => { throw new ConvexError("استخدم تعطيل الفرع بدلاً من الحذف"); } });

export const stats = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireModulePermission(ctx, "view_branches", "branches");
    const branches = await ctx.db.query("branches").collect();
    const totalEmployees = hasPermission(user, "view_employees")
      ? (await ctx.db.query("userProfiles").collect()).length
      : undefined;
    return {
      total: branches.length,
      active: branches.filter(b => b.isActive).length,
      inactive: branches.filter(b => !b.isActive).length,
      totalEmployees,
    };
  },
});

export const legacyDataStats = query({
  args: {},
  handler: async (ctx) => {
    await requireModulePermission(ctx, "manage_branches", "branches");
    const [products, customers, invoices, orders, repairs, shipments, expenses, payments, leads, deliveries] = await Promise.all([
      ctx.db.query("products").collect(),
      ctx.db.query("customers").collect(),
      ctx.db.query("invoices").collect(),
      ctx.db.query("orders").collect(),
      ctx.db.query("repairs").collect(),
      ctx.db.query("shipments").collect(),
      ctx.db.query("expenses").collect(),
      ctx.db.query("payments").collect(),
      ctx.db.query("leads").collect(),
      ctx.db.query("deliveries").collect(),
    ]);
    const counts = {
      products: products.filter((item) => !item.branchId).length,
      customers: customers.filter((item) => !item.branchId).length,
      invoices: invoices.filter((item) => !item.branchId).length,
      orders: orders.filter((item) => !item.branchId).length,
      repairs: repairs.filter((item) => !item.branchId).length,
      shipments: shipments.filter((item) => !item.branchId).length,
      expenses: expenses.filter((item) => !item.branchId).length,
      payments: payments.filter((item) => !item.branchId).length,
      leads: leads.filter((item) => !item.branchId).length,
      deliveries: deliveries.filter((item) => !item.branchId).length,
    };
    return { counts, total: Object.values(counts).reduce((sum, count) => sum + count, 0) };
  },
});

export const assignLegacyData = mutation({
  args: { branchId: v.id("branches") },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "manage_branches", "branches");
    const branch = await ctx.db.get(args.branchId);
    if (!branch) throw new ConvexError("الفرع غير موجود");
    let assigned = 0;

    for (const item of await ctx.db.query("products").collect()) if (!item.branchId) { await ctx.db.patch(item._id, { branchId: args.branchId }); assigned++; }
    for (const item of await ctx.db.query("customers").collect()) if (!item.branchId) { await ctx.db.patch(item._id, { branchId: args.branchId }); assigned++; }
    for (const item of await ctx.db.query("invoices").collect()) if (!item.branchId) { await ctx.db.patch(item._id, { branchId: args.branchId }); assigned++; }
    for (const item of await ctx.db.query("orders").collect()) if (!item.branchId) { await ctx.db.patch(item._id, { branchId: args.branchId }); assigned++; }
    for (const item of await ctx.db.query("repairs").collect()) if (!item.branchId) { await ctx.db.patch(item._id, { branchId: args.branchId }); assigned++; }
    for (const item of await ctx.db.query("shipments").collect()) if (!item.branchId) { await ctx.db.patch(item._id, { branchId: args.branchId }); assigned++; }
    for (const item of await ctx.db.query("expenses").collect()) if (!item.branchId) { await ctx.db.patch(item._id, { branchId: args.branchId }); assigned++; }
    for (const item of await ctx.db.query("payments").collect()) if (!item.branchId) { await ctx.db.patch(item._id, { branchId: args.branchId }); assigned++; }
    for (const item of await ctx.db.query("leads").collect()) if (!item.branchId) { await ctx.db.patch(item._id, { branchId: args.branchId }); assigned++; }
    for (const item of await ctx.db.query("deliveries").collect()) if (!item.branchId) { await ctx.db.patch(item._id, { branchId: args.branchId }); assigned++; }

    await logAction(ctx, user, {
      action: "migrate",
      module: "branches",
      recordId: args.branchId,
      recordLabel: branch.name,
      details: `إسناد ${assigned} سجل قديم بدون فرع إلى ${branch.name}`,
    });
    return assigned;
  },
});
