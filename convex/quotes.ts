import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertBranchAccess, requirePermission, resolveWriteBranch } from "./lib/auth.ts";
import { nextDocumentNumber } from "./lib/documentNumbers.ts";
import { requireActiveCustomer } from "./lib/references.ts";
import { isValidIsoDate, roundMoney } from "../shared/businessRules.ts";

const itemValidator = v.object({
  productId: v.id("products"),
  quantity: v.number(),
  unitPrice: v.number(),
  discount: v.optional(v.number()),
});
const quoteStatus = v.union(v.literal("draft"), v.literal("sent"), v.literal("accepted"), v.literal("rejected"), v.literal("expired"), v.literal("cancelled"));

export const list = query({
  args: { branchId: v.optional(v.id("branches")), status: v.optional(quoteStatus) },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "view_quotes");
    const branchId = resolveWriteBranch(user, args.branchId);
    if (!branchId) throw new ConvexError("اختر الفرع");
    const rows = await ctx.db.query("quotes").withIndex("by_branch_date", q => q.eq("branchId", branchId)).order("desc").collect();
    return args.status ? rows.filter(row => row.status === args.status) : rows;
  },
});

export const get = query({
  args: { quoteId: v.id("quotes") },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "view_quotes");
    const quote = await ctx.db.get(args.quoteId);
    if (quote) assertBranchAccess(user, quote);
    return quote;
  },
});

export const create = mutation({
  args: {
    customerId: v.optional(v.id("customers")),
    customerName: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
    items: v.array(itemValidator),
    discount: v.optional(v.number()),
    tax: v.optional(v.number()),
    date: v.string(),
    validUntil: v.optional(v.string()),
    notes: v.optional(v.string()),
    branchId: v.optional(v.id("branches")),
    creationRequestId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "create_quotes");
    const branchId = resolveWriteBranch(user, args.branchId);
    if (!branchId) throw new ConvexError("اختر الفرع");
    const requestId = args.creationRequestId.trim();
    if (!requestId) throw new ConvexError("معرف إنشاء عرض السعر مطلوب");
    const previous = await ctx.db.query("quotes").withIndex("by_creation_request", q => q.eq("creationRequestId", requestId)).unique();
    if (previous) return previous._id;
    if (!isValidIsoDate(args.date) || (args.validUntil && !isValidIsoDate(args.validUntil))) throw new ConvexError("تاريخ عرض السعر غير صالح");
    if (args.validUntil && args.validUntil < args.date) throw new ConvexError("تاريخ الصلاحية يسبق تاريخ العرض");
    if (!args.items.length) throw new ConvexError("أضف صنفًا واحدًا على الأقل");
    const customer = args.customerId ? await requireActiveCustomer(ctx, args.customerId, branchId) : undefined;
    const customerName = customer?.name ?? args.customerName?.trim();
    if (!customerName) throw new ConvexError("اسم العميل مطلوب");
    const items = await Promise.all(args.items.map(async item => {
      const product = await ctx.db.get(item.productId);
      if (!product || product.isActive === false) throw new ConvexError("أحد أصناف العرض غير موجود أو معطل");
      if (product.branchId && product.branchId !== branchId) throw new ConvexError("أحد أصناف العرض يتبع فرعًا آخر");
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) throw new ConvexError("كمية الصنف غير صالحة");
      const unitPrice = roundMoney(item.unitPrice), discount = roundMoney(item.discount ?? 0);
      if (unitPrice < 0 || discount < 0 || discount > unitPrice * item.quantity) throw new ConvexError("سعر أو خصم الصنف غير صالح");
      return { productId: product._id, productName: product.name, quantity: item.quantity, unitPrice, discount, total: roundMoney(unitPrice * item.quantity - discount) };
    }));
    const subtotal = roundMoney(items.reduce((sum, item) => sum + item.total, 0));
    const discount = roundMoney(args.discount ?? 0), tax = roundMoney(args.tax ?? 0);
    if (discount < 0 || discount > subtotal || tax < 0) throw new ConvexError("الخصم أو الضريبة غير صالحين");
    const quoteNumber = await nextDocumentNumber(ctx, "quote", new Date(`${args.date}T00:00:00Z`));
    const now = Date.now();
    return await ctx.db.insert("quotes", {
      quoteNumber,
      customerId: customer?._id,
      customerName,
      customerPhone: customer?.phone ?? (args.customerPhone?.trim() || undefined),
      items,
      subtotal,
      discount,
      tax,
      total: roundMoney(subtotal - discount + tax),
      status: "draft",
      validUntil: args.validUntil,
      notes: args.notes?.trim() || undefined,
      date: args.date,
      branchId,
      creationRequestId: requestId,
      createdBy: user.userId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateStatus = mutation({
  args: { quoteId: v.id("quotes"), status: quoteStatus },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "edit_quotes");
    const quote = await ctx.db.get(args.quoteId);
    if (!quote) throw new ConvexError("عرض السعر غير موجود");
    assertBranchAccess(user, quote);
    await ctx.db.patch(quote._id, { status: args.status, updatedAt: Date.now() });
  },
});

export const printData = query({
  args: { quoteId: v.id("quotes") },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "print_quotes");
    const quote = await ctx.db.get(args.quoteId);
    if (!quote) throw new ConvexError("عرض السعر غير موجود");
    assertBranchAccess(user, quote);
    const branch = await ctx.db.get(quote.branchId);
    return { ...quote, branchName: branch?.name ?? "—" };
  },
});
