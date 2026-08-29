import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";
import {
  assertBranchAccess,
  logAction,
  requireModulePermission,
  requirePermission,
} from "./lib/auth";
import { changeProductStock } from "./lib/inventory";
import { postCustomerLedgerEntry } from "./lib/customerLedger";
import { postSupplierBalanceMovement } from "./lib/supplierLedger";
import { requireFinanceInitialized } from "./lib/finance";
import {
  INVENTORY_MOVEMENT_TYPES,
} from "../shared/inventoryRules";
import {
  deriveInvoiceStatus,
  roundMoney,
} from "../shared/businessRules";
import {
  inventoryValueForPurchaseReturn,
  purchaseReceiptAfterCredit,
  purchaseReceiptAfterReversal,
  totalPurchaseCredit,
} from "../shared/purchaseReturnRules";
import {
  postPurchaseReturnJournal,
  reversePurchaseReturnJournal,
} from "./lib/generalLedgerPurchases";

const correctionReason = (value: string) => {
  const reason = value.trim();
  if (!reason) throw new ConvexError("سبب التعديل مطلوب");
  if (reason.length > 500) throw new ConvexError("سبب التعديل طويل جداً");
  return reason;
};

const requestKey = (value: string) => {
  const key = value.trim();
  if (!key || key.length > 200) throw new ConvexError("معرف طلب التعديل غير صالح");
  return key;
};

export const editPurchaseOrder = mutation({
  args: {
    shipmentId: v.id("shipments"),
    items: v.array(v.object({
      productId: v.optional(v.id("products")),
      productName: v.string(),
      quantity: v.number(),
      unitCost: v.number(),
    })),
    shippingCost: v.number(),
    expectedDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    reason: v.string(),
    requestId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "edit_shipments", "shipments");
    const reason = correctionReason(args.reason);
    const requestId = requestKey(args.requestId);
    const shipment = await ctx.db.get(args.shipmentId);
    if (!shipment) throw new ConvexError("مستند المشتريات غير موجود");
    assertBranchAccess(user, shipment);
    if (shipment.status === "cancelled") throw new ConvexError("لا يمكن تعديل عملية شراء ملغاة");
    if (shipment.status === "arrived" || shipment.purchaseReceiptId) {
      throw new ConvexError("تم استلام هذه المشتريات وترحيلها للمخزون؛ استخدم مرتجع شراء أو عكس المستند بدلاً من تغيير التاريخ المالي مباشرة");
    }
    if (shipment.status !== "ordered" && shipment.status !== "in_transit") {
      throw new ConvexError("حالة مستند المشتريات لا تسمح بالتعديل");
    }
    if (!shipment.branchId) throw new ConvexError("مستند المشتريات بلا فرع");
    if (args.items.length === 0) throw new ConvexError("أضف صنفاً واحداً على الأقل");
    if (!Number.isFinite(args.shippingCost) || args.shippingCost < 0) {
      throw new ConvexError("تكلفة الشحن غير صالحة");
    }

    const items = [];
    for (const item of args.items) {
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new ConvexError("كمية الشراء يجب أن تكون عدداً صحيحاً أكبر من صفر");
      }
      if (!Number.isFinite(item.unitCost) || item.unitCost <= 0) {
        throw new ConvexError("تكلفة شراء الوحدة يجب أن تكون أكبر من صفر");
      }
      let productName = item.productName.trim();
      if (item.productId) {
        const product = await ctx.db.get(item.productId);
        if (!product || !product.isActive) throw new ConvexError(`الصنف غير موجود أو غير نشط: ${item.productName}`);
        assertBranchAccess(user, product);
        if (product.branchId !== shipment.branchId) throw new ConvexError("الصنف لا ينتمي إلى فرع مستند المشتريات");
        productName = product.name;
      }
      if (!productName) throw new ConvexError("اسم الصنف مطلوب");
      const unitCost = roundMoney(item.unitCost);
      items.push({
        productId: item.productId,
        productName,
        quantity: item.quantity,
        unitCost,
        total: roundMoney(item.quantity * unitCost),
      });
    }

    const totalCost = roundMoney(items.reduce((sum, item) => sum + item.total, 0));
    const shippingCost = roundMoney(args.shippingCost);
    const grandTotal = roundMoney(totalCost + shippingCost);

    await ctx.db.patch(shipment._id, {
      items,
      totalCost,
      shippingCost,
      grandTotal,
      expectedDate: args.expectedDate,
      notes: args.notes?.trim() || undefined,
    });

    await logAction(ctx, user, {
      action: "update",
      module: "shipments",
      recordId: String(shipment._id),
      recordLabel: shipment.shipmentNumber,
      details: `تصحيح مستند المشتريات ${shipment.shipmentNumber}: ${reason}`,
      branchId: shipment.branchId,
      sourceType: "shipment",
      sourceId: String(shipment._id),
      sourceNumber: shipment.shipmentNumber,
      relatedType: "supplier",
      relatedId: shipment.supplierId ? String(shipment.supplierId) : undefined,
      relatedNumber: shipment.supplierName,
      before: {
        requestId,
        itemsCount: shipment.items.length,
        totalCost: shipment.totalCost,
        shippingCost: shipment.shippingCost,
        grandTotal: shipment.grandTotal,
      },
      after: {
        correctionReason: reason,
        itemsCount: items.length,
        totalCost,
        shippingCost,
        grandTotal,
      },
    });

    return { totalCost, shippingCost, grandTotal };
  },
});

