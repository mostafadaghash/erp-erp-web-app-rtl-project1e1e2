import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";
import {
  assertBranchAccess,
  logAction,
  requireModulePermission,
} from "./lib/auth";
import { changeProductStock } from "./lib/inventory";
import { postCustomerLedgerEntry } from "./lib/customerLedger";
import {
  postRepairRevenueJournal,
  repairPostingState,
  reverseRepairRevenueJournal,
} from "./lib/generalLedgerRepairs";
import { assertIsoDate } from "./lib/generalLedgerRules";
import { INVENTORY_MOVEMENT_TYPES } from "../shared/inventoryRules";
import { roundMoney } from "../shared/businessRules";

const clean = (value?: string) => value?.trim() || undefined;
const MAX_PART_PICKER_RESULTS = 1_000;

const partOptionValidator = v.object({
  _id: v.id("products"),
  name: v.string(),
  sku: v.string(),
  barcode: v.optional(v.string()),
  stock: v.number(),
  sellPrice: v.number(),
  unit: v.string(),
});

function assertMoney(value: number, label: string) {
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    Math.abs(value * 100 - Math.round(value * 100)) > 1e-7
  ) {
    throw new ConvexError(`${label} يجب أن يكون رقماً غير سالب وبدقة قرشين`);
  }
  return roundMoney(value);
}

function correctionReason(value: string) {
  const reason = value.trim();
  if (!reason) throw new ConvexError("سبب تعديل أعمال الصيانة مطلوب");
  if (reason.length > 500) throw new ConvexError("سبب التعديل طويل جداً");
  return reason;
}

function normalizeRequestId(value: string) {
  const requestId = value.trim();
  if (!requestId || requestId.length > 200) {
    throw new ConvexError("معرف طلب تعديل الصيانة غير صالح");
  }
  return requestId;
}

export const partPicker = query({
  args: { branchId: v.id("branches") },
  returns: v.array(partOptionValidator),
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "edit_repairs", "repairs");
    assertBranchAccess(user, { branchId: args.branchId });
    const products = await ctx.db
      .query("products")
      .withIndex("by_branch_active", (q) =>
        q.eq("branchId", args.branchId).eq("isActive", true),
      )
      .take(MAX_PART_PICKER_RESULTS);
    return products
      .sort((a, b) => a.name.localeCompare(b.name, "ar"))
      .map((product) => ({
        _id: product._id,
        name: product.name,
        sku: product.sku,
        barcode: product.barcode,
        stock: product.stock,
        sellPrice: product.sellPrice,
        unit: product.unit,
      }));
  },
});

