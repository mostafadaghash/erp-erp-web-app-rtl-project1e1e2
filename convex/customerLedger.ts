import { query, mutation } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v, ConvexError } from "convex/values";
import { requirePermission } from "./lib/auth";
import type { AuthUser } from "./lib/auth";
import type { Id } from "./_generated/dataModel";
import { deriveCustomerLedgerOpeningState, initializeCustomerBalance } from "./lib/customerLedger.ts";

function assertLedgerBranch(user: AuthUser, branchId: Id<"branches">) {
  if (user.role !== "admin" && user.role !== "accountant" && user.branchId !== branchId) throw new ConvexError("ليس لديك صلاحية للوصول إلى دفتر هذا الفرع");
}

export const availableBranches = query({ args: {}, handler: async ctx => {
  const user = await requirePermission(ctx, "view_customer_ledger");
  if (user.role === "admin" || user.role === "accountant") return (await ctx.db.query("branches").collect()).filter(x => x.isActive).map(({ _id, name }) => ({ _id, name }));
  if (!user.branchId) return [];
  const branch = await ctx.db.get(user.branchId); return branch?.isActive ? [{ _id: branch._id, name: branch.name }] : [];
} });

export const initializeOpeningBalance = mutation({ args: { customerId: v.id("customers"), branchId: v.id("branches"), receivableBalance: v.number(), advanceBalance: v.number(), totalPurchases: v.number(), date: v.string(), requestId: v.string(), notes: v.optional(v.string()) }, handler: async (ctx, args) => {
  const user = await requirePermission(ctx, "initialize_customer_ledger"); assertLedgerBranch(user, args.branchId); return initializeCustomerBalance(ctx, user, args);
} });

export const branchBalances = query({ args: { branchId: v.id("branches") }, handler: async (ctx, args) => {
  const user = await requirePermission(ctx, "view_customer_ledger"); assertLedgerBranch(user, args.branchId);
  const balances = await ctx.db.query("customerBalances").withIndex("by_branch", q => q.eq("branchId", args.branchId)).collect();
  return Promise.all(balances.map(async balance => { const customer = await ctx.db.get(balance.customerId); return { customerId: balance.customerId, customerName: customer?.name ?? "عميل غير معروف", phone: customer?.phone ?? "", branchId: balance.branchId, receivableBalance: balance.receivableBalance, advanceBalance: balance.advanceBalance, totalPurchases: balance.totalPurchases, requiresOpeningBalance: balance.openingBalancePostedAt === undefined }; }));
} });

export const customerOptions = query({ args: { branchId: v.id("branches") }, handler: async (ctx, args) => {
  const user = await requirePermission(ctx, "view_customer_ledger"); assertLedgerBranch(user, args.branchId);
  const branch = await ctx.db.get(args.branchId); if (!branch?.isActive) throw new ConvexError("الفرع غير موجود أو معطل");
  const settings = await ctx.db.query("financeSettings").first();
  const customers = await ctx.db.query("customers").withIndex("by_branch", q => q.eq("branchId", args.branchId)).collect();
  return { cutoverDate: settings?.cutoverDate ?? null, customers: await Promise.all(customers.map(async customer => {
    const balance = await ctx.db.query("customerBalances").withIndex("by_customer_branch", q => q.eq("customerId", customer._id).eq("branchId", args.branchId)).unique();
    const policy = await deriveCustomerLedgerOpeningState(ctx, customer._id, args.branchId);
    return { customerId: customer._id, customerName: customer.name, phone: customer.phone, isActive: customer.isActive !== false, branchId: args.branchId, receivableBalance: balance?.receivableBalance ?? 0, advanceBalance: balance?.advanceBalance ?? 0, totalPurchases: balance?.totalPurchases ?? 0, ...policy };
  })) };
} });

export const ledger = query({ args: { customerId: v.id("customers"), branchId: v.id("branches"), paginationOpts: paginationOptsValidator }, handler: async (ctx, args) => {
  const user = await requirePermission(ctx, "view_customer_ledger"); assertLedgerBranch(user, args.branchId);
  const customer = await ctx.db.get(args.customerId); if (!customer || customer.branchId !== args.branchId) throw new ConvexError("العميل لا ينتمي إلى الفرع");
  const result = await ctx.db.query("customerLedgerEntries").withIndex("by_customer_branch_date", q => q.eq("customerId", args.customerId).eq("branchId", args.branchId)).order("desc").paginate(args.paginationOpts);
  return { ...result, page: result.page.map(entry => ({ id: entry._id, entryNumber: entry.entryNumber, type: entry.type, status: entry.status, date: entry.date, receivableDelta: entry.receivableDelta, advanceDelta: entry.advanceDelta, purchasesDelta: entry.purchasesDelta, receivableBefore: entry.receivableBefore, receivableAfter: entry.receivableAfter, advanceBefore: entry.advanceBefore, advanceAfter: entry.advanceAfter, totalPurchasesBefore: entry.totalPurchasesBefore, totalPurchasesAfter: entry.totalPurchasesAfter, description: entry.description, referenceType: entry.referenceType, referenceNumber: entry.referenceNumber, createdAt: entry.createdAt })) };
} });

