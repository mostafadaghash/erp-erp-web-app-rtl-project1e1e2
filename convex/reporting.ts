import { query } from "./_generated/server.js";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";
import {
  hasPermission,
  requirePermission,
  type AuthUser,
} from "./lib/auth.ts";
import { roundMoney } from "../shared/businessRules.ts";
import {
  dateInRange,
  monthKey,
  monthKeysInRange,
  percentage,
  reversibleActivity,
  validateReportingRange,
  type ReportingRange,
} from "../shared/reportingRules.ts";

const COLLECTION_TYPES = new Set<Doc<"financialTransactions">["type"]>([
  "invoice_payment",
  "order_deposit",
  "repair_payment",
  "delivery_cod_collection",
]);
const REFUND_TYPES = new Set<Doc<"financialTransactions">["type"]>([
  "invoice_refund",
  "sales_return_refund",
  "order_refund",
  "repair_refund",
]);
const LIQUID_ACCOUNT_TYPES = new Set<Doc<"financialAccounts">["type"]>([
  "cash",
  "instapay",
  "vodafone_cash",
  "bank",
  "other",
]);

type ReportBranchData = Awaited<ReturnType<typeof loadBranchData>>;

function mergeById<T extends { _id: unknown }>(...sets: T[][]) {
  const documents = new Map<string, T>();
  for (const document of sets.flat()) {
    documents.set(String(document._id), document);
  }
  return [...documents.values()];
}

function normalizedRange(from: string, to: string): ReportingRange {
  try {
    return validateReportingRange(from, to);
  } catch (error) {
    if (error instanceof RangeError && error.message === "reporting range is too large") {
      throw new ConvexError("الفترة الواحدة للتقرير لا يمكن أن تتجاوز 366 يومًا");
    }
    throw new ConvexError("أدخل فترة تقرير صحيحة بصيغة YYYY-MM-DD");
  }
}

export const availableBranches = query({
  args: {},
  handler: async (ctx) => {
    const user = await requirePermission(ctx, "view_reports");
    const central = user.role === "admin" || user.role === "accountant";
    if (central) {
      return (await ctx.db.query("branches").collect())
        .filter((branch) => branch.isActive)
        .map((branch) => ({ _id: branch._id, name: branch.name }));
    }
    if (!user.branchId) {
      throw new ConvexError("يجب ربط حسابك بفرع لعرض التقارير");
    }
    const branch = await ctx.db.get(user.branchId);
    return branch?.isActive
      ? [{ _id: branch._id, name: branch.name }]
      : [];
  },
});

async function resolveReportBranches(
  ctx: QueryCtx,
  user: AuthUser,
  requestedBranchId?: Id<"branches">,
) {
  const central = user.role === "admin" || user.role === "accountant";
  if (requestedBranchId) {
    const branch = await ctx.db.get(requestedBranchId);
    if (!branch) throw new ConvexError("الفرع المطلوب غير موجود");
    if (!central && user.branchId !== requestedBranchId) {
      throw new ConvexError("ليس لديك صلاحية لعرض تقارير فرع آخر");
    }
    return [requestedBranchId];
  }
  if (central) {
    return (await ctx.db.query("branches").collect()).map((branch) => branch._id);
  }
  if (!user.branchId) {
    throw new ConvexError("يجب ربط حسابك بفرع لعرض التقارير");
  }
  return [user.branchId];
}

