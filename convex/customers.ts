import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { assertBranchAccess, requirePermission, filterByBranch, resolveWriteBranch, logAction } from "./lib/auth";
import { initializeCustomerBalance } from "./lib/customerLedger.ts";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requirePermission(ctx, "view_customers");
    const all = await ctx.db.query("customers").collect();
    return filterByBranch(all, user).map(({ balance: _legacyBalance, totalPurchases: _legacyPurchases, ...customer }) => customer);
  },
});

/** Minimal customer data for employees who may create repairs without viewing CRM records. */
export const repairPicker = query({
  args: {},
  handler: async (ctx) => {
    const user = await requirePermission(ctx, "create_repairs");
    const customers = filterByBranch(await ctx.db.query("customers").collect(), user).filter(customer => customer.isActive !== false);
    return customers.map(({ _id, name, phone }) => ({ _id, name, phone }));
  },
});

export const get = query({
  args: { id: v.id("customers") },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "view_customers");
    const customer = await ctx.db.get(args.id);
    if (customer) assertBranchAccess(user, customer);
    if (!customer) return null;
    const { balance: _legacyBalance, totalPurchases: _legacyPurchases, ...visible } = customer;
    return visible;
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
    const branchId = resolveWriteBranch(user, args.branchId);
    const id = await ctx.db.insert("customers", {
      ...args,
      branchId,
      balance: 0,
      totalPurchases: 0,
      isActive: true,
    });
    const financeSettings = await ctx.db.query("financeSettings").first();
    if (financeSettings?.isInitialized && branchId) await initializeCustomerBalance(ctx, user, { customerId: id, branchId, receivableBalance: 0, advanceBalance: 0, totalPurchases: 0, date: financeSettings.cutoverDate, requestId: `new-customer:${id}`, notes: "تهيئة دفتر عميل جديد" });
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
    assertBranchAccess(user, customer);
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

export const setActive = mutation({
  args: { id: v.id("customers"), isActive: v.boolean() },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "delete_customers");
    const customer = await ctx.db.get(args.id); if (!customer) throw new ConvexError("العميل غير موجود");
    assertBranchAccess(user, customer); await ctx.db.patch(args.id, { isActive: args.isActive });
    await logAction(ctx, user, { action: args.isActive ? "activate" : "deactivate", module: "customers", recordId: args.id, recordLabel: customer.name, details: `${args.isActive ? "تفعيل" : "تعطيل"} العميل ${customer.name}` });
  },
});
export const remove = mutation({ args: { id: v.id("customers") }, handler: async () => { throw new ConvexError("استخدم تعطيل العميل بدلاً من الحذف"); } });
