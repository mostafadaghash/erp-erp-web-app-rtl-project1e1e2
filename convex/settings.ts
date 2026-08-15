import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { requireAdmin, logAction } from "./lib/auth";

const DEFAULT_STORE_NAME = "DAGHASH ERP";
const DEFAULT_TAGLINE = "إدارة أعمالك بوضوح";
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const normalizeRequired = (value: string, label: string, maxLength: number) => {
  const normalized = value.trim();
  if (!normalized) throw new ConvexError(`${label} مطلوب`);
  if (normalized.length > maxLength) {
    throw new ConvexError(`${label} لا يمكن أن يتجاوز ${maxLength} حرفًا`);
  }
  return normalized;
};

const normalizeOptional = (value: string | undefined, maxLength: number) => {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (normalized.length > maxLength) {
    throw new ConvexError(`القيمة لا يمكن أن تتجاوز ${maxLength} حرفًا`);
  }
  return normalized;
};

const normalizeColor = (value: string, label: string) => {
  const normalized = value.trim();
  if (!HEX_COLOR.test(normalized)) {
    throw new ConvexError(`${label} يجب أن يكون بصيغة #RRGGBB`);
  }
  return normalized.toLowerCase();
};

const normalizeAssetUrl = (value: string | undefined, label: string) => {
  const normalized = normalizeOptional(value, 500);
  if (!normalized) return undefined;
  if (!normalized.startsWith("https://") && !normalized.startsWith("/")) {
    throw new ConvexError(`${label} يجب أن يكون رابط HTTPS أو مسارًا داخليًا`);
  }
  return normalized;
};

async function publicSettings(ctx: QueryCtx) {
  const settings = await ctx.db.query("settings").first();
  if (!settings) return null;
  const storedLogoUrl = settings.logoStorageId
    ? await ctx.storage.getUrl(settings.logoStorageId)
    : null;
  const storedFaviconUrl = settings.faviconStorageId
    ? await ctx.storage.getUrl(settings.faviconStorageId)
    : null;

  return {
    storeName: settings.storeName,
    shortName: settings.shortName,
    tagline: settings.tagline,
    legalName: settings.legalName,
    storeType: settings.storeType,
    primaryColor: settings.primaryColor,
    secondaryColor: settings.secondaryColor,
    logoUrl: storedLogoUrl ?? settings.logoUrl,
    faviconUrl: storedFaviconUrl ?? settings.faviconUrl,
    invoiceFooter: settings.invoiceFooter,
    phone: settings.phone,
    address: settings.address,
    currency: settings.currency,
    taxRate: settings.taxRate,
    whatsappNumber: settings.whatsappNumber,
    modules: settings.modules,
  };
}

// Public query — exposes presentation and business-contact fields only.
export const getPublic = query({
  args: {},
  handler: async (ctx) => publicSettings(ctx),
});

// Admin-only query used by the White Label settings screen.
export const get = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const settings = await ctx.db.query("settings").first();
    if (!settings) return null;
    const resolved = await publicSettings(ctx);
    return {
      ...settings,
      logoPreviewUrl: resolved?.logoUrl,
      faviconPreviewUrl: resolved?.faviconUrl,
    };
  },
});

export const upsert = mutation({
  args: {
    storeName: v.string(),
    shortName: v.optional(v.string()),
    tagline: v.optional(v.string()),
    legalName: v.optional(v.string()),
    storeType: v.string(),
    primaryColor: v.string(),
    secondaryColor: v.string(),
    logoUrl: v.optional(v.string()),
    faviconUrl: v.optional(v.string()),
    invoiceFooter: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    currency: v.string(),
    taxRate: v.number(),
    whatsappNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx);
    if (!Number.isFinite(args.taxRate) || args.taxRate < 0 || args.taxRate > 100) {
      throw new ConvexError("نسبة الضريبة يجب أن تكون بين 0 و100");
    }

    const normalizedArgs = {
      storeName: normalizeRequired(args.storeName, "اسم النظام", 100),
      shortName: normalizeOptional(args.shortName, 30),
      tagline: normalizeOptional(args.tagline, 120) ?? DEFAULT_TAGLINE,
      legalName: normalizeOptional(args.legalName, 160),
      storeType: normalizeRequired(args.storeType, "نوع النشاط", 60),
      primaryColor: normalizeColor(args.primaryColor, "اللون الرئيسي"),
      secondaryColor: normalizeColor(args.secondaryColor, "اللون الثانوي"),
      logoUrl: normalizeAssetUrl(args.logoUrl, "رابط الشعار"),
      faviconUrl: normalizeAssetUrl(args.faviconUrl, "رابط أيقونة المتصفح"),
      invoiceFooter: normalizeOptional(args.invoiceFooter, 300),
      phone: normalizeOptional(args.phone, 30),
      address: normalizeOptional(args.address, 250),
      currency: "EGP",
      taxRate: Math.round(args.taxRate * 100) / 100,
      whatsappNumber: normalizeOptional(args.whatsappNumber, 30),
    };

    const existing = await ctx.db.query("settings").first();
    const id = existing
      ? (await ctx.db.patch(existing._id, normalizedArgs), existing._id)
      : await ctx.db.insert("settings", normalizedArgs);

    await logAction(ctx, user, {
      action: "update",
      module: "settings",
      recordId: id,
      recordLabel: normalizedArgs.storeName,
      details: `تحديث هوية وإعدادات النظام: ${normalizedArgs.storeName}`,
      branchId: null,
      before: existing
        ? {
            storeName: existing.storeName,
            shortName: existing.shortName,
            tagline: existing.tagline,
            legalName: existing.legalName,
            storeType: existing.storeType,
            primaryColor: existing.primaryColor,
            secondaryColor: existing.secondaryColor,
            currency: existing.currency,
            taxRate: existing.taxRate,
          }
        : undefined,
      after: normalizedArgs,
    });
    return id;
  },
});