export const salesDetails = query({
  args: {
    branchId: v.optional(v.id("branches")),
    from: v.string(),
    to: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "view_reports");
    const range = normalizedRange(args.from, args.to);
    const branchIds = await resolveReportBranches(ctx, user, args.branchId);
    const [invoiceSets, branchDocs] = await Promise.all([
      Promise.all(
        branchIds.map((branchId) =>
          ctx.db
            .query("invoices")
            .withIndex("by_branch_date", (q) =>
              q
                .eq("branchId", branchId)
                .gte("date", range.from)
                .lte("date", range.to),
            )
            .collect(),
        ),
      ),
      Promise.all(branchIds.map((branchId) => ctx.db.get(branchId))),
    ]);
    const branchNames = new Map(
      branchIds.map((branchId, index) => [
        String(branchId),
        branchDocs[index]?.name ?? "فرع غير معروف",
      ]),
    );
    const canViewProfits = hasPermission(user, "view_profits");
    const invoices = invoiceSets
      .flat()
      .sort((left, right) =>
        right.date === left.date
          ? right.invoiceNumber.localeCompare(left.invoiceNumber)
          : String(right.date).localeCompare(String(left.date)),
      )
      .map((invoice) => ({
        _id: String(invoice._id),
        invoiceNumber: invoice.invoiceNumber,
        date: invoice.date!,
        branchId: String(invoice.branchId),
        branchName: branchNames.get(String(invoice.branchId)) ?? "فرع غير معروف",
        customerName: invoice.customerName,
        customerPhone: invoice.customerPhone,
        itemCount: invoice.items.length,
        totalQuantity: invoice.items.reduce((sum, item) => sum + item.quantity, 0),
        subtotal: invoice.subtotal,
        discount: invoice.discount,
        tax: invoice.tax,
        total: invoice.total,
        creditedTotal: invoice.creditedTotal ?? 0,
        netTotal: invoice.netTotal ?? invoice.total,
        paid: invoice.paid,
        remaining: invoice.remaining,
        paymentMethod: invoice.paymentMethod,
        status: invoice.status,
        items: invoice.items.map((item) => ({
          productId: String(item.productId),
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount,
          total: item.total,
          ...(canViewProfits && item.costTotal !== undefined
            ? {
                costTotal: item.costTotal,
                grossProfit: roundMoney(item.total - item.costTotal),
              }
            : {}),
        })),
      }));

    return {
      scope: {
        from: range.from,
        to: range.to,
        branchId: branchIds.length === 1 ? String(branchIds[0]) : undefined,
        branchCount: branchIds.length,
        consolidated: args.branchId === undefined && branchIds.length > 1,
        dateBasis: "operation_date" as const,
      },
      invoices,
    };
  },
});

