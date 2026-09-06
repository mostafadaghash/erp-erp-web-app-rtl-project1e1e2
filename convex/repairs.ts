import { query, mutation } from "./_generated/server.js";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v, ConvexError } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  canTransition,
  REPAIR_TRANSITIONS,
  roundMoney,
  type RepairStatus,
} from "../shared/businessRules.ts";
import { nextDocumentNumber } from "./lib/documentNumbers.ts";
import { requireActiveBranch, requireActiveCustomer } from "./lib/references.ts";
import { assertBranchAccess, requireModuleEnabled, requireModulePermission, requirePermission, filterByBranch, resolveWriteBranch, logAction, type AuthUser } from "./lib/auth.ts";
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

type RepairTransitionArgs = {
  id: Id<"repairs">;
  status: RepairStatus;
  date: string;
  requestId: string;
  diagnosis?: string;
  reason?: string;
  qualityCheckNotes?: string;
  warrantyDays?: number;
};

type RepairHistoryStatus = "received" | "under_inspection" | "awaiting_approval" | "in_progress" | "ready" | "delivered" | "cancelled";
const historyStatus = (status: string): RepairHistoryStatus =>
  status === "rejected_by_shipping" ? "ready" : status as RepairHistoryStatus;

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

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function normalizeOptionalText(value?: string): string | undefined {
  const normalized = value ? normalizeText(value) : "";
  return normalized || undefined;
}

async function requireRepairTechnician(
  ctx: MutationCtx,
  branchId: Id<"branches">,
  profileId: Id<"userProfiles">,
) {
  const profile = await ctx.db.get(profileId);
  if (
    !profile ||
    !profile.isActive ||
    profile.role !== "technician" ||
    profile.branchId !== branchId
  ) {
    throw new ConvexError("الفني غير موجود أو غير نشط أو لا ينتمي إلى فرع الصيانة");
  }
  return profile;
}

async function resolveEmployeeName(
  ctx: Pick<QueryCtx, "db">,
  userId?: string,
): Promise<string> {
  if (!userId) return "مستخدم غير معروف";
  const byUser = await ctx.db
    .query("userProfiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  if (byUser) return byUser.name;
  const byToken = await ctx.db
    .query("userProfiles")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", userId))
    .first();
  return byToken?.name ?? "مستخدم غير معروف";
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
    createdBy: _createdBy,
    deliveredBy: _deliveredBy,
    technicianId: _technicianId,
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
  args: { branchId: v.optional(v.id("branches")) },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "view_repairs", "repairs");
    const requestedBranchId = args.branchId;
    if (requestedBranchId) assertBranchAccess(user, { branchId: requestedBranchId });
    const branchId = user.role === "admin"
      ? requestedBranchId ?? user.branchId
      : user.branchId;
    if (!branchId) return [];
    const repairs = await ctx.db
      .query("repairs")
      .withIndex("by_branch_received", (q) => q.eq("branchId", branchId))
      .order("desc")
      .collect();
    return repairs.map((repair) =>
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

export const technicianPicker = query({
  args: { branchId: v.optional(v.id("branches")) },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "edit_repairs", "repairs");
    const branchId = resolveWriteBranch(user, args.branchId);
    const profiles = await ctx.db
      .query("userProfiles")
      .withIndex("by_branch", (q) => q.eq("branchId", branchId))
      .collect();
    return profiles
      .filter((profile) => profile.isActive && profile.role === "technician")
      .sort((a, b) => a.name.localeCompare(b.name, "ar"))
      .map(({ _id, name }) => ({ _id, name }));
  },
});

