import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertBranchAccess, requirePermission, resolveWriteBranch } from "./lib/auth.ts";
import { assertFinancialAccountBranch, postFinancialTransaction, requireActiveFinancialAccount } from "./lib/finance.ts";
import { postCustomerLedgerEntry } from "./lib/customerLedger.ts";
import { postSupplierBalanceMovement } from "./lib/supplierLedger.ts";
import { nextDocumentNumber } from "./lib/documentNumbers.ts";
import { requireActiveCustomer, requireActiveSupplier } from "./lib/references.ts";
import { isValidIsoDate, roundMoney } from "../shared/businessRules.ts";

const kind = v.union(v.literal("check"), v.literal("installment"));
const direction = v.union(v.literal("receivable"), v.literal("payable"));

export const list = query({
  args: {
    branchId: v.optional(v.id("branches")),
    status: v.optional(v.union(v.literal("pending"), v.literal("settled"), v.literal("cancelled"))),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "view_finance");
    const branchId = resolveWriteBranch(user, args.branchId);
    if (!branchId) throw new ConvexError("اختر الفرع");
    const rows = await ctx.db.query("paymentSchedules").withIndex("by_branch_due", q => q.eq("branchId", branchId)).order("desc").collect();
    return args.status ? rows.filter(row => row.status === args.status) : rows;
  },
});

export const create = mutation({
  args: {
    kind,
    direction,
    branchId: v.optional(v.id("branches")),
    customerId: v.optional(v.id("customers")),
    supplierId: v.optional(v.id("suppliers")),
    counterpartyName: v.optional(v.string()),
    amount: v.number(),
    dueDate: v.string(),
    referenceNumber: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const permission = args.direction === "receivable" ? "record_collections" : "record_disbursements";
    const user = await requirePermission(ctx, permission);
    const branchId = resolveWriteBranch(user, args.branchId);
    if (!branchId) throw new ConvexError("اختر الفرع");
    assertBranchAccess(user, { branchId });
    if (!isValidIsoDate(args.dueDate)) throw new ConvexError("تاريخ الاستحقاق غير صالح");
    const amount = roundMoney(args.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new ConvexError("قيمة الاستحقاق غير صالحة");
    if (args.direction === "receivable" && args.supplierId) throw new ConvexError("الاستحقاق الوارد لا يرتبط بمورد");
    if (args.direction === "payable" && args.customerId) throw new ConvexError("الاستحقاق الصادر لا يرتبط بعميل");
    const customer = args.customerId ? await requireActiveCustomer(ctx, args.customerId, branchId) : undefined;
    const supplier = args.supplierId ? await requireActiveSupplier(ctx, args.supplierId) : undefined;
    const counterpartyName = customer?.name ?? supplier?.name ?? args.counterpartyName?.trim();
    if (!counterpartyName) throw new ConvexError("اسم الطرف مطلوب");
    const scheduleNumber = await nextDocumentNumber(ctx, "paymentSchedule", new Date(`${args.dueDate}T00:00:00Z`));
    return await ctx.db.insert("paymentSchedules", {
      scheduleNumber,
      kind: args.kind,
      direction: args.direction,
      branchId,
      customerId: customer?._id,
      supplierId: supplier?._id,
      counterpartyName,
      amount,
      dueDate: args.dueDate,
      referenceNumber: args.referenceNumber?.trim() || undefined,
      notes: args.notes?.trim() || undefined,
      status: "pending",
      createdAt: Date.now(),
      createdBy: user.userId,
    });
  },
});

export const settle = mutation({
  args: {
    scheduleId: v.id("paymentSchedules"),
    accountId: v.id("financialAccounts"),
    date: v.string(),
    requestId: v.string(),
  },
  handler: async (ctx, args) => {
    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) throw new ConvexError("الاستحقاق غير موجود");
    const permission = schedule.direction === "receivable" ? "record_collections" : "record_disbursements";
    const user = await requirePermission(ctx, permission);
    assertBranchAccess(user, schedule);
    if (schedule.status !== "pending") throw new ConvexError("تمت معالجة هذا الاستحقاق سابقًا");
    const account = await requireActiveFinancialAccount(ctx, args.accountId);
    assertFinancialAccountBranch(account, schedule.branchId);
    const receipt = schedule.direction === "receivable";
    const description = `تسوية ${schedule.kind === "check" ? "شيك" : "قسط"} ${schedule.scheduleNumber}`;
    const posted = await postFinancialTransaction(ctx, user, {
      type: receipt ? "receipt_voucher" : "disbursement_voucher",
      requestId: args.requestId,
      date: args.date,
      amount: schedule.amount,
      description,
      branchId: schedule.branchId,
      referenceType: "payment_schedule",
      referenceId: String(schedule._id),
      referenceNumber: schedule.scheduleNumber,
      customerId: schedule.customerId,
      supplierId: schedule.supplierId,
      movements: [{ accountId: account._id, signedAmount: receipt ? schedule.amount : -schedule.amount }],
    });
    if (!posted.duplicate && schedule.customerId) {
      const ledger = await postCustomerLedgerEntry(ctx, user, {
        type: "invoice_payment",
        requestId: `${args.requestId}:customer-ledger`,
        customerId: schedule.customerId,
        branchId: schedule.branchId,
        date: args.date,
        receivableDelta: -schedule.amount,
        advanceDelta: 0,
        purchasesDelta: 0,
        description,
        referenceType: "payment_schedule",
        referenceId: String(schedule._id),
        referenceNumber: schedule.scheduleNumber,
      });
      await ctx.db.patch(posted.transactionId, { customerLedgerEntryId: ledger.entryId });
    }
    if (!posted.duplicate && schedule.supplierId) {
      const ledger = await postSupplierBalanceMovement(ctx, user, {
        type: "supplier_payment",
        requestId: `${args.requestId}:supplier-ledger`,
        supplierId: schedule.supplierId,
        branchId: schedule.branchId,
        date: args.date,
        amountDelta: -schedule.amount,
        description,
        referenceType: "payment_schedule",
        referenceId: String(schedule._id),
        referenceNumber: schedule.scheduleNumber,
      });
      await ctx.db.patch(posted.transactionId, { supplierLedgerEntryId: ledger._id });
    }
    await ctx.db.patch(schedule._id, { status: "settled", settlementTransactionId: posted.transactionId, settledAt: Date.now(), settledBy: user.userId });
    return posted.transactionId;
  },
});

export const cancel = mutation({
  args: { scheduleId: v.id("paymentSchedules"), reason: v.string() },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "reverse_financial_transactions");
    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) throw new ConvexError("الاستحقاق غير موجود");
    assertBranchAccess(user, schedule);
    if (schedule.status !== "pending") throw new ConvexError("لا يمكن إلغاء استحقاق تمت معالجته");
    const reason = args.reason.trim();
    if (!reason) throw new ConvexError("سبب الإلغاء مطلوب");
    await ctx.db.patch(schedule._id, { status: "cancelled", cancelledAt: Date.now(), cancelledBy: user.userId, cancellationReason: reason });
  },
});
