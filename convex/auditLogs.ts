import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireAdmin, requirePermission } from "./lib/auth";

export const list = query({
  args: {
    module: v.optional(v.string()),
    action: v.optional(v.string()),
    userId: v.optional(v.id("userProfiles")),
    branchId: v.optional(v.id("branches")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "view_audit_logs");
    let logs = await ctx.db.query("auditLogs").collect();
    // Non-admins only see their own logs
    if (user.role !== "admin") {
      logs = logs.filter(l => l.userId === user.userId);
    }
    if (args.module) {
      logs = logs.filter(l => l.module === args.module);
    }
    if (args.action) {
      logs = logs.filter(l => l.action === args.action);
    }
    if (args.userId) {
      logs = logs.filter(l => l.userId === args.userId);
    }
    if (args.branchId) {
      logs = logs.filter(l => l.branchId === args.branchId);
    }
    logs = logs.sort((a, b) => b._creationTime - a._creationTime);
    if (args.limit) {
      logs = logs.slice(0, args.limit);
    }
    return logs;
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const user = await requirePermission(ctx, "view_audit_logs");
    let logs = await ctx.db.query("auditLogs").collect();
    if (user.role !== "admin") {
      logs = logs.filter(l => l.userId === user.userId);
    }
    const byModule: Record<string, number> = {};
    const byAction: Record<string, number> = {};
    for (const l of logs) {
      byModule[l.module] = (byModule[l.module] ?? 0) + 1;
      byAction[l.action] = (byAction[l.action] ?? 0) + 1;
    }
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    return {
      total: logs.length,
      last24h: logs.filter(l => l._creationTime > dayAgo).length,
      last7d: logs.filter(l => l._creationTime > weekAgo).length,
      byModule,
      byAction,
    };
  },
});

export const log = mutation({
  args: {
    action: v.string(),
    module: v.string(),
    recordId: v.optional(v.string()),
    recordLabel: v.optional(v.string()),
    details: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    return await ctx.db.insert("auditLogs", {
      ...args,
      userId: user.userId,
      userName: user.name,
      branchId: user.branchId as any,
    });
  },
});

export const clear = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const logs = await ctx.db.query("auditLogs").collect();
    for (const l of logs) {
      await ctx.db.delete(l._id);
    }
    return logs.length;
  },
});