export const historyPaginated = query({
  args: {
    repairId: v.id("repairs"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "view_repairs", "repairs");
    const repair = await ctx.db.get(args.repairId);
    if (!repair) throw new ConvexError("أمر الصيانة غير موجود");
    assertBranchAccess(user, repair);
    const result = await ctx.db
      .query("repairStatusHistory")
      .withIndex("by_repair_date", (q) => q.eq("repairId", args.repairId))
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: await Promise.all(
        result.page.map(async (entry) => ({
          _id: entry._id,
          fromStatus: entry.fromStatus,
          toStatus: entry.toStatus,
          date: entry.date,
          diagnosis: entry.diagnosisSnapshot,
          technicianName: entry.technicianNameSnapshot,
          qualityCheckNotes: entry.qualityCheckNotesSnapshot,
          reason: entry.reason,
          employeeName: await resolveEmployeeName(ctx, entry.changedBy),
        })),
      ),
    };
  },
});

export const repairForPrint = query({
  args: { id: v.id("repairs") },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "print_repairs", "repairs");
    const repair = await ctx.db.get(args.id);
    if (!repair) throw new ConvexError("أمر الصيانة غير موجود");
    assertBranchAccess(user, repair);
    const history = await ctx.db
      .query("repairStatusHistory")
      .withIndex("by_repair_date", (q) => q.eq("repairId", repair._id))
      .order("asc")
      .collect();
    return {
      repairNumber: repair.repairNumber,
      customerName: repair.customerName,
      customerPhone: repair.customerPhone,
      deviceType: repair.deviceType,
      deviceBrand: repair.deviceBrand,
      deviceModel: repair.deviceModel,
      serialNumber: repair.serialNumber,
      accessories: repair.accessories,
      intakeCondition: repair.intakeCondition,
      problem: repair.problem,
      diagnosis: repair.diagnosis,
      parts: repair.parts.map((part) => ({
        name: part.name,
        cost: part.unitPrice ?? part.cost,
        quantity: part.quantity,
        lineTotal: part.lineTotal ?? roundMoney(part.cost * part.quantity),
      })),
      laborCost: repair.laborCost,
      totalCost: repair.totalCost,
      deposit: repair.deposit,
      remaining: repair.remaining,
      status: repair.status,
      technicianName: repair.technicianName,
      receivedDate: repair.receivedDate,
      expectedDate: repair.expectedDate,
      deliveredDate: repair.deliveredDate,
      warrantyDays: repair.warrantyDays,
      warrantyUntil: repair.warrantyUntil,
      qualityCheckNotes: repair.qualityCheckNotes,
      notes: repair.notes,
      _creationTime: repair._creationTime,
      employeeName: await resolveEmployeeName(ctx, repair.createdBy),
      history: await Promise.all(
        history.map(async (entry) => ({
          fromStatus: entry.fromStatus,
          toStatus: entry.toStatus,
          date: entry.date,
          reason: entry.reason,
          employeeName: await resolveEmployeeName(ctx, entry.changedBy),
        })),
      ),
    };
  },
});

