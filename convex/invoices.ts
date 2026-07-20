import { query, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { assertBranchAccess, filterByBranch, requireModulePermission, resolveWriteBranch, logAction, type AuthUser } from "./lib/auth";
import { calculateInvoiceTotals, roundMoney } from "../shared/businessRules";
import { changeProductStock } from "./lib/inventory";
import { INVENTORY_MOVEMENT_TYPES } from "../shared/inventoryRules";
import { nextDocumentNumber } from "./lib/documentNumbers";
import { requireActiveBranch, requireActiveCustomer } from "./lib/references";

type InvoiceItemInput = {
  productId: Id<"products">;
  productName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
};

async function prepareInvoice(
  ctx: MutationCtx,
  user: AuthUser,
  items: InvoiceItemInput[],
  overallDiscount: number,
  paid: number,
  stockCredits = new Map<string, number>(),
) {
  if (items.length === 0) throw new ConvexError("أضف منتجاً واحداً على الأقل");

  const requested = new Map<string, number>();
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new ConvexError("كمية المنتج يجب أن تكون عدداً صحيحاً أكبر من صفر");
    }
    if (!Number.isFinite(item.discount) || item.discount < 0 || item.discount > 100) {
      throw new ConvexError("خصم المنتج يجب أن يكون بين 0 و100%");
    }
    const key = String(item.productId);
    requested.set(key, (requested.get(key) ?? 0) + item.quantity);
  }

  const productDocs = new Map<string, any>();
  for (const item of items) {
    const key = String(item.productId);
    if (productDocs.has(key)) continue;
    const product = await ctx.db.get(item.productId);
    if (!product || !product.isActive) throw new ConvexError(`المنتج غير موجود أو غير نشط: ${item.productName}`);
    assertBranchAccess(user, product);
    const available = product.stock + (stockCredits.get(key) ?? 0);
    if (available < (requested.get(key) ?? 0)) {
      throw new ConvexError(`المخزون غير كافٍ للمنتج: ${product.name}`);
    }
    productDocs.set(key, product);
  }

  const normalizedItems = items.map((item) => {
    const product = productDocs.get(String(item.productId));
    const total = roundMoney(product.sellPrice * item.quantity * (1 - item.discount / 100));
    return {
      productId: item.productId,
      productName: product.name,
      quantity: item.quantity,
      unitPrice: product.sellPrice,
      discount: item.discount,
      total,
    };
  });
  const settings = await ctx.db.query("settings").first();
  const taxRate = settings?.taxRate ?? 14;
  let totals;
  try {
    totals = calculateInvoiceTotals(
      normalizedItems.map((item) => item.total),
      overallDiscount,
      taxRate,
      paid,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "invalid discount") throw new ConvexError("قيمة الخصم غير صالحة");
    if (message === "invalid tax rate") throw new ConvexError("نسبة الضريبة في الإعدادات غير صالحة");
    throw new ConvexError("المبلغ المدفوع غير صالح");
  }

  return { normalizedItems, productDocs, requested, ...totals };
}

async function adjustCustomer(
  ctx: MutationCtx,
  user: AuthUser,
  customerId: Id<"customers">,
  purchasesDelta: number,
  balanceDelta: number,
) {
  const customer = await ctx.db.get(customerId);
  if (!customer) throw new ConvexError("العميل غير موجود");
  assertBranchAccess(user, customer);
  if (customer.totalPurchases + purchasesDelta < 0 || customer.balance + balanceDelta < 0) throw new ConvexError("لا يمكن عكس رصيد العميل لأن البيانات الحالية غير متسقة");
  await ctx.db.patch(customerId, {
    totalPurchases: roundMoney(customer.totalPurchases + purchasesDelta),
    balance: roundMoney(customer.balance + balanceDelta),
  });
}

export const list = query({
  args: {
    status: v.optional(v.string()),
    customerId: v.optional(v.id("customers")),
    branchId: v.optional(v.id("branches")),
  },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "view_invoices", "invoices");
    let invoices = await ctx.db.query("invoices").collect();
    invoices = filterByBranch(invoices, user);
    if (args.branchId && user.role === "admin") {
      invoices = invoices.filter(i => i.branchId === args.branchId);
    }
    if (args.status) {
      invoices = invoices.filter(i => i.status === args.status);
    }
    if (args.customerId) {
      invoices = invoices.filter(i => i.customerId === args.customerId);
    }
    return invoices.sort((a, b) => b._creationTime - a._creationTime);
  },
});

export const get = query({
  args: { id: v.id("invoices") },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "view_invoices", "invoices");
    const invoice = await ctx.db.get(args.id);
    if (invoice) assertBranchAccess(user, invoice);
    return invoice;
  },
});

