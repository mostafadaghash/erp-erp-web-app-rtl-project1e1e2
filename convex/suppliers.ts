import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireModulePermission, requirePermission, assertBranchAccess, logAction } from "./lib/auth";
import { paginationOptsValidator } from "convex/server";

function publicSupplier<T extends { balance: number }>(supplier: T) {
  const { balance: _legacyBalance, ...safe } = supplier;
  return safe;
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
    return await ctx.db.query("supplierBalances").withIndex("by_branch", q => q.eq("branchId", args.branchId)).collect();
  },
});

export const ledger = query({
  args: { supplierId: v.id("suppliers"), branchId: v.id("branches"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "view_supplier_ledger");
    assertBranchAccess(user, { branchId: args.branchId });
    return await ctx.db.query("supplierLedgerEntries").withIndex("by_supplier_branch_date", q => q.eq("supplierId", args.supplierId).eq("branchId", args.branchId)).order("desc").paginate(args.paginationOpts);
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
    const id = await ctx.db.insert("suppliers", { ...args, balance: 0, isActive: true });
    await logAction(ctx, user, {
      action: "create",
      module: "suppliers",
      recordId: id,
      recordLabel: args.name,
      details: `إضافة مورد جديد: ${args.name} - ${args.phone}`,
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
    const { id, ...rest } = args;
    const supplier = await ctx.db.get(id);
    if (!supplier) throw new ConvexError("المورد غير موجود");
    await ctx.db.patch(id, rest);
    await logAction(ctx, user, {
      action: "update",
      module: "suppliers",
      recordId: id,
      recordLabel: supplier.name,
      details: `تحديث بيانات المورد: ${supplier.name}`,
    });
  },
});

export const setActive = mutation({
  args: { id: v.id("suppliers"), isActive: v.boolean() },
  handler: async (ctx, args) => { const user = await requireModulePermission(ctx, "delete_suppliers", "suppliers"); const supplier = await ctx.db.get(args.id); if (!supplier) throw new ConvexError("المورد غير موجود"); await ctx.db.patch(args.id, { isActive: args.isActive }); await logAction(ctx, user, { action: args.isActive ? "activate" : "deactivate", module: "suppliers", recordId: args.id, recordLabel: supplier.name, details: `${args.isActive ? "تفعيل" : "تعطيل"} المورد ${supplier.name}` }); },
});
export const remove = mutation({ args: { id: v.id("suppliers") }, handler: async () => { throw new ConvexError("استخدم تعطيل المورد بدلاً من الحذف"); } });