export const updateWork = mutation({
  args: {
    repairId: v.id("repairs"),
    laborCost: v.number(),
    parts: v.array(
      v.object({
        productId: v.id("products"),
        quantity: v.number(),
        unitPrice: v.number(),
      }),
    ),
    diagnosis: v.optional(v.string()),
    qualityCheckNotes: v.optional(v.string()),
    notes: v.optional(v.string()),
    date: v.string(),
    reason: v.string(),
    requestId: v.string(),
  },
  returns: v.id("repairs"),
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "edit_repairs", "repairs");
    const reason = correctionReason(args.reason);
    const requestId = normalizeRequestId(args.requestId);
    const date = assertIsoDate(args.date);
    const repair = await ctx.db.get(args.repairId);
    if (!repair || !repair.branchId) throw new ConvexError("أمر الصيانة غير موجود أو بلا فرع");
    assertBranchAccess(user, repair);
    if (repair.status === "delivered" || repair.status === "cancelled") {
      throw new ConvexError("تم إغلاق أمر الصيانة؛ لا يمكن تغيير القطع أو التكلفة بعد التسليم أو الإلغاء");
    }

    const laborCost = assertMoney(args.laborCost, "أجرة الصيانة");
    const seen = new Set<string>();
    const requestedParts = [];
    for (const item of args.parts) {
      const key = String(item.productId);
      if (seen.has(key)) throw new ConvexError("لا يجوز تكرار قطعة الغيار نفسها");
      seen.add(key);
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new ConvexError("كمية قطعة الغيار يجب أن تكون عدداً صحيحاً أكبر من صفر");
      }
      const unitPrice = assertMoney(item.unitPrice, "سعر بيع قطعة الغيار");
      const product = await ctx.db.get(item.productId);
      if (!product || !product.isActive) throw new ConvexError("قطعة الغيار غير موجودة أو غير نشطة");
      if (product.branchId !== repair.branchId) throw new ConvexError("قطعة الغيار لا تنتمي إلى فرع أمر الصيانة");
      assertBranchAccess(user, product);
      requestedParts.push({ productId: product._id, productName: product.name, quantity: item.quantity, unitPrice });
    }

    const partsTotalPreview = roundMoney(
      requestedParts.reduce((sum, part) => sum + part.quantity * part.unitPrice, 0),
    );
    const totalPreview = roundMoney(laborCost + partsTotalPreview);
    const amountAlreadyCollected = roundMoney(repair.deposit);
    if (totalPreview < amountAlreadyCollected) {
      throw new ConvexError(
        `الإجمالي الجديد أقل من المبلغ المحصل (${amountAlreadyCollected}). استرد فرق التحصيل أولاً ثم أعد تعديل أعمال الصيانة`,
      );
    }

    const sameParts =
      repair.parts.length === requestedParts.length &&
      requestedParts.every((part) => {
        const current = repair.parts.find((row) => row.productId === part.productId);
        const currentUnitPrice = current?.unitPrice ?? current?.cost ?? 0;
        return Boolean(current) && current?.quantity === part.quantity && roundMoney(currentUnitPrice) === part.unitPrice;
      });
    const nextDiagnosis = args.diagnosis === undefined ? repair.diagnosis : clean(args.diagnosis);
    const nextQuality = args.qualityCheckNotes === undefined ? repair.qualityCheckNotes : clean(args.qualityCheckNotes);
    const nextNotes = args.notes === undefined ? repair.notes : clean(args.notes);
    if (
      sameParts &&
      roundMoney(repair.laborCost) === laborCost &&
      nextDiagnosis === repair.diagnosis &&
      nextQuality === repair.qualityCheckNotes &&
      nextNotes === repair.notes
    ) {
      return repair._id;
    }

    const postingState = await repairPostingState(ctx);
    if (postingState.operational && totalPreview > 0 && !repair.customerId) {
      throw new ConvexError("يجب ربط أمر الصيانة بعميل مسجل قبل تعديل قيمته المحاسبية");
    }

    // A correction must never invent a value for stock that was issued by an
    // older repair record. Validate every historical leg before the first
    // inventory write so legacy rows are sent to manual review instead.
    for (const part of repair.parts) {
      if (!part.productId || part.quantity <= 0) continue;
      if (
        part.inventoryValueRemoved === undefined ||
        !Number.isFinite(part.inventoryValueRemoved) ||
        part.inventoryValueRemoved < 0
      ) {
        throw new ConvexError(
          "أمر الصيانة القديم يحتوي قطعًا بلا تكلفة مخزون تاريخية؛ راجعه يدويًا قبل تعديل أعمال الصيانة",
        );
      }
      const product = await ctx.db.get(part.productId);
      if (!product || product.branchId !== repair.branchId) {
        throw new ConvexError(
          "تعذر استعادة قطعة غيار إلى مخزون فرع أمر الصيانة",
        );
      }
    }

    // Restore the exact historical inventory value of the old issued parts.
    for (const part of repair.parts) {
      if (!part.productId || part.quantity <= 0) continue;
      if (part.inventoryValueRemoved === undefined) {
        throw new ConvexError(
          "أمر الصيانة القديم يحتوي قطعًا بلا تكلفة مخزون تاريخية؛ راجعه يدويًا قبل تعديل أعمال الصيانة",
        );
      }
      const exactValue = roundMoney(part.inventoryValueRemoved);
      const historicalUnitCost =
        part.historicalUnitCost ??
        (part.quantity > 0 ? exactValue / part.quantity : 0);
      await changeProductStock(ctx, user, {
        productId: part.productId,
        quantityDelta: part.quantity,
        unitCost: historicalUnitCost,
        valueDelta: exactValue,
        type: INVENTORY_MOVEMENT_TYPES.repairPartReversal,
        reason: `عكس قطع الصيانة قبل تصحيح ${repair.repairNumber}`,
        referenceId: String(repair._id),
        referenceType: "repair_work_correction",
      });
    }

    const storedParts: Array<{
      productId: Id<"products">;
      name: string;
      cost: number;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
      historicalUnitCost: number;
      inventoryValueRemoved: number;
    }> = [];
    let partsCogsTotal = 0;
    for (const requested of requestedParts) {
      const product = await ctx.db.get(requested.productId);
      if (!product || !product.isActive || product.branchId !== repair.branchId) {
        throw new ConvexError(`قطعة الغيار غير متاحة: ${requested.productName}`);
      }
      if (product.stock < requested.quantity) {
        throw new ConvexError(`المخزون غير كافٍ لقطعة ${product.name}. المتاح ${product.stock}`);
      }
      const historicalUnitCost = product.costPrice;
      const valuation = await changeProductStock(ctx, user, {
        productId: product._id,
        quantityDelta: -requested.quantity,
        unitCost: historicalUnitCost,
        type: INVENTORY_MOVEMENT_TYPES.repairPartIssue,
        reason: `صرف قطع الصيانة بعد تصحيح ${repair.repairNumber}`,
        referenceId: String(repair._id),
        referenceType: "repair_work_correction",
      });
      const inventoryValueRemoved = roundMoney(-valuation.valueDelta);
      partsCogsTotal = roundMoney(partsCogsTotal + inventoryValueRemoved);
      storedParts.push({
        productId: product._id,
        name: product.name,
        cost: requested.unitPrice,
        quantity: requested.quantity,
        unitPrice: requested.unitPrice,
        lineTotal: roundMoney(requested.unitPrice * requested.quantity),
        historicalUnitCost,
        inventoryValueRemoved,
      });
    }

    const partsTotal = roundMoney(storedParts.reduce((sum, part) => sum + part.lineTotal, 0));
    const totalCost = roundMoney(laborCost + partsTotal);
    const remaining = roundMoney(totalCost - amountAlreadyCollected);
    const totalDelta = roundMoney(totalCost - repair.totalCost);
    const remainingDelta = roundMoney(remaining - repair.remaining);

    if (repair.customerId && (totalDelta !== 0 || remainingDelta !== 0)) {
      await postCustomerLedgerEntry(ctx, user, {
        type: "repair_adjustment",
        requestId: `${requestId}:customer-ledger`,
        customerId: repair.customerId,
        branchId: repair.branchId,
        date,
        receivableDelta: remainingDelta,
        advanceDelta: 0,
        purchasesDelta: totalDelta,
        description: `تصحيح أعمال وقطع الصيانة ${repair.repairNumber}: ${reason}`,
        referenceType: "repair",
        referenceId: String(repair._id),
        referenceNumber: repair.repairNumber,
      });
    }

    const oldPartsTotal = repair.partsTotal ?? roundMoney(
      repair.parts.reduce((sum, part) => sum + (part.lineTotal ?? part.cost * part.quantity), 0),
    );
    const oldPartsCogs = repair.partsCogsTotal ?? roundMoney(
      repair.parts.reduce(
        (sum, part) => sum + (part.inventoryValueRemoved ?? (part.historicalUnitCost ?? 0) * part.quantity),
        0,
      ),
    );
    let reversalJournalId: Id<"journalEntries"> | undefined;
    if (postingState.operational && (repair.totalCost !== 0 || oldPartsCogs !== 0)) {
      const reversal = await reverseRepairRevenueJournal(ctx, user, {
        branchId: repair.branchId,
        date,
        requestId: `${requestId}:journal-reversal`,
        repairId: repair._id,
        repairNumber: repair.repairNumber,
        originalEntryId: repair.journalEntryId,
        reason: `تصحيح أعمال الصيانة: ${reason}`,
        hasAccountingImpact: repair.totalCost !== 0 || oldPartsCogs !== 0,
      });
      reversalJournalId = reversal?._id;
    }
    const newJournal = await postRepairRevenueJournal(ctx, user, {
      branchId: repair.branchId,
      date,
      requestId: `${requestId}:journal-new`,
      repairId: repair._id,
      repairNumber: repair.repairNumber,
      laborCost,
      partsRevenue: partsTotal,
      partsCogs: partsCogsTotal,
    });

    await ctx.db.patch(repair._id, {
      parts: storedParts,
      partsTotal,
      partsCogsTotal,
      costingVersion: 1,
      laborCost,
      totalCost,
      remaining,
      diagnosis: nextDiagnosis,
      qualityCheckNotes: nextQuality,
      notes: nextNotes,
      journalEntryId: newJournal?._id,
    });

    await logAction(ctx, user, {
      action: "update",
      module: "repairs",
      recordId: String(repair._id),
      recordLabel: repair.repairNumber,
      details: `تصحيح أعمال وقطع الصيانة ${repair.repairNumber}: ${reason}`,
      branchId: repair.branchId,
      sourceType: "repair",
      sourceId: String(repair._id),
      sourceNumber: repair.repairNumber,
      relatedType: repair.customerId ? "customer" : undefined,
      relatedId: repair.customerId ? String(repair.customerId) : undefined,
      reversalOfId: repair.journalEntryId ? String(repair.journalEntryId) : undefined,
      journalEntryId: newJournal?._id ? String(newJournal._id) : undefined,
      before: {
        status: repair.status,
        laborCost: repair.laborCost,
        partsTotal: oldPartsTotal,
        partsCogsTotal: oldPartsCogs,
        totalCost: repair.totalCost,
        deposit: repair.deposit,
        remaining: repair.remaining,
        partsCount: repair.parts.length,
      },
      after: {
        correctionReason: reason,
        status: repair.status,
        laborCost,
        partsTotal,
        partsCogsTotal,
        totalCost,
        deposit: amountAlreadyCollected,
        remaining,
        partsCount: storedParts.length,
        reversalJournalId: reversalJournalId ? String(reversalJournalId) : null,
      },
    });

    return repair._id;
  },
});