export const create = mutation({
  args: {
    customerId: v.optional(v.id("customers")),
    customerName: v.string(),
    customerPhone: v.optional(v.string()),
    items: v.array(v.object({
      productId: v.id("products"),
      productName: v.string(),
      quantity: v.number(),
      unitPrice: v.number(),
      discount: v.number(),
      total: v.number(),
    })),
    subtotal: v.number(),
    discount: v.number(),
    tax: v.number(),
    total: v.number(),
    paid: v.number(),
    paymentMethod: v.optional(v.string()),
    notes: v.optional(v.string()),
    branchId: v.optional(v.id("branches")),
  },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "create_invoices", "invoices");
    const branchId = resolveWriteBranch(user, args.branchId);
    await requireActiveBranch(ctx, branchId);
    let customerName = args.customerName.trim();
    let customerPhone = args.customerPhone;
    if (!customerName) throw new ConvexError("اسم العميل مطلوب");
    if (args.customerId) {
      const customer = await requireActiveCustomer(ctx, args.customerId, branchId);
      assertBranchAccess(user, customer);
      customerName = customer.name;
      customerPhone = customer.phone;
    }
    const prepared = await prepareInvoice(ctx, user, args.items, args.discount, args.paid);

    const invoiceNumber = await nextDocumentNumber(ctx, "invoice");

    const id = await ctx.db.insert("invoices", {
      invoiceNumber,
      customerId: args.customerId,
      customerName,
      customerPhone,
      items: prepared.normalizedItems,
      subtotal: prepared.subtotal,
      discount: prepared.discount,
      tax: prepared.tax,
      total: prepared.total,
      paid: prepared.paid,
      remaining: prepared.remaining,
      paymentMethod: args.paymentMethod ?? "cash",
      status: prepared.status,
      notes: args.notes,
      branchId,
      userId: user.userId,
      type: "sale",
    });

    for (const [productId, quantity] of prepared.requested) {
      const product = prepared.productDocs.get(productId);
      await changeProductStock(ctx, user, {
        productId: product._id,
        quantityDelta: -quantity,
        type: INVENTORY_MOVEMENT_TYPES.sale,
        reason: `بيع عبر الفاتورة ${invoiceNumber}`,
        referenceId: String(id),
        referenceType: "invoice",
      });
    }

    if (args.customerId) {
      await adjustCustomer(ctx, user, args.customerId, prepared.total, prepared.remaining);
    }

    await logAction(ctx, user, {
      action: "create",
      module: "invoices",
      recordId: id,
      recordLabel: invoiceNumber,
      details: `إنشاء فاتورة ${invoiceNumber} بقيمة ${prepared.total} للعميل ${customerName}`,
    });

    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("invoices"),
    customerId: v.optional(v.id("customers")),
    customerName: v.string(),
    customerPhone: v.optional(v.string()),
    items: v.array(v.object({
      productId: v.id("products"),
      productName: v.string(),
      quantity: v.number(),
      unitPrice: v.number(),
      discount: v.number(),
      total: v.number(),
    })),
    subtotal: v.number(),
    discount: v.number(),
    tax: v.number(),
    total: v.number(),
    paid: v.number(),
    paymentMethod: v.optional(v.string()),
    notes: v.optional(v.string()),
    branchId: v.optional(v.id("branches")),
  },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "edit_invoices", "invoices");
    const { id, ...data } = args;
    const inv = await ctx.db.get(id);
    if (!inv) throw new ConvexError("الفاتورة غير موجودة");
    assertBranchAccess(user, inv);
    if (inv.status === "cancelled") throw new ConvexError("لا يمكن تعديل فاتورة ملغاة");
    if (inv.paid > 0) throw new ConvexError("لا يمكن تعديل فاتورة مدفوعة قبل تنفيذ التسوية المالية");
    let customerName = data.customerName.trim();
    let customerPhone = data.customerPhone;
    if (!customerName) throw new ConvexError("اسم العميل مطلوب");
    if (data.customerId) {
      const customer = await ctx.db.get(data.customerId);
      if (!customer) throw new ConvexError("العميل غير موجود");
      assertBranchAccess(user, customer);
      customerName = customer.name;
      customerPhone = customer.phone;
    }
    const oldQuantities = new Map<string, number>();
    for (const item of inv.items) {
      const key = String(item.productId);
      oldQuantities.set(key, (oldQuantities.get(key) ?? 0) + item.quantity);
    }
    const prepared = await prepareInvoice(ctx, user, data.items, data.discount, data.paid, oldQuantities);
    const branchId = resolveWriteBranch(user, data.branchId ?? inv.branchId);
    await ctx.db.patch(id, {
      customerId: data.customerId,
      customerName,
      customerPhone,
      items: prepared.normalizedItems,
      subtotal: prepared.subtotal,
      discount: prepared.discount,
      tax: prepared.tax,
      total: prepared.total,
      paid: prepared.paid,
      remaining: prepared.remaining,
      paymentMethod: data.paymentMethod ?? "cash",
      status: prepared.status,
      notes: data.notes,
      branchId,
    });

    for (const [productId, quantity] of oldQuantities) {
      await changeProductStock(ctx, user, { productId: productId as Id<"products">, quantityDelta: quantity, type: INVENTORY_MOVEMENT_TYPES.saleReversal, reason: `عكس مخزون تعديل الفاتورة ${inv.invoiceNumber}`, referenceId: String(id), referenceType: "invoice" });
    }
    for (const [productId, quantity] of prepared.requested) {
      await changeProductStock(ctx, user, { productId: productId as Id<"products">, quantityDelta: -quantity, type: INVENTORY_MOVEMENT_TYPES.sale, reason: `بيع بعد تعديل الفاتورة ${inv.invoiceNumber}`, referenceId: String(id), referenceType: "invoice" });
    }

    if (inv.customerId === data.customerId && data.customerId) {
      await adjustCustomer(ctx, user, data.customerId, prepared.total - inv.total, prepared.remaining - inv.remaining);
    } else {
      if (inv.customerId) await adjustCustomer(ctx, user, inv.customerId, -inv.total, -inv.remaining);
      if (data.customerId) await adjustCustomer(ctx, user, data.customerId, prepared.total, prepared.remaining);
    }
    await logAction(ctx, user, {
      action: "update",
      module: "invoices",
      recordId: id,
      recordLabel: inv.invoiceNumber,
      details: `تعديل الفاتورة ${inv.invoiceNumber}`,
    });
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("invoices"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "edit_invoices", "invoices");
    const inv = await ctx.db.get(args.id);
    if (!inv) throw new ConvexError("الفاتورة غير موجودة");
    assertBranchAccess(user, inv);
    const expectedStatus = inv.remaining === 0 ? "paid" : inv.paid > 0 ? "partial" : "unpaid";
    if (args.status !== expectedStatus) {
      throw new ConvexError("حالة الفاتورة تُحتسب من المدفوع والمتبقي ولا يمكن تغييرها يدوياً");
    }
    await ctx.db.patch(args.id, { status: args.status });
    await logAction(ctx, user, {
      action: "update",
      module: "invoices",
      recordId: args.id,
      recordLabel: inv.invoiceNumber,
      details: `تغيير حالة الفاتورة ${inv.invoiceNumber} إلى ${args.status}`,
    });
  },
});