export const editSalesReturn = mutation({
  args: {
    salesReturnId: v.id("salesReturns"),
    items: v.array(v.object({
      productId: v.id("products"),
      quantity: v.number(),
      unitCredit: v.number(),
    })),
    reason: v.string(),
    date: v.string(),
    requestId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "create_sales_returns");
    const reason = correctionReason(args.reason);
    const requestId = requestKey(args.requestId);
    const note = await ctx.db.get(args.salesReturnId);
    if (!note) throw new ConvexError("مرتجع المبيعات غير موجود");
    assertBranchAccess(user, note);
    if (note.status !== "posted") throw new ConvexError("لا يمكن تعديل إشعار دائن معكوس");
    if (note.cashRefund > 0 || note.financialTransactionId) {
      throw new ConvexError("هذا المرتجع مرتبط برد نقدي؛ اعكس الإشعار ثم أنشئ المرتجع الصحيح حتى تظل حركة الخزينة قابلة للمراجعة");
    }
    if (args.items.length === 0) throw new ConvexError("يجب أن يحتوي المرتجع على صنف واحد على الأقل");
    await requireFinanceInitialized(ctx, args.date);

    const invoice = await ctx.db.get(note.invoiceId);
    if (!invoice || !invoice.branchId) throw new ConvexError("فاتورة المبيعات الأصلية غير موجودة");
    assertBranchAccess(user, invoice);
    if (!invoice.costingVersion || invoice.items.some((item) => item.lineNetTotal === undefined || item.unitCost === undefined)) {
      throw new ConvexError("الفاتورة الأصلية بلا تكلفة/صافي تاريخي كافٍ للتصحيح الآلي");
    }

    const otherNotes = (await ctx.db
      .query("salesReturns")
      .withIndex("by_invoice", (q) => q.eq("invoiceId", invoice._id))
      .collect())
      .filter((row) => row._id !== note._id && row.status === "posted");
    const returnedElsewhere = new Map<string, number>();
    for (const row of otherNotes) {
      for (const item of row.items) {
        const key = String(item.productId);
        returnedElsewhere.set(key, (returnedElsewhere.get(key) ?? 0) + item.quantityReturned);
      }
    }

    const seen = new Set<string>();
    const normalized = [];
    for (const requested of args.items) {
      const key = String(requested.productId);
      if (seen.has(key)) throw new ConvexError("لا يجوز تكرار الصنف داخل التعديل");
      seen.add(key);
      if (!Number.isInteger(requested.quantity) || requested.quantity <= 0) {
        throw new ConvexError("كمية المرتجع يجب أن تكون عدداً صحيحاً أكبر من صفر");
      }
      if (!Number.isFinite(requested.unitCredit) || requested.unitCredit <= 0) {
        throw new ConvexError("قيمة وحدة المرتجع يجب أن تكون أكبر من صفر");
      }
      const original = invoice.items.find((item) => item.productId === requested.productId);
      if (!original || original.lineNetTotal === undefined || original.unitCost === undefined) {
        throw new ConvexError("الصنف غير موجود في فاتورة المبيعات الأصلية");
      }
      const availableQuantity = original.quantity - (returnedElsewhere.get(key) ?? 0);
      if (requested.quantity > availableQuantity) {
        throw new ConvexError(`كمية المرتجع تتجاوز المتاح للصنف ${original.productName}`);
      }
      const maximumUnitCredit = roundMoney(original.lineNetTotal / original.quantity);
      const unitCredit = roundMoney(requested.unitCredit);
      if (unitCredit > maximumUnitCredit + 0.01) {
        throw new ConvexError(`قيمة مرتجع الوحدة للصنف ${original.productName} تتجاوز صافي قيمة الوحدة في الفاتورة الأصلية`);
      }
      normalized.push({
        productId: original.productId,
        productName: original.productName,
        quantityReturned: requested.quantity,
        unitPrice: unitCredit,
        creditAmount: roundMoney(unitCredit * requested.quantity),
        historicalUnitCost: original.unitCost,
        returnedCostTotal: roundMoney(original.unitCost * requested.quantity),
      });
    }

    const totalCredit = roundMoney(normalized.reduce((sum, item) => sum + item.creditAmount, 0));
    const baseCredited = roundMoney((invoice.creditedTotal ?? 0) - note.totalCredit);
    const baseNet = roundMoney((invoice.netTotal ?? invoice.total) + note.totalCredit);
    const basePaid = roundMoney(invoice.paid + note.cashRefund);
    const baseRemaining = roundMoney(invoice.remaining + note.debtReduction);
    const debtReduction = roundMoney(Math.min(baseRemaining, totalCredit));
    const cashRefund = roundMoney(totalCredit - debtReduction);
    if (cashRefund > 0) {
      throw new ConvexError("القيمة الجديدة ستنشئ رداً نقدياً؛ اعكس الإشعار الحالي وأنشئ إشعاراً جديداً مع اختيار حساب الرد");
    }

    for (const item of note.items) {
      await changeProductStock(ctx, user, {
        productId: item.productId,
        quantityDelta: -item.quantityReturned,
        unitCost: item.historicalUnitCost,
        type: INVENTORY_MOVEMENT_TYPES.sale,
        reason: `عكس أثر مرتجع قبل تصحيح ${note.creditNoteNumber}`,
        referenceId: String(note._id),
        referenceType: "sales_return_correction",
      });
    }
    for (const item of normalized) {
      await changeProductStock(ctx, user, {
        productId: item.productId,
        quantityDelta: item.quantityReturned,
        unitCost: item.historicalUnitCost,
        type: INVENTORY_MOVEMENT_TYPES.salesReturn,
        reason: `إعادة ترحيل مرتجع مصحح ${note.creditNoteNumber}`,
        referenceId: String(note._id),
        referenceType: "sales_return_correction",
      });
    }

    const creditedTotal = roundMoney(baseCredited + totalCredit);
    const netTotal = roundMoney(baseNet - totalCredit);
    const paid = roundMoney(basePaid - cashRefund);
    const remaining = roundMoney(baseRemaining - debtReduction);
    const status = deriveInvoiceStatus({ netTotal, creditedTotal, paid, remaining });

    await ctx.db.patch(note._id, {
      items: normalized,
      subtotal: totalCredit,
      totalCredit,
      totalCogsReversed: roundMoney(normalized.reduce((sum, item) => sum + item.returnedCostTotal, 0)),
      debtReduction,
      cashRefund,
    });
    await ctx.db.patch(invoice._id, { creditedTotal, netTotal, paid, remaining, status });

    if (invoice.customerId) {
      const receivableDelta = roundMoney(note.debtReduction - debtReduction);
      const purchasesDelta = roundMoney(note.totalCredit - totalCredit);
      if (receivableDelta !== 0 || purchasesDelta !== 0) {
        await postCustomerLedgerEntry(ctx, user, {
          type: "sales_return",
          requestId: `${requestId}:ledger`,
          customerId: invoice.customerId,
          branchId: invoice.branchId,
          date: args.date,
          receivableDelta,
          advanceDelta: 0,
          purchasesDelta,
          description: `تصحيح الإشعار الدائن ${note.creditNoteNumber}: ${reason}`,
          referenceType: "sales_return",
          referenceId: String(note._id),
          referenceNumber: note.creditNoteNumber,
        });
      }
    }

    await logAction(ctx, user, {
      action: "update",
      module: "sales_returns",
      recordId: String(note._id),
      recordLabel: note.creditNoteNumber,
      details: `تصحيح مرتجع المبيعات ${note.creditNoteNumber}: ${reason}`,
      branchId: note.branchId,
      sourceType: "sales_return",
      sourceId: String(note._id),
      sourceNumber: note.creditNoteNumber,
      relatedType: "invoice",
      relatedId: String(invoice._id),
      relatedNumber: invoice.invoiceNumber,
      before: {
        requestId,
        totalCredit: note.totalCredit,
        debtReduction: note.debtReduction,
        cashRefund: note.cashRefund,
        itemsCount: note.items.length,
      },
      after: {
        correctionReason: reason,
        totalCredit,
        debtReduction,
        cashRefund,
        itemsCount: normalized.length,
      },
    });

    return { totalCredit, debtReduction, cashRefund };
  },
});

