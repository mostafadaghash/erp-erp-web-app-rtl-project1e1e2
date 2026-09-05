import { query } from "./_generated/server.js";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";
import { hasPermission, requirePermission, type AuthUser } from "./lib/auth.ts";
import { roundMoney } from "../shared/businessRules.ts";
import {
  percentage,
  reversibleActivity,
  validateReportingRange,
  type ReportingRange,
} from "../shared/reportingRules.ts";

const LIQUID_ACCOUNT_TYPES = new Set<Doc<"financialAccounts">["type"]>([
  "cash",
  "instapay",
  "vodafone_cash",
  "bank",
  "other",
]);

function normalizedRange(from: string, to: string): ReportingRange {
  try {
    return validateReportingRange(from, to);
  } catch (error) {
    if (error instanceof RangeError && error.message === "reporting range is too large") {
      throw new ConvexError("الفترة الواحدة للوحة التنفيذية لا يمكن أن تتجاوز 366 يومًا");
    }
    throw new ConvexError("أدخل فترة صحيحة بصيغة YYYY-MM-DD");
  }
}

function mergeById<T extends { _id: unknown }>(...sets: T[][]) {
  const documents = new Map<string, T>();
  for (const document of sets.flat()) documents.set(String(document._id), document);
  return [...documents.values()];
}

function invoiceCogs(invoice: Doc<"invoices">): number | null {
  if (invoice.cogsTotal !== undefined && Number.isFinite(invoice.cogsTotal)) return invoice.cogsTotal;
  if (invoice.items.every((item) => item.costTotal !== undefined)) {
    return roundMoney(invoice.items.reduce((sum, item) => sum + (item.costTotal ?? 0), 0));
  }
  return null;
}

async function resolveBranches(
  ctx: QueryCtx,
  user: AuthUser,
  requestedBranchId?: Id<"branches">,
) {
  const central = user.role === "admin" || user.role === "accountant";
  if (requestedBranchId) {
    const branch = await ctx.db.get(requestedBranchId);
    if (!branch || !branch.isActive) throw new ConvexError("الفرع المطلوب غير موجود أو غير نشط");
    if (!central && user.branchId !== requestedBranchId) {
      throw new ConvexError("ليس لديك صلاحية لعرض بيانات فرع آخر");
    }
    return [requestedBranchId];
  }
  if (central) {
    return (await ctx.db.query("branches").collect())
      .filter((branch) => branch.isActive)
      .map((branch) => branch._id);
  }
  if (!user.branchId) throw new ConvexError("يجب ربط حسابك بفرع لعرض اللوحة التنفيذية");
  const branch = await ctx.db.get(user.branchId);
  if (!branch?.isActive) throw new ConvexError("فرع المستخدم غير نشط");
  return [user.branchId];
}

async function loadInvoices(ctx: QueryCtx, branchId: Id<"branches">, range: ReportingRange) {
  return ctx.db
    .query("invoices")
    .withIndex("by_branch_date", (q) => q.eq("branchId", branchId).gte("date", range.from).lte("date", range.to))
    .collect();
}

async function loadSalesReturns(ctx: QueryCtx, branchId: Id<"branches">, range: ReportingRange) {
  const [byDate, byReversal] = await Promise.all([
    ctx.db
      .query("salesReturns")
      .withIndex("by_branch_date", (q) => q.eq("branchId", branchId).gte("date", range.from).lte("date", range.to))
      .collect(),
    ctx.db
      .query("salesReturns")
      .withIndex("by_branch_reversal_date", (q) => q.eq("branchId", branchId).gte("reversalDate", range.from).lte("reversalDate", range.to))
      .collect(),
  ]);
  return mergeById(byDate, byReversal);
}

async function loadExpenses(ctx: QueryCtx, branchId: Id<"branches">, range: ReportingRange) {
  return ctx.db
    .query("expenses")
    .withIndex("by_branch_date", (q) => q.eq("branchId", branchId).gte("date", range.from).lte("date", range.to))
    .collect();
}

async function loadSettlements(ctx: QueryCtx, branchId: Id<"branches">, range: ReportingRange) {
  const [byDate, byReversal] = await Promise.all([
    ctx.db
      .query("codSettlements")
      .withIndex("by_branch_date", (q) => q.eq("branchId", branchId).gte("date", range.from).lte("date", range.to))
      .collect(),
    ctx.db
      .query("codSettlements")
      .withIndex("by_branch_reversal_date", (q) => q.eq("branchId", branchId).gte("reversalDate", range.from).lte("reversalDate", range.to))
      .collect(),
  ]);
  return mergeById(byDate, byReversal);
}

export const availableBranches = query({
  args: {},
  handler: async (ctx) => {
    const user = await requirePermission(ctx, "view_executive_dashboard");
    const central = user.role === "admin" || user.role === "accountant";
    if (central) {
      return (await ctx.db.query("branches").collect())
        .filter((branch) => branch.isActive)
        .map((branch) => ({ _id: branch._id, name: branch.name }));
    }
    if (!user.branchId) return [];
    const branch = await ctx.db.get(user.branchId);
    return branch?.isActive ? [{ _id: branch._id, name: branch.name }] : [];
  },
});

