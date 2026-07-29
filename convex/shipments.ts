import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { assertBranchAccess, requireModulePermission, requirePermission, filterByBranch, resolveWriteBranch, logAction } from "./lib/auth";
import { canTransition, roundMoney, SHIPMENT_TRANSITIONS } from "../shared/businessRules";
import { changeProductStock } from "./lib/inventory";
import { allocateProportionally, INVENTORY_MOVEMENT_TYPES, roundAverageCost } from "../shared/inventoryRules";
import { nextDocumentNumber } from "./lib/documentNumbers";
import { requireActiveBranch, requireActiveSupplier } from "./lib/references";
import { postSupplierLedgerEntry } from "./lib/supplierLedger";
import { requireFinanceInitialized } from "./lib/finance";
import { isValidIsoDate } from "../shared/businessRules";
import { postPurchaseReceiptJournal } from "./lib/generalLedgerPurchases.ts";

export const list = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "view_shipments", "shipments");
    let shipments;
    if (args.status) {
      shipments = await ctx.db
        .query("shipments")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .collect();
    } else {
      shipments = await ctx.db.query("shipments").order("desc").collect();
    }
    return filterByBranch(shipments, user);
  },
});

export const get = query({
  args: { id: v.id("shipments") },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "view_shipments", "shipments");
    const shipment = await ctx.db.get(args.id);
    if (shipment) assertBranchAccess(user, shipment);
    return shipment;
  },
});

export const stats = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireModulePermission(ctx, "view_shipments", "shipments");
    const all = await ctx.db.query("shipments").collect();
    const s = filterByBranch(all, user);
    const ordered = s.filter((x) => x.status === "ordered").length;
    const inTransit = s.filter((x) => x.status === "in_transit").length;
    const arrived = s.filter((x) => x.status === "arrived").length;
    const totalCost = s.reduce((sum, sh) => sum + sh.grandTotal, 0);
    const pendingCost = s
      .filter((x) => x.status !== "arrived" && x.status !== "cancelled")
      .reduce((sum, sh) => sum + sh.grandTotal, 0);
    return { ordered, inTransit, arrived, totalCost, pendingCost, total: s.length };
  },
});

/** Least-privilege selector data needed by the shipment creation form. */
export const creationOptions = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireModulePermission(ctx, "create_shipments", "shipments");
    const products = filterByBranch(await ctx.db.query("products").collect(), user).filter((product) => product.isActive);
    const suppliers = (await ctx.db.query("suppliers").collect()).filter(supplier => supplier.isActive !== false);
    return {
      products: products.map(({ _id, name }) => ({ _id, name })),
      suppliers: suppliers.map(({ _id, name }) => ({ _id, name })),
    };
  },
});

export const create = mutation({
  args: {
    supplierName: v.string(),
    supplierId: v.id("suppliers"),
    items: v.array(v.object({
      productId: v.optional(v.id("products")),
      productName: v.string(),
      quantity: v.number(),
      unitCost: v.number(),
      total: v.number(),
    })),
    totalCost: v.number(),
    shippingCost: v.number(),
    grandTotal: v.number(),
    expectedDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    branchId: v.optional(v.id("branches")),
  },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "create_shipments", "shipments");
    const branchId = resolveWriteBranch(user, args.branchId);
    await requireActiveBranch(ctx, branchId);
    const supplier = await requireActiveSupplier(ctx, args.supplierId);
    const supplierName = supplier.name;
    if (!supplierName) throw new ConvexError("اسم المورد مطلوب");
    if (args.items.length === 0) throw new ConvexError("أضف منتجاً واحداً على الأقل");
    const items = [];
    for (const item of args.items) {
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) throw new ConvexError("كمية الشحنة يجب أن تكون عدداً صحيحاً أكبر من صفر");
      if (!Number.isFinite(item.unitCost) || item.unitCost < 0) throw new ConvexError("تكلفة الوحدة غير صالحة");
      let productName = item.productName.trim();
      if (item.productId) {
        const product = await ctx.db.get(item.productId);
        if (!product || !product.isActive) throw new ConvexError(`المنتج غير موجود أو غير نشط: ${item.productName}`);
        assertBranchAccess(user, product);
        if (branchId && product.branchId && product.branchId !== branchId) throw new ConvexError("المنتج لا ينتمي إلى فرع الشحنة");
        productName = product.name;
      }
      if (!productName) throw new ConvexError("اسم المنتج مطلوب");
      const unitCost = roundMoney(item.unitCost);
      items.push({ ...item, productName, unitCost, total: roundMoney(item.quantity * unitCost) });
    }
    if (!Number.isFinite(args.shippingCost) || args.shippingCost < 0) throw new ConvexError("تكلفة الشحن غير صالحة");
    const totalCost = roundMoney(items.reduce((sum, item) => sum + item.total, 0));
    const shippingCost = roundMoney(args.shippingCost);
    const grandTotal = roundMoney(totalCost + shippingCost);
    const shipmentNumber = await nextDocumentNumber(ctx, "shipment");
    const id = await ctx.db.insert("shipments", {
      supplierName,
      supplierId: args.supplierId,
      items,
      totalCost,
      shippingCost,
      grandTotal,
      expectedDate: args.expectedDate,
      notes: args.notes,
      branchId,
      shipmentNumber,
      status: "ordered",
    });
    await logAction(ctx, user, {
      action: "create",
      module: "shipments",
      recordId: id,
      recordLabel: shipmentNumber,
      details: `إنشاء شحنة واردة: ${shipmentNumber} من ${supplierName} بقيمة ${grandTotal}`,
    });
    return id;
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("shipments"),
    status: v.union(v.literal("ordered"), v.literal("in_transit"), v.literal("arrived"), v.literal("cancelled")),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "edit_shipments", "shipments");
    const shipment = await ctx.db.get(args.id);
    if (!shipment) throw new ConvexError("الشحنة غير موجودة");
    if (args.status === "arrived") throw new ConvexError("استخدم عملية استلام الشحنة لإنشاء مستند الشراء ومديونية المورد");
    assertBranchAccess(user, shipment);
    if (args.status === "cancelled" && !args.reason?.trim()) throw new ConvexError("سبب الإلغاء مطلوب");
    if (!canTransition(SHIPMENT_TRANSITIONS, shipment.status, args.status)) {
      throw new ConvexError(`لا يمكن تغيير حالة الشحنة من ${shipment.status} إلى ${args.status}`);
    }
    const patch: Record<string, string | number> = { status: args.status };
    if (args.status === "cancelled") { patch.cancelledAt = Date.now(); patch.cancelledBy = user.userId; patch.cancellationReason = args.reason?.trim() ?? ""; }
    await ctx.db.patch(args.id, patch);
    await logAction(ctx, user, {
      action: "update",
      module: "shipments",
      recordId: args.id,
      recordLabel: shipment.shipmentNumber,
      details: `تحديث حالة الشحنة ${shipment.shipmentNumber} إلى: ${args.status}`,
    });
  },
});