export const getByTracking = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "view_repairs");
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
      warrantyDays: repair.warrantyDays,
      warrantyUntil: repair.warrantyUntil,
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
    serialNumber: v.optional(v.string()),
    accessories: v.optional(v.string()),
    intakeCondition: v.optional(v.string()),
    technicianProfileId: v.optional(v.id("userProfiles")),
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
      serialNumber: normalizeOptionalText(args.serialNumber),
      accessories: normalizeOptionalText(args.accessories),
      intakeCondition: normalizeOptionalText(args.intakeCondition),
      technicianName: normalizeOptionalText(args.technicianName),
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
      technicianProfileId: args.technicianProfileId
        ? String(args.technicianProfileId)
        : null,
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
    const assignedTechnician = args.technicianProfileId
      ? await requireRepairTechnician(ctx, branchId!, args.technicianProfileId)
      : null;
    const technicianName =
      assignedTechnician?.name ?? normalizedText.technicianName;
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
      serialNumber: normalizedText.serialNumber,
      accessories: normalizedText.accessories,
      intakeCondition: normalizedText.intakeCondition,
      expectedDate: normalizedText.expectedDate,
      notes: normalizedText.notes,
      technicianName,
      technicianId: args.technicianProfileId
        ? String(args.technicianProfileId)
        : undefined,
      assignedTechnicianProfileId: args.technicianProfileId,
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
      createdBy: user.userId,
      status: "received",
      receivedDate: date,
    });
    await ctx.db.insert("repairStatusHistory", {
      repairId: id,
      repairNumber,
      branchId: branchId!,
      toStatus: "received",
      date,
      technicianNameSnapshot: technicianName,
      idempotencyKey: `${creationRequestId}:received`,
      requestFingerprint: creationFingerprint,
      changedAt: Date.now(),
      changedBy: user.userId,
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
      recordId: String(id),
      recordLabel: repairNumber,
      details: `استلام جهاز للصيانة: ${repairNumber} - ${args.deviceBrand} ${args.deviceModel} للعميل ${args.customerName}`,
      branchId,
      sourceType: "repair",
      sourceId: String(id),
      sourceNumber: repairNumber,
      relatedType: args.customerId ? "customer" : undefined,
      relatedId: args.customerId ? String(args.customerId) : undefined,
      journalEntryId: journal?._id ? String(journal._id) : undefined,
      after: { status: "received", date, totalCost, deposit: initialAmount, remaining: roundMoney(totalCost - initialAmount), laborCost, partsCount: storedParts.length, customerName: normalizedText.customerName, technicianName: technicianName ?? null },
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
      recordId: String(args.id),
      recordLabel: repair.repairNumber,
      details: `تجديد رابط تتبع الصيانة ${repair.repairNumber}`,
      branchId: repair.branchId,
      sourceType: "repair",
      sourceId: String(args.id),
      sourceNumber: repair.repairNumber,
      relatedType: repair.customerId ? "customer" : undefined,
      relatedId: repair.customerId ? String(repair.customerId) : undefined,
      before: { publicTrackingActive: Boolean(repair.trackingToken) },
      after: { publicTrackingActive: true, publicTrackingRotated: true },
    });
    return trackingToken;
  },
});

export const updateDetails = mutation({
  args: {
    id: v.id("repairs"),
    technicianProfileId: v.optional(v.id("userProfiles")),
    diagnosis: v.optional(v.string()),
    serialNumber: v.optional(v.string()),
    accessories: v.optional(v.string()),
    intakeCondition: v.optional(v.string()),
    qualityCheckNotes: v.optional(v.string()),
    expectedDate: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "edit_repairs", "repairs");
    const repair = await ctx.db.get(args.id);
    if (!repair) throw new ConvexError("أمر الصيانة غير موجود");
    assertBranchAccess(user, repair);
    if (!["received", "under_inspection", "awaiting_approval", "in_progress", "rejected_by_shipping"].includes(repair.status)) {
      throw new ConvexError("لا يمكن تعديل تفاصيل الصيانة بعد التسليم أو رفض العميل");
    }
    const technician = args.technicianProfileId
      ? await requireRepairTechnician(
          ctx,
          repair.branchId!,
          args.technicianProfileId,
        )
      : null;
    const expectedDate = args.expectedDate
      ? assertIsoDate(args.expectedDate)
      : undefined;
    await ctx.db.patch(args.id, {
      assignedTechnicianProfileId:
        args.technicianProfileId ?? repair.assignedTechnicianProfileId,
      technicianId: args.technicianProfileId
        ? String(args.technicianProfileId)
        : repair.technicianId,
      technicianName: technician?.name ?? repair.technicianName,
      diagnosis:
        args.diagnosis === undefined
          ? repair.diagnosis
          : normalizeOptionalText(args.diagnosis),
      serialNumber:
        args.serialNumber === undefined
          ? repair.serialNumber
          : normalizeOptionalText(args.serialNumber),
      accessories:
        args.accessories === undefined
          ? repair.accessories
          : normalizeOptionalText(args.accessories),
      intakeCondition:
        args.intakeCondition === undefined
          ? repair.intakeCondition
          : normalizeOptionalText(args.intakeCondition),
      qualityCheckNotes:
        args.qualityCheckNotes === undefined
          ? repair.qualityCheckNotes
          : normalizeOptionalText(args.qualityCheckNotes),
      expectedDate:
        args.expectedDate === undefined ? repair.expectedDate : expectedDate,
      notes:
        args.notes === undefined
          ? repair.notes
          : normalizeOptionalText(args.notes),
    });
    await logAction(ctx, user, {
      action: "update_details",
      module: "repairs",
      recordId: String(args.id),
      recordLabel: repair.repairNumber,
      details: `تحديث بيانات الجهاز والتشخيص للصيانة ${repair.repairNumber}`,
      branchId: repair.branchId,
      sourceType: "repair",
      sourceId: String(args.id),
      sourceNumber: repair.repairNumber,
      relatedType: repair.customerId ? "customer" : undefined,
      relatedId: repair.customerId ? String(repair.customerId) : undefined,
      before: { technicianName: repair.technicianName ?? null, hasDiagnosis: Boolean(repair.diagnosis), hasSerialNumber: Boolean(repair.serialNumber), expectedDate: repair.expectedDate ?? null, hasQualityCheckNotes: Boolean(repair.qualityCheckNotes) },
      after: { technicianName: technician?.name ?? repair.technicianName ?? null, hasDiagnosis: args.diagnosis === undefined ? Boolean(repair.diagnosis) : Boolean(normalizeOptionalText(args.diagnosis)), hasSerialNumber: args.serialNumber === undefined ? Boolean(repair.serialNumber) : Boolean(normalizeOptionalText(args.serialNumber)), expectedDate: args.expectedDate === undefined ? repair.expectedDate ?? null : expectedDate ?? null, hasQualityCheckNotes: args.qualityCheckNotes === undefined ? Boolean(repair.qualityCheckNotes) : Boolean(normalizeOptionalText(args.qualityCheckNotes)) },
    });
    return args.id;
  },
});

