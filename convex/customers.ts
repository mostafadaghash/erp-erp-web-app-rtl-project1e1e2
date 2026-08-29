import { query, mutation } from "./_generated/server.js";
import { v, ConvexError } from "convex/values";
import { assertBranchAccess, requirePermission, resolveWriteBranch, logAction } from "./lib/auth.ts";
import { initializeCustomerBalance } from "./lib/customerLedger.ts";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  normalizeContactEmail,
  normalizeContactName,
  normalizeContactPhone,
  normalizeOptionalContactText,
} from "../shared/contactRules.ts";

function customerData(input: {
  name: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
}) {
  try {
    return {
      name: normalizeContactName(input.name),
      phone: normalizeContactPhone(input.phone),
      email: normalizeContactEmail(input.email),
      address: normalizeOptionalContactText(input.address, 300),
      notes: normalizeOptionalContactText(input.notes, 1000),
    };
  } catch {
    throw new ConvexError("أدخل اسمًا ورقم هاتف صحيحين، وتأكد من أطوال بيانات العميل");
  }
}

async function assertUniqueCustomerPhone(
  ctx: MutationCtx,
  branchId: Id<"branches"> | undefined,
  phone: string,
  exceptId?: Id<"customers">,
) {
  const exactMatches = branchId
    ? await ctx.db
        .query("customers")
        .withIndex("by_branch_phone", (q) =>
          q.eq("branchId", branchId).eq("phone", phone),
        )
        .collect()
    : await ctx.db
        .query("customers")
        .withIndex("by_phone", (q) => q.eq("phone", phone))
        .collect();
  const branchCustomers = exactMatches.length === 0
    ? branchId
      ? await ctx.db
          .query("customers")
          .withIndex("by_branch", (q) => q.eq("branchId", branchId))
          .collect()
      : await ctx.db
          .query("customers")
          .withIndex("by_phone", (q) => q.eq("phone", phone))
          .collect()
    : exactMatches;
  if (
    branchCustomers.some((customer) => {
      if (
        customer._id === exceptId ||
        (branchId === undefined && customer.branchId !== undefined)
      ) {
        return false;
      }
      try {
        return normalizeContactPhone(customer.phone) === phone;
      } catch {
        return false;
      }
    })
  ) {
    throw new ConvexError("رقم الهاتف مسجل لعميل آخر في هذا الفرع");
  }
}

export const list = query({
  args: { branchId: v.optional(v.id("branches")) },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "view_customers");
    if (args.branchId) assertBranchAccess(user, { branchId: args.branchId });
    const branchId = user.role === "admin"
      ? args.branchId ?? user.branchId
      : user.branchId;
    const all = branchId
      ? await ctx.db
          .query("customers")
          .withIndex("by_branch", (q) => q.eq("branchId", branchId))
          .collect()
      : user.role === "admin"
        ? await ctx.db.query("customers").collect()
        : [];
    return all.map(({ balance: _legacyBalance, totalPurchases: _legacyPurchases, ...customer }) => customer);
  },
});

