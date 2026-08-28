import { mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";
import { assertBranchAccess, logAction, requireModulePermission, type AuthUser } from "./lib/auth";
import { changeProductStock } from "./lib/inventory";
import { postCustomerLedgerEntry } from "./lib/customerLedger.ts";
import { assertInvoiceNotLockedByActiveDelivery } from "./lib/deliveryLocks.ts";
import { allocateProportionally, INVENTORY_MOVEMENT_TYPES } from "../shared/inventoryRules";
import { calculateInvoiceTotals, deriveInvoiceStatus, roundMoney } from "../shared/businessRules";

type EditItem = {
  productId: Id<"products">;
  productName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
};

function invoiceTaxRate(invoice: { subtotal: number; discount: number; tax: number }) {
  const taxable = roundMoney(invoice.subtotal - invoice.discount);
  if (taxable <= 0) return 0;
  return Math.max(0, Math.min(100, (invoice.tax / taxable) * 100));
}

async function prepareEditedItems(
  ctx: MutationCtx,
  user: AuthUser,
  invoice: any,
  items: EditItem[],
) {
  if (items.length === 0) throw new ConvexError("يجب أن تحتوي الفاتورة على صنف واحد على الأقل");

  const oldQuantity = new Map<string, number>();
  const oldCost = new Map<string, number>();
  for (const item of invoice.items) {
    const key = String(item.productId);
    oldQuantity.set(key, (oldQuantity.get(key) ?? 0) + item.quantity);
    if (typeof item.unitCost === "number") oldCost.set(key, item.unitCost);
  }

  const requested = new Map<string, number>();
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new ConvexError("الكمية يجب أن تكون رقماً صحيحاً أكبر من صفر");
    }
    if (!Number.isFinite(item.unitPrice) || item.unitPrice <= 0) {
      throw new ConvexError("سعر الوحدة يجب أن يكون أكبر من صفر");
    }
    if (!Number.isFinite(item.discount) || item.discount < 0 || item.discount > 100) {
      throw new ConvexError("خصم الصنف يجب أن يكون بين 0 و100%");
    }
    const key = String(item.productId);
    requested.set(key, (requested.get(key) ?? 0) + item.quantity);
  }

  const products = new Map<string, any>();
  for (const item of items) {
    const key = String(item.productId);
    if (products.has(key)) continue;
    const product = await ctx.db.get(item.productId);
    if (!product || !product.isActive) throw new ConvexError(`الصنف غير موجود أو غير نشط: ${item.productName}`);
    assertBranchAccess(user, product);
    if (invoice.branchId && product.branchId !== invoice.branchId) {
      throw new ConvexError("الصنف لا ينتمي إلى فرع الفاتورة");
    }
    const available = product.stock + (oldQuantity.get(key) ?? 0);
    if (available < (requested.get(key) ?? 0)) {
      throw new ConvexError(`المخزون غير كافٍ للصنف: ${product.name}`);
    }
    products.set(key, product);
  }

  const normalizedItems = items.map((item) => {
    const key = String(item.productId);
    const product = products.get(key);
    const previousQty = oldQuantity.get(key) ?? 0;
    const previousUnitCost = oldCost.get(key) ?? product.costPrice;
    const retainedQty = Math.min(item.quantity, previousQty);
    const addedQty = Math.max(0, item.quantity - previousQty);
    const costTotal = roundMoney(retainedQty * previousUnitCost + addedQty * product.costPrice);
    const unitCost = roundMoney(costTotal / item.quantity);
    const total = roundMoney(item.unitPrice * item.quantity * (1 - item.discount / 100));
    return {
      productId: item.productId,
      productName: product.name,
      quantity: item.quantity,
      unitPrice: roundMoney(item.unitPrice),
      discount: item.discount,
      total,
      unitCost,
      costTotal,
      lineNetTotal: 0,
    };
  });

  const taxRate = invoiceTaxRate(invoice);
  let totals;
  try {
    totals = calculateInvoiceTotals(
      normalizedItems.map((item) => item.total),
      invoice.discount,
      taxRate,
      invoice.paid,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "invalid paid amount") {
      throw new ConvexError("القيمة الجديدة أقل من المبلغ المحصل؛ استرد فرق التحصيل أولاً ثم عدّل الفاتورة");
    }
    if (message === "invalid discount") {
      throw new ConvexError("قيمة الفاتورة بعد التعديل أصبحت أقل من الخصم المسجل");
    }
    throw new ConvexError("تعذر احتساب إجماليات الفاتورة بعد التعديل");
  }

  const allocations = allocateProportionally(totals.total, normalizedItems.map((item) => item.total));
  normalizedItems.forEach((item, index) => { item.lineNetTotal = allocations[index]; });

  return {
    oldQuantity,
    products,
    requested,
    normalizedItems,
    cogsTotal: roundMoney(normalizedItems.reduce((sum, item) => sum + item.costTotal, 0)),
    ...totals,
  };
}