export const editPurchaseReturn = mutation({
  args: {
    purchaseReturnId: v.id("purchaseReturns"),
    items: v.array(v.object({
      receiptItemIndex: v.number(),
      quantity: v.number(),
      unitCredit: v.number(),
    })),
    reason: v.string(),
    date: v.string(),
    requestId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "create_purchase_returns");
    const reason = correctionReason(args.reason);
    const requestId = requestKey(args.requestId);
    const row = await ctx.db.get(args.purchaseReturnId);
    if (!row) throw new ConvexError("مرتجع المشتريات غير موجود");
    assertBranchAccess(user, row);
    if (row.status !== "posted") throw new ConvexError("لا يمكن تعديل مرتجع مشتريات معكوس");
    if (row.cashRefund > 0 || row.financialTransactionId) {
      throw new ConvexError("هذا المرتجع مرتبط برد نقدي من المورد؛ اعكس المرتجع ثم أنشئ المستند الصحيح للحفاظ على أثر الخزينة");
    }
    if (!row.branchId) throw new ConvexError("مرتجع المشتريات بلا فرع");
    if (args.items.length === 0) throw new ConvexError("يجب أن يحتوي المرتجع على صنف واحد على الأقل");
    await requireFinanceInitialized(ctx, args.date);

    const receipt = await ctx.db.get(row.purchaseReceiptId);
    if (!receipt) throw new ConvexError("مستند الشراء الأصلي غير موجود");
    assertBranchAccess(user, receipt);

    const otherReturns = (await ctx.db
      .query("purchaseReturns")
      .withIndex("by_purchase_receipt", (q) => q.eq("purchaseReceiptId", receipt._id))
      .collect())
      .filter((candidate) => candidate._id !== row._id && candidate.status === "posted");
    const returnedElsewhere = new Map<number, number>();
    for (const candidate of otherReturns) {
      for (const item of candidate.items) {
        returnedElsewhere.set(
          item.receiptItemIndex,
          (returnedElsewhere.get(item.receiptItemIndex) ?? 0) + item.quantityReturned,
        );
      }
    }

    const seen = new Set<number>();
    const prepared: Array<{
      receiptItemIndex: number;
      productId: Id<"products">;
      productName: string;
      quantityReturned: number;
      historicalUnitCost: number;
      historicalLineTotal: number;
      goodsCreditAmount: number;
      historicalLandedUnitCost: number;
      inventoryValueRemoved: number;
    }> = [];
    let goodsCredit = 0;

    // First restore the previous return exactly, then value the corrected return
    // from the now-restored current inventory state.
    for (const item of row.items) {
      await changeProductStock(ctx, user, {
        productId: item.productId,
        quantityDelta: item.quantityReturned,
        unitCost: item.inventoryValueRemoved / item.quantityReturned,
        valueDelta: item.inventoryValueRemoved,
        type: INVENTORY_MOVEMENT_TYPES.purchaseReturn,
        reason: `عكس أثر مرتجع قبل تصحيح ${row.returnNumber}`,
        referenceId: String(row._id),
        referenceType: "purchase_return_correction",
      });
    }

    for (const requested of args.items) {
      if (!Number.isInteger(requested.receiptItemIndex) || requested.receiptItemIndex < 0 || seen.has(requested.receiptItemIndex)) {
        throw new ConvexError("رقم بند مرتجع المشتريات غير صالح أو مكرر");
      }
      seen.add(requested.receiptItemIndex);
      if (!Number.isInteger(requested.quantity) || requested.quantity <= 0) {
        throw new ConvexError("كمية المرتجع يجب أن تكون عدداً صحيحاً أكبر من صفر");
      }
      if (!Number.isFinite(requested.unitCredit) || requested.unitCredit <= 0) {
        throw new ConvexError("قيمة وحدة مرتجع الشراء يجب أن تكون أكبر من صفر");
      }
      const historical = receipt.items[requested.receiptItemIndex];
      if (!historical) throw new ConvexError("بند مستند الشراء الأصلي غير موجود");
      const available = historical.quantity - (returnedElsewhere.get(requested.receiptItemIndex) ?? 0);
      if (requested.quantity > available) throw new ConvexError(`كمية المرتجع تتجاوز المتاح للصنف ${historical.productName}`);
      const maxUnitCredit = roundMoney(historical.lineTotal / historical.quantity);
      const unitCredit = roundMoney(requested.unitCredit);
      if (unitCredit > maxUnitCredit + 0.01) {
        throw new ConvexError(`قيمة وحدة مرتجع ${historical.productName} تتجاوز قيمة الوحدة في مستند الشراء الأصلي`);
      }
      const product = await ctx.db.get(historical.productId);
      if (!product || product.branchId !== row.branchId) throw new ConvexError("الصنف غير موجود أو من فرع آخر");
      let removedValue;
      try {
        removedValue = inventoryValueForPurchaseReturn(
          product.stock,
          product.inventoryValue ?? roundMoney(product.stock * product.costPrice),
          requested.quantity,
        );
      } catch (error) {
        throw new ConvexError(error instanceof Error ? error.message : "مخزون الصنف لا يسمح بتعديل المرتجع");
      }
      const credit = roundMoney(unitCredit * requested.quantity);
      goodsCredit = roundMoney(goodsCredit + credit);
      const valuation = await changeProductStock(ctx, user, {
        productId: historical.productId,
        quantityDelta: -requested.quantity,
        unitCost: removedValue / requested.quantity,
        valueDelta: -removedValue,
        type: INVENTORY_MOVEMENT_TYPES.purchaseReturn,
        reason: `إعادة ترحيل مرتجع مصحح ${row.returnNumber}`,
        referenceId: String(row._id),
        referenceType: "purchase_return_correction",
      });
      prepared.push({
        receiptItemIndex: requested.receiptItemIndex,
        productId: historical.productId,
        productName: historical.productName,
        quantityReturned: requested.quantity,
        historicalUnitCost: unitCredit,
        historicalLineTotal: historical.lineTotal,
        goodsCreditAmount: credit,
        historicalLandedUnitCost: historical.landedUnitCost,
        inventoryValueRemoved: -valuation.valueDelta,
      });
    }

    const freightCredit = row.freightCredit;
    const totalCredit = totalPurchaseCredit(goodsCredit, freightCredit);
    let baseState;
    try {
      baseState = purchaseReceiptAfterReversal(
        receipt.netPayableAmount ?? receipt.payableAmount,
        receipt.paidAmount,
        receipt.remainingAmount,
        row.totalCredit,
        row.debtReduction,
        row.cashRefund,
      );
    } catch (error) {
      throw new ConvexError(error instanceof Error ? error.message : "تعذر استرجاع حالة مستند الشراء قبل المرتجع");
    }
    let nextState;
    try {
      nextState = purchaseReceiptAfterCredit(
        baseState.netPayableAmount,
        baseState.paidAmount,
        baseState.remainingAmount,
        totalCredit,
      );
    } catch (error) {
      throw new ConvexError(error instanceof Error ? error.message : "تعذر احتساب مستند الشراء بعد التصحيح");
    }
    if (nextState.cashRefund > 0) {
      throw new ConvexError("القيمة الجديدة ستنشئ رداً نقدياً من المورد؛ اعكس المرتجع ثم أنشئ مستنداً جديداً مع حساب الرد");
    }

    let reversedLedgerEntryId: Id<"supplierLedgerEntries"> | undefined;
    if (row.supplierLedgerEntryId) {
      const reversal = await postSupplierBalanceMovement(ctx, user, {
        type: "reversal",
        requestId: `${requestId}:old-ledger-reversal`,
        supplierId: row.supplierId,
        branchId: row.branchId,
        date: args.date,
        amountDelta: row.totalCredit,
        referenceType: "purchase_return",
        referenceId: String(row._id),
        referenceNumber: row.returnNumber,
        description: `عكس حركة المورد القديمة قبل تصحيح ${row.returnNumber}`,
        originalEntryId: row.supplierLedgerEntryId,
        reversalReason: reason,
        reversalDate: args.date,
      });
      reversedLedgerEntryId = reversal._id;
    }
    const newSupplierLedger = totalCredit > 0
      ? await postSupplierBalanceMovement(ctx, user, {
          type: "purchase_return",
          requestId: `${requestId}:new-ledger`,
          supplierId: row.supplierId,
          branchId: row.branchId,
          date: args.date,
          amountDelta: -totalCredit,
          referenceType: "purchase_return",
          referenceId: String(row._id),
          referenceNumber: row.returnNumber,
          description: `إعادة ترحيل مرتجع شراء مصحح ${row.returnNumber}`,
        })
      : undefined;

    const inventoryValueRemoved = roundMoney(prepared.reduce((sum, item) => sum + item.inventoryValueRemoved, 0));
    let reversalJournalId: Id<"journalEntries"> | undefined;
    if (row.journalEntryId) {
      const reversal = await reversePurchaseReturnJournal(ctx, user, {
        branchId: row.branchId,
        date: args.date,
        requestId: `${requestId}:journal-reversal`,
        referenceId: String(row._id),
        referenceNumber: row.returnNumber,
        originalEntryId: row.journalEntryId,
        reason,
        hasAccountingImpact: row.totalCredit !== 0 || row.inventoryValueRemoved !== 0,
      });
      reversalJournalId = reversal?._id;
    }
    const newJournal = await postPurchaseReturnJournal(ctx, user, {
      branchId: row.branchId,
      date: args.date,
      requestId: `${requestId}:journal-new`,
      referenceId: String(row._id),
      referenceNumber: row.returnNumber,
      totalCredit,
      inventoryValueRemoved,
    });

    await ctx.db.patch(receipt._id, {
      creditedTotal: roundMoney((receipt.creditedTotal ?? 0) - row.totalCredit + totalCredit),
      returnedGoodsTotal: roundMoney((receipt.returnedGoodsTotal ?? 0) - row.goodsCredit + goodsCredit),
      netPayableAmount: nextState.netPayableAmount,
      paidAmount: nextState.paidAmount,
      remainingAmount: nextState.remainingAmount,
      status: nextState.status,
    });
    await ctx.db.patch(row._id, {
      items: prepared,
      goodsCredit,
      totalCredit,
      inventoryValueRemoved,
      debtReduction: nextState.debtReduction,
      cashRefund: nextState.cashRefund,
      supplierLedgerEntryId: newSupplierLedger?._id,
      journalEntryId: newJournal?._id,
    });

    await logAction(ctx, user, {
      action: "update",
      module: "purchase_returns",
      recordId: String(row._id),
      recordLabel: row.returnNumber,
      details: `تصحيح مرتجع المشتريات ${row.returnNumber}: ${reason}`,
      branchId: row.branchId,
      sourceType: "purchase_return",
      sourceId: String(row._id),
      sourceNumber: row.returnNumber,
      relatedType: "purchase_receipt",
      relatedId: String(receipt._id),
      relatedNumber: receipt.receiptNumber,
      reversalOfId: row.journalEntryId ? String(row.journalEntryId) : undefined,
      journalEntryId: newJournal?._id ? String(newJournal._id) : undefined,
      before: {
        requestId,
        totalCredit: row.totalCredit,
        debtReduction: row.debtReduction,
        cashRefund: row.cashRefund,
        inventoryValueRemoved: row.inventoryValueRemoved,
        supplierLedgerEntryId: row.supplierLedgerEntryId ? String(row.supplierLedgerEntryId) : null,
      },
      after: {
        correctionReason: reason,
        totalCredit,
        debtReduction: nextState.debtReduction,
        cashRefund: nextState.cashRefund,
        inventoryValueRemoved,
        reversalSupplierLedgerEntryId: reversedLedgerEntryId ? String(reversedLedgerEntryId) : null,
        reversalJournalEntryId: reversalJournalId ? String(reversalJournalId) : null,
      },
    });

    return {
      totalCredit,
      debtReduction: nextState.debtReduction,
      cashRefund: nextState.cashRefund,
      inventoryValueRemoved,
    };
  },
});
