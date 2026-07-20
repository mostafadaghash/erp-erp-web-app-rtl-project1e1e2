import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {
    module: v.optional(v.string()),
    action: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    if (args.module) {
      return await ctx.db
        .query("auditLogs")
        .withIndex("by_module", (q) => q.eq("module", args.module!))
        .order("desc")
        .take(limit);
    }
    if (args.action) {
      return await ctx.db
        .query("auditLogs")
        .withIndex("by_action", (q) => q.eq("action", args.action!))
        .order("desc")
        .take(limit);
    }
    return await ctx.db.query("auditLogs").order("desc").take(limit);
  },
});

export const log = mutation({
  args: {
    action: v.string(),       // create, update, delete, view
    module: v.string(),       // invoices, orders, repairs, etc.
    recordId: v.optional(v.string()),
    recordLabel: v.optional(v.string()),
    details: v.optional(v.string()),
    userName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("auditLogs", {
      ...args,
      userId: undefined,
    });
  },
});

export const clear = mutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("auditLogs").collect();
    for (const log of all) {
      await ctx.db.delete(log._id);
    }
    return all.length;
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("auditLogs").collect();
    const creates = all.filter(l => l.action === "create").length;
    const updates = all.filter(l => l.action === "update").length;
    const deletes = all.filter(l => l.action === "delete").length;
    const byModule: Record<string, number> = {};
    for (const log of all) {
      byModule[log.module] = (byModule[log.module] ?? 0) + 1;
    }
    return { total: all.length, creates, updates, deletes, byModule };
  },
});