export const cancel = mutation({
  args: { id: v.id("invoices"), reason: v.string() },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "delete_invoices", "invoices");
    const inv = await ctx.db.get(args.id);
    if (!inv) throw new ConvexError("الفاتورة غير موجودة");
    assertBranchAccess(user, inv);
    const reason = args.reason.trim();
    if (!reason) throw new ConvexError("سبب الإلغاء مطلوب");
    if (inv.status === "cancelled") throw new ConvexError("الفاتورة ملغاة بالفعل");
    if (inv.paid > 0) throw new ConvexError("لا يمكن إلغاء فاتورة مدفوعة أو جزئية قبل تنفيذ الاسترداد المالي");
    const quantities = new Map<string, number>();
    for (const item of inv.items) {
      const key = String(item.productId);
      quantities.set(key, (quantities.get(key) ?? 0) + item.quantity);
    }
    for (const [productId, quantity] of quantities) {
      const product = await ctx.db.get(productId as Id<"products">);
      if (!product) throw new ConvexError("تعذر استعادة مخزون منتج محذوف من الفاتورة");
      assertBranchAccess(user, product);
      await changeProductStock(ctx, user, { productId: product._id, quantityDelta: quantity, type: INVENTORY_MOVEMENT_TYPES.saleReversal, reason: `عكس مخزون إلغاء الفاتورة ${inv.invoiceNumber}`, referenceId: String(args.id), referenceType: "invoice" });
    }
    if (inv.customerId) {
      await adjustCustomer(ctx, user, inv.customerId, -inv.total, -inv.remaining);
    }
    await ctx.db.patch(args.id, { status: "cancelled", cancelledAt: Date.now(), cancelledBy: user.userId, cancellationReason: reason });
    await logAction(ctx, user, {
      action: "cancel",
      module: "invoices",
      recordId: args.id,
      recordLabel: inv.invoiceNumber,
      details: `إلغاء الفاتورة ${inv.invoiceNumber}: ${reason}`,
    });
  },
});

export const remove = mutation({ args: { id: v.id("invoices") }, handler: async () => { throw new ConvexError("استخدم مسار إلغاء الفاتورة مع إدخال السبب"); } });

export const stats = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireModulePermission(ctx, "view_invoices", "invoices");
    let invoices = await ctx.db.query("invoices").collect();
    invoices = filterByBranch(invoices, user);
    const active = invoices.filter(i => i.status !== "cancelled");
    const totalRevenue = active.filter(i => i.status === "paid").reduce((s, i) => s + i.total, 0);
    const totalOutstanding = active.reduce((s, i) => s + (i.remaining ?? 0), 0);
    return {
      total: invoices.length,
      paid: invoices.filter(i => i.status === "paid").length,
      partial: invoices.filter(i => i.status === "partial").length,
      unpaid: invoices.filter(i => i.status === "unpaid").length,
      cancelled: invoices.filter(i => i.status === "cancelled").length,
      totalRevenue,
      totalOutstanding,
    };
  },
});
