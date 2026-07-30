import { query, mutation } from "./_generated/server.js";
import { v, ConvexError } from "convex/values";
import { requireModulePermission, requirePermission, assertBranchAccess, logAction } from "./lib/auth.ts";
import { paginationOptsValidator } from "convex/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  normalizeContactEmail,
  normalizeContactName,
  normalizeContactPhone,
  normalizeOptionalContactText,
} from "../shared/contactRules.ts";

function publicSupplier<T extends { balance: number }>(supplier: T) {
  const { balance: _legacyBalance, ...safe } = supplier;
  return safe;
}

function supplierData(input: {
  name: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
}) {
  try {
    return {
      name: normalizeContactName(input.name),
      phone: normalizeContactPhone(input.phone),
      email: normalizeContactEmail(input.email),
      address: normalizeOptionalContactText(input.address, 300),
      notes: normalizeOptionalContactText(input.notes, 1000),
    };
  } catch {
    throw new ConvexError("أدخل اسمًا ورقم هاتف صحيحين، وتأكد من أطوال بيانات المورد");
  }
}

async function assertUniqueSupplierPhone(
  ctx: MutationCtx,
  phone: string,
  exceptId?: Id<"suppliers">,
) {
  const exactMatches = await ctx.db
    .query("suppliers")
    .withIndex("by_phone", (q) => q.eq("phone", phone))
    .collect();
  const suppliers = exactMatches.length === 0
    ? await ctx.db.query("suppliers").collect()
    : exactMatches;
  if (suppliers.some((supplier) => {
    if (supplier._id === exceptId) return false;
    try {
      return normalizeContactPhone(supplier.phone) === phone;
    } catch {
      return false;
    }
  })) {
    throw new ConvexError("رقم الهاتف مسجل لمورد آخر");
  }
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireModulePermission(ctx, "view_suppliers", "suppliers");
    return (await ctx.db.query("suppliers").collect()).map(publicSupplier);
  },
});

export const get = query({
  args: { id: v.id("suppliers") },
  handler: async (ctx, args) => {
    await requireModulePermission(ctx, "view_suppliers", "suppliers");
    const supplier = await ctx.db.get(args.id);
    return supplier ? publicSupplier(supplier) : null;
  },
});

export const branchBalances = query({
  args: { branchId: v.id("branches") },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "view_supplier_ledger");
    assertBranchAccess(user, { branchId: args.branchId });
    const balances = await ctx.db.query("supplierBalances").withIndex("by_branch", q => q.eq("branchId", args.branchId)).collect();
    return balances.map(({ supplierId, balance }) => ({ supplierId, balance }));
  },
});

export const availableBranches = query({
  args: {},
  handler: async (ctx) => {
    const user = await requirePermission(ctx, "view_supplier_ledger");
    if (user.role === "admin") {
      return (await ctx.db.query("branches").collect())
        .filter((branch) => branch.isActive)
        .map(({ _id, name }) => ({ _id, name }));
    }
    if (!user.branchId) throw new ConvexError("المستخدم غير مربوط بفرع");
    const branch = await ctx.db.get(user.branchId);
    return branch?.isActive ? [{ _id: branch._id, name: branch.name }] : [];
  },
});

export const ledger = query({
  args: { supplierId: v.id("suppliers"), branchId: v.id("branches"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "view_supplier_ledger");
    assertBranchAccess(user, { branchId: args.branchId });
    const supplier = await ctx.db.get(args.supplierId);
    if (!supplier) throw new ConvexError("المورد غير موجود");
    const page = await ctx.db.query("supplierLedgerEntries").withIndex("by_supplier_branch_date", q => q.eq("supplierId", args.supplierId).eq("branchId", args.branchId)).order("desc").paginate(args.paginationOpts);
    return {
      ...page,
      page: page.page.map((entry) => ({
        _id: entry._id,
        entryNumber: entry.entryNumber,
        type: entry.type,
        status: entry.status,
        date: entry.date,
        amountDelta: entry.amountDelta,
        balanceBefore: entry.balanceBefore,
        balanceAfter: entry.balanceAfter,
        referenceType: entry.referenceType,
        referenceNumber: entry.referenceNumber,
        description: entry.description,
        ...(entry.externalInvoiceNumber
          ? { externalInvoiceNumber: entry.externalInvoiceNumber }
          : {}),
        ...(entry.reversalDate ? { reversalDate: entry.reversalDate } : {}),
        ...(entry.reversalReason ? { reversalReason: entry.reversalReason } : {}),
      })),
    };
  },
});

