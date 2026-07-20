import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("expenses").order("desc").collect();
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
    return await ctx.db.insert("expenses", { ...args, userId: undefined });
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const expenses = await ctx.db.query("expenses").collect();
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
