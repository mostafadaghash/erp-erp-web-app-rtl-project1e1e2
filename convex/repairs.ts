import { query, mutation } from "./_generated/server.js";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v, ConvexError } from "convex/values";
import { canTransition, REPAIR_TRANSITIONS, roundMoney } from "../shared/businessRules.ts";
import { nextDocumentNumber } from "./lib/documentNumbers.ts";
import { requireActiveBranch, requireActiveCustomer } from "./lib/references.ts";
import { assertBranchAccess, requireModuleEnabled, requireModulePermission, requirePermission, filterByBranch, resolveWriteBranch, logAction } from "./lib/auth.ts";
import { postFinancialTransaction, requireActiveFinancialAccount, assertFinancialAccountBranch, findFinancialTransactionByRequest } from "./lib/finance.ts";
import { postCustomerLedgerEntry } from "./lib/customerLedger.ts";
import { changeProductStock } from "./lib/inventory.ts";
import { INVENTORY_MOVEMENT_TYPES } from "../shared/inventoryRules.ts";
import {
  postRepairRevenueJournal,
  repairPostingState,
  reverseRepairRevenueJournal,
} from "./lib/generalLedgerRepairs.ts";
import {
  assertIsoDate,
  fingerprint,
  normalizeRequestId,
  normalizeText,
} from "./lib/generalLedgerRules.ts";

type RepairPartRequest = {
  productId: Id<"products">;
  quantity: number;
};

type PreparedRepairPart = {
  product: Doc<"products">;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

function assertMoney(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0 || roundMoney(value) !== value) {
    throw new ConvexError(`${label} يجب أن يكون رقمًا غير سالب بدقة قرشين`);
  }
  return value;
}

function canonicalPartRequests(
  parts: RepairPartRequest[] | undefined,
): RepairPartRequest[] {
  const rows = [...(parts ?? [])].sort((a, b) =>
    String(a.productId).localeCompare(String(b.productId)),
  );
  if (rows.length > 100) {
    throw new ConvexError("لا يمكن إضافة أكثر من 100 قطعة لأمر الصيانة");
  }
  const seen = new Set<string>();
  for (const row of rows) {
    if (!Number.isInteger(row.quantity) || row.quantity <= 0) {
      throw new ConvexError("كمية قطعة الغيار يجب أن تكون عددًا صحيحًا أكبر من صفر");
    }
    const key = String(row.productId);
    if (seen.has(key)) {
      throw new ConvexError("لا يمكن تكرار قطعة الغيار في أمر الصيانة");
    }
    seen.add(key);
  }
  return rows;
}

async function prepareRepairParts(
  ctx: MutationCtx,
  branchId: Id<"branches">,
  parts: RepairPartRequest[],
): Promise<PreparedRepairPart[]> {
  const prepared: PreparedRepairPart[] = [];
  for (const row of parts) {
    const product = await ctx.db.get(row.productId);
    if (!product || !product.isActive) {
      throw new ConvexError("قطعة الغيار غير موجودة أو غير نشطة");
    }
    if (product.branchId !== branchId) {
      throw new ConvexError("قطعة الغيار لا تنتمي إلى فرع أمر الصيانة");
    }
    if (product.stock < row.quantity) {
      throw new ConvexError(`المخزون غير كافٍ لقطعة الغيار: ${product.name}`);
    }
    const unitPrice = assertMoney(product.sellPrice, "سعر بيع قطعة الغيار");
    prepared.push({
      product,
      quantity: row.quantity,
      unitPrice,
      lineTotal: roundMoney(unitPrice * row.quantity),
    });
  }
  return prepared;
}

function createTrackingToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

async function createUniqueTrackingToken(ctx: MutationCtx): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const token = createTrackingToken();
    const existing = await ctx.db
      .query("repairs")
      .withIndex("by_tracking", (q) => q.eq("trackingToken", token))
      .first();
    if (!existing) return token;
  }
  throw new ConvexError("تعذر إنشاء رمز تتبع آمن. حاول مرة أخرى");
}