export const overview = query({
  args: {
    branchId: v.optional(v.id("branches")),
    from: v.string(),
    to: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "view_executive_dashboard");
    const range = normalizedRange(args.from, args.to);
    const branchIds = await resolveBranches(ctx, user, args.branchId);

    const canViewSales = hasPermission(user, "view_invoices");
    const canViewPurchases = hasPermission(user, "view_shipments");
    const canViewExpenses = hasPermission(user, "view_expenses");
    const canViewFinance = hasPermission(user, "view_finance");
    const canViewCustomerLedger = hasPermission(user, "view_customer_ledger");
    const canViewSupplierLedger = hasPermission(user, "view_supplier_ledger");
    const canViewProfits = hasPermission(user, "view_profits");
    const canViewProducts = hasPermission(user, "view_products");

    const needSalesData = canViewSales || canViewProfits;
    const needExpenseData = canViewExpenses || canViewProfits;

    const invoicesByBranch = needSalesData
      ? await Promise.all(branchIds.map((branchId) => loadInvoices(ctx, branchId, range)))
      : [];
    const returnsByBranch = needSalesData
      ? await Promise.all(branchIds.map((branchId) => loadSalesReturns(ctx, branchId, range)))
      : [];
    const invoices = invoicesByBranch.flat().filter((invoice) => invoice.status !== "cancelled");
    const salesReturns = returnsByBranch.flat();

    const grossSales = roundMoney(invoices.reduce((sum, invoice) => sum + invoice.total, 0));
    const salesReturnActivity = roundMoney(
      salesReturns.reduce(
        (sum, document) => sum + reversibleActivity(document, document.totalCredit, range),
        0,
      ),
    );
    const netSales = roundMoney(grossSales - salesReturnActivity);

    const receipts = canViewPurchases
      ? (await Promise.all(branchIds.map((branchId) =>
          ctx.db
            .query("purchaseReceipts")
            .withIndex("by_branch_date", (q) => q.eq("branchId", branchId).gte("receiptDate", range.from).lte("receiptDate", range.to))
            .collect(),
        ))).flat()
      : [];
    const landedPurchases = roundMoney(receipts.reduce((sum, receipt) => sum + receipt.totalLandedCost, 0));

    const expenseRows = needExpenseData
      ? (await Promise.all(branchIds.map((branchId) => loadExpenses(ctx, branchId, range)))).flat()
      : [];
    const settlements = needExpenseData
      ? (await Promise.all(branchIds.map((branchId) => loadSettlements(ctx, branchId, range)))).flat()
      : [];
    const operatingExpenses = roundMoney(
      expenseRows.filter((expense) => expense.status !== "voided").reduce((sum, expense) => sum + expense.amount, 0),
    );
    const carrierFees = roundMoney(
      settlements.reduce(
        (sum, settlement) => sum + reversibleActivity(settlement, settlement.feeAmount, range),
        0,
      ),
    );
    const totalExpenses = roundMoney(operatingExpenses + carrierFees);

    let profitability: { netProfit: number | null; netMargin: number | null; complete: boolean } | null = null;
    if (canViewProfits) {
      const cogsValues = invoices.map(invoiceCogs);
      const incompleteCogsInvoices = cogsValues.filter((value) => value === null).length;
      const invoiceCogsTotal = roundMoney(cogsValues.reduce<number>((sum, value) => sum + (value ?? 0), 0));
      const returnedCogs = roundMoney(
        salesReturns.reduce(
          (sum, document) => sum + reversibleActivity(document, document.totalCogsReversed, range),
          0,
        ),
      );
      const netCogs = roundMoney(invoiceCogsTotal - returnedCogs);
      const complete = incompleteCogsInvoices === 0;
      const grossProfit = complete ? roundMoney(netSales - netCogs) : null;
      const netProfit = grossProfit === null ? null : roundMoney(grossProfit - totalExpenses);
      profitability = {
        complete,
        netProfit,
        netMargin: netProfit === null ? null : percentage(netProfit, netSales),
      };
    }

    const customerBalances = canViewCustomerLedger
      ? (await Promise.all(branchIds.map((branchId) =>
          ctx.db.query("customerBalances").withIndex("by_branch", (q) => q.eq("branchId", branchId)).collect(),
        ))).flat()
      : [];
    const supplierBalances = canViewSupplierLedger
      ? (await Promise.all(branchIds.map((branchId) =>
          ctx.db.query("supplierBalances").withIndex("by_branch", (q) => q.eq("branchId", branchId)).collect(),
        ))).flat()
      : [];
    const financialAccounts = canViewFinance
      ? (await Promise.all(branchIds.map((branchId) =>
          ctx.db.query("financialAccounts").withIndex("by_branch", (q) => q.eq("branchId", branchId)).collect(),
        ))).flat()
      : [];
    const products = canViewProducts && canViewProfits
      ? (await Promise.all(branchIds.map((branchId) =>
          ctx.db.query("products").withIndex("by_branch", (q) => q.eq("branchId", branchId)).collect(),
        ))).flat()
      : [];

    return {
      scope: {
        from: range.from,
        to: range.to,
        branchId: branchIds.length === 1 ? branchIds[0] : undefined,
        branchCount: branchIds.length,
        consolidated: args.branchId === undefined && branchIds.length > 1,
      },
      sales: canViewSales ? { invoiceCount: invoices.length, netSales } : null,
      purchases: canViewPurchases ? { receiptCount: receipts.length, landedPurchases } : null,
      profitability,
      expenses: canViewExpenses ? { totalExpenses } : null,
      balances: {
        liquidAccounts: canViewFinance
          ? roundMoney(financialAccounts.filter((account) => LIQUID_ACCOUNT_TYPES.has(account.type)).reduce((sum, account) => sum + account.currentBalance, 0))
          : null,
        customerReceivables: canViewCustomerLedger
          ? roundMoney(customerBalances.reduce((sum, balance) => sum + balance.receivableBalance, 0))
          : null,
        supplierPayables: canViewSupplierLedger
          ? roundMoney(supplierBalances.reduce((sum, balance) => sum + balance.balance, 0))
          : null,
        inventoryValue: canViewProducts && canViewProfits
          ? roundMoney(products.reduce((sum, product) => sum + (product.inventoryValue ?? roundMoney(product.stock * product.costPrice)), 0))
          : null,
      },
    };
  },
});
