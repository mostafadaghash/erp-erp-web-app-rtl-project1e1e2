import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import {
  assertBranchAccess,
  logAction,
  requireModulePermission,
  requirePermission,
  resolveWriteBranch,
  type AuthUser,
} from "./lib/auth.ts";
import { nextDocumentNumber } from "./lib/documentNumbers.ts";
import { requireActiveBranch, requireActiveCustomer } from "./lib/references.ts";
import { assertFinancialAccountBranch, postFinancialTransaction, requireActiveFinancialAccount } from "./lib/finance.ts";
import { postCustomerLedgerEntry } from "./lib/customerLedger.ts";
import { assertOrderNotLockedByDelivery } from "./lib/deliveryLocks.ts";
import { applyOrderStatsChange } from "./lib/orderStats.ts";
import { upsertOperationFollowUp } from "./lib/operationFollowUpSync.ts";
import { encodeOrderOperationalMeta } from "../shared/orderOperationalMeta.ts";
import { roundMoney } from "../shared/businessRules.ts";

const itemValidator = v.array(v.object({
  productId: v.id("products"),
  quantity: v.number(),
  notes: v.optional(v.string()),
}));

function requestId(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 180) throw new ConvexError("معرف العملية غير صالح");
  return normalized;
}

async function requireProduct(ctx: MutationCtx, user: AuthUser, productId: Id<"products">, branchId: Id<"branches">) {
  const product = await ctx.db.get(productId);
  if (!product || product.isActive === false) throw new ConvexError("أحد الأصناف غير موجود أو غير نشط");
  assertBranchAccess(user, product);
  if (product.branchId !== branchId) throw new ConvexError("أحد الأصناف لا ينتمي إلى فرع الطلب");
  return product;
}

async function sync(ctx: MutationCtx, user: AuthUser, order: Doc<"orders">) {
  if (!order.branchId) return;
  await upsertOperationFollowUp(ctx, user, {
    sourceType: "order",
    sourceId: String(order._id),
    sourceNumber: order.orderNumber,
    sourceStatus: order.status,
    branchId: order.branchId,
    customerId: order.customerId,
    customerName: order.customerName,
    phone: order.customerPhone,
    terminal: order.status === "cancelled" || order.status === "received" || order.status === "delivered_to_customer",
  });
}

export const depositAccounts = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireModulePermission(ctx, "record_order_deposits", "orders");
    const rows = user.role === "admin" && !user.branchId
      ? await ctx.db.query("financialAccounts").withIndex("by_active", q => q.eq("isActive", true)).collect()
      : user.branchId
        ? await ctx.db.query("financialAccounts").withIndex("by_branch", q => q.eq("branchId", user.branchId!)).collect()
        : [];
    return rows.filter(account => account.isActive).map(account => ({ _id: account._id, name: account.name, type: account.type }));
  },
});

export const create = mutation({
  args: {
    customerId: v.id("customers"),
    items: itemValidator,
    creationRequestId: v.string(),
    initialDeposit: v.optional(v.object({
      amount: v.number(),
      accountId: v.id("financialAccounts"),
      paymentDate: v.string(),
      requestId: v.string(),
      notes: v.optional(v.string()),
    })),
    expectedDate: v.optional(v.string()),
    internalNotes: v.optional(v.string()),
    customerAddress: v.optional(v.string()),
    deliveryAddress: v.optional(v.string()),
    shippingCompany: v.optional(v.string()),
    deliveryNotes: v.optional(v.string()),
    branchId: v.optional(v.id("branches")),
  },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "create_order_intake", "orders");
    const idempotency = `${user.userId}:${requestId(args.creationRequestId)}`;
    const duplicate = await ctx.db.query("orders").withIndex("by_creation_request", q => q.eq("creationRequestId", idempotency)).unique();
    if (duplicate) return duplicate._id;

    const branchId = resolveWriteBranch(user, args.branchId);
    if (!branchId) throw new ConvexError("اختر فرع العمل");
    await requireActiveBranch(ctx, branchId);
    const customer = await requireActiveCustomer(ctx, args.customerId, branchId);
    assertBranchAccess(user, customer);
    if (args.items.length === 0) throw new ConvexError("أضف صنفاً واحداً على الأقل");

    const seen = new Set<string>();
    const items = [];
    for (const row of args.items) {
      if (!Number.isInteger(row.quantity) || row.quantity <= 0) throw new ConvexError("الكمية يجب أن تكون عدداً صحيحاً أكبر من صفر");
      const key = String(row.productId);
      if (seen.has(key)) throw new ConvexError("لا تكرر الصنف؛ عدّل الكمية في السطر نفسه");
      seen.add(key);
      const product = await requireProduct(ctx, user, row.productId, branchId);
      items.push({ productId: product._id, productName: product.name, quantity: row.quantity, unitPrice: -1, notes: row.notes?.trim() || undefined });
    }

    const deposit = roundMoney(args.initialDeposit?.amount ?? 0);
    if (!Number.isFinite(deposit) || deposit < 0) throw new ConvexError("العربون غير صالح");
    let account: Doc<"financialAccounts"> | undefined;
    if (args.initialDeposit) {
      await requirePermission(ctx, "record_order_deposits");
      if (deposit <= 0) throw new ConvexError("العربون يجب أن يكون أكبر من صفر");
      account = await requireActiveFinancialAccount(ctx, args.initialDeposit.accountId);
      assertFinancialAccountBranch(account, branchId);
    }

    const orderNumber = await nextDocumentNumber(ctx, "order");
    const notes = encodeOrderOperationalMeta({
      internalNotes: args.internalNotes,
      customerAddress: args.customerAddress,
      deliveryAddress: args.deliveryAddress,
      shippingCompany: args.shippingCompany,
      deliveryNotes: args.deliveryNotes,
    });
    const orderId = await ctx.db.insert("orders", {
      orderNumber,
      customerId: customer._id,
      customerName: customer.name,
      customerPhone: customer.phone,
      items,
      total: 0,
      deposit,
      remaining: 0,
      status: "pending",
      expectedDate: args.expectedDate?.trim() || undefined,
      notes,
      branchId,
      creationRequestId: idempotency,
    });

    await applyOrderStatsChange(ctx, undefined, { status: "pending", total: 0, remaining: 0, branchId });
    if (args.initialDeposit && account) {
      await postCustomerLedgerEntry(ctx, user, {
        type: "order_deposit",
        requestId: `${args.initialDeposit.requestId}:ledger`,
        customerId: customer._id,
        branchId,
        date: args.initialDeposit.paymentDate,
        receivableDelta: 0,
        advanceDelta: deposit,
        purchasesDelta: 0,
        description: `عربون الطلب ${orderNumber}`,
        referenceType: "order",
        referenceId: String(orderId),
        referenceNumber: orderNumber,
      });
      await postFinancialTransaction(ctx, user, {
        type: "order_deposit",
        requestId: args.initialDeposit.requestId,
        date: args.initialDeposit.paymentDate,
        amount: deposit,
        description: args.initialDeposit.notes?.trim() || `عربون الطلب ${orderNumber}`,
        branchId,
        referenceType: "order",
        referenceId: String(orderId),
        referenceNumber: orderNumber,
        customerId: customer._id,
        movements: [{ accountId: account._id, signedAmount: deposit }],
      });
    }

    const order = (await ctx.db.get(orderId))!;
    await sync(ctx, user, order);
    await logAction(ctx, user, {
      action: "create",
      module: "orders",
      recordId: String(orderId),
      recordLabel: orderNumber,
      details: `إنشاء طلب بيع غير مسعر ${orderNumber} للعميل ${customer.name}`,
      branchId,
      sourceType: "order",
      sourceId: String(orderId),
      sourceNumber: orderNumber,
      relatedType: "customer",
      relatedId: String(customer._id),
      after: { status: "pending", priced: false, deposit, customerName: customer.name },
    });
    return orderId;
  },
});