function maskCustomerName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? "عميل";
  return `${parts[0]} ${parts.slice(1).map((part) => `${part[0]}ـ`).join(" ")}`;
}

function publicRepair<T extends Doc<"repairs">>(
  repair: T,
  canViewProfits: boolean,
) {
  const {
    journalEntryId: _journalEntryId,
    cancellationJournalEntryId: _cancellationJournalEntryId,
    creationRequestId: _creationRequestId,
    cancellationRequestId: _cancellationRequestId,
    cancellationFingerprint: _cancellationFingerprint,
    creationFingerprint: _creationFingerprint,
    ...dto
  } = repair;
  if (canViewProfits) return dto;
  const {
    partsCogsTotal: _partsCogsTotal,
    ...visible
  } = dto;
  return {
    ...visible,
    parts: visible.parts.map(
      ({
        historicalUnitCost: _historicalUnitCost,
        inventoryValueRemoved: _inventoryValueRemoved,
        ...part
      }) => part,
    ),
  };
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireModulePermission(ctx, "view_repairs", "repairs");
    const repairs = await ctx.db.query("repairs").order("desc").collect();
    return filterByBranch(repairs, user).map((repair) =>
      publicRepair(repair, user.permissions.includes("view_profits")),
    );
  },
});

export const get = query({
  args: { id: v.id("repairs") },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "view_repairs", "repairs");
    const repair = await ctx.db.get(args.id);
    if (repair) assertBranchAccess(user, repair);
    return repair
      ? publicRepair(repair, user.permissions.includes("view_profits"))
      : null;
  },
});

export const partPicker = query({
  args: { branchId: v.optional(v.id("branches")) },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "create_repairs", "repairs");
    const branchId = resolveWriteBranch(user, args.branchId);
    const products = await ctx.db
      .query("products")
      .withIndex("by_branch", (q) => q.eq("branchId", branchId))
      .collect();
    return products
      .filter((product) => product.isActive)
      .sort((a, b) => a.name.localeCompare(b.name, "ar"))
      .map(({ _id, name, sku, stock, unit, sellPrice }) => ({
        _id,
        name,
        sku,
        stock,
        unit,
        sellPrice,
        branchId,
      }));
  },
});

export const getByTracking = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireModuleEnabled(ctx, "repairs");
    const token = args.token.trim().toUpperCase();
    if (token.length < 8 || token.length > 64 || !/^[A-Z0-9]+$/.test(token)) {
      return null;
    }
    const repair = await ctx.db.query("repairs")
      .withIndex("by_tracking", q => q.eq("trackingToken", token))
      .first();
    if (!repair) return null;

    return {
      repairNumber: repair.repairNumber,
      customerName: maskCustomerName(repair.customerName),
      deviceType: repair.deviceType,
      deviceBrand: repair.deviceBrand,
      deviceModel: repair.deviceModel,
      problem: repair.problem,
      diagnosis: repair.diagnosis,
      totalCost: repair.totalCost,
      deposit: repair.deposit,
      remaining: repair.remaining,
      status: repair.status,
      receivedDate: repair.receivedDate,
      expectedDate: repair.expectedDate,
      deliveredDate: repair.deliveredDate,
    };
  },
});

