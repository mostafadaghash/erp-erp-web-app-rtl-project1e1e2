import { query, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { canTransition, REPAIR_TRANSITIONS, isValidIsoDate, roundMoney } from "../shared/businessRules";
import { nextDocumentNumber } from "./lib/documentNumbers";
import { requireActiveBranch, requireActiveCustomer } from "./lib/references";
import { assertBranchAccess, requireModuleEnabled, requireModulePermission, filterByBranch, resolveWriteBranch, logAction } from "./lib/auth";

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

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireModulePermission(ctx, "view_repairs", "repairs");
    const repairs = await ctx.db.query("repairs").order("desc").collect();
    return filterByBranch(repairs, user);
  },
});

export const get = query({
  args: { id: v.id("repairs") },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "view_repairs", "repairs");
    const repair = await ctx.db.get(args.id);
    if (repair) assertBranchAccess(user, repair);
    return repair;
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
    deposit: v.number(),
    expectedDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    branchId: v.optional(v.id("branches")),
    technicianName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "create_repairs", "repairs");
    const branchId = resolveWriteBranch(user, args.branchId);
    await requireActiveBranch(ctx, branchId);
    for (const value of [args.customerName, args.customerPhone, args.deviceType, args.deviceBrand, args.deviceModel, args.problem]) if (!value.trim()) throw new ConvexError("جميع الحقول النصية المطلوبة يجب ألا تكون فارغة");
    if (!Number.isFinite(args.laborCost) || args.laborCost < 0 || !Number.isFinite(args.deposit) || args.deposit < 0) throw new ConvexError("قيم الصيانة المالية غير صالحة");
    if (args.deposit > args.laborCost) throw new ConvexError("العربون لا يمكن أن يتجاوز التكلفة الإجمالية");
    if (args.expectedDate && !isValidIsoDate(args.expectedDate)) throw new ConvexError("التاريخ المتوقع غير صالح");
    if (args.customerId) {
      const customer = await requireActiveCustomer(ctx, args.customerId, branchId);
      assertBranchAccess(user, customer);
    }
    const repairNumber = await nextDocumentNumber(ctx, "repair");
    const trackingToken = await createUniqueTrackingToken(ctx);
    const totalCost = roundMoney(args.laborCost);
    const id = await ctx.db.insert("repairs", {
      ...args,
      branchId,
      repairNumber,
      trackingToken,
      parts: [],
      totalCost,
      laborCost: totalCost, deposit: roundMoney(args.deposit),
      remaining: roundMoney(totalCost - args.deposit),
      status: "received",
      receivedDate: new Date().toISOString().split("T")[0],
    });
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
  },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "edit_repairs", "repairs");
    const repair = await ctx.db.get(args.id);
    if (!repair) throw new ConvexError("أمر الصيانة غير موجود");
    assertBranchAccess(user, repair);
    if (!canTransition(REPAIR_TRANSITIONS, repair.status, args.status)) throw new ConvexError(`لا يمكن تغيير حالة الصيانة من ${repair.status} إلى ${args.status}`);
    if (args.status === "cancelled" && !args.reason?.trim()) throw new ConvexError("سبب الإلغاء مطلوب");
    if (args.status === "delivered" && repair.remaining > 0) throw new ConvexError("لا يمكن تسليم صيانة عليها مبلغ متبقٍ");
    await ctx.db.patch(args.id, {
      status: args.status, diagnosis: args.diagnosis?.trim(),
      ...(args.status === "delivered" ? { deliveredDate: new Date().toISOString().slice(0, 10) } : {}),
      ...(args.status === "cancelled" ? { cancelledAt: Date.now(), cancelledBy: user.userId, cancellationReason: args.reason?.trim() } : {}),
    });
    await logAction(ctx, user, {
      action: "update",
      module: "repairs",
      recordId: args.id,
      recordLabel: repair.repairNumber,
      details: `تحديث حالة الصيانة ${repair.repairNumber} إلى: ${args.status}`,
    });
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