async function loadBranchData(
  ctx: QueryCtx,
  branchId: Id<"branches">,
  range: ReportingRange,
) {
  const [
    invoices,
    salesReturnsByReversal,
    salesReturnsByDate,
    expenses,
    purchaseReceipts,
    purchaseReturnsByDate,
    purchaseReturnsByReversal,
    supplierPaymentsByDate,
    supplierPaymentsByReversal,
    confirmationsByDate,
    confirmationsByReversal,
    codSettlementsByDate,
    codSettlementsByReversal,
    financialTransactions,
    customerBalances,
    supplierBalances,
    financialAccounts,
    products,
  ] = await Promise.all([
    ctx.db
      .query("invoices")
      .withIndex("by_branch_date", (q) =>
        q.eq("branchId", branchId).gte("date", range.from).lte("date", range.to),
      )
      .collect(),
    ctx.db
      .query("salesReturns")
      .withIndex("by_branch_reversal_date", (q) =>
        q.eq("branchId", branchId).gte("reversalDate", range.from).lte("reversalDate", range.to),
      )
      .collect(),
    ctx.db
      .query("salesReturns")
      .withIndex("by_branch_date", (q) =>
        q.eq("branchId", branchId).gte("date", range.from).lte("date", range.to),
      )
      .collect(),
    ctx.db
      .query("expenses")
      .withIndex("by_branch_date", (q) =>
        q.eq("branchId", branchId).gte("date", range.from).lte("date", range.to),
      )
      .collect(),
    ctx.db
      .query("purchaseReceipts")
      .withIndex("by_branch_date", (q) =>
        q.eq("branchId", branchId).gte("receiptDate", range.from).lte("receiptDate", range.to),
      )
      .collect(),
    ctx.db
      .query("purchaseReturns")
      .withIndex("by_branch_date", (q) =>
        q.eq("branchId", branchId).gte("date", range.from).lte("date", range.to),
      )
      .collect(),
    ctx.db
      .query("purchaseReturns")
      .withIndex("by_branch_reversal_date", (q) =>
        q.eq("branchId", branchId).gte("reversalDate", range.from).lte("reversalDate", range.to),
      )
      .collect(),
    ctx.db
      .query("supplierPayments")
      .withIndex("by_branch_date", (q) =>
        q.eq("branchId", branchId).gte("date", range.from).lte("date", range.to),
      )
      .collect(),
    ctx.db
      .query("supplierPayments")
      .withIndex("by_branch_reversal_date", (q) =>
        q.eq("branchId", branchId).gte("reversalDate", range.from).lte("reversalDate", range.to),
      )
      .collect(),
    ctx.db
      .query("deliveryConfirmations")
      .withIndex("by_branch_date", (q) =>
        q.eq("branchId", branchId).gte("date", range.from).lte("date", range.to),
      )
      .collect(),
    ctx.db
      .query("deliveryConfirmations")
      .withIndex("by_branch_reversal_date", (q) =>
        q.eq("branchId", branchId).gte("reversalDate", range.from).lte("reversalDate", range.to),
      )
      .collect(),
    ctx.db
      .query("codSettlements")
      .withIndex("by_branch_date", (q) =>
        q.eq("branchId", branchId).gte("date", range.from).lte("date", range.to),
      )
      .collect(),
    ctx.db
      .query("codSettlements")
      .withIndex("by_branch_reversal_date", (q) =>
        q.eq("branchId", branchId).gte("reversalDate", range.from).lte("reversalDate", range.to),
      )
      .collect(),
    ctx.db
      .query("financialTransactions")
      .withIndex("by_branch_date", (q) =>
        q.eq("branchId", branchId).gte("date", range.from).lte("date", range.to),
      )
      .collect(),
    ctx.db
      .query("customerBalances")
      .withIndex("by_branch", (q) => q.eq("branchId", branchId))
      .collect(),
    ctx.db
      .query("supplierBalances")
      .withIndex("by_branch", (q) => q.eq("branchId", branchId))
      .collect(),
    ctx.db
      .query("financialAccounts")
      .withIndex("by_branch", (q) => q.eq("branchId", branchId))
      .collect(),
    ctx.db
      .query("products")
      .withIndex("by_branch", (q) => q.eq("branchId", branchId))
      .collect(),
  ]);
  return {
    branchId,
    invoices,
    salesReturns: mergeById(salesReturnsByDate, salesReturnsByReversal),
    expenses,
    purchaseReceipts,
    purchaseReturns: mergeById(purchaseReturnsByDate, purchaseReturnsByReversal),
    supplierPayments: mergeById(supplierPaymentsByDate, supplierPaymentsByReversal),
    confirmations: mergeById(confirmationsByDate, confirmationsByReversal),
    codSettlements: mergeById(codSettlementsByDate, codSettlementsByReversal),
    financialTransactions,
    customerBalances,
    supplierBalances,
    financialAccounts,
    products,
  };
}

function invoiceCogs(invoice: Doc<"invoices">): number | null {
  if (invoice.cogsTotal !== undefined && Number.isFinite(invoice.cogsTotal)) {
    return invoice.cogsTotal;
  }
  if (invoice.items.every((item) => item.costTotal !== undefined)) {
    return roundMoney(
      invoice.items.reduce((sum, item) => sum + (item.costTotal ?? 0), 0),
    );
  }
  return null;
}

function all<T>(branches: ReportBranchData[], select: (branch: ReportBranchData) => T[]) {
  return branches.flatMap(select);
}