async function transitionRepair(
  ctx: MutationCtx,
  user: AuthUser,
  args: RepairTransitionArgs,
) {
  const date = assertIsoDate(args.date);
  const reason = normalizeOptionalText(args.reason);
  const diagnosis = normalizeOptionalText(args.diagnosis);
  const qualityCheckNotes = normalizeOptionalText(args.qualityCheckNotes);
  const requestId = normalizeRequestId(args.requestId);
  const idempotencyKey = `${user.userId}:repair_status:${requestId}`;
  const requestFingerprint = fingerprint({
    repairId: String(args.id),
    status: args.status,
    date,
    reason: reason ?? null,
    diagnosis: diagnosis ?? null,
    qualityCheckNotes: qualityCheckNotes ?? null,
    warrantyDays: args.warrantyDays ?? null,
  });
  const previousAttempt = await ctx.db
    .query("repairStatusHistory")
    .withIndex("by_idempotency_key", (q) =>
      q.eq("idempotencyKey", idempotencyKey),
    )
    .unique();
  if (previousAttempt) {
    if (previousAttempt.requestFingerprint === requestFingerprint) {
      return previousAttempt.repairId;
    }
    throw new ConvexError(
      "استُخدم معرف طلب تغيير الحالة ببيانات مختلفة — طلب مختلف",
    );
  }

  const repair = await ctx.db.get(args.id);
  if (!repair || !repair.branchId) {
    throw new ConvexError("أمر الصيانة غير موجود");
  }
  assertBranchAccess(user, repair);
  if (repair.status === "cancelled" && args.status === "cancelled") {
    throw new ConvexError("تم رفض الصيانة من العميل سابقًا بطلب مختلف");
  }
  if (repair.status === "rejected_by_shipping" && args.status === "rejected_by_shipping") {
    throw new ConvexError("تم تسجيل رفض الفني سابقًا بطلب مختلف");
  }
  if (!canTransition(REPAIR_TRANSITIONS, repair.status, args.status)) {
    throw new ConvexError(
      `لا يمكن تغيير حالة الصيانة من ${repair.status} إلى ${args.status}`,
    );
  }
  const nextDiagnosis = diagnosis ?? repair.diagnosis;
  const nextQualityCheckNotes =
    qualityCheckNotes ?? repair.qualityCheckNotes;
  if ((args.status === "under_inspection" || args.status === "in_progress") && !repair.technicianName) {
    throw new ConvexError("يجب تعيين فني قبل استلام الجهاز أو بدء الإصلاح");
  }
  if (args.status === "ready" && !nextDiagnosis) {
    throw new ConvexError("التشخيص مطلوب قبل اعتماد الصيانة جاهزة");
  }
  if (args.status === "cancelled" && !reason) {
    throw new ConvexError("سبب الإلغاء مطلوب");
  }
  if (args.status === "rejected_by_shipping" && !reason) {
    throw new ConvexError("سبب رفض الفني مطلوب");
  }
  if (args.status === "cancelled" && repair.deposit > 0) {
    throw new ConvexError("يجب استرداد عربون الصيانة بالكامل قبل الإلغاء");
  }
  if (args.status === "delivered" && repair.remaining > 0) {
    throw new ConvexError("لا يمكن تسليم صيانة عليها مبلغ متبقٍ");
  }
  if (
    args.warrantyDays !== undefined &&
    (args.status !== "delivered" ||
      !Number.isInteger(args.warrantyDays) ||
      args.warrantyDays < 0 ||
      args.warrantyDays > 365)
  ) {
    throw new ConvexError("مدة الضمان يجب أن تكون عدد أيام صحيحًا من صفر إلى 365 عند التسليم");
  }

  if (args.status === "cancelled") {
    for (const part of repair.parts) {
      if (
        !part.productId ||
        part.inventoryValueRemoved === undefined ||
        !Number.isFinite(part.inventoryValueRemoved)
      ) {
        throw new ConvexError(
          "أمر الصيانة القديم يحتوي قطعًا بلا تكلفة مخزون تاريخية؛ راجعه يدويًا قبل رفض العميل",
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
        reason: `رفض العميل للصيانة ${repair.repairNumber}`,
        referenceId: String(repair._id),
        referenceType: "repair_cancellation",
      });
    }
  }
  if (args.status === "cancelled" && repair.customerId) {
    await postCustomerLedgerEntry(ctx, user, {
      type: "repair_cancel",
      requestId: `${idempotencyKey}:ledger`,
      customerId: repair.customerId,
      branchId: repair.branchId,
      date,
      receivableDelta: -repair.remaining,
      advanceDelta: 0,
      purchasesDelta: -repair.totalCost,
      description: `رفض العميل للصيانة ${repair.repairNumber}`,
      referenceType: "repair",
      referenceId: String(repair._id),
      referenceNumber: repair.repairNumber,
    });
  }
  const cancellationJournal =
    args.status === "cancelled" && reason
      ? await reverseRepairRevenueJournal(ctx, user, {
          branchId: repair.branchId,
          date,
          requestId: `${idempotencyKey}:revenue`,
          repairId: repair._id,
          repairNumber: repair.repairNumber,
          originalEntryId: repair.journalEntryId,
          reason,
          hasAccountingImpact:
            repair.totalCost > 0 || (repair.partsCogsTotal ?? 0) > 0,
        })
      : null;
  const warrantyDays =
    args.status === "delivered" ? args.warrantyDays ?? 0 : undefined;
  await ctx.db.patch(args.id, {
    status: args.status,
    diagnosis: nextDiagnosis,
    qualityCheckNotes: nextQualityCheckNotes,
    ...(args.status === "delivered"
      ? {
          deliveredDate: date,
          deliveredBy: user.userId,
          warrantyDays,
          warrantyUntil: warrantyDays ? addDays(date, warrantyDays) : date,
        }
      : {}),
    ...(args.status === "cancelled"
      ? {
          cancelledAt: Date.now(),
          cancelledBy: user.userId,
          cancellationReason: reason,
          cancellationDate: date,
          cancellationRequestId: idempotencyKey,
          cancellationFingerprint: requestFingerprint,
          cancellationJournalEntryId: cancellationJournal?._id,
        }
      : {}),
  });
  await ctx.db.insert("repairStatusHistory", {
    repairId: repair._id,
    repairNumber: repair.repairNumber,
    branchId: repair.branchId,
    fromStatus: historyStatus(repair.status),
    toStatus: historyStatus(args.status),
    date,
    diagnosisSnapshot: nextDiagnosis,
    technicianNameSnapshot: repair.technicianName,
    qualityCheckNotesSnapshot: nextQualityCheckNotes,
    reason: args.status === "rejected_by_shipping" ? `الفني: ${reason}` : reason,
    idempotencyKey,
    requestFingerprint,
    changedAt: Date.now(),
    changedBy: user.userId,
  });
  await logAction(ctx, user, {
    action: "update_status",
    module: "repairs",
    recordId: String(args.id),
    recordLabel: repair.repairNumber,
    details: `تحديث حالة الصيانة ${repair.repairNumber} من ${repair.status} إلى ${args.status}`,
    branchId: repair.branchId,
    sourceType: "repair",
    sourceId: String(args.id),
    sourceNumber: repair.repairNumber,
    relatedType: repair.customerId ? "customer" : undefined,
    relatedId: repair.customerId ? String(repair.customerId) : undefined,
    journalEntryId: cancellationJournal?._id ? String(cancellationJournal._id) : undefined,
    before: { status: repair.status },
    after: { status: args.status, date, reversalReason: reason ?? null, warrantyDays: warrantyDays ?? null },
  });
  return args.id;
}