export const update = mutation({
  args: {
    id: v.id("orders"),
    customerId: v.id("customers"),
    items: itemValidator,
    expectedDate: v.optional(v.string()),
    internalNotes: v.optional(v.string()),
    customerAddress: v.optional(v.string()),
    deliveryAddress: v.optional(v.string()),
    shippingCompany: v.optional(v.string()),
    deliveryNotes: v.optional(v.string()),
    requestId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "edit_order_intake", "orders");
    requestId(args.requestId);
    const order = await ctx.db.get(args.id);
    if (!order || !order.branchId) throw new ConvexError("الطلب غير موجود أو غير مرتبط بفرع");
    assertBranchAccess(user, order);
    if (order.status !== "pending" || order.linkedInvoiceId) throw new ConvexError("بيانات الإدخال قابلة للتعديل قبل التأكيد فقط");
    await assertOrderNotLockedByDelivery(ctx, order._id);
    if (order.deposit > 0 && order.customerId && args.customerId !== order.customerId) throw new ConvexError("لا يمكن تغيير العميل بعد تسجيل عربون");
    const customer = await requireActiveCustomer(ctx, args.customerId, order.branchId);
    assertBranchAccess(user, customer);
    if (args.items.length === 0) throw new ConvexError("أضف صنفاً واحداً على الأقل");

    const seen = new Set<string>();
    const items = [];
    for (const row of args.items) {
      if (!Number.isInteger(row.quantity) || row.quantity <= 0) throw new ConvexError("الكمية يجب أن تكون عدداً صحيحاً أكبر من صفر");
      const key = String(row.productId);
      if (seen.has(key)) throw new ConvexError("لا تكرر الصنف؛ عدّل الكمية في السطر نفسه");
      seen.add(key);
      const product = await requireProduct(ctx, user, row.productId, order.branchId);
      items.push({ productId: product._id, productName: product.name, quantity: row.quantity, unitPrice: -1, notes: row.notes?.trim() || undefined });
    }
    const notes = encodeOrderOperationalMeta({
      internalNotes: args.internalNotes,
      customerAddress: args.customerAddress,
      deliveryAddress: args.deliveryAddress,
      shippingCompany: args.shippingCompany,
      deliveryNotes: args.deliveryNotes,
    });
    await ctx.db.patch(order._id, {
      customerId: customer._id,
      customerName: customer.name,
      customerPhone: customer.phone,
      items,
      total: 0,
      remaining: 0,
      expectedDate: args.expectedDate?.trim() || undefined,
      notes,
    });
    await applyOrderStatsChange(ctx, order, { ...order, total: 0, remaining: 0 });
    const updated = (await ctx.db.get(order._id))!;
    await sync(ctx, user, updated);
    await logAction(ctx, user, {
      action: "update_intake",
      module: "orders",
      recordId: String(order._id),
      recordLabel: order.orderNumber,
      details: `تعديل بيانات الإدخال وإعادة الطلب ${order.orderNumber} إلى غير مسعر`,
      branchId: order.branchId,
      sourceType: "order",
      sourceId: String(order._id),
      sourceNumber: order.orderNumber,
      relatedType: "customer",
      relatedId: String(customer._id),
      before: { total: order.total, remaining: order.remaining },
      after: { total: 0, remaining: 0, priced: false },
    });
    return order._id;
  },
});