type TrendBucket = {
  month: string;
  grossSales: number;
  salesReturns: number;
  invoiceCogs: number;
  returnCogs: number;
  incompleteCogsInvoices: number;
  operatingExpenses: number;
  carrierFees: number;
  landedPurchases: number;
  codCollected: number;
  codSettled: number;
};

function monthlyTrend(
  branches: ReportBranchData[],
  range: ReportingRange,
  canViewProfits: boolean,
) {
  const buckets = new Map<string, TrendBucket>(
    monthKeysInRange(range).map((month) => [
      month,
      {
        month,
        grossSales: 0,
        salesReturns: 0,
        invoiceCogs: 0,
        returnCogs: 0,
        incompleteCogsInvoices: 0,
        operatingExpenses: 0,
        carrierFees: 0,
        landedPurchases: 0,
        codCollected: 0,
        codSettled: 0,
      },
    ]),
  );
    const add = (
    date: string | undefined,
    field: Exclude<keyof TrendBucket, "month">,
    value: number,
  ) => {
    if (!date || !dateInRange(date, range)) return;
    const bucket = buckets.get(monthKey(date));
    if (bucket) bucket[field] = roundMoney(bucket[field] + value);
  };
  for (const invoice of all(branches, (branch) => branch.invoices)) {
    if (invoice.status === "cancelled") continue;
    add(invoice.date, "grossSales", invoice.total);
    const cogs = invoiceCogs(invoice);
    if (cogs === null) add(invoice.date, "incompleteCogsInvoices", 1);
    else add(invoice.date, "invoiceCogs", cogs);
  }
  for (const document of all(branches, (branch) => branch.salesReturns)) {
    add(document.date, "salesReturns", document.totalCredit);
    add(document.date, "returnCogs", document.totalCogsReversed);
    if (document.status === "reversed") {
      add(document.reversalDate, "salesReturns", -document.totalCredit);
      add(document.reversalDate, "returnCogs", -document.totalCogsReversed);
    }
  }
  for (const expense of all(branches, (branch) => branch.expenses)) {
    if (expense.status !== "voided") {
      add(expense.date, "operatingExpenses", expense.amount);
    }
  }
  for (const receipt of all(branches, (branch) => branch.purchaseReceipts)) {
    add(receipt.receiptDate, "landedPurchases", receipt.totalLandedCost);
  }
  for (const confirmation of all(branches, (branch) => branch.confirmations)) {
    add(confirmation.date, "codCollected", confirmation.codAmount);
    if (confirmation.status === "reversed") {
      add(confirmation.reversalDate, "codCollected", -confirmation.codAmount);
    }
  }
  for (const settlement of all(branches, (branch) => branch.codSettlements)) {
    add(settlement.date, "codSettled", settlement.grossAmount);
    add(settlement.date, "carrierFees", settlement.feeAmount);
    if (settlement.status === "reversed") {
      add(settlement.reversalDate, "codSettled", -settlement.grossAmount);
      add(settlement.reversalDate, "carrierFees", -settlement.feeAmount);
    }
  }
  return [...buckets.values()].map((bucket) => {
    const netSales = roundMoney(bucket.grossSales - bucket.salesReturns);
    const cogs = roundMoney(bucket.invoiceCogs - bucket.returnCogs);
    const grossProfit =
      bucket.incompleteCogsInvoices === 0
        ? roundMoney(netSales - cogs)
        : null;
    return {
      month: bucket.month,
      grossSales: bucket.grossSales,
      salesReturns: bucket.salesReturns,
      netSales,
      operatingExpenses: bucket.operatingExpenses,
      carrierFees: bucket.carrierFees,
      landedPurchases: bucket.landedPurchases,
      codCollected: bucket.codCollected,
      codSettled: bucket.codSettled,
      ...(canViewProfits
        ? {
            cogs: grossProfit === null ? null : cogs,
            grossProfit,
            netProfit:
              grossProfit === null
                ? null
                : roundMoney(
                    grossProfit -
                      bucket.operatingExpenses -
                      bucket.carrierFees,
                  ),
            complete: grossProfit !== null,
          }
        : {}),
    };
  });
}

