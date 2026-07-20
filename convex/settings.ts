import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireAdmin, logAction } from "./lib/auth";

export const get = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const settings = await ctx.db.query("settings").first();
    return settings;
  },
});

export const upsert = mutation({
  args: {
    storeName: v.string(),
    storeType: v.string(),
    primaryColor: v.string(),
    secondaryColor: v.string(),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    currency: v.string(),
    taxRate: v.number(),
    whatsappNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx);
    const existing = await ctx.db.query("settings").first();
    let id;
    if (existing) {
      await ctx.db.patch(existing._id, args);
      id = existing._id;
    } else {
      id = await ctx.db.insert("settings", args);
    }
    await logAction(ctx, user, {
      action: "update",
      module: "settings",
      recordId: id,
      recordLabel: args.storeName,
      details: `تحديث إعدادات المتجر: ${args.storeName}`,
    });
  },
});

export const updateModules = mutation({
  args: {
    modules: v.object({
      invoices:   v.boolean(),
      orders:     v.boolean(),
      deliveries: v.boolean(),
      repairs:    v.boolean(),
      expenses:   v.boolean(),
      suppliers:  v.boolean(),
      shipments:  v.boolean(),
      crm:        v.boolean(),
      branches:   v.boolean(),
      employees:  v.boolean(),
      reports:    v.boolean(),
    }),
  },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx);
    const existing = await ctx.db.query("settings").first();
    let id;
    if (existing) {
      await ctx.db.patch(existing._id, { modules: args.modules });
      id = existing._id;
    } else {
      id = await ctx.db.insert("settings", {
        storeName: "تك ستور ERP",
        storeType: "electronics",
        primaryColor: "#6366f1",
        secondaryColor: "#8b5cf6",
        currency: "EGP",
        taxRate: 0,
        modules: args.modules,
      });
    }
    await logAction(ctx, user, {
      action: "update",
      module: "settings",
      recordId: id,
      recordLabel: "modules",
      details: `تحديث تفعيل الوحدات`,
    });
  },
});
