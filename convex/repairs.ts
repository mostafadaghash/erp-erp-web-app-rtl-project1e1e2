import { query, mutation } from "./_generated/server.js";
import type { MutationCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { canTransition, REPAIR_TRANSITIONS, isValidIsoDate, roundMoney } from "../shared/businessRules.ts";
import { nextDocumentNumber } from "./lib/documentNumbers.ts";
import { requireActiveBranch, requireActiveCustomer } from "./lib/references.ts";
import { assertBranchAccess, requireModuleEnabled, requireModulePermission, requirePermission, filterByBranch, resolveWriteBranch, logAction } from "./lib/auth.ts";
import { postFinancialTransaction, requireActiveFinancialAccount, assertFinancialAccountBranch, findFinancialTransactionByRequest } from "./lib/finance.ts";
import { postCustomerLedgerEntry } from "./lib/customerLedger.ts";
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

function publicRepair<T extends Record<string, unknown>>(repair: T) {
  const {
    journalEntryId: _journalEntryId,
    cancellationJournalEntryId: _cancellationJournalEntryId,
    creationRequestId: _creationRequestId,
    cancellationRequestId: _cancellationRequestId,
    cancellationFingerprint: _cancellationFingerprint,
    ...dto
  } = repair;
  return dto;
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireModulePermission(ctx, "view_repairs", "repairs");
    const repairs = await ctx.db.query("repairs").order("desc").collect();
    return filterByBranch(repairs, user).map(publicRepair);
  },
});

export const get = query({
  args: { id: v.id("repairs") },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "view_repairs", "repairs");
    const repair = await ctx.db.get(args.id);
    if (repair) assertBranchAccess(user, repair);
    return repair ? publicRepair(repair) : null;
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
    const creationRequestId = `${user.userId}:${args.creationRequestId.trim()}`; if (!args.creationRequestId.trim()) throw new ConvexError("معرف طلب إنشاء الصيانة مطلوب");
    const existing = await ctx.db.query("repairs").withIndex("by_creation_request", q => q.eq("creationRequestId", creationRequestId)).unique(); if (existing) return existing._id;
    const branchId = resolveWriteBranch(user, args.branchId);
    await requireActiveBranch(ctx, branchId);
    const date = assertIsoDate(
      args.date ?? new Date().toISOString().slice(0, 10),
    );
    for (const value of [args.customerName, args.customerPhone, args.deviceType, args.deviceBrand, args.deviceModel, args.problem]) if (!value.trim()) throw new ConvexError("جميع الحقول النصية المطلوبة يجب ألا تكون فارغة");
    const initialAmount = args.initialDeposit?.amount ?? 0;
    if (args.initialDeposit && initialAmount <= 0) throw new ConvexError("العربون الأولي يجب أن يكون أكبر من صفر");
    if (!Number.isFinite(args.laborCost) || args.laborCost < 0 || !Number.isFinite(initialAmount) || initialAmount < 0) throw new ConvexError("قيم الصيانة المالية غير صالحة");
    if (initialAmount > args.laborCost) throw new ConvexError("العربون لا يمكن أن يتجاوز التكلفة الإجمالية");
    if (args.expectedDate && !isValidIsoDate(args.expectedDate)) throw new ConvexError("التاريخ المتوقع غير صالح");
    const postingState = await repairPostingState(ctx);
    if (
      !args.customerId &&
      ((postingState.operational && args.laborCost > 0) ||
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
    const totalCost = roundMoney(args.laborCost);
    let account; if (args.initialDeposit) { await requirePermission(ctx, "record_collections"); account = await requireActiveFinancialAccount(ctx, args.initialDeposit.accountId); assertFinancialAccountBranch(account, branchId!); }
    const { initialDeposit: _initialDeposit, date: _date, ...documentArgs } = args;
    const id = await ctx.db.insert("repairs", {
      ...documentArgs,
      branchId,
      repairNumber,
      trackingToken,
      parts: [],
      totalCost,
      laborCost: totalCost, deposit: roundMoney(initialAmount),
      remaining: roundMoney(totalCost - initialAmount), creationRequestId,
      status: "received",
      receivedDate: date,
    });
    if (args.customerId) await postCustomerLedgerEntry(ctx, user, { type: "repair_charge", requestId: `${args.creationRequestId}:charge`, customerId: args.customerId, branchId: branchId!, date, receivableDelta: totalCost, advanceDelta: 0, purchasesDelta: totalCost, description: `تكلفة الصيانة ${repairNumber}`, referenceType: "repair", referenceId: String(id), referenceNumber: repairNumber });
    const journal = await postRepairRevenueJournal(ctx, user, {
      branchId: branchId!,
      date,
      requestId: `${args.creationRequestId}:revenue`,
      repairId: id,
      repairNumber,
      laborCost: args.laborCost,
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
            hasAccountingImpact: repair.totalCost > 0,
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