export const create = mutation({
  args: {
    customerId: v.optional(v.id("customers")),
    customerName: v.string(),
    customerPhone: v.string(),
    deviceType: v.string(),
    deviceBrand: v.string(),
    deviceModel: v.string(),
    problem: v.string(),
    laborCost: v.number(),
    parts: v.optional(v.array(v.object({
      productId: v.id("products"),
      quantity: v.number(),
    }))),
    date: v.optional(v.string()),
    creationRequestId: v.string(),
    initialDeposit: v.optional(v.object({ amount: v.number(), accountId: v.id("financialAccounts"), paymentDate: v.string(), requestId: v.string(), notes: v.optional(v.string()) })),
    expectedDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    branchId: v.optional(v.id("branches")),
    technicianName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "create_repairs", "repairs");
    const normalizedRequestId = normalizeRequestId(args.creationRequestId);
    const creationRequestId = `${user.userId}:${normalizedRequestId}`;
    const branchId = resolveWriteBranch(user, args.branchId);
    const date = assertIsoDate(
      args.date ?? new Date().toISOString().slice(0, 10),
    );
    const canonicalParts = canonicalPartRequests(args.parts);
    const normalizedText = {
      customerName: normalizeText(args.customerName),
      customerPhone: normalizeText(args.customerPhone),
      deviceType: normalizeText(args.deviceType),
      deviceBrand: normalizeText(args.deviceBrand),
      deviceModel: normalizeText(args.deviceModel),
      problem: normalizeText(args.problem),
      expectedDate: args.expectedDate
        ? assertIsoDate(args.expectedDate)
        : undefined,
      notes: args.notes ? normalizeText(args.notes) || undefined : undefined,
      technicianName: args.technicianName
        ? normalizeText(args.technicianName) || undefined
        : undefined,
    };
    for (const value of [
      normalizedText.customerName,
      normalizedText.customerPhone,
      normalizedText.deviceType,
      normalizedText.deviceBrand,
      normalizedText.deviceModel,
      normalizedText.problem,
    ]) {
      if (!value) {
        throw new ConvexError(
          "جميع الحقول النصية المطلوبة يجب ألا تكون فارغة",
        );
      }
    }
    const laborCost = assertMoney(args.laborCost, "تكلفة العمالة");
    const initialAmount = args.initialDeposit?.amount ?? 0;
    assertMoney(initialAmount, "العربون الأولي");
    if (args.initialDeposit && initialAmount <= 0) {
      throw new ConvexError("العربون الأولي يجب أن يكون أكبر من صفر");
    }
    const initialDeposit = args.initialDeposit
      ? {
          amount: initialAmount,
          accountId: String(args.initialDeposit.accountId),
          paymentDate: assertIsoDate(args.initialDeposit.paymentDate),
          requestId: normalizeRequestId(args.initialDeposit.requestId),
          notes: args.initialDeposit.notes
            ? normalizeText(args.initialDeposit.notes) || undefined
            : undefined,
        }
      : undefined;
    const creationFingerprint = fingerprint({
      branchId: String(branchId),
      customerId: args.customerId ? String(args.customerId) : null,
      ...normalizedText,
      laborCost,
      date,
      parts: canonicalParts.map((part) => ({
        productId: String(part.productId),
        quantity: part.quantity,
      })),
      initialDeposit: initialDeposit ?? null,
    });
    const existing = await ctx.db
      .query("repairs")
      .withIndex("by_creation_request", (q) =>
        q.eq("creationRequestId", creationRequestId),
      )
      .unique();
    if (existing) {
      if (existing.creationFingerprint === creationFingerprint) {
        return existing._id;
      }
      throw new ConvexError(
        "استُخدم معرف طلب إنشاء الصيانة ببيانات مختلفة",
      );
    }
    await requireActiveBranch(ctx, branchId);
    const preparedParts = await prepareRepairParts(
      ctx,
      branchId!,
      canonicalParts,
    );
    const partsTotal = roundMoney(
      preparedParts.reduce((sum, part) => sum + part.lineTotal, 0),
    );
    const totalCost = roundMoney(laborCost + partsTotal);
    if (initialAmount > totalCost) {
      throw new ConvexError("العربون لا يمكن أن يتجاوز التكلفة الإجمالية");
    }
    const postingState = await repairPostingState(ctx);
    if (
      !args.customerId &&
      ((postingState.operational && totalCost > 0) ||
        (postingState.financial && initialAmount > 0))
    ) {
      throw new ConvexError(
        "يجب ربط الصيانة بعميل مسجل قبل الترحيل المحاسبي",
      );
    }
    if (args.customerId) {
      const customer = await requireActiveCustomer(ctx, args.customerId, branchId);
      assertBranchAccess(user, customer);
    }
    const repairNumber = await nextDocumentNumber(ctx, "repair");
    const trackingToken = await createUniqueTrackingToken(ctx);
    let account; if (args.initialDeposit) { await requirePermission(ctx, "record_collections"); account = await requireActiveFinancialAccount(ctx, args.initialDeposit.accountId); assertFinancialAccountBranch(account, branchId!); }
    const id = await ctx.db.insert("repairs", {
      customerId: args.customerId,
      customerName: normalizedText.customerName,
      customerPhone: normalizedText.customerPhone,
      deviceType: normalizedText.deviceType,
      deviceBrand: normalizedText.deviceBrand,
      deviceModel: normalizedText.deviceModel,
      problem: normalizedText.problem,
      expectedDate: normalizedText.expectedDate,
      notes: normalizedText.notes,
      technicianName: normalizedText.technicianName,
      branchId,
      repairNumber,
      trackingToken,
      parts: [],
      partsTotal,
      partsCogsTotal: 0,
      costingVersion: 1,
      totalCost,
      laborCost,
      deposit: roundMoney(initialAmount),
      remaining: roundMoney(totalCost - initialAmount),
      creationRequestId,
      creationFingerprint,
      status: "received",
      receivedDate: date,
    });
    const storedParts = [];
    let partsCogsTotal = 0;
    for (const part of preparedParts) {
      const valuation = await changeProductStock(ctx, user, {
        productId: part.product._id,
        quantityDelta: -part.quantity,
        unitCost: part.product.costPrice,
        type: INVENTORY_MOVEMENT_TYPES.repairPartIssue,
        reason: `صرف قطعة غيار للصيانة ${repairNumber}`,
        referenceId: String(id),
        referenceType: "repair",
      });
      const inventoryValueRemoved = roundMoney(-valuation.valueDelta);
      partsCogsTotal = roundMoney(
        partsCogsTotal + inventoryValueRemoved,
      );
      storedParts.push({
        productId: part.product._id,
        name: part.product.name,
        cost: part.unitPrice,
        quantity: part.quantity,
        unitPrice: part.unitPrice,
        lineTotal: part.lineTotal,
        historicalUnitCost: part.product.costPrice,
        inventoryValueRemoved,
      });
    }
    await ctx.db.patch(id, { parts: storedParts, partsCogsTotal });
    if (args.customerId) await postCustomerLedgerEntry(ctx, user, { type: "repair_charge", requestId: `${args.creationRequestId}:charge`, customerId: args.customerId, branchId: branchId!, date, receivableDelta: totalCost, advanceDelta: 0, purchasesDelta: totalCost, description: `تكلفة الصيانة ${repairNumber}`, referenceType: "repair", referenceId: String(id), referenceNumber: repairNumber });
    const journal = await postRepairRevenueJournal(ctx, user, {
      branchId: branchId!,
      date,
      requestId: `${args.creationRequestId}:revenue`,
      repairId: id,
      repairNumber,
      laborCost,
      partsRevenue: partsTotal,
      partsCogs: partsCogsTotal,
    });
    if (args.customerId && args.initialDeposit) await postCustomerLedgerEntry(ctx, user, { type: "repair_payment", requestId: `${args.initialDeposit.requestId}:ledger`, customerId: args.customerId, branchId: branchId!, date: args.initialDeposit.paymentDate, receivableDelta: -initialAmount, advanceDelta: 0, purchasesDelta: 0, description: `عربون الصيانة ${repairNumber}`, referenceType: "repair", referenceId: String(id), referenceNumber: repairNumber });
    if (args.initialDeposit && account) await postFinancialTransaction(ctx, user, { type: "repair_payment", requestId: args.initialDeposit.requestId, date: args.initialDeposit.paymentDate, amount: initialAmount, description: args.initialDeposit.notes?.trim() || `عربون الصيانة ${repairNumber}`, branchId: branchId!, referenceType: "repair", referenceId: String(id), referenceNumber: repairNumber, customerId: args.customerId, movements: [{ accountId: account._id, signedAmount: initialAmount }] });
    if (journal) await ctx.db.patch(id, { journalEntryId: journal._id });
    await logAction(ctx, user, {
      action: "create",
      module: "repairs",
      recordId: id,
      recordLabel: repairNumber,
      details: `استلام جهاز للصيانة: ${repairNumber} - ${args.deviceBrand} ${args.deviceModel} للعميل ${args.customerName}`,
    });
    return id;
  },
});