export const generateBrandAssetUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

export const setBrandAsset = mutation({
  args: {
    kind: v.union(v.literal("logo"), v.literal("favicon")),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx);
    const settings = await ctx.db.query("settings").first();
    if (!settings) throw new ConvexError("احفظ إعدادات الهوية أولًا");
    const assetUrl = await ctx.storage.getUrl(args.storageId);
    if (!assetUrl) throw new ConvexError("تعذر قراءة ملف الهوية المرفوع");

    const oldStorageId = args.kind === "logo"
      ? settings.logoStorageId
      : settings.faviconStorageId;
    const patch = args.kind === "logo"
      ? { logoStorageId: args.storageId }
      : { faviconStorageId: args.storageId };
    await ctx.db.patch(settings._id, patch);
    if (oldStorageId && oldStorageId !== args.storageId) {
      await ctx.storage.delete(oldStorageId);
    }

    await logAction(ctx, user, {
      action: "update",
      module: "settings",
      recordId: settings._id,
      recordLabel: args.kind,
      details: args.kind === "logo" ? "تحديث شعار النظام" : "تحديث أيقونة المتصفح",
      branchId: null,
      before: oldStorageId ? { storageId: oldStorageId } : undefined,
      after: { storageId: args.storageId },
    });
  },
});

export const removeBrandAsset = mutation({
  args: { kind: v.union(v.literal("logo"), v.literal("favicon")) },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx);
    const settings = await ctx.db.query("settings").first();
    if (!settings) return;
    const storageId = args.kind === "logo"
      ? settings.logoStorageId
      : settings.faviconStorageId;
    await ctx.db.patch(
      settings._id,
      args.kind === "logo"
        ? { logoStorageId: undefined, logoUrl: undefined }
        : { faviconStorageId: undefined, faviconUrl: undefined },
    );
    if (storageId) await ctx.storage.delete(storageId);
    await logAction(ctx, user, {
      action: "update",
      module: "settings",
      recordId: settings._id,
      recordLabel: args.kind,
      details: args.kind === "logo" ? "إزالة شعار النظام" : "إزالة أيقونة المتصفح",
      branchId: null,
      before: storageId ? { storageId } : undefined,
      after: { removed: true },
    });
  },
});

export const updateModules = mutation({
  args: {
    modules: v.object({
      invoices: v.boolean(),
      orders: v.boolean(),
      deliveries: v.boolean(),
      repairs: v.boolean(),
      expenses: v.boolean(),
      suppliers: v.boolean(),
      shipments: v.boolean(),
      crm: v.boolean(),
      branches: v.boolean(),
      employees: v.boolean(),
      reports: v.boolean(),
    }),
  },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx);
    const existing = await ctx.db.query("settings").first();
    const id = existing
      ? (await ctx.db.patch(existing._id, { modules: args.modules }), existing._id)
      : await ctx.db.insert("settings", {
          storeName: DEFAULT_STORE_NAME,
          shortName: "DAGHASH",
          tagline: DEFAULT_TAGLINE,
          storeType: "electronics",
          primaryColor: "#4f46e5",
          secondaryColor: "#7c3aed",
          currency: "EGP",
          taxRate: 0,
          modules: args.modules,
        });

    await logAction(ctx, user, {
      action: "update",
      module: "settings",
      recordId: id,
      recordLabel: "modules",
      details: "تحديث تفعيل وحدات النظام",
      branchId: null,
      before: existing?.modules,
      after: args.modules,
    });
  },
});
