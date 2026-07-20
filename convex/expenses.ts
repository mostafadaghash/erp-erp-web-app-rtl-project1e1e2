import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { isValidIsoDate, PAYMENT_METHODS, roundMoney } from "../shared/businessRules";
import { requireActiveBranch } from "./lib/references";
import { assertBranchAccess, requireModulePermission, filterByBranch, resolveWriteBranch, logAction } from "./lib/auth";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireModulePermission(ctx, "view_expenses", "expenses");
    const all = await ctx.db.query("expenses").order("desc").collect();
    return filterByBranch(all, user);
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    category: v.string(),
    amount: v.number(),
    date: v.string(),
    paymentMethod: v.string(),
    notes: v.optional(v.string()),
    branchId: v.optional(v.id("branches")),
  },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "create_expenses", "expenses");
    const branchId = resolveWriteBranch(user, args.branchId);
    await requireActiveBranch(ctx, branchId);
    const title = args.title.trim(), category = args.category.trim();
    if (!title || !category) throw new ConvexError("العنوان والتصنيف مطلوبان");
    if (!Number.isFinite(args.amount) || args.amount <= 0) throw new ConvexError("المبلغ يجب أن يكون أكبر من صفر");
    if (!isValidIsoDate(args.date)) throw new ConvexError("تاريخ المصروف غير صالح");
    if (!PAYMENT_METHODS.includes(args.paymentMethod as typeof PAYMENT_METHODS[number])) throw new ConvexError("طريقة الدفع غير صالحة");
    const id = await ctx.db.insert("expenses", {
      ...args, title, category, amount: roundMoney(args.amount), notes: args.notes?.trim(),
      branchId, userId: user.userId, status: "active",
    });
    await logAction(ctx, user, {
      action: "create",
      module: "expenses",
      recordId: id,
      recordLabel: args.title,
      details: `تسجيل مصروف: ${args.title} - ${args.amount} (${args.category})`,
    });
    return id;
  },
});

export const voidExpense = mutation({
  args: { id: v.id("expenses"), reason: v.string() },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "delete_expenses", "expenses");
    const expense = await ctx.db.get(args.id);
    if (!expense) throw new ConvexError("المصروف غير موجود");
    assertBranchAccess(user, expense);
    const reason = args.reason.trim();
    if (!reason) throw new ConvexError("سبب الإبطال مطلوب");
    if (expense.status === "voided") throw new ConvexError("المصروف مبطل بالفعل");
    await ctx.db.patch(args.id, { status: "voided", voidedAt: Date.now(), voidedBy: user.userId, voidReason: reason });
    await logAction(ctx, user, { action: "void", module: "expenses", recordId: args.id, recordLabel: expense.title, details: `إبطال المصروف ${expense.title}: ${reason}` });
  },
});
export { voidExpense as void };
export const remove = mutation({ args: { id: v.id("expenses") }, handler: async () => { throw new ConvexError("استخدم مسار إبطال المصروف مع إدخال السبب"); } });

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireModulePermission(ctx, "view_expenses", "expenses");
    const all = await ctx.db.query("expenses").collect();
    const expenses = filterByBranch(all, user);
    const active = expenses.filter(e => e.status !== "voided");
    const today = new Date().toISOString().slice(0, 10);
    const todayExpenses = active.filter(e => e.date === today);
    return {
      total: active.reduce((s, e) => s + e.amount, 0),
      today: todayExpenses.reduce((s, e) => s + e.amount, 0),
      count: active.length,
      voided: expenses.filter(e => e.status === "voided").length,
    };
  },
});
