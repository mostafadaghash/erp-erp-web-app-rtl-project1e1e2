import test from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema.ts";
import { api } from "../convex/_generated/api.js";
import type { Id } from "../convex/_generated/dataModel";

const modules = {
  "../convex/_generated/api.js": () => import("../convex/_generated/api.js"),
  "../convex/_generated/server.js": () =>
    import("../convex/_generated/server.js"),
  "../convex/reporting.ts": () => import("../convex/reporting.ts"),
};

async function fixture() {
  const raw = convexTest(schema, modules);
  const ids = await raw.run(async (ctx) => {
    const branchId = await ctx.db.insert("branches", {
      name: "فرع أول",
      address: "القاهرة",
      isActive: true,
    });
    const otherBranchId = await ctx.db.insert("branches", {
      name: "فرع ثان",
      address: "الجيزة",
      isActive: true,
    });
    for (const profile of [
      { userId: "admin", tokenIdentifier: "admin-token", name: "Admin", role: "admin", branchId, permissions: [] },
      { userId: "manager", tokenIdentifier: "manager-token", name: "Manager", role: "manager", branchId, permissions: [] },
      { userId: "other-manager", tokenIdentifier: "other-manager-token", name: "Other Manager", role: "manager", branchId: otherBranchId, permissions: [] },
      { userId: "accountant", tokenIdentifier: "accountant-token", name: "Accountant", role: "accountant", branchId, permissions: [] },
      { userId: "report-only", tokenIdentifier: "report-only-token", name: "Report Only", role: "viewer", branchId, permissions: ["view_reports"] },
      { userId: "viewer", tokenIdentifier: "viewer-token", name: "Viewer", role: "viewer", branchId, permissions: [] },
    ]) {
      await ctx.db.insert("userProfiles", { ...profile, isActive: true });
    }
    const customerId = await ctx.db.insert("customers", {
      name: "عميل أول",
      phone: "01000000001",
      balance: 0,
      totalPurchases: 0,
      branchId,
      isActive: true,
    });
    const otherCustomerId = await ctx.db.insert("customers", {
      name: "عميل ثان",
      phone: "01000000002",
      balance: 0,
      totalPurchases: 0,
      branchId: otherBranchId,
      isActive: true,
    });
    const supplierId = await ctx.db.insert("suppliers", {
      name: "مورد أول",
      phone: "01100000001",
      balance: 0,
      isActive: true,
    });
    const otherSupplierId = await ctx.db.insert("suppliers", {
      name: "مورد ثان",
      phone: "01100000002",
      balance: 0,
      isActive: true,
    });
    const productId = await ctx.db.insert("products", {
      name: "منتج أول",
      sku: "RPT-1",
      costPrice: 60,
      inventoryValue: 300,
      sellPrice: 100,
      stock: 5,
      minStock: 1,
      unit: "قطعة",
      branchId,
      isActive: true,
    });
    const otherProductId = await ctx.db.insert("products", {
      name: "منتج ثان",
      sku: "RPT-2",
      costPrice: 30,
      inventoryValue: 150,
      sellPrice: 50,
      stock: 5,
      minStock: 1,
      unit: "قطعة",
      branchId: otherBranchId,
      isActive: true,
    });
    const cashId = await ctx.db.insert("financialAccounts", {
      name: "خزينة أولى",
      code: "CASH-1",
      uniqueKey: "cash-1",
      type: "cash",
      branchId,
      isActive: true,
      currentBalance: 100,
      allowNegative: false,
      settlementDelayDays: 0,
      createdAt: 1,
      createdBy: "admin",
      updatedAt: 1,
    });
    const codId = await ctx.db.insert("financialAccounts", {
      name: "COD أول",
      code: "COD-1",
      uniqueKey: "cod-1",
      type: "cod_clearing",
      branchId,
      isActive: true,
      currentBalance: 80,
      allowNegative: false,
      settlementDelayDays: 0,
      createdAt: 1,
      createdBy: "admin",
      updatedAt: 1,
    });
    const clearingId = await ctx.db.insert("financialAccounts", {
      name: "Paymob أول",
      code: "PAY-1",
      uniqueKey: "pay-1",
      type: "paymob_clearing",
      branchId,
      isActive: true,
      currentBalance: 25,
      allowNegative: false,
      settlementDelayDays: 0,
      createdAt: 1,
      createdBy: "admin",
      updatedAt: 1,
    });
    const otherCashId = await ctx.db.insert("financialAccounts", {
      name: "خزينة ثانية",
      code: "CASH-2",
      uniqueKey: "cash-2",
      type: "cash",
      branchId: otherBranchId,
      isActive: true,
      currentBalance: 200,
      allowNegative: false,
      settlementDelayDays: 0,
      createdAt: 1,
      createdBy: "admin",
      updatedAt: 1,
    });
    return {
      branchId,
      otherBranchId,
      customerId,
      otherCustomerId,
      supplierId,
      otherSupplierId,
      productId,
      otherProductId,
      cashId,
      codId,
      clearingId,
      otherCashId,
    };
  });
  return {
    raw,
    admin: raw.withIdentity({ subject: "admin", tokenIdentifier: "admin-token" }),
    manager: raw.withIdentity({ subject: "manager", tokenIdentifier: "manager-token" }),
    otherManager: raw.withIdentity({ subject: "other-manager", tokenIdentifier: "other-manager-token" }),
    accountant: raw.withIdentity({ subject: "accountant", tokenIdentifier: "accountant-token" }),
    reportOnly: raw.withIdentity({ subject: "report-only", tokenIdentifier: "report-only-token" }),
    viewer: raw.withIdentity({ subject: "viewer", tokenIdentifier: "viewer-token" }),
    ...ids,
  };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

const range = { from: "2026-01-01", to: "2026-12-31" };

async function report(
  e: Fixture,
  actor: Fixture["admin"] | Fixture["manager"] | Fixture["otherManager"] | Fixture["accountant"] | Fixture["reportOnly"] | Fixture["viewer"] = e.manager,
  args: { branchId?: Id<"branches">; from?: string; to?: string } = {},
) {
  return actor.query(api.reporting.overview, {
    branchId: args.branchId,
    from: args.from ?? range.from,
    to: args.to ?? range.to,
  });
}

async function addInvoice(
  e: Fixture,
  options: {
    branchId?: Id<"branches">;
    date?: string;
    total?: number;
    cogs?: number;
    status?: string;
    missingCogs?: boolean;
    productId?: Id<"products">;
    customerId?: Id<"customers">;
    number?: string;
  } = {},
) {
  return e.raw.run(async (ctx) => {
    const branchId = options.branchId ?? e.branchId;
    const productId = options.productId ??
      (branchId === e.branchId ? e.productId : e.otherProductId);
    const customerId = options.customerId ??
      (branchId === e.branchId ? e.customerId : e.otherCustomerId);
    const total = options.total ?? 100;
    const cogs = options.cogs ?? 60;
    return ctx.db.insert("invoices", {
      invoiceNumber: options.number ?? `INV-${Math.random()}`,
      customerId,
      customerName: "عميل",
      items: [{
        productId,
        productName: productId === e.productId ? "منتج أول" : "منتج ثان",
        quantity: 1,
        unitPrice: total,
        discount: 0,
        total,
        ...(!options.missingCogs ? { unitCost: cogs, costTotal: cogs, lineNetTotal: total } : {}),
      }],
      subtotal: total,
      discount: 0,
      tax: 0,
      total,
      ...(!options.missingCogs ? { cogsTotal: cogs, creditedTotal: 0, netTotal: total, costingVersion: 1 } : {}),
      paid: total,
      remaining: 0,
      paymentMethod: "cash",
      status: options.status ?? "paid",
      date: options.date ?? "2026-01-10",
      branchId,
      type: "sale",
    });
  });
}

async function addSalesReturn(
  e: Fixture,
  invoiceId: Id<"invoices">,
  options: {
    date?: string;
    credit?: number;
    cogs?: number;
    status?: "posted" | "reversed";
    reversalDate?: string;
    branchId?: Id<"branches">;
  } = {},
) {
  return e.raw.run(async (ctx) => {
    const invoice = await ctx.db.get(invoiceId);
    if (!invoice) throw new Error("invoice fixture missing");
    const item = invoice.items[0];
    const credit = options.credit ?? 25;
    const cogs = options.cogs ?? 15;
    return ctx.db.insert("salesReturns", {
      creditNoteNumber: `CRN-${Math.random()}`,
      invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customerId,
      customerName: invoice.customerName,
      items: [{
        productId: item.productId,
        productName: item.productName,
        quantityReturned: 1,
        unitPrice: credit,
        creditAmount: credit,
        historicalUnitCost: cogs,
        returnedCostTotal: cogs,
      }],
      subtotal: credit,
      totalCredit: credit,
      totalCogsReversed: cogs,
      debtReduction: credit,
      cashRefund: 0,
      reason: "مرتجع",
      date: options.date ?? "2026-01-15",
      branchId: options.branchId ?? invoice.branchId!,
      status: options.status ?? "posted",
      creationRequestId: `return-${Math.random()}`,
      createdBy: "admin",
      createdAt: 1,
      reversalDate: options.reversalDate,
    });
  });
}

async function addExpense(
  e: Fixture,
  amount: number,
  status: "active" | "voided" = "active",
  branchId = e.branchId,
) {
  return e.raw.run(async (ctx) =>
    ctx.db.insert("expenses", {
      title: "مصروف",
      category: "تشغيل",
      amount,
      date: "2026-01-20",
      paymentMethod: "cash",
      branchId,
      status,
    }),
  );
}

async function addTransaction(
  e: Fixture,
  options: {
    type: "invoice_payment" | "invoice_refund" | "reversal" | "cod_settlement";
    amount: number;
    date?: string;
    branchId?: Id<"branches">;
    originalTransactionId?: Id<"financialTransactions">;
  },
) {
  return e.raw.run(async (ctx) =>
    ctx.db.insert("financialTransactions", {
      transactionNumber: `FTX-${Math.random()}`,
      idempotencyKey: `key-${Math.random()}`,
      type: options.type,
      status: "posted",
      date: options.date ?? "2026-01-20",
      amount: options.amount,
      feeAmount: 0,
      netAmount: options.amount,
      description: "حركة اختبار",
      branchId: options.branchId ?? e.branchId,
      userId: "admin",
      createdAt: 1,
      originalTransactionId: options.originalTransactionId,
    }),
  );
}

async function addPurchaseReceipt(
  e: Fixture,
  options: {
    landed?: number;
    payable?: number;
    date?: string;
    branchId?: Id<"branches">;
  } = {},
) {
  return e.raw.run(async (ctx) => {
    const branchId = options.branchId ?? e.branchId;
    const supplierId = branchId === e.branchId ? e.supplierId : e.otherSupplierId;
    const productId = branchId === e.branchId ? e.productId : e.otherProductId;
    const shipmentId = await ctx.db.insert("shipments", {
      shipmentNumber: `SHP-${Math.random()}`,
      supplierId,
      supplierName: "مورد",
      items: [{ productId, productName: "منتج", quantity: 1, unitCost: 80, total: 80 }],
      totalCost: 80,
      shippingCost: 20,
      grandTotal: 100,
      status: "arrived",
      branchId,
    });
    const landed = options.landed ?? 100;
    const payable = options.payable ?? 80;
    return ctx.db.insert("purchaseReceipts", {
      receiptNumber: `PUR-${Math.random()}`,
      shipmentId,
      shipmentNumber: "SHP",
      supplierId,
      supplierName: "مورد",
      receiptDate: options.date ?? "2026-01-10",
      items: [{
        productId,
        productName: "منتج",
        quantity: 1,
        unitCost: 80,
        lineTotal: 80,
        allocatedFreight: landed - 80,
        landedUnitCost: landed,
        inventoryValueAdded: landed,
      }],
      goodsTotal: 80,
      totalFreight: landed - 80,
      supplierFreightAmount: payable - 80,
      externalFreightAmount: landed - payable,
      totalLandedCost: landed,
      payableAmount: payable,
      paidAmount: 0,
      remainingAmount: payable,
      status: "unpaid",
      branchId,
      arrivalRequestId: `arrival-${Math.random()}`,
      createdBy: "admin",
      createdAt: 1,
    });
  });
}

async function addPurchaseReturn(
  e: Fixture,
  receiptId: Id<"purchaseReceipts">,
  options: {
    credit?: number;
    inventory?: number;
    date?: string;
    status?: "posted" | "reversed";
    reversalDate?: string;
  } = {},
) {
  return e.raw.run(async (ctx) => {
    const receipt = await ctx.db.get(receiptId);
    if (!receipt) throw new Error("receipt fixture missing");
    return ctx.db.insert("purchaseReturns", {
      returnNumber: `PRN-${Math.random()}`,
      purchaseReceiptId: receiptId,
      receiptNumber: receipt.receiptNumber,
      shipmentId: receipt.shipmentId,
      shipmentNumber: receipt.shipmentNumber,
      supplierId: receipt.supplierId,
      supplierName: receipt.supplierName,
      branchId: receipt.branchId,
      date: options.date ?? "2026-01-15",
      reason: "مرتجع شراء",
      items: [],
      goodsCredit: options.credit ?? 20,
      freightCredit: 0,
      totalCredit: options.credit ?? 20,
      inventoryValueRemoved: options.inventory ?? 25,
      debtReduction: options.credit ?? 20,
      cashRefund: 0,
      status: options.status ?? "posted",
      idempotencyKey: `pr-${Math.random()}`,
      requestId: `pr-req-${Math.random()}`,
      requestFingerprint: "fingerprint",
      createdBy: "admin",
      createdAt: 1,
      reversalDate: options.reversalDate,
    });
  });
}

async function addSupplierPayment(
  e: Fixture,
  options: {
    amount?: number;
    date?: string;
    status?: "posted" | "reversed";
    reversalDate?: string;
  } = {},
) {
  return e.raw.run(async (ctx) =>
    ctx.db.insert("supplierPayments", {
      paymentNumber: `SPY-${Math.random()}`,
      idempotencyKey: `spy-${Math.random()}`,
      requestId: `spy-req-${Math.random()}`,
      requestFingerprint: "fingerprint",
      supplierId: e.supplierId,
      supplierName: "مورد",
      branchId: e.branchId,
      accountId: e.cashId,
      accountName: "خزينة",
      date: options.date ?? "2026-01-18",
      amount: options.amount ?? 30,
      status: options.status ?? "posted",
      createdBy: "admin",
      createdAt: 1,
      reversalDate: options.reversalDate,
    }),
  );
}

async function addConfirmation(
  e: Fixture,
  options: {
    amount?: number;
    date?: string;
    status?: "posted" | "reversed";
    reversalDate?: string;
    branchId?: Id<"branches">;
  } = {},
) {
  const branchId = options.branchId ?? e.branchId;
  const customerId = branchId === e.branchId ? e.customerId : e.otherCustomerId;
  const invoiceId = await addInvoice(e, {
    branchId,
    customerId,
    productId: branchId === e.branchId ? e.productId : e.otherProductId,
    total: options.amount ?? 80,
    cogs: 40,
    date: options.date ?? "2026-01-12",
  });
  return e.raw.run(async (ctx) => {
    const orderId = await ctx.db.insert("orders", {
      orderNumber: `ORD-${Math.random()}`,
      customerId,
      customerName: "عميل",
      items: [{ productName: "منتج", quantity: 1, unitPrice: options.amount ?? 80 }],
      total: options.amount ?? 80,
      deposit: 0,
      remaining: options.amount ?? 80,
      status: "delivered",
      branchId,
    });
    const deliveryId = await ctx.db.insert("deliveries", {
      deliveryNumber: `DEL-${Math.random()}`,
      orderId,
      orderNumber: "ORD",
      invoiceId,
      invoiceNumber: "INV",
      customerId,
      customerName: "عميل",
      customerPhone: "01000000000",
      city: "القاهرة",
      address: "عنوان",
      items: [{ productName: "منتج", quantity: 1, unitPrice: options.amount ?? 80 }],
      totalAmount: options.amount ?? 80,
      paymentMethod: "cod",
      codAmount: options.amount ?? 80,
      prepaidAmount: 0,
      shippingCompany: "شركة",
      shippingCost: 0,
      status: options.status === "reversed" ? "shipped" : "delivered",
      branchId,
    });
    return ctx.db.insert("deliveryConfirmations", {
      deliveryId,
      deliveryNumber: "DEL",
      attemptNumber: 1,
      branchId,
      invoiceId,
      orderId,
      customerId,
      codAmount: options.amount ?? 80,
      status: options.status ?? "posted",
      date: options.date ?? "2026-01-12",
      requestId: `cod-${Math.random()}`,
      idempotencyKey: `cod-key-${Math.random()}`,
      requestFingerprint: "fingerprint",
      reversalDate: options.reversalDate,
      createdBy: "admin",
      createdAt: 1,
    });
  });
}

async function addSettlement(
  e: Fixture,
  options: {
    gross?: number;
    fee?: number;
    date?: string;
    status?: "posted" | "reversed";
    reversalDate?: string;
  } = {},
) {
  const gross = options.gross ?? 80;
  const fee = options.fee ?? 5;
  const transactionId = await addTransaction(e, {
    type: "cod_settlement",
    amount: gross,
    date: options.date ?? "2026-01-20",
  });
  return e.raw.run(async (ctx) =>
    ctx.db.insert("codSettlements", {
      settlementNumber: `COD-${Math.random()}`,
      branchId: e.branchId,
      sourceAccountId: e.codId,
      destinationAccountId: e.cashId,
      grossAmount: gross,
      feeAmount: fee,
      netAmount: gross - fee,
      date: options.date ?? "2026-01-20",
      status: options.status ?? "posted",
      requestId: `settle-${Math.random()}`,
      idempotencyKey: `settle-key-${Math.random()}`,
      requestFingerprint: "fingerprint",
      financialTransactionId: transactionId,
      createdBy: "admin",
      createdAt: 1,
      reversalDate: options.reversalDate,
    }),
  );
}

test("RPT-01 overview validates real ISO dates", async () => {
  const e = await fixture();
  await assert.rejects(() => report(e, e.manager, { from: "2026-02-30", to: "2026-03-01" }), /فترة تقرير صحيحة/);
});

test("RPT-02 overview rejects ranges above one year", async () => {
  const e = await fixture();
  await assert.rejects(() => report(e, e.manager, { from: "2025-01-01", to: "2026-12-31" }), /366/);
});

test("RPT-03 viewer without report permission is rejected", async () => {
  const e = await fixture();
  await assert.rejects(() => report(e, e.viewer), /view_reports/);
});

test("RPT-04 manager is pinned to the assigned branch", async () => {
  const e = await fixture();
  await addInvoice(e, { total: 100, cogs: 60 });
  await addInvoice(e, { branchId: e.otherBranchId, productId: e.otherProductId, customerId: e.otherCustomerId, total: 50, cogs: 30 });
  assert.equal((await report(e)).sales.grossSales, 100);
  await assert.rejects(() => report(e, e.manager, { branchId: e.otherBranchId }), /فرع آخر/);
});

test("RPT-05 admin can select either branch independently", async () => {
  const e = await fixture();
  await addInvoice(e, { total: 100 });
  await addInvoice(e, { branchId: e.otherBranchId, total: 70 });
  assert.equal((await report(e, e.admin, { branchId: e.branchId })).sales.grossSales, 100);
  assert.equal((await report(e, e.admin, { branchId: e.otherBranchId })).sales.grossSales, 70);
});

test("RPT-06 accountant receives a consolidated central report", async () => {
  const e = await fixture();
  await addInvoice(e, { total: 100 });
  await addInvoice(e, { branchId: e.otherBranchId, total: 70 });
  const result = await report(e, e.accountant);
  assert.equal(result.scope.consolidated, true);
  assert.equal(result.scope.branchCount, 2);
  assert.equal(result.sales.grossSales, 170);
});

test("RPT-07 cancelled invoices are excluded from sales and counts", async () => {
  const e = await fixture();
  await addInvoice(e, { total: 100 });
  await addInvoice(e, { total: 900, status: "cancelled" });
  const result = await report(e);
  assert.equal(result.sales.invoiceCount, 1);
  assert.equal(result.sales.grossSales, 100);
});

test("RPT-08 invoice activity follows operation date not creation time", async () => {
  const e = await fixture();
  await addInvoice(e, { total: 100, date: "2026-01-31" });
  assert.equal((await report(e, e.manager, { from: "2026-02-01", to: "2026-02-28" })).sales.grossSales, 0);
  assert.equal((await report(e, e.manager, { from: "2026-01-01", to: "2026-01-31" })).sales.grossSales, 100);
});

test("RPT-09 posted sales return reduces sales and COGS in its date", async () => {
  const e = await fixture();
  const invoiceId = await addInvoice(e, { total: 100, cogs: 60 });
  await addSalesReturn(e, invoiceId, { credit: 25, cogs: 15 });
  const result = await report(e);
  assert.equal(result.sales.netSales, 75);
  assert.equal(result.profitability?.cogs, 45);
  assert.equal(result.profitability?.grossProfit, 30);
});

test("RPT-10 reversed sales return posts a later negative return event", async () => {
  const e = await fixture();
  const invoiceId = await addInvoice(e, { date: "2026-01-10" });
  await addSalesReturn(e, invoiceId, { date: "2026-01-15", status: "reversed", reversalDate: "2026-02-05" });
  assert.equal((await report(e, e.manager, { from: "2026-01-01", to: "2026-01-31" })).sales.salesReturns, 25);
  assert.equal((await report(e, e.manager, { from: "2026-02-01", to: "2026-02-28" })).sales.salesReturns, -25);
});

test("RPT-11 exact historical COGS produces gross profit and margin", async () => {
  const e = await fixture();
  await addInvoice(e, { total: 120, cogs: 72 });
  const result = await report(e);
  assert.deepEqual(result.profitability, {
    complete: true,
    incompleteCogsInvoices: 0,
    cogs: 72,
    grossProfit: 48,
    grossMargin: 40,
    netProfit: 48,
    netMargin: 40,
  });
});

test("RPT-12 missing historical COGS blocks profit instead of guessing", async () => {
  const e = await fixture();
  await addInvoice(e, { total: 100, missingCogs: true });
  const result = await report(e);
  assert.equal(result.profitability?.complete, false);
  assert.equal(result.profitability?.cogs, null);
  assert.equal(result.profitability?.grossProfit, null);
  assert.equal(result.profitability?.netProfit, null);
});

test("RPT-13 voided expense is excluded from operating expenses", async () => {
  const e = await fixture();
  await addExpense(e, 20);
  await addExpense(e, 900, "voided");
  assert.equal((await report(e)).expenses.operatingExpenses, 20);
});

test("RPT-14 posted carrier fee is separated from normal expenses", async () => {
  const e = await fixture();
  await addExpense(e, 20);
  await addSettlement(e, { gross: 80, fee: 5 });
  const result = await report(e);
  assert.deepEqual(result.expenses, { operatingExpenses: 20, carrierFees: 5, totalExpenses: 25 });
});

test("RPT-15 reversed COD settlement reverses fee on reversal date", async () => {
  const e = await fixture();
  await addSettlement(e, { date: "2026-01-20", fee: 5, status: "reversed", reversalDate: "2026-02-10" });
  assert.equal((await report(e, e.manager, { from: "2026-01-01", to: "2026-01-31" })).expenses.carrierFees, 5);
  assert.equal((await report(e, e.manager, { from: "2026-02-01", to: "2026-02-28" })).expenses.carrierFees, -5);
});

test("RPT-16 net profit deducts operating expenses and carrier fees", async () => {
  const e = await fixture();
  await addInvoice(e, { total: 100, cogs: 60 });
  await addExpense(e, 10);
  await addSettlement(e, { fee: 5 });
  assert.equal((await report(e)).profitability?.netProfit, 25);
});

test("RPT-17 collections and refunds remain separate from revenue", async () => {
  const e = await fixture();
  await addInvoice(e, { total: 100, cogs: 60 });
  await addTransaction(e, { type: "invoice_payment", amount: 70 });
  await addTransaction(e, { type: "invoice_refund", amount: 10 });
  const result = await report(e);
  assert.equal(result.sales.netSales, 100);
  assert.equal(result.collections.netCollections, 60);
});

test("RPT-18 financial reversal adjusts collection activity by original type", async () => {
  const e = await fixture();
  const original = await addTransaction(e, { type: "invoice_payment", amount: 70, date: "2026-01-10" });
  await addTransaction(e, { type: "reversal", amount: 70, date: "2026-02-10", originalTransactionId: original });
  const result = await report(e, e.manager, { from: "2026-02-01", to: "2026-02-28" });
  assert.equal(result.collections.reversedCollections, 70);
  assert.equal(result.collections.netCollections, -70);
});

test("RPT-19 customer receivable and advance balances are distinct", async () => {
  const e = await fixture();
  await e.raw.run(async (ctx) => {
    await ctx.db.insert("customerBalances", { key: "c1", customerId: e.customerId, branchId: e.branchId, receivableBalance: 150, advanceBalance: 40, totalPurchases: 500, updatedAt: 1 });
  });
  const result = await report(e);
  assert.equal(result.currentBalances.customerReceivables, 150);
  assert.equal(result.currentBalances.customerAdvances, 40);
});

test("RPT-20 supplier payables use branch supplier balances", async () => {
  const e = await fixture();
  await e.raw.run(async (ctx) => {
    await ctx.db.insert("supplierBalances", { key: "s1", supplierId: e.supplierId, branchId: e.branchId, balance: 275, updatedAt: 1 });
  });
  assert.equal((await report(e)).currentBalances.supplierPayables, 275);
});

test("RPT-21 purchase receipt separates landed cost and supplier liability", async () => {
  const e = await fixture();
  await addPurchaseReceipt(e, { landed: 100, payable: 80 });
  const result = await report(e);
  assert.equal(result.purchases.landedPurchases, 100);
  assert.equal(result.purchases.supplierLiabilityCreated, 80);
});

test("RPT-22 purchase return and reversal affect supplier credit on event dates", async () => {
  const e = await fixture();
  const receiptId = await addPurchaseReceipt(e, { date: "2026-01-10" });
  await addPurchaseReturn(e, receiptId, { credit: 20, inventory: 25, date: "2026-01-15", status: "reversed", reversalDate: "2026-02-10" });
  assert.equal((await report(e, e.manager, { from: "2026-01-01", to: "2026-01-31" })).purchases.supplierCredits, 20);
  assert.equal((await report(e, e.manager, { from: "2026-02-01", to: "2026-02-28" })).purchases.supplierCredits, -20);
});

test("RPT-23 supplier payment and reversal are reported independently by date", async () => {
  const e = await fixture();
  await addSupplierPayment(e, { amount: 30, date: "2026-01-18", status: "reversed", reversalDate: "2026-02-18" });
  assert.equal((await report(e, e.manager, { from: "2026-01-01", to: "2026-01-31" })).purchases.supplierPayments, 30);
  assert.equal((await report(e, e.manager, { from: "2026-02-01", to: "2026-02-28" })).purchases.supplierPayments, -30);
});

test("RPT-24 COD activity distinguishes collected settled and outstanding", async () => {
  const e = await fixture();
  await addConfirmation(e, { amount: 80 });
  await addSettlement(e, { gross: 50, fee: 5 });
  const result = await report(e);
  assert.equal(result.cod.collected, 80);
  assert.equal(result.cod.settled, 50);
  assert.equal(result.cod.netPeriodMovement, 30);
  assert.equal(result.cod.currentOutstanding, 80);
});

test("RPT-25 reversed confirmation appears as a negative COD event", async () => {
  const e = await fixture();
  await addConfirmation(e, { amount: 80, date: "2026-01-12", status: "reversed", reversalDate: "2026-02-12" });
  assert.equal((await report(e, e.manager, { from: "2026-01-01", to: "2026-01-31" })).cod.collected, 80);
  assert.equal((await report(e, e.manager, { from: "2026-02-01", to: "2026-02-28" })).cod.collected, -80);
});

test("RPT-26 current liquidity clearing and COD balances stay separated", async () => {
  const e = await fixture();
  const result = await report(e);
  assert.equal(result.currentBalances.liquidAccounts, 100);
  assert.equal(result.currentBalances.otherClearingAccounts, 25);
  assert.equal(result.cod.currentOutstanding, 80);
});

test("RPT-27 report-only permission cannot receive cost or inventory value", async () => {
  const e = await fixture();
  await addInvoice(e, { total: 100, cogs: 60 });
  const result = await report(e, e.reportOnly);
  assert.equal(result.profitability, null);
  assert.equal("inventoryValue" in result.currentBalances, false);
  assert.equal("cogs" in result.topProducts[0], false);
});

test("RPT-28 legacy inventory fallback is disclosed explicitly", async () => {
  const e = await fixture();
  await e.raw.run(async (ctx) => {
    const product = await ctx.db.get(e.productId);
    if (product) await ctx.db.replace(e.productId, { ...product, inventoryValue: undefined });
  });
  const result = await report(e);
  assert.equal(result.currentBalances.inventoryValue, 300);
  assert.equal(result.completeness.legacyInventoryValueProducts, 1);
});

test("RPT-29 top products use net quantity sales and historical COGS", async () => {
  const e = await fixture();
  const invoiceId = await addInvoice(e, { total: 100, cogs: 60 });
  await addSalesReturn(e, invoiceId, { credit: 25, cogs: 15 });
  assert.deepEqual((await report(e)).topProducts[0], {
    productName: "منتج أول",
    quantity: 0,
    netSales: 75,
    cogs: 45,
    grossProfit: 30,
  });
});

test("RPT-30 overview DTO exposes totals but no operational internals", async () => {
  const e = await fixture();
  await addInvoice(e);
  const json = JSON.stringify(await report(e));
  for (const forbidden of ["idempotencyKey", "requestFingerprint", "userId", "financialTransactionId", "journalEntryId"]) {
    assert.equal(json.includes(forbidden), false, forbidden);
  }
});

test("RPT-31 overview query is read-only across all source tables", async () => {
  const e = await fixture();
  await addInvoice(e);
  await addExpense(e, 10);
  const tables = ["invoices", "salesReturns", "expenses", "financialTransactions", "customerBalances", "supplierBalances", "financialAccounts", "products"] as const;
  const snapshot = () => e.raw.run(async (ctx) => Promise.all(tables.map((table) => ctx.db.query(table).collect())));
  const before = await snapshot();
  await report(e);
  assert.deepEqual(await snapshot(), before);
});

test("RPT-32 consolidated totals do not leak another branch to a manager", async () => {
  const e = await fixture();
  await addInvoice(e, { total: 100 });
  await addInvoice(e, { branchId: e.otherBranchId, total: 900 });
  await e.raw.run(async (ctx) => {
    await ctx.db.insert("customerBalances", { key: "other", customerId: e.otherCustomerId, branchId: e.otherBranchId, receivableBalance: 999, advanceBalance: 0, totalPurchases: 999, updatedAt: 1 });
  });
  const manager = await report(e);
  const admin = await report(e, e.admin);
  assert.equal(manager.sales.grossSales, 100);
  assert.equal(manager.currentBalances.customerReceivables, 0);
  assert.equal(admin.sales.grossSales, 1000);
  assert.equal(admin.currentBalances.customerReceivables, 999);
});

test("RPT-33 monthly trend includes zero-activity months in stable order", async () => {
  const e = await fixture();
  await addInvoice(e, { date: "2026-01-10", total: 100, cogs: 60 });
  await addInvoice(e, { date: "2026-03-10", total: 50, cogs: 30 });
  const result = await report(e, e.manager, {
    from: "2026-01-01",
    to: "2026-03-31",
  });
  assert.deepEqual(
    result.trend.map((row) => [row.month, row.netSales]),
    [["2026-01", 100], ["2026-02", 0], ["2026-03", 50]],
  );
});

test("RPT-34 monthly trend records a return and its later reversal separately", async () => {
  const e = await fixture();
  const invoiceId = await addInvoice(e, {
    date: "2026-01-10",
    total: 100,
    cogs: 60,
  });
  await addSalesReturn(e, invoiceId, {
    date: "2026-01-15",
    credit: 25,
    cogs: 15,
    status: "reversed",
    reversalDate: "2026-02-05",
  });
  const result = await report(e, e.manager, {
    from: "2026-01-01",
    to: "2026-02-28",
  });
  assert.equal(result.trend[0].salesReturns, 25);
  assert.equal(result.trend[0].cogs, 45);
  assert.equal(result.trend[1].salesReturns, -25);
  assert.equal(result.trend[1].cogs, 15);
});

test("RPT-35 monthly profit is null for incomplete COGS and redacted without permission", async () => {
  const e = await fixture();
  await addInvoice(e, { date: "2026-04-10", total: 100, missingCogs: true });
  const admin = await report(e, e.admin, {
    branchId: e.branchId,
    from: "2026-04-01",
    to: "2026-04-30",
  });
  assert.equal(admin.trend[0].complete, false);
  assert.equal(admin.trend[0].cogs, null);
  assert.equal(admin.trend[0].grossProfit, null);
  assert.equal(admin.trend[0].netProfit, null);
  const reportOnly = await report(e, e.reportOnly, {
    from: "2026-04-01",
    to: "2026-04-30",
  });
  assert.equal("cogs" in reportOnly.trend[0], false);
  assert.equal("grossProfit" in reportOnly.trend[0], false);
});

test("RPT-36 monthly trend separates expenses purchases and COD movement", async () => {
  const e = await fixture();
  await addExpense(e, 20);
  await addPurchaseReceipt(e, { date: "2026-02-10", landed: 120, payable: 90 });
  await addConfirmation(e, { date: "2026-03-10", amount: 80 });
  await addSettlement(e, { date: "2026-03-20", gross: 80, fee: 5 });
  const result = await report(e, e.manager, {
    from: "2026-01-01",
    to: "2026-03-31",
  });
  assert.equal(result.trend[0].operatingExpenses, 20);
  assert.equal(result.trend[1].landedPurchases, 120);
  assert.equal(result.trend[2].codCollected, 80);
  assert.equal(result.trend[2].codSettled, 80);
  assert.equal(result.trend[2].carrierFees, 5);
});

test("reporting branch options follow central and pinned branch policy", async () => {
  const e = await fixture();
  const [admin, accountant, manager, reportOnly] = await Promise.all([
    e.admin.query(api.reporting.availableBranches, {}),
    e.accountant.query(api.reporting.availableBranches, {}),
    e.manager.query(api.reporting.availableBranches, {}),
    e.reportOnly.query(api.reporting.availableBranches, {}),
  ]);
  assert.deepEqual(
    admin.map((branch) => branch._id).sort(),
    [e.branchId, e.otherBranchId].sort(),
  );
  assert.deepEqual(
    accountant.map((branch) => branch._id).sort(),
    [e.branchId, e.otherBranchId].sort(),
  );
  assert.deepEqual(manager.map((branch) => branch._id), [e.branchId]);
  assert.deepEqual(reportOnly.map((branch) => branch._id), [e.branchId]);
  assert.deepEqual(Object.keys(admin[0]).sort(), ["_id", "name"]);
});

test("reporting branch options reject users without report permission", async () => {
  const e = await fixture();
  await assert.rejects(
    e.viewer.query(api.reporting.availableBranches, {}),
    /صلاحية|permission/i,
  );
});

test("reporting branch options exclude inactive branches without writing data", async () => {
  const e = await fixture();
  const inactiveId = await e.raw.run((ctx) =>
    ctx.db.insert("branches", {
      name: "فرع متوقف",
      address: "القاهرة",
      isActive: false,
    }),
  );
  const before = await e.raw.run((ctx) => ctx.db.query("branches").collect());
  const options = await e.admin.query(api.reporting.availableBranches, {});
  assert.equal(options.some((branch) => branch._id === inactiveId), false);
  assert.deepEqual(
    await e.raw.run((ctx) => ctx.db.query("branches").collect()),
    before,
  );
});
