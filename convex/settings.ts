import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  args: {},
  handler: async (ctx) => {
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
    const existing = await ctx.db.query("settings").first();
    if (existing) {
      await ctx.db.patch(existing._id, args);
    } else {
      await ctx.db.insert("settings", args);
    }
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
    const existing = await ctx.db.query("settings").first();
    if (existing) {
      await ctx.db.patch(existing._id, { modules: args.modules });
    } else {
      await ctx.db.insert("settings", {
        storeName: "تك ستور ERP",
        storeType: "electronics",
        primaryColor: "#6366f1",
        secondaryColor: "#8b5cf6",
        currency: "EGP",
        taxRate: 0,
        modules: args.modules,
      });
    }
  },
});