function productRows(
  branches: ReportBranchData[],
  range: ReportingRange,
  canViewProfits: boolean,
) {
  const rows = new Map<string, {
    productName: string;
    quantity: number;
    netSales: number;
    cogs: number;
    cogsComplete: boolean;
  }>();
  for (const invoice of all(branches, (branch) => branch.invoices)) {
    if (invoice.status === "cancelled") continue;
    for (const item of invoice.items) {
      const key = String(item.productId);
      const row = rows.get(key) ?? {
        productName: item.productName,
        quantity: 0,
        netSales: 0,
        cogs: 0,
        cogsComplete: true,
      };
      row.quantity += item.quantity;
      row.netSales = roundMoney(row.netSales + item.total);
      if (item.costTotal === undefined) row.cogsComplete = false;
      else row.cogs = roundMoney(row.cogs + item.costTotal);
      rows.set(key, row);
    }
  }
  for (const returned of all(branches, (branch) => branch.salesReturns)) {
    const originalSign = dateInRange(returned.date, range) ? 1 : 0;
    const reversalSign =
      returned.status === "reversed" &&
      dateInRange(returned.reversalDate, range)
        ? -1
        : 0;
    const activitySign = originalSign + reversalSign;
    if (activitySign === 0) continue;
    for (const item of returned.items) {
      const key = String(item.productId);
      const row = rows.get(key) ?? {
        productName: item.productName,
        quantity: 0,
        netSales: 0,
        cogs: 0,
        cogsComplete: true,
      };
      row.quantity -= item.quantityReturned * activitySign;
      row.netSales = roundMoney(
        row.netSales - item.creditAmount * activitySign,
      );
      row.cogs = roundMoney(
        row.cogs - item.returnedCostTotal * activitySign,
      );
      rows.set(key, row);
    }
  }
  return [...rows.values()]
    .sort((a, b) => b.netSales - a.netSales)
    .slice(0, 10)
    .map((row) => ({
      productName: row.productName,
      quantity: row.quantity,
      netSales: row.netSales,
      ...(canViewProfits
        ? {
            cogs: row.cogsComplete ? row.cogs : null,
            grossProfit: row.cogsComplete
              ? roundMoney(row.netSales - row.cogs)
              : null,
          }
        : {}),
    }));
}

async function collectionActivity(
  ctx: QueryCtx,
  transactions: Doc<"financialTransactions">[],
) {
  let collections = 0;
  let refunds = 0;
  let reversedCollections = 0;
  let reversedRefunds = 0;
  for (const transaction of transactions) {
    if (COLLECTION_TYPES.has(transaction.type)) {
      collections += transaction.amount;
      continue;
    }
    if (REFUND_TYPES.has(transaction.type)) {
      refunds += transaction.amount;
      continue;
    }
    if (transaction.type !== "reversal" || !transaction.originalTransactionId) {
      continue;
    }
    const original = await ctx.db.get(transaction.originalTransactionId);
    if (!original) continue;
    if (COLLECTION_TYPES.has(original.type)) {
      reversedCollections += transaction.amount;
    } else if (REFUND_TYPES.has(original.type)) {
      reversedRefunds += transaction.amount;
    }
  }
  return {
    collections: roundMoney(collections),
    refunds: roundMoney(refunds),
    reversedCollections: roundMoney(reversedCollections),
    reversedRefunds: roundMoney(reversedRefunds),
    netCollections: roundMoney(
      collections - refunds - reversedCollections + reversedRefunds,
    ),
  };
}