export const rotateTrackingToken = mutation({
  args: { id: v.id("repairs") },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "edit_repairs", "repairs");
    const repair = await ctx.db.get(args.id);
    if (!repair) throw new ConvexError("أمر الصيانة غير موجود");
    assertBranchAccess(user, repair);
    const trackingToken = await createUniqueTrackingToken(ctx);
    await ctx.db.patch(args.id, { trackingToken });
    await logAction(ctx, user, {
      action: "rotate_tracking_token",
      module: "repairs",
      recordId: args.id,
      recordLabel: repair.repairNumber,
      details: `تجديد رابط تتبع الصيانة ${repair.repairNumber}`,
    });
    return trackingToken;
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("repairs"),
    status: v.union(v.literal("received"), v.literal("in_progress"), v.literal("ready"), v.literal("delivered"), v.literal("cancelled")),
    diagnosis: v.optional(v.string()),
    reason: v.optional(v.string()),
    date: v.optional(v.string()),
    requestId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "edit_repairs", "repairs");
    const repair = await ctx.db.get(args.id);
    if (!repair) throw new ConvexError("أمر الصيانة غير موجود");
    assertBranchAccess(user, repair);
    let cancellationRequestId: string | undefined;
    let cancellationFingerprint: string | undefined;
    let cancellationDate: string | undefined;
    let cancellationReason: string | undefined;
    if (args.status === "cancelled") {
      if (!args.date || !args.requestId) throw new ConvexError("تاريخ ومعرف طلب الإلغاء مطلوبان");
      cancellationDate = assertIsoDate(args.date);
      cancellationReason = normalizeText(args.reason ?? "");
      if (!cancellationReason) throw new ConvexError("سبب الإلغاء مطلوب");
      cancellationRequestId = `${user.userId}:${normalizeRequestId(args.requestId)}`;
      cancellationFingerprint = fingerprint({
        date: cancellationDate,
        reason: cancellationReason,
      });
      if (repair.status === "cancelled") {
        if (
          repair.cancellationRequestId === cancellationRequestId &&
          repair.cancellationFingerprint === cancellationFingerprint
        ) {
          return repair._id;
        }
        throw new ConvexError("تم إلغاء الصيانة سابقًا بطلب مختلف");
      }
    }
    if (!canTransition(REPAIR_TRANSITIONS, repair.status, args.status)) throw new ConvexError(`لا يمكن تغيير حالة الصيانة من ${repair.status} إلى ${args.status}`);
    if (args.status === "cancelled" && repair.deposit > 0) throw new ConvexError("يجب استرداد عربون الصيانة بالكامل قبل الإلغاء");
    if (args.status === "delivered" && repair.remaining > 0) throw new ConvexError("لا يمكن تسليم صيانة عليها مبلغ متبقٍ");
    if (args.status === "cancelled") {
      for (const part of repair.parts) {
        if (
          !part.productId ||
          part.inventoryValueRemoved === undefined ||
          !Number.isFinite(part.inventoryValueRemoved)
        ) {
          throw new ConvexError(
            "أمر الصيانة القديم يحتوي قطعًا بلا تكلفة مخزون تاريخية؛ راجعه يدويًا قبل الإلغاء",
          );
        }
        const product = await ctx.db.get(part.productId);
        if (!product || product.branchId !== repair.branchId) {
          throw new ConvexError(
            "تعذر استعادة قطعة غيار إلى مخزون فرع أمر الصيانة",
          );
        }
        await changeProductStock(ctx, user, {
          productId: part.productId,
          quantityDelta: part.quantity,
          unitCost:
            part.historicalUnitCost ??
            part.inventoryValueRemoved / part.quantity,
          valueDelta: part.inventoryValueRemoved,
          type: INVENTORY_MOVEMENT_TYPES.repairPartReversal,
          reason: `عكس قطع غيار الصيانة ${repair.repairNumber}`,
          referenceId: String(repair._id),
          referenceType: "repair_cancellation",
        });
      }
    }
    if (args.status === "cancelled" && repair.customerId && cancellationDate && cancellationRequestId) await postCustomerLedgerEntry(ctx, user, { type: "repair_cancel", requestId: `${cancellationRequestId}:ledger`, customerId: repair.customerId, branchId: repair.branchId!, date: cancellationDate, receivableDelta: -repair.remaining, advanceDelta: 0, purchasesDelta: -repair.totalCost, description: `إلغاء الصيانة ${repair.repairNumber}`, referenceType: "repair", referenceId: String(repair._id), referenceNumber: repair.repairNumber });
    const cancellationJournal =
      args.status === "cancelled" &&
      cancellationDate &&
      cancellationRequestId &&
      cancellationReason
        ? await reverseRepairRevenueJournal(ctx, user, {
            branchId: repair.branchId!,
            date: cancellationDate,
            requestId: `${cancellationRequestId}:revenue`,
            repairId: repair._id,
            repairNumber: repair.repairNumber,
            originalEntryId: repair.journalEntryId,
            reason: cancellationReason,
            hasAccountingImpact:
              repair.totalCost > 0 || (repair.partsCogsTotal ?? 0) > 0,
          })
        : null;
    await ctx.db.patch(args.id, {
      status: args.status, diagnosis: args.diagnosis?.trim(),
      ...(args.status === "delivered" ? { deliveredDate: new Date().toISOString().slice(0, 10) } : {}),
      ...(args.status === "cancelled" ? {
        cancelledAt: Date.now(),
        cancelledBy: user.userId,
        cancellationReason,
        cancellationDate,
        cancellationRequestId,
        cancellationFingerprint,
        cancellationJournalEntryId: cancellationJournal?._id,
      } : {}),
    });
    await logAction(ctx, user, {
      action: "update",
      module: "repairs",
      recordId: args.id,
      recordLabel: repair.repairNumber,
      details: `تحديث حالة الصيانة ${repair.repairNumber} إلى: ${args.status}`,
    });
    return args.id;
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireModulePermission(ctx, "view_repairs", "repairs");
    const all = await ctx.db.query("repairs").collect();
    const repairs = filterByBranch(all, user);
    return {
      total: repairs.length,
      received: repairs.filter(r => r.status === "received").length,
      inProgress: repairs.filter(r => r.status === "in_progress").length,
      ready: repairs.filter(r => r.status === "ready").length,
      delivered: repairs.filter(r => r.status === "delivered").length,
      cancelled: repairs.filter(r => r.status === "cancelled").length,
    };
  },
});