const repairStatusValidator = v.union(
  v.literal("received"),
  v.literal("under_inspection"),
  v.literal("awaiting_approval"),
  v.literal("in_progress"),
  v.literal("ready"),
  v.literal("delivered"),
  v.literal("cancelled"),
  v.literal("rejected_by_shipping"),
);

export const transitionStatus = mutation({
  args: {
    id: v.id("repairs"),
    status: repairStatusValidator,
    date: v.string(),
    requestId: v.string(),
    diagnosis: v.optional(v.string()),
    reason: v.optional(v.string()),
    qualityCheckNotes: v.optional(v.string()),
    warrantyDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "edit_repairs", "repairs");
    return transitionRepair(ctx, user, args);
  },
});

/** Compatibility path for older callers; the UI uses transitionStatus. */
export const updateStatus = mutation({
  args: {
    id: v.id("repairs"),
    status: repairStatusValidator,
    diagnosis: v.optional(v.string()),
    reason: v.optional(v.string()),
    date: v.optional(v.string()),
    requestId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "edit_repairs", "repairs");
    const repair = await ctx.db.get(args.id);
    if (!repair) throw new ConvexError("أمر الصيانة غير موجود");
    const date = args.date ?? new Date().toISOString().slice(0, 10);
    return transitionRepair(ctx, user, {
      ...args,
      date,
      requestId:
        args.requestId ??
        `legacy:${args.id}:${repair.status}:${args.status}:${date}`,
    });
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireModulePermission(ctx, "view_repairs", "repairs");
    const all = await ctx.db.query("repairs").collect();
    const repairs = filterByBranch(all, user);
    const rejectedByTechnician = repairs.filter(r => r.status === "rejected_by_shipping").length;
    return {
      total: repairs.length,
      received: repairs.filter(r => r.status === "received").length,
      underInspection: repairs.filter(r => r.status === "under_inspection").length,
      awaitingApproval: repairs.filter(r => r.status === "awaiting_approval").length,
      inProgress: repairs.filter(r => r.status === "in_progress").length,
      ready: repairs.filter(r => r.status === "ready").length,
      delivered: repairs.filter(r => r.status === "delivered").length,
      cancelled: repairs.filter(r => r.status === "cancelled").length,
      rejectedByTechnician,
      rejectedByShipping: rejectedByTechnician,
    };
  },
});

