import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./lib/auth";

const LANGUAGE_MODULE = "user_preferences";
const LANGUAGE_ACTION = "set_language";
const languageValidator = v.union(v.literal("ar"), v.literal("en"));

export const getLanguage = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    const entries = await ctx.db
      .query("auditLogs")
      .withIndex("by_user_module_action", (q) =>
        q
          .eq("userId", user.userId)
          .eq("module", LANGUAGE_MODULE)
          .eq("action", LANGUAGE_ACTION),
      )
      .collect();

    const latest = entries
      .filter((entry) => entry.details === "ar" || entry.details === "en")
      .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))[0];

    return latest?.details === "ar" || latest?.details === "en"
      ? latest.details
      : null;
  },
});

export const setLanguage = mutation({
  args: { language: languageValidator },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const entries = await ctx.db
      .query("auditLogs")
      .withIndex("by_user_module_action", (q) =>
        q
          .eq("userId", user.userId)
          .eq("module", LANGUAGE_MODULE)
          .eq("action", LANGUAGE_ACTION),
      )
      .collect();

    const latest = entries
      .filter((entry) => entry.details === "ar" || entry.details === "en")
      .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))[0];

    if (latest?.details === args.language) return args.language;

    await ctx.db.insert("auditLogs", {
      userId: user.userId,
      userName: user.name,
      action: LANGUAGE_ACTION,
      module: LANGUAGE_MODULE,
      recordId: String(user.employeeId),
      recordLabel: user.name,
      details: args.language,
      branchId: user.branchId,
      timestamp: Date.now(),
    });

    return args.language;
  },
});