export const recordPayment = mutation({ args: { repairId: v.id("repairs"), amount: v.number(), accountId: v.id("financialAccounts"), paymentDate: v.string(), requestId: v.string(), notes: v.optional(v.string()) }, handler: async (ctx, args) => { const user = await requirePermission(ctx, "record_collections"); const repair = await ctx.db.get(args.repairId); if (!repair || !repair.branchId) throw new ConvexError("أمر الصيانة غير موجود"); assertBranchAccess(user, repair); if ((await repairPostingState(ctx)).financial && !repair.customerId) throw new ConvexError("يجب ربط الصيانة بعميل مسجل قبل التحصيل المحاسبي"); if (["cancelled", "delivered"].includes(repair.status)) throw new ConvexError("لا يمكن التحصيل لأمر ملغي أو مسلم"); if (!Number.isFinite(args.amount) || args.amount <= 0 || args.amount > repair.remaining) throw new ConvexError("مبلغ التحصيل غير صالح"); const account = await requireActiveFinancialAccount(ctx, args.accountId); assertFinancialAccountBranch(account, repair.branchId); const posted = await postFinancialTransaction(ctx, user, { type: "repair_payment", requestId: args.requestId, date: args.paymentDate, amount: args.amount, description: args.notes?.trim() || `تحصيل الصيانة ${repair.repairNumber}`, branchId: repair.branchId, referenceType: "repair", referenceId: String(repair._id), referenceNumber: repair.repairNumber, customerId: repair.customerId, movements: [{ accountId: account._id, signedAmount: args.amount }] }); if (!posted.duplicate) { if (repair.customerId) await postCustomerLedgerEntry(ctx, user, { type: "repair_payment", requestId: `${args.requestId}:ledger`, customerId: repair.customerId, branchId: repair.branchId, date: args.paymentDate, receivableDelta: -args.amount, advanceDelta: 0, purchasesDelta: 0, description: `تحصيل الصيانة ${repair.repairNumber}`, referenceType: "repair", referenceId: String(repair._id), referenceNumber: repair.repairNumber }); await ctx.db.patch(repair._id, { deposit: roundMoney(repair.deposit + args.amount), remaining: roundMoney(repair.remaining - args.amount) }); } return posted.transactionId; } });