/** Minimal customer data for employees who may create repairs without viewing CRM records. */
export const repairPicker = query({
  args: { branchId: v.optional(v.id("branches")) },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "create_repairs");
    const requestedBranchId = args.branchId;
    if (requestedBranchId) assertBranchAccess(user, { branchId: requestedBranchId });
    const branchId = user.role === "admin"
      ? requestedBranchId ?? user.branchId
      : user.branchId;
    if (!branchId) return [];
    const customers = await ctx.db
      .query("customers")
      .withIndex("by_branch", (q) => q.eq("branchId", branchId))
      .collect();
    const activeCustomers = customers.filter(customer => customer.isActive !== false);
    return activeCustomers.map(({ _id, name, phone }) => ({ _id, name, phone }));
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

export const profile = query({
  args: { id: v.id("customers") },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "view_customers");
    const customer = await ctx.db.get(args.id);
    if (!customer) throw new ConvexError("العميل غير موجود");
    assertBranchAccess(user, customer);
    const [invoices, orders, repairs, deliveries, ledger, balances, category] = await Promise.all([
      ctx.db.query("invoices").withIndex("by_customer", q => q.eq("customerId", customer._id)).collect(),
      ctx.db.query("orders").withIndex("by_customer", q => q.eq("customerId", customer._id)).collect(),
      ctx.db.query("repairs").withIndex("by_customer", q => q.eq("customerId", customer._id)).collect(),
      ctx.db.query("deliveries").collect().then(rows => rows.filter(row => row.customerId === customer._id)),
      customer.branchId ? ctx.db.query("customerLedgerEntries").withIndex("by_customer_branch_date", q => q.eq("customerId", customer._id).eq("branchId", customer.branchId!)).order("desc").take(200) : Promise.resolve([]),
      customer.branchId ? ctx.db.query("customerBalances").withIndex("by_customer_branch", q => q.eq("customerId", customer._id).eq("branchId", customer.branchId!)).unique() : Promise.resolve(null),
      customer.categoryId ? ctx.db.get(customer.categoryId) : Promise.resolve(null),
    ]);
    return { customer: { ...customer, categoryName: category?.name }, balance: balances, invoices, orders, repairs, deliveries, ledger };
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
    categoryId: v.optional(v.id("customerCategories")),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "create_customers");
    const branchId = resolveWriteBranch(user, args.branchId);
    const normalized = customerData(args);
    await assertUniqueCustomerPhone(ctx, branchId, normalized.phone);
    const id = await ctx.db.insert("customers", {
      ...normalized,
      branchId,
      balance: 0,
      totalPurchases: 0,
      isActive: true,
      categoryId: args.categoryId,
    });
    const financeSettings = await ctx.db.query("financeSettings").first();
    if (financeSettings?.isInitialized && branchId) await initializeCustomerBalance(ctx, user, { customerId: id, branchId, receivableBalance: 0, advanceBalance: 0, totalPurchases: 0, date: financeSettings.cutoverDate, requestId: `new-customer:${id}`, notes: "تهيئة دفتر عميل جديد" });
    await logAction(ctx, user, {
      action: "create",
      module: "customers",
      recordId: id,
      recordLabel: normalized.name,
      details: `إضافة عميل جديد: ${normalized.name} - ${normalized.phone}`,
      branchId,
      after: { name: normalized.name, phoneLast4: normalized.phone.slice(-4), hasEmail: Boolean(normalized.email), hasAddress: Boolean(normalized.address), hasNotes: Boolean(normalized.notes), isActive: true },
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
    categoryId: v.optional(v.id("customerCategories")),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "edit_customers");
    const { id } = args;
    const customer = await ctx.db.get(id);
    if (!customer) throw new ConvexError("العميل غير موجود");
    assertBranchAccess(user, customer);
    const normalized = {
      ...customerData({
      name: args.name ?? customer.name,
      phone: args.phone ?? customer.phone,
      email: args.email !== undefined ? args.email : customer.email,
      address: args.address !== undefined ? args.address : customer.address,
      notes: args.notes !== undefined ? args.notes : customer.notes,
      }),
      categoryId: args.categoryId ?? customer.categoryId,
    };
    await assertUniqueCustomerPhone(
      ctx,
      customer.branchId,
      normalized.phone,
      customer._id,
    );
    const customerUnchanged =
      normalized.name === customer.name &&
      normalized.phone === customer.phone &&
      normalized.email === customer.email &&
      normalized.address === customer.address &&
      normalized.notes === customer.notes &&
      normalized.categoryId === customer.categoryId;
    if (customerUnchanged) return;
    await ctx.db.patch(id, normalized);
    await logAction(ctx, user, {
      action: "update",
      module: "customers",
      recordId: id,
      recordLabel: normalized.name,
      details: `تحديث بيانات العميل: ${customer.name} ← ${normalized.name}`,
      branchId: customer.branchId,
      before: { name: customer.name, phoneLast4: customer.phone.slice(-4), hasEmail: Boolean(customer.email), hasAddress: Boolean(customer.address), hasNotes: Boolean(customer.notes) },
      after: { name: normalized.name, phoneLast4: normalized.phone.slice(-4), hasEmail: Boolean(normalized.email), hasAddress: Boolean(normalized.address), hasNotes: Boolean(normalized.notes) },
    });
  },
});

export const setActive = mutation({
  args: { id: v.id("customers"), isActive: v.boolean() },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "delete_customers");
    const customer = await ctx.db.get(args.id);
    if (!customer) throw new ConvexError("العميل غير موجود");
    assertBranchAccess(user, customer);
    if (customer.isActive === args.isActive) return;
    await ctx.db.patch(args.id, { isActive: args.isActive });
    await logAction(ctx, user, { action: args.isActive ? "activate" : "deactivate", module: "customers", recordId: args.id, recordLabel: customer.name, details: `${args.isActive ? "تفعيل" : "تعطيل"} العميل ${customer.name}`, branchId: customer.branchId, before: { isActive: customer.isActive ?? true }, after: { isActive: args.isActive } });
  },
});
export const remove = mutation({ args: { id: v.id("customers") }, handler: async () => { throw new ConvexError("استخدم تعطيل العميل بدلاً من الحذف"); } });