export const receive = mutation({
  args: { shipmentId: v.id("shipments"), receiptDate: v.string(), requestId: v.string(), externalInvoiceNumber: v.optional(v.string()), invoiceDate: v.optional(v.string()), dueDate: v.optional(v.string()), supplierFreightAmount: v.number() },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "edit_shipments", "shipments");
    await requirePermission(ctx, "post_purchase_receipts");
    const shipment = await ctx.db.get(args.shipmentId);
    if (!shipment) throw new ConvexError("الشحنة غير موجودة");
    assertBranchAccess(user, shipment);
    if (shipment.status === "arrived") {
      if (shipment.arrivalRequestId === args.requestId && shipment.purchaseReceiptId) return { purchaseReceiptId: shipment.purchaseReceiptId, receiptNumber: (await ctx.db.get(shipment.purchaseReceiptId))?.receiptNumber };
      throw new ConvexError("تم استلام هذه الشحنة مسبقاً بطلب مختلف");
    }
    if (shipment.status !== "in_transit") throw new ConvexError("يجب أن تكون الشحنة في الطريق قبل استلامها");
    if (!shipment.supplierId) throw new ConvexError("لا يمكن استلام شحنة دون مورد محدد");
    if (!shipment.branchId) throw new ConvexError("لا يمكن استلام شحنة دون فرع محدد");
    if (!isValidIsoDate(args.receiptDate)) throw new ConvexError("تاريخ الاستلام غير صالح");
    if (args.invoiceDate && !isValidIsoDate(args.invoiceDate)) throw new ConvexError("تاريخ الفاتورة غير صالح");
    if (args.dueDate && (!isValidIsoDate(args.dueDate) || args.dueDate < (args.invoiceDate ?? args.receiptDate))) throw new ConvexError("تاريخ الاستحقاق غير صالح");
    await requireFinanceInitialized(ctx, args.receiptDate);
    const supplier = await requireActiveSupplier(ctx, shipment.supplierId);
    await requireActiveBranch(ctx, shipment.branchId);
    const requestId = args.requestId.trim();
    if (!requestId || requestId.length > 200) throw new ConvexError("معرف طلب الاستلام غير صالح");
    const existingReceipt = await ctx.db.query("purchaseReceipts").withIndex("by_shipment", q => q.eq("shipmentId", args.shipmentId)).unique();
    if (existingReceipt) throw new ConvexError("يوجد مستند استلام لهذه الشحنة بالفعل");
    const externalInvoiceNumber = args.externalInvoiceNumber?.trim().replace(/\s+/g, " ");
    const externalInvoiceKey = externalInvoiceNumber ? `${shipment.supplierId}:${externalInvoiceNumber.toLocaleLowerCase("ar")}` : undefined;
    if (externalInvoiceKey && await ctx.db.query("purchaseReceipts").withIndex("by_external_invoice_key", q => q.eq("externalInvoiceKey", externalInvoiceKey)).first()) throw new ConvexError("رقم فاتورة المورد مستخدم مسبقاً لهذا المورد");
    const totalFreight = roundMoney(shipment.shippingCost);
    const supplierFreightAmount = roundMoney(args.supplierFreightAmount);
    if (!Number.isFinite(supplierFreightAmount) || supplierFreightAmount < 0 || supplierFreightAmount > totalFreight) throw new ConvexError("قيمة الشحن المستحقة للمورد غير صالحة");
    const goodsTotal = roundMoney(shipment.items.reduce((sum, item) => sum + roundMoney(item.quantity * item.unitCost), 0));
    // Paid lines carry freight by value. Quantities are only the fallback when
    // every goods line is free, since value weights would otherwise all be zero.
    const allocations = allocateProportionally(totalFreight, shipment.items.map(item => goodsTotal === 0 ? item.quantity : roundMoney(item.quantity * item.unitCost)));
    const items = [];
    for (const [index, item] of shipment.items.entries()) {
      if (!item.productId) throw new ConvexError("كل أصناف الشحنة يجب أن ترتبط بمنتج موجود");
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) throw new ConvexError("كمية الشحنة غير صالحة");
      const product = await ctx.db.get(item.productId);
      if (!product || !product.isActive) throw new ConvexError("منتج الشحنة غير موجود أو غير نشط");
      if (product.branchId !== shipment.branchId) throw new ConvexError("منتج الشحنة لا ينتمي إلى فرعها");
      const lineTotal = roundMoney(item.quantity * item.unitCost), allocatedFreight = allocations[index], inventoryValueAdded = roundMoney(lineTotal + allocatedFreight);
      items.push({ productId: item.productId, productName: product.name, quantity: item.quantity, unitCost: roundMoney(item.unitCost), lineTotal, allocatedFreight, landedUnitCost: roundAverageCost(inventoryValueAdded / item.quantity), inventoryValueAdded });
    }
    const totalLandedCost = roundMoney(goodsTotal + totalFreight), payableAmount = roundMoney(goodsTotal + supplierFreightAmount);
    const receiptNumber = await nextDocumentNumber(ctx, "purchaseReceipt", new Date(`${args.receiptDate}T00:00:00.000Z`));
    const purchaseReceiptId = await ctx.db.insert("purchaseReceipts", { receiptNumber, shipmentId: args.shipmentId, shipmentNumber: shipment.shipmentNumber, supplierId: shipment.supplierId, supplierName: supplier.name, externalInvoiceNumber, externalInvoiceKey, invoiceDate: args.invoiceDate, receiptDate: args.receiptDate, dueDate: args.dueDate, items, goodsTotal, totalFreight, supplierFreightAmount, externalFreightAmount: roundMoney(totalFreight - supplierFreightAmount), totalLandedCost, payableAmount, paidAmount: 0, remainingAmount: payableAmount, status: payableAmount === 0 ? "paid" : "unpaid", branchId: shipment.branchId, arrivalRequestId: requestId, createdBy: user.userId, createdAt: Date.now() });
    for (const item of items) await changeProductStock(ctx, user, { productId: item.productId, quantityDelta: item.quantity, unitCost: item.landedUnitCost, valueDelta: item.inventoryValueAdded, type: INVENTORY_MOVEMENT_TYPES.shipmentReceipt, reason: `استلام الشحنة ${shipment.shipmentNumber}`, referenceId: String(purchaseReceiptId), referenceType: "purchase_receipt" });
    if (payableAmount > 0) {
      const ledger = await postSupplierLedgerEntry(ctx, user, { requestId, supplierId: shipment.supplierId, branchId: shipment.branchId, date: args.receiptDate, amount: payableAmount, referenceId: String(purchaseReceiptId), referenceNumber: receiptNumber, externalInvoiceNumber, dueDate: args.dueDate });
      await ctx.db.patch(purchaseReceiptId, { supplierLedgerEntryId: ledger._id });
    }
    const journal = await postPurchaseReceiptJournal(ctx, user, { branchId: shipment.branchId, date: args.receiptDate, requestId: `purchase-receipt:${purchaseReceiptId}:create`, referenceId: String(purchaseReceiptId), referenceNumber: receiptNumber, totalLandedCost, payableAmount, externalFreightAmount: roundMoney(totalFreight - supplierFreightAmount) });
    if (journal) await ctx.db.patch(purchaseReceiptId, { journalEntryId: journal._id });
    await ctx.db.patch(args.shipmentId, { status: "arrived", arrivedDate: args.receiptDate, purchaseReceiptId, arrivalRequestId: requestId });
    await logAction(ctx, user, { action: "receive", module: "shipments", recordId: args.shipmentId, recordLabel: shipment.shipmentNumber, details: JSON.stringify({ purchaseReceiptId, receiptNumber, payableAmount, totalLandedCost }) });
    return { purchaseReceiptId, receiptNumber };
  },
});

export const remove = mutation({ args: { id: v.id("shipments") }, handler: async () => { throw new ConvexError("استخدم انتقال حالة الشحنة إلى ملغاة مع إدخال السبب"); } });