export const updateItems = mutation({
  args: {
    invoiceId: v.id("invoices"),
    items: v.array(v.object({
      productId: v.id("products"),
      productName: v.string(),
      quantity: v.number(),
      unitPrice: v.number(),
      discount: v.number(),
    })),
    date: v.string(),
    requestId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "edit_invoices", "invoices");
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice || !invoice.branchId) throw new ConvexError("الفاتورة غير موجودة");
    assertBranchAccess(user, invoice);
    await assertInvoiceNotLockedByActiveDelivery(ctx, invoice._id);

    if (invoice.status === "cancelled") throw new ConvexError("لا يمكن تعديل فاتورة ملغاة");
    const existingReturn = await ctx.db
      .query("salesReturns")
      .withIndex("by_invoice", (q) => q.eq("invoiceId", invoice._id))
      .first();
    if (existingReturn || (invoice.creditedTotal ?? 0) > 0) {
      throw new ConvexError("لا يمكن تعديل أصناف فاتورة لها مرتجع؛ استخدم إشعار المرتجع أو أنشئ تصحيحاً جديداً");
    }

    const prepared = await prepareEditedItems(ctx, user, invoice, args.items);
    if (prepared.remaining > 0 && !invoice.customerId) {
      throw new ConvexError("بعد التعديل أصبحت الفاتورة آجلة؛ يجب ربطها بعميل مسجل أولاً");
    }

    for (const item of invoice.items) {
      if (typeof item.unitCost !== "number") {
        throw new ConvexError("الفاتورة القديمة بلا تكلفة تاريخية ولا يمكن تعديل أصنافها آلياً");
      }
      await changeProductStock(ctx, user, {
        productId: item.productId,
        quantityDelta: item.quantity,
        unitCost: item.unitCost,
        type: INVENTORY_MOVEMENT_TYPES.saleReversal,
        reason: `عكس مخزون تعديل الفاتورة ${invoice.invoiceNumber}`,
        referenceId: String(invoice._id),
        referenceType: "invoice",
      });
    }

    for (const item of prepared.normalizedItems) {
      await changeProductStock(ctx, user, {
        productId: item.productId,
        quantityDelta: -item.quantity,
        unitCost: item.unitCost,
        type: INVENTORY_MOVEMENT_TYPES.sale,
        reason: `بيع بعد تعديل الفاتورة ${invoice.invoiceNumber}`,
        referenceId: String(invoice._id),
        referenceType: "invoice",
      });
    }

    const previousTotal = invoice.netTotal ?? invoice.total;
    const nextStatus = deriveInvoiceStatus({
      netTotal: prepared.total,
      creditedTotal: 0,
      paid: prepared.paid,
      remaining: prepared.remaining,
    });

    await ctx.db.patch(invoice._id, {
      items: prepared.normalizedItems,
      subtotal: prepared.subtotal,
      discount: prepared.discount,
      tax: prepared.tax,
      total: prepared.total,
      cogsTotal: prepared.cogsTotal,
      creditedTotal: 0,
      netTotal: prepared.total,
      costingVersion: 1,
      paid: prepared.paid,
      remaining: prepared.remaining,
      status: nextStatus,
    });

    if (invoice.customerId) {
      const totalDelta = roundMoney(prepared.total - previousTotal);
      if (totalDelta !== 0) {
        await postCustomerLedgerEntry(ctx, user, {
          type: "invoice_adjustment",
          requestId: args.requestId,
          customerId: invoice.customerId,
          branchId: invoice.branchId,
          date: args.date,
          receivableDelta: totalDelta,
          advanceDelta: 0,
          purchasesDelta: totalDelta,
          description: `تعديل أصناف الفاتورة ${invoice.invoiceNumber}`,
          referenceType: "invoice",
          referenceId: String(invoice._id),
          referenceNumber: invoice.invoiceNumber,
        });
      }
    }

    await logAction(ctx, user, {
      action: "update",
      module: "invoices",
      recordId: String(invoice._id),
      recordLabel: invoice.invoiceNumber,
      details: `تعديل كميات/أسعار أصناف الفاتورة ${invoice.invoiceNumber}`,
      branchId: invoice.branchId,
      sourceType: "invoice",
      sourceId: String(invoice._id),
      sourceNumber: invoice.invoiceNumber,
      relatedType: invoice.customerId ? "customer" : undefined,
      relatedId: invoice.customerId ? String(invoice.customerId) : undefined,
      before: {
        total: previousTotal,
        paid: invoice.paid,
        remaining: invoice.remaining,
        itemCount: invoice.items.length,
      },
      after: {
        total: prepared.total,
        paid: prepared.paid,
        remaining: prepared.remaining,
        itemCount: prepared.normalizedItems.length,
      },
    });

    return {
      total: prepared.total,
      paid: prepared.paid,
      remaining: prepared.remaining,
      status: nextStatus,
    };
  },
});