export const refundPayment = mutation({ args: { repairId: v.id("repairs"), amount: v.number(), accountId: v.id("financialAccounts"), date: v.string(), reason: v.string(), requestId: v.string() }, handler: async (ctx, args) => { const user = await requirePermission(ctx, "refund_collections"); const repair = await ctx.db.get(args.repairId); if (!repair || !repair.branchId) throw new ConvexError("أمر الصيانة غير موجود"); assertBranchAccess(user, repair); if ((await repairPostingState(ctx)).financial && !repair.customerId) throw new ConvexError("يجب ربط الصيانة بعميل مسجل قبل الاسترداد المحاسبي"); const duplicate = await findFinancialTransactionByRequest(ctx, "repair_refund", user.userId, args.requestId); if (duplicate) return duplicate._id; const reason = args.reason.trim(); if (!reason) throw new ConvexError("سبب الاسترداد مطلوب"); if (!Number.isFinite(args.amount) || args.amount <= 0 || args.amount > repair.deposit) throw new ConvexError("مبلغ الاسترداد غير صالح"); const account = await requireActiveFinancialAccount(ctx, args.accountId); assertFinancialAccountBranch(account, repair.branchId); const posted = await postFinancialTransaction(ctx, user, { type: "repair_refund", requestId: args.requestId, date: args.date, amount: args.amount, description: reason, branchId: repair.branchId, referenceType: "repair", referenceId: String(repair._id), referenceNumber: repair.repairNumber, movements: [{ accountId: account._id, signedAmount: -args.amount }] }); if (repair.customerId) await postCustomerLedgerEntry(ctx, user, { type: "repair_refund", requestId: `${args.requestId}:ledger`, customerId: repair.customerId, branchId: repair.branchId, date: args.date, receivableDelta: args.amount, advanceDelta: 0, purchasesDelta: 0, description: reason, referenceType: "repair", referenceId: String(repair._id), referenceNumber: repair.repairNumber }); await ctx.db.patch(repair._id, { deposit: roundMoney(repair.deposit - args.amount), remaining: roundMoney(repair.remaining + args.amount) }); return posted.transactionId; } });