export const statementForPrint = query({ args: { customerId: v.id("customers"), branchId: v.id("branches") }, handler: async (ctx, args) => {
  const user = await requirePermission(ctx, "print_customer_statements"); assertLedgerBranch(user, args.branchId);
  const customer = await ctx.db.get(args.customerId), branch = await ctx.db.get(args.branchId); if (!customer || customer.branchId !== args.branchId || !branch) throw new ConvexError("بيانات كشف الحساب غير صحيحة");
  const entries = await ctx.db.query("customerLedgerEntries").withIndex("by_customer_branch_date", q => q.eq("customerId", args.customerId).eq("branchId", args.branchId)).order("asc").collect();
  const safeEntries = await Promise.all(entries.map(async entry => { let profile = await ctx.db.query("userProfiles").withIndex("by_user", q => q.eq("userId", entry.createdBy)).first(); if (!profile) profile = await ctx.db.query("userProfiles").withIndex("by_token", q => q.eq("tokenIdentifier", entry.createdBy)).first(); return { entryNumber: entry.entryNumber, type: entry.type, status: entry.status, date: entry.date, receivableDelta: entry.receivableDelta, advanceDelta: entry.advanceDelta, purchasesDelta: entry.purchasesDelta, receivableBefore: entry.receivableBefore, receivableAfter: entry.receivableAfter, advanceBefore: entry.advanceBefore, advanceAfter: entry.advanceAfter, totalPurchasesBefore: entry.totalPurchasesBefore, totalPurchasesAfter: entry.totalPurchasesAfter, description: entry.description, referenceType: entry.referenceType, referenceNumber: entry.referenceNumber, createdByName: profile?.name ?? "مستخدم غير معروف" }; }));
  const opening = entries.find(x => x.type === "opening_balance"), balance = await ctx.db.query("customerBalances").withIndex("by_customer_branch", q => q.eq("customerId", args.customerId).eq("branchId", args.branchId)).unique();
  return { customer: { name: customer.name, phone: customer.phone, address: customer.address }, branch: { name: branch.name, address: branch.address, phone: branch.phone }, openingBalance: { receivable: opening?.receivableAfter ?? 0, advance: opening?.advanceAfter ?? 0, totalPurchases: opening?.totalPurchasesAfter ?? 0 }, entries: safeEntries, balances: { receivable: balance?.receivableBalance ?? 0, advance: balance?.advanceBalance ?? 0, totalPurchases: balance?.totalPurchases ?? 0 }, totals: { receivableDebit: entries.reduce((sum, x) => sum + Math.max(x.receivableDelta, 0), 0), receivableCredit: entries.reduce((sum, x) => sum + Math.max(-x.receivableDelta, 0), 0), advanceIn: entries.reduce((sum, x) => sum + Math.max(x.advanceDelta, 0), 0), advanceOut: entries.reduce((sum, x) => sum + Math.max(-x.advanceDelta, 0), 0), purchasesIn: entries.reduce((sum, x) => sum + Math.max(x.purchasesDelta, 0), 0), purchasesOut: entries.reduce((sum, x) => sum + Math.max(-x.purchasesDelta, 0), 0) } };
} });

export const legacyReview = query({ args: { branchId: v.id("branches") }, handler: async (ctx, args) => {
  const user = await requirePermission(ctx, "initialize_customer_ledger"); assertLedgerBranch(user, args.branchId);
  const customers = await ctx.db.query("customers").withIndex("by_branch", q => q.eq("branchId", args.branchId)).collect();
  return (await Promise.all(customers.map(async customer => { const policy = await deriveCustomerLedgerOpeningState(ctx, customer._id, args.branchId); return { customerId: customer._id, customerName: customer.name, phone: customer.phone, branchId: args.branchId, legacyBalance: customer.balance, legacyTotalPurchases: customer.totalPurchases, hasLegacyDocuments: policy.legacyReasons.includes("unposted_documents"), requiresOpeningBalance: policy.requiresOpeningReview, openingState: policy.openingState, legacyReasons: policy.legacyReasons }; }))).filter(x => x.requiresOpeningBalance);
} });
