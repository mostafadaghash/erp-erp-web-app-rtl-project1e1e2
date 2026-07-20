import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireAuth, requirePermission, filterByBranch, logAction } from "./lib/auth";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
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
    const user = await requirePermission(ctx, "manage_expenses");
    const branchId = args.branchId ?? (user.branchId as any);
    const id = await ctx.db.insert("expenses", {
      ...args,
      branchId,
      userId: user.userId,
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

export const remove = mutation({
  args: { id: v.id("expenses") },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "manage_expenses");
    const expense = await ctx.db.get(args.id);
    if (!expense) throw new ConvexError("المصروف غير موجود");
    await ctx.db.delete(args.id);
    await logAction(ctx, user, {
      action: "delete",
      module: "expenses",
      recordId: args.id,
      recordLabel: expense.title,
      details: `حذف مصروف: ${expense.title}`,
    });
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    const all = await ctx.db.query("expenses").collect();
    const expenses = filterByBranch(all, user);
    const today = new Date().toDateString();
    const todayExpenses = expenses.filter(e =>
      new Date(e._creationTime).toDateString() === today
    );
    return {
      total: expenses.reduce((s, e) => s + e.amount, 0),
      today: todayExpenses.reduce((s, e) => s + e.amount, 0),
      count: expenses.length,
    };
  },
});