export const purchaseReceipt = query({ args: { id: v.id("purchaseReceipts") }, handler: async (ctx, args) => { const user = await requirePermission(ctx, "view_supplier_ledger"); const receipt = await ctx.db.get(args.id); if (receipt) assertBranchAccess(user, receipt); return receipt; } });

export const legacyReview = query({ args: {}, handler: async (ctx) => {
  await requirePermission(ctx, "initialize_finance");
  const arrived = await ctx.db.query("shipments").withIndex("by_status", q => q.eq("status", "arrived")).collect();
  const legacy = arrived.filter(shipment => !shipment.purchaseReceiptId);
  const suppliers = await ctx.db.query("suppliers").collect();
  return { arrivedWithoutPurchaseReceiptCount: legacy.length, arrivedWithoutPurchaseReceiptValue: legacy.reduce((sum, shipment) => sum + shipment.grandTotal, 0), shipmentIdsWithoutSupplier: legacy.filter(shipment => !shipment.supplierId).map(shipment => shipment._id), suppliersWithLegacyBalance: suppliers.filter(supplier => supplier.balance !== 0).map(supplier => ({ supplierId: supplier._id, legacyBalance: supplier.balance })), requiresManualMigrationDecision: true };
} });

export const create = mutation({
  args: {
    name: v.string(),
    phone: v.string(),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "create_suppliers", "suppliers");
    const normalized = supplierData(args);
    await assertUniqueSupplierPhone(ctx, normalized.phone);
    const id = await ctx.db.insert("suppliers", { ...normalized, balance: 0, isActive: true });
    await logAction(ctx, user, {
      action: "create",
      module: "suppliers",
      recordId: id,
      recordLabel: normalized.name,
      details: `إضافة مورد جديد: ${normalized.name} - ${normalized.phone}`,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("suppliers"),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "edit_suppliers", "suppliers");
    const { id } = args;
    const supplier = await ctx.db.get(id);
    if (!supplier) throw new ConvexError("المورد غير موجود");
    const normalized = supplierData({
      name: args.name ?? supplier.name,
      phone: args.phone ?? supplier.phone,
      email: args.email !== undefined ? args.email : supplier.email,
      address: args.address !== undefined ? args.address : supplier.address,
      notes: args.notes !== undefined ? args.notes : supplier.notes,
    });
    await assertUniqueSupplierPhone(ctx, normalized.phone, supplier._id);
    await ctx.db.patch(id, normalized);
    await logAction(ctx, user, {
      action: "update",
      module: "suppliers",
      recordId: id,
      recordLabel: normalized.name,
      details: `تحديث بيانات المورد: ${supplier.name} ← ${normalized.name}`,
    });
  },
});

export const setActive = mutation({
  args: { id: v.id("suppliers"), isActive: v.boolean() },
  handler: async (ctx, args) => { const user = await requireModulePermission(ctx, "delete_suppliers", "suppliers"); const supplier = await ctx.db.get(args.id); if (!supplier) throw new ConvexError("المورد غير موجود"); await ctx.db.patch(args.id, { isActive: args.isActive }); await logAction(ctx, user, { action: args.isActive ? "activate" : "deactivate", module: "suppliers", recordId: args.id, recordLabel: supplier.name, details: `${args.isActive ? "تفعيل" : "تعطيل"} المورد ${supplier.name}` }); },
});
export const remove = mutation({ args: { id: v.id("suppliers") }, handler: async () => { throw new ConvexError("استخدم تعطيل المورد بدلاً من الحذف"); } });