export const recordPayment = mutation({ args: { repairId: v.id("repairs"), amount: v.number(), accountId: v.id("financialAccounts"), paymentDate: v.string(), requestId: v.string(), notes: v.optional(v.string()) }, handler: async (ctx, args) => { const user = await requirePermission(ctx, "record_collections"); const repair = await ctx.db.get(args.repairId); if (!repair || !repair.branchId) throw new ConvexError("أمر الصيانة غير موجود"); assertBranchAccess(user, repair); if ((await repairPostingState(ctx)).financial && !repair.customerId) throw new ConvexError("يجب ربط الصيانة بعميل مسجل قبل التحصيل المحاسبي"); if (["cancelled", "delivered"].includes(repair.status)) throw new ConvexError("لا يمكن التحصيل لأمر مرفوض من العميل أو مسلم"); if (!Number.isFinite(args.amount) || args.amount <= 0 || args.amount > repair.remaining) throw new ConvexError("مبلغ التحصيل غير صالح"); const account = await requireActiveFinancialAccount(ctx, args.accountId); assertFinancialAccountBranch(account, repair.branchId); const posted = await postFinancialTransaction(ctx, user, { type: "repair_payment", requestId: args.requestId, date: args.paymentDate, amount: args.amount, description: args.notes?.trim() || `تحصيل الصيانة ${repair.repairNumber}`, branchId: repair.branchId, referenceType: "repair", referenceId: String(repair._id), referenceNumber: repair.repairNumber, customerId: repair.customerId, movements: [{ accountId: account._id, signedAmount: args.amount }] }); if (!posted.duplicate) { if (repair.customerId) await postCustomerLedgerEntry(ctx, user, { type: "repair_payment", requestId: `${args.requestId}:ledger`, customerId: repair.customerId, branchId: repair.branchId, date: args.paymentDate, receivableDelta: -args.amount, advanceDelta: 0, purchasesDelta: 0, description: `تحصيل الصيانة ${repair.repairNumber}`, referenceType: "repair", referenceId: String(repair._id), referenceNumber: repair.repairNumber }); await ctx.db.patch(repair._id, { deposit: roundMoney(repair.deposit + args.amount), remaining: roundMoney(repair.remaining - args.amount) }); } return posted.transactionId; } });