export const overview = query({
  args: {
    branchId: v.optional(v.id("branches")),
    from: v.string(),
    to: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "view_reports");
    const range = normalizedRange(args.from, args.to);
    const branchIds = await resolveReportBranches(ctx, user, args.branchId);
    const branches = await Promise.all(
      branchIds.map((branchId) => loadBranchData(ctx, branchId, range)),
    );
    const canViewProfits = hasPermission(user, "view_profits");
    const invoices = all(branches, (branch) => branch.invoices).filter(
      (invoice) => invoice.status !== "cancelled",
    );
    const salesReturns = all(branches, (branch) => branch.salesReturns);
    const expenses = all(branches, (branch) => branch.expenses).filter(
      (expense) => expense.status !== "voided",
    );
    const receipts = all(branches, (branch) => branch.purchaseReceipts);
    const purchaseReturns = all(branches, (branch) => branch.purchaseReturns);
    const supplierPayments = all(branches, (branch) => branch.supplierPayments);
    const confirmations = all(branches, (branch) => branch.confirmations);
    const settlements = all(branches, (branch) => branch.codSettlements);
    const transactions = all(branches, (branch) => branch.financialTransactions);

    const grossSales = roundMoney(
      invoices.reduce((sum, invoice) => sum + invoice.total, 0),
    );
    const salesReturnActivity = roundMoney(
      salesReturns.reduce(
        (sum, document) =>
          sum + reversibleActivity(document, document.totalCredit, range),
        0,
      ),
    );
    const netSales = roundMoney(grossSales - salesReturnActivity);
    const cogsValues = invoices.map(invoiceCogs);
    const incompleteCogsInvoices = cogsValues.filter(
      (value) => value === null,
    ).length;
    const invoiceCogsTotal = roundMoney(
      cogsValues.reduce<number>(
        (sum, value) => sum + (value === null ? 0 : value),
        0,
      ),
    );
    const returnCogsActivity = roundMoney(
      salesReturns.reduce(
        (sum, document) =>
          sum +
          reversibleActivity(document, document.totalCogsReversed, range),
        0,
      ),
    );
    const netCogs = roundMoney(invoiceCogsTotal - returnCogsActivity);
    const operatingExpenses = roundMoney(
      expenses.reduce((sum, expense) => sum + expense.amount, 0),
    );
    const carrierFees = roundMoney(
      settlements.reduce(
        (sum, settlement) =>
          sum + reversibleActivity(settlement, settlement.feeAmount, range),
        0,
      ),
    );
    const grossProfit =
      incompleteCogsInvoices === 0 ? roundMoney(netSales - netCogs) : null;
    const netProfit =
      grossProfit === null
        ? null
        : roundMoney(grossProfit - operatingExpenses - carrierFees);

    const landedPurchases = roundMoney(
      receipts.reduce((sum, receipt) => sum + receipt.totalLandedCost, 0),
    );
    const supplierLiabilityCreated = roundMoney(
      receipts.reduce((sum, receipt) => sum + receipt.payableAmount, 0),
    );
    const supplierCredits = roundMoney(
      purchaseReturns.reduce(
        (sum, document) =>
          sum + reversibleActivity(document, document.totalCredit, range),
        0,
      ),
    );
    const returnedInventoryValue = roundMoney(
      purchaseReturns.reduce(
        (sum, document) =>
          sum +
          reversibleActivity(document, document.inventoryValueRemoved, range),
        0,
      ),
    );
    const supplierPaymentActivity = roundMoney(
      supplierPayments.reduce(
        (sum, document) =>
          sum + reversibleActivity(document, document.amount, range),
        0,
      ),
    );
    const codCollected = roundMoney(
      confirmations.reduce(
        (sum, document) =>
          sum + reversibleActivity(document, document.codAmount, range),
        0,
      ),
    );
    const codSettled = roundMoney(
      settlements.reduce(
        (sum, document) =>
          sum + reversibleActivity(document, document.grossAmount, range),
        0,
      ),
    );
    const currentCustomerReceivables = roundMoney(
      all(branches, (branch) => branch.customerBalances).reduce(
        (sum, balance) => sum + balance.receivableBalance,
        0,
      ),
    );
    const currentCustomerAdvances = roundMoney(
      all(branches, (branch) => branch.customerBalances).reduce(
        (sum, balance) => sum + balance.advanceBalance,
        0,
      ),
    );
    const currentSupplierPayables = roundMoney(
      all(branches, (branch) => branch.supplierBalances).reduce(
        (sum, balance) => sum + balance.balance,
        0,
      ),
    );
    const accounts = all(branches, (branch) => branch.financialAccounts);
    const currentLiquidBalance = roundMoney(
      accounts
        .filter((account) => LIQUID_ACCOUNT_TYPES.has(account.type))
        .reduce((sum, account) => sum + account.currentBalance, 0),
    );
    const currentCodOutstanding = roundMoney(
      accounts
        .filter((account) => account.type === "cod_clearing")
        .reduce((sum, account) => sum + account.currentBalance, 0),
    );
    const currentOtherClearing = roundMoney(
      accounts
        .filter((account) =>
          ["fawry_clearing", "paymob_clearing", "card_clearing"].includes(
            account.type,
          ),
        )
        .reduce((sum, account) => sum + account.currentBalance, 0),
    );
    const products = all(branches, (branch) => branch.products);
    const currentInventoryValue = roundMoney(
      products.reduce(
        (sum, product) =>
          sum +
          (product.inventoryValue ??
            roundMoney(product.stock * product.costPrice)),
        0,
      ),
    );
    const legacyInventoryValueProducts = products.filter(
      (product) => product.inventoryValue === undefined,
    ).length;
    const collections = await collectionActivity(ctx, transactions);

    return {
      scope: {
        from: range.from,
        to: range.to,
        branchId: branchIds.length === 1 ? branchIds[0] : undefined,
        branchCount: branchIds.length,
        consolidated: args.branchId === undefined && branchIds.length > 1,
        dateBasis: "operation_date" as const,
      },
      sales: {
        invoiceCount: invoices.length,
        salesReturnCount: salesReturns.length,
        grossSales,
        salesReturns: salesReturnActivity,
        netSales,
      },
      collections,
      expenses: {
        operatingExpenses,
        carrierFees,
        totalExpenses: roundMoney(operatingExpenses + carrierFees),
      },
      purchases: {
        receiptCount: receipts.length,
        returnCount: purchaseReturns.length,
        landedPurchases,
        supplierLiabilityCreated,
        supplierCredits,
        netSupplierLiabilityCreated: roundMoney(
          supplierLiabilityCreated - supplierCredits,
        ),
        returnedInventoryValue,
        supplierPayments: supplierPaymentActivity,
      },
      cod: {
        collected: codCollected,
        settled: codSettled,
        netPeriodMovement: roundMoney(codCollected - codSettled),
        currentOutstanding: currentCodOutstanding,
        carrierFees,
      },
      currentBalances: {
        customerReceivables: currentCustomerReceivables,
        customerAdvances: currentCustomerAdvances,
        supplierPayables: currentSupplierPayables,
        liquidAccounts: currentLiquidBalance,
        otherClearingAccounts: currentOtherClearing,
        ...(canViewProfits
          ? { inventoryValue: currentInventoryValue }
          : {}),
      },
      profitability: canViewProfits
        ? {
            complete: incompleteCogsInvoices === 0,
            incompleteCogsInvoices,
            cogs: incompleteCogsInvoices === 0 ? netCogs : null,
            grossProfit,
            grossMargin: grossProfit === null
              ? null
              : percentage(grossProfit, netSales),
            netProfit,
            netMargin: netProfit === null
              ? null
              : percentage(netProfit, netSales),
          }
        : null,
      topProducts: productRows(branches, range, canViewProfits),
      trend: monthlyTrend(branches, range, canViewProfits),
      completeness: {
        operationDatesOnly: true,
        incompleteCogsInvoices,
        legacyInventoryValueProducts,
        profitabilityAvailable:
          canViewProfits && incompleteCogsInvoices === 0,
      },
    };
  },
});