export const refundPayment = mutation({ args: { repairId: v.id("repairs"), amount: v.number(), accountId: v.id("financialAccounts"), date: v.string(), reason: v.string(), requestId: v.string() }, handler: async (ctx, args) => { const user = await requirePermission(ctx, "refund_collections"); const repair = await ctx.db.get(args.repairId); if (!repair || !repair.branchId) throw new ConvexError("أمر الصيانة غير موجود"); assertBranchAccess(user, repair); if ((await repairPostingState(ctx)).financial && !repair.customerId) throw new ConvexError("يجب ربط الصيانة بعميل مسجل قبل الاسترداد المحاسبي"); const duplicate = await findFinancialTransactionByRequest(ctx, "repair_refund", user.userId, args.requestId); if (duplicate) return duplicate._id; const reason = args.reason.trim(); if (!reason) throw new ConvexError("سبب الاسترداد مطلوب"); if (!Number.isFinite(args.amount) || args.amount <= 0 || args.amount > repair.deposit) throw new ConvexError("مبلغ الاسترداد غير صالح"); const account = await requireActiveFinancialAccount(ctx, args.accountId); assertFinancialAccountBranch(account, repair.branchId); const posted = await postFinancialTransaction(ctx, user, { type: "repair_refund", requestId: args.requestId, date: args.date, amount: args.amount, description: reason, branchId: repair.branchId, referenceType: "repair", referenceId: String(repair._id), referenceNumber: repair.repairNumber, movements: [{ accountId: account._id, signedAmount: -args.amount }] }); if (repair.customerId) await postCustomerLedgerEntry(ctx, user, { type: "repair_refund", requestId: `${args.requestId}:ledger`, customerId: repair.customerId, branchId: repair.branchId, date: args.date, receivableDelta: args.amount, advanceDelta: 0, purchasesDelta: 0, description: reason, referenceType: "repair", referenceId: String(repair._id), referenceNumber: repair.repairNumber }); await ctx.db.patch(repair._id, { deposit: roundMoney(repair.deposit - args.amount), remaining: roundMoney(repair.remaining + args.amount) }); return posted.transactionId; } });
