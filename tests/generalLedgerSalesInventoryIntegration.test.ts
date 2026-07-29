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
  "../convex/generalLedger.ts": () => import("../convex/generalLedger.ts"),
  "../convex/invoices.ts": () => import("../convex/invoices.ts"),
  "../convex/salesReturns.ts": () => import("../convex/salesReturns.ts"),
};

type Fixture = Awaited<ReturnType<typeof fixture>>;

async function fixture(options?: { operational?: boolean }) {
  const raw = convexTest(schema, modules);
  const seeded = await raw.run(async (ctx) => {
    const branchId = await ctx.db.insert("branches", {
      name: "الفرع الرئيسي",
      address: "القاهرة",
      isActive: true,
    });
    await ctx.db.insert("userProfiles", {
      userId: "admin",
      tokenIdentifier: "admin",
      name: "مدير النظام",
      role: "admin",
      branchId,
      permissions: [],
      isActive: true,
    });
    await ctx.db.insert("settings", {
      storeName: "اختبار",
      storeType: "retail",
      primaryColor: "#000",
      secondaryColor: "#fff",
      currency: "EGP",
      taxRate: 0,
    });
    await ctx.db.insert("financeSettings", {
      isInitialized: true,
      cutoverDate: "2026-01-01",
      defaultClearingDelayDays: 0,
      updatedAt: Date.now(),
    });
    const cashAccountId = await ctx.db.insert("financialAccounts", {
      name: "الخزينة",
      code: "CASH",
      uniqueKey: `${branchId}:CASH`,
      type: "cash",
      branchId,
      isActive: true,
      currentBalance: 1000,
      allowNegative: false,
      settlementDelayDays: 0,
      createdAt: Date.now(),
      createdBy: "admin",
      updatedAt: Date.now(),
    });
    const customerId = await ctx.db.insert("customers", {
      name: "عميل الاختبار",
      phone: "01000000000",
      balance: 0,
      totalPurchases: 0,
      branchId,
      isActive: true,
    });
    const productId = await ctx.db.insert("products", {
      name: "جهاز اختبار",
      sku: "TEST-1",
      costPrice: 50,
      inventoryValue: 500,
      sellPrice: 100,
      stock: 10,
      minStock: 1,
      unit: "قطعة",
      branchId,
      isActive: true,
    });
    return { branchId, cashAccountId, customerId, productId };
  });
  const t = raw.withIdentity({
    subject: "admin",
    tokenIdentifier: "admin",
  });
  await t.mutation(api.generalLedger.initialize, {
    cutoverDate: "2026-01-01",
    requestId: "gl-init",
  });
  await t.mutation(api.generalLedger.createOrOpenPeriod, {
    periodKey: "2026-01",
  });
  const chart = await t.query(api.generalLedger.chart, {
    activeOnly: false,
  });
  const account = (key: string) => {
    const found = chart.find((row) => row.systemKey === key);
    assert.ok(found, `missing ${key}`);
    return found._id;
  };
  await t.mutation(api.generalLedger.confirmOpening, {
    branchId: seeded.branchId,
    openingDate: "2026-01-01",
    isZeroOpening: false,
    requestId: "gl-opening",
    lines: [
      {
        accountId: account("cash"),
        debit: 1000,
        credit: 0,
        description: "الخزينة الافتتاحية",
      },
      {
        accountId: account("inventory"),
        debit: 500,
        credit: 0,
        description: "المخزون الافتتاحي",
      },
      {
        accountId: account("opening_equity"),
        debit: 0,
        credit: 1500,
        description: "حقوق الافتتاح",
      },
    ],
  });
  await t.mutation(api.generalLedger.enableFinancialPosting, {
    cutoverDate: "2026-01-01",
    requestId: "finance-bridge",
  });
  if (options?.operational !== false) {
    await raw.run(async (ctx) => {
      const settings = await ctx.db.query("generalLedgerSettings").first();
      assert.ok(settings);
      await ctx.db.patch(settings._id, { operationalPostingEnabled: true });
    });
  }
  return { raw, t, account, ...seeded };
}

function invoiceArgs(
  e: Fixture,
  overrides?: {
    quantity?: number;
    requestId?: string;
    initialPayment?: number;
    date?: string;
  },
) {
  const quantity = overrides?.quantity ?? 2;
  const initialPayment = overrides?.initialPayment;
  return {
    customerId: e.customerId,
    customerName: "غير موثوق",
    items: [
      {
        productId: e.productId,
        productName: "غير موثوق",
        quantity,
        unitPrice: 1,
        discount: 0,
        total: 1,
      },
    ],
    subtotal: 1,
    discount: 0,
    tax: 0,
    total: 1,
    date: overrides?.date ?? "2026-01-10",
    creationRequestId: overrides?.requestId ?? "invoice-create",
    branchId: e.branchId,
    ...(initialPayment
      ? {
          initialPayment: {
            amount: initialPayment,
            accountId: e.cashAccountId,
            paymentDate: overrides?.date ?? "2026-01-10",
            requestId: `${overrides?.requestId ?? "invoice-create"}:payment`,
          },
        }
      : {}),
  };
}

async function createInvoice(
  e: Fixture,
  overrides?: Parameters<typeof invoiceArgs>[1],
) {
  return await e.t.mutation(api.invoices.create, invoiceArgs(e, overrides));
}

async function entriesFor(e: Fixture, type: string, referenceId: string) {
  return await e.raw.run(async (ctx) =>
    (
      await ctx.db
        .query("journalEntries")
        .withIndex("by_reference", (q) =>
          q.eq("referenceType", type).eq("referenceId", referenceId),
        )
        .collect()
    ).sort((a, b) => a.entryNumber.localeCompare(b.entryNumber)),
  );
}

async function linesFor(e: Fixture, entryId: Id<"journalEntries">) {
  return await e.raw.run(async (ctx) =>
    ctx.db
      .query("journalLines")
      .withIndex("by_entry", (q) => q.eq("entryId", entryId))
      .collect(),
  );
}

async function balance(e: Fixture, key: string) {
  return await e.raw.run(async (ctx) => {
    const accountId = e.account(key);
    const row = await ctx.db
      .query("generalLedgerAccountBalances")
      .withIndex("by_key", (q) =>
        q.eq("key", `${e.branchId}:${accountId}`),
      )
      .unique();
    return row?.netDebitBalance ?? 0;
  });
}

async function counts(e: Fixture) {
  return await e.raw.run(async (ctx) => ({
    invoices: (await ctx.db.query("invoices").collect()).length,
    returns: (await ctx.db.query("salesReturns").collect()).length,
    inventory: (await ctx.db.query("inventoryMovements").collect()).length,
    customer: (await ctx.db.query("customerLedgerEntries").collect()).length,
    finance: (await ctx.db.query("financialTransactions").collect()).length,
    movements: (await ctx.db.query("financialMovements").collect()).length,
    journals: (await ctx.db.query("journalEntries").collect()).length,
    lines: (await ctx.db.query("journalLines").collect()).length,
    payments: (await ctx.db.query("payments").collect()).length,
  }));
}

test("SIB-01 unpaid invoice posts sales receivable COGS and inventory", async () => {
  const e = await fixture();
  const id = await createInvoice(e);
  const invoice = await e.raw.run((ctx) => ctx.db.get(id));
  assert.ok(invoice?.journalEntryId);
  assert.equal(invoice.date, "2026-01-10");
  assert.equal(invoice.total, 200);
  assert.equal(invoice.cogsTotal, 100);
  const entries = await entriesFor(e, "invoice", String(id));
  assert.equal(entries.length, 1);
  assert.equal(entries[0].operationType, "invoice_create");
  assert.equal(entries[0].totalDebit, 300);
  assert.equal(entries[0].totalCredit, 300);
  assert.equal((await linesFor(e, entries[0]._id)).length, 4);
  assert.equal(await balance(e, "accounts_receivable"), 200);
  assert.equal(await balance(e, "sales"), -200);
  assert.equal(await balance(e, "cogs"), 100);
  assert.equal(await balance(e, "inventory"), 400);
});

test("SIB-02 fully paid invoice combines operational and financial journals", async () => {
  const e = await fixture();
  const id = await createInvoice(e, { initialPayment: 200 });
  const entries = await entriesFor(e, "invoice", String(id));
  assert.deepEqual(
    entries.map((entry) => entry.sourceType).sort(),
    ["financial", "operational"],
  );
  assert.equal(await balance(e, "accounts_receivable"), 0);
  assert.equal(await balance(e, "cash"), 1200);
  assert.equal(await balance(e, "sales"), -200);
  assert.equal(await balance(e, "cogs"), 100);
  assert.equal(await balance(e, "inventory"), 400);
});

test("SIB-03 invoice retry does not duplicate operational posting", async () => {
  const e = await fixture();
  const first = await createInvoice(e);
  const before = await counts(e);
  const retry = await createInvoice(e);
  assert.equal(retry, first);
  assert.deepEqual(await counts(e), before);
});

test("SIB-04 invoice adjustment posts only sales and COGS deltas", async () => {
  const e = await fixture();
  const id = await createInvoice(e);
  await e.t.mutation(api.invoices.update, {
    id,
    customerId: e.customerId,
    customerName: "عميل الاختبار",
    items: [
      {
        productId: e.productId,
        productName: "جهاز اختبار",
        quantity: 1,
        unitPrice: 100,
        discount: 0,
        total: 100,
      },
    ],
    subtotal: 100,
    discount: 0,
    tax: 0,
    total: 100,
    paid: 0,
    date: "2026-01-11",
    requestId: "invoice-adjust",
    branchId: e.branchId,
  });
  const invoice = await e.raw.run((ctx) => ctx.db.get(id));
  assert.ok(invoice?.lastAdjustmentJournalEntryId);
  const lines = await linesFor(e, invoice.lastAdjustmentJournalEntryId);
  assert.equal(lines.reduce((sum, line) => sum + line.debit, 0), 150);
  assert.equal(lines.reduce((sum, line) => sum + line.credit, 0), 150);
  assert.equal(await balance(e, "accounts_receivable"), 100);
  assert.equal(await balance(e, "sales"), -100);
  assert.equal(await balance(e, "cogs"), 50);
  assert.equal(await balance(e, "inventory"), 450);
});

test("SIB-05 invoice cancellation reverses revenue COGS and inventory", async () => {
  const e = await fixture();
  const id = await createInvoice(e);
  await e.t.mutation(api.invoices.cancel, {
    id,
    reason: "إلغاء البيع",
    date: "2026-01-11",
    requestId: "invoice-cancel",
  });
  const invoice = await e.raw.run((ctx) => ctx.db.get(id));
  assert.equal(invoice?.status, "cancelled");
  assert.ok(invoice?.cancellationJournalEntryId);
  assert.equal(await balance(e, "accounts_receivable"), 0);
  assert.equal(await balance(e, "sales"), 0);
  assert.equal(await balance(e, "cogs"), 0);
  assert.equal(await balance(e, "inventory"), 500);
  const product = await e.raw.run((ctx) => ctx.db.get(e.productId));
  assert.equal(product?.stock, 10);
  assert.equal(product?.inventoryValue, 500);
});

test("SIB-06 debt-only sales return posts contra revenue AR and COGS reversal", async () => {
  const e = await fixture();
  const invoiceId = await createInvoice(e);
  const returnId = await e.t.mutation(api.salesReturns.create, {
    invoiceId,
    items: [{ productId: e.productId, quantity: 1 }],
    reason: "مرتجع جزئي",
    date: "2026-01-12",
    requestId: "return-debt",
  });
  const note = await e.raw.run((ctx) => ctx.db.get(returnId));
  assert.equal(note?.debtReduction, 100);
  assert.equal(note?.cashRefund, 0);
  assert.ok(note?.journalEntryId);
  assert.equal(await balance(e, "sales_returns"), 100);
  assert.equal(await balance(e, "accounts_receivable"), 100);
  assert.equal(await balance(e, "cogs"), 50);
  assert.equal(await balance(e, "inventory"), 450);
});

test("SIB-07 cash-only sales return splits cash and inventory journals without overlap", async () => {
  const e = await fixture();
  const invoiceId = await createInvoice(e, { initialPayment: 200 });
  const returnId = await e.t.mutation(api.salesReturns.create, {
    invoiceId,
    items: [{ productId: e.productId, quantity: 1 }],
    reason: "رد نقدي",
    date: "2026-01-12",
    requestId: "return-cash",
    accountId: e.cashAccountId,
  });
  const note = await e.raw.run((ctx) => ctx.db.get(returnId));
  assert.equal(note?.debtReduction, 0);
  assert.equal(note?.cashRefund, 100);
  const entries = await entriesFor(e, "sales_return", String(returnId));
  assert.deepEqual(
    entries.map((entry) => entry.sourceType).sort(),
    ["financial", "operational"],
  );
  const operational = entries.find(
    (entry) => entry.sourceType === "operational",
  );
  assert.ok(operational);
  assert.equal((await linesFor(e, operational._id)).length, 2);
  assert.equal(await balance(e, "sales_returns"), 100);
  assert.equal(await balance(e, "accounts_receivable"), 0);
  assert.equal(await balance(e, "cash"), 1100);
  assert.equal(await balance(e, "cogs"), 50);
  assert.equal(await balance(e, "inventory"), 450);
});

test("SIB-08 mixed sales return posts exact debt and cash portions once", async () => {
  const e = await fixture();
  const invoiceId = await createInvoice(e, { initialPayment: 150 });
  const returnId = await e.t.mutation(api.salesReturns.create, {
    invoiceId,
    items: [{ productId: e.productId, quantity: 1 }],
    reason: "مرتجع مختلط",
    date: "2026-01-12",
    requestId: "return-mixed",
    accountId: e.cashAccountId,
  });
  const note = await e.raw.run((ctx) => ctx.db.get(returnId));
  assert.equal(note?.debtReduction, 50);
  assert.equal(note?.cashRefund, 50);
  assert.equal(await balance(e, "sales_returns"), 100);
  assert.equal(await balance(e, "accounts_receivable"), 0);
  assert.equal(await balance(e, "cash"), 1100);
  assert.equal(await balance(e, "cogs"), 50);
  assert.equal(await balance(e, "inventory"), 450);
});

test("SIB-09 reversing debt return restores all operational balances", async () => {
  const e = await fixture();
  const invoiceId = await createInvoice(e);
  const returnId = await e.t.mutation(api.salesReturns.create, {
    invoiceId,
    items: [{ productId: e.productId, quantity: 1 }],
    reason: "مرتجع",
    date: "2026-01-12",
    requestId: "return-reverse-source",
  });
  await e.t.mutation(api.salesReturns.reverse, {
    id: returnId,
    reason: "إعادة المرتجع",
    date: "2026-01-13",
    requestId: "return-reverse",
  });
  const note = await e.raw.run((ctx) => ctx.db.get(returnId));
  assert.equal(note?.status, "reversed");
  assert.ok(note?.reversalJournalEntryId);
  const original = await e.raw.run((ctx) =>
    ctx.db.get(note!.journalEntryId!),
  );
  assert.equal(original?.status, "reversed");
  assert.equal(original?.reversalEntryId, note?.reversalJournalEntryId);
  assert.equal(await balance(e, "sales_returns"), 0);
  assert.equal(await balance(e, "accounts_receivable"), 200);
  assert.equal(await balance(e, "cogs"), 100);
  assert.equal(await balance(e, "inventory"), 400);
});

test("SIB-10 reversing cash return restores financial and operational balances", async () => {
  const e = await fixture();
  const invoiceId = await createInvoice(e, { initialPayment: 200 });
  const returnId = await e.t.mutation(api.salesReturns.create, {
    invoiceId,
    items: [{ productId: e.productId, quantity: 1 }],
    reason: "مرتجع نقدي",
    date: "2026-01-12",
    requestId: "cash-return-source",
    accountId: e.cashAccountId,
  });
  await e.t.mutation(api.salesReturns.reverse, {
    id: returnId,
    reason: "عكس الرد",
    date: "2026-01-13",
    requestId: "cash-return-reverse",
  });
  assert.equal(await balance(e, "sales_returns"), 0);
  assert.equal(await balance(e, "accounts_receivable"), 0);
  assert.equal(await balance(e, "cash"), 1200);
  assert.equal(await balance(e, "cogs"), 100);
  assert.equal(await balance(e, "inventory"), 400);
});

test("SIB-11 closed period rolls back invoice customer inventory and counters", async () => {
  const e = await fixture();
  await e.t.mutation(api.generalLedger.closePeriod, {
    periodKey: "2026-01",
    reason: "إقفال الاختبار",
  });
  const before = await counts(e);
  const productBefore = await e.raw.run((ctx) => ctx.db.get(e.productId));
  await assert.rejects(
    createInvoice(e, { requestId: "closed-period" }),
    /الفترة المالية غير مفتوحة/,
  );
  assert.deepEqual(await counts(e), before);
  assert.deepEqual(
    await e.raw.run((ctx) => ctx.db.get(e.productId)),
    productBefore,
  );
});

test("SIB-12 inactive sales account rolls back the complete invoice mutation", async () => {
  const e = await fixture();
  await e.raw.run(async (ctx) => {
    const sales = await ctx.db
      .query("chartOfAccounts")
      .withIndex("by_system_key", (q) => q.eq("systemKey", "sales"))
      .unique();
    assert.ok(sales);
    await ctx.db.patch(sales._id, { isActive: false });
  });
  const before = await counts(e);
  await assert.rejects(
    createInvoice(e, { requestId: "inactive-sales" }),
    /حساب الأستاذ العام غير صالح: sales/,
  );
  assert.deepEqual(await counts(e), before);
  const product = await e.raw.run((ctx) => ctx.db.get(e.productId));
  assert.equal(product?.stock, 10);
  assert.equal(product?.inventoryValue, 500);
});

test("SIB-13 pre-cutover invoice is rejected atomically by the shared cutover", async () => {
  const e = await fixture();
  const before = await counts(e);
  await assert.rejects(
    createInvoice(e, {
      requestId: "before-cutover",
      date: "2025-12-31",
    }),
    /تاريخ القطع|تاريخ الربط/,
  );
  assert.deepEqual(await counts(e), before);
});

test("SIB-14 dormant operational bridge preserves document behavior without journals", async () => {
  const e = await fixture({ operational: false });
  const id = await createInvoice(e);
  const invoice = await e.raw.run((ctx) => ctx.db.get(id));
  assert.equal(invoice?.journalEntryId, undefined);
  const entries = await entriesFor(e, "invoice", String(id));
  assert.equal(entries.length, 0);
  assert.equal(invoice?.total, 200);
  assert.equal(invoice?.cogsTotal, 100);
  assert.equal(
    (await e.raw.run((ctx) => ctx.db.get(e.productId)))?.inventoryValue,
    400,
  );
});

test("SIB-15 operational posting cannot run without the financial bridge", async () => {
  const e = await fixture();
  await e.raw.run(async (ctx) => {
    const settings = await ctx.db.query("generalLedgerSettings").first();
    assert.ok(settings);
    await ctx.db.patch(settings._id, { financialPostingEnabled: false });
  });
  const before = await counts(e);
  await assert.rejects(
    createInvoice(e, { requestId: "missing-finance-bridge" }),
    /يجب تفعيل ربط الخزائن/,
  );
  assert.deepEqual(await counts(e), before);
});

test("SIB-16 no sales cycle writes the legacy payments table", async () => {
  const e = await fixture();
  const invoiceId = await createInvoice(e, { initialPayment: 150 });
  const returnId = await e.t.mutation(api.salesReturns.create, {
    invoiceId,
    items: [{ productId: e.productId, quantity: 1 }],
    reason: "مرتجع",
    date: "2026-01-12",
    requestId: "no-payments",
    accountId: e.cashAccountId,
  });
  await e.t.mutation(api.salesReturns.reverse, {
    id: returnId,
    reason: "عكس",
    date: "2026-01-13",
    requestId: "no-payments-reverse",
  });
  assert.equal((await counts(e)).payments, 0);
});

test("SIB-17 sales return retry preserves one document and one journal", async () => {
  const e = await fixture();
  const invoiceId = await createInvoice(e);
  const args = {
    invoiceId,
    items: [{ productId: e.productId, quantity: 1 }],
    reason: "مرتجع ثابت",
    date: "2026-01-12",
    requestId: "return-retry",
  };
  const first = await e.t.mutation(api.salesReturns.create, args);
  const before = await counts(e);
  const retry = await e.t.mutation(api.salesReturns.create, args);
  assert.equal(retry, first);
  assert.deepEqual(await counts(e), before);
  assert.equal((await entriesFor(e, "sales_return", String(first))).length, 1);
});

test("SIB-18 identical return reversal retry preserves one reversal journal", async () => {
  const e = await fixture();
  const invoiceId = await createInvoice(e);
  const returnId = await e.t.mutation(api.salesReturns.create, {
    invoiceId,
    items: [{ productId: e.productId, quantity: 1 }],
    reason: "مرتجع",
    date: "2026-01-12",
    requestId: "reverse-retry-source",
  });
  const args = {
    id: returnId,
    reason: "عكس المرتجع",
    date: "2026-01-13",
    requestId: "reverse-retry",
  };
  const first = await e.t.mutation(api.salesReturns.reverse, args);
  const before = await counts(e);
  const retry = await e.t.mutation(api.salesReturns.reverse, args);
  assert.equal(retry, first);
  assert.deepEqual(await counts(e), before);
});

test("SIB-19 conflicting reversal request is rejected without side effects", async () => {
  const e = await fixture();
  const invoiceId = await createInvoice(e);
  const returnId = await e.t.mutation(api.salesReturns.create, {
    invoiceId,
    items: [{ productId: e.productId, quantity: 1 }],
    reason: "مرتجع",
    date: "2026-01-12",
    requestId: "conflict-source",
  });
  await e.t.mutation(api.salesReturns.reverse, {
    id: returnId,
    reason: "العكس الأصلي",
    date: "2026-01-13",
    requestId: "conflict-original",
  });
  const before = await counts(e);
  await assert.rejects(
    e.t.mutation(api.salesReturns.reverse, {
      id: returnId,
      reason: "عكس مختلف",
      date: "2026-01-14",
      requestId: "conflict-other",
    }),
    /بطلب مختلف/,
  );
  assert.deepEqual(await counts(e), before);
});

test("SIB-20 insufficient stock leaves GL customer and inventory untouched", async () => {
  const e = await fixture();
  const before = await counts(e);
  const productBefore = await e.raw.run((ctx) => ctx.db.get(e.productId));
  await assert.rejects(
    createInvoice(e, {
      quantity: 11,
      requestId: "insufficient-stock",
    }),
    /المخزون غير كاف/,
  );
  assert.deepEqual(await counts(e), before);
  assert.deepEqual(
    await e.raw.run((ctx) => ctx.db.get(e.productId)),
    productBefore,
  );
});

test("SIB-21 over-return rejection preserves invoice product and journals", async () => {
  const e = await fixture();
  const invoiceId = await createInvoice(e, { quantity: 1 });
  await e.t.mutation(api.salesReturns.create, {
    invoiceId,
    items: [{ productId: e.productId, quantity: 1 }],
    reason: "المرتجع الكامل",
    date: "2026-01-12",
    requestId: "full-return",
  });
  const before = await counts(e);
  const invoiceBefore = await e.raw.run((ctx) => ctx.db.get(invoiceId));
  const productBefore = await e.raw.run((ctx) => ctx.db.get(e.productId));
  await assert.rejects(
    e.t.mutation(api.salesReturns.create, {
      invoiceId,
      items: [{ productId: e.productId, quantity: 1 }],
      reason: "مرتجع زائد",
      date: "2026-01-13",
      requestId: "over-return",
    }),
    /تتجاوز المتاح/,
  );
  assert.deepEqual(await counts(e), before);
  assert.deepEqual(
    await e.raw.run((ctx) => ctx.db.get(invoiceId)),
    invoiceBefore,
  );
  assert.deepEqual(
    await e.raw.run((ctx) => ctx.db.get(e.productId)),
    productBefore,
  );
});

test("SIB-22 missing historical COGS blocks cancellation and rolls everything back", async () => {
  const e = await fixture();
  const invoiceId = await createInvoice(e);
  await e.raw.run(async (ctx) => {
    await ctx.db.patch(invoiceId, { cogsTotal: undefined });
  });
  const before = await counts(e);
  const invoiceBefore = await e.raw.run((ctx) => ctx.db.get(invoiceId));
  const productBefore = await e.raw.run((ctx) => ctx.db.get(e.productId));
  await assert.rejects(
    e.t.mutation(api.invoices.cancel, {
      id: invoiceId,
      reason: "إلغاء بلا تكلفة",
      date: "2026-01-12",
      requestId: "legacy-cancel",
    }),
    /تكلفة المبيعات/,
  );
  assert.deepEqual(await counts(e), before);
  assert.deepEqual(
    await e.raw.run((ctx) => ctx.db.get(invoiceId)),
    invoiceBefore,
  );
  assert.deepEqual(
    await e.raw.run((ctx) => ctx.db.get(e.productId)),
    productBefore,
  );
});

test("SIB-23 public invoice and return DTOs hide internal journal links", async () => {
  const e = await fixture();
  const invoiceId = await createInvoice(e);
  const returnId = await e.t.mutation(api.salesReturns.create, {
    invoiceId,
    items: [{ productId: e.productId, quantity: 1 }],
    reason: "فحص DTO",
    date: "2026-01-12",
    requestId: "dto-return",
  });
  const invoice = await e.t.query(api.invoices.get, { id: invoiceId });
  assert.ok(invoice);
  assert.equal("journalEntryId" in invoice, false);
  assert.equal("lastAdjustmentJournalEntryId" in invoice, false);
  assert.equal("cancellationJournalEntryId" in invoice, false);
  const listedInvoices = await e.t.query(api.invoices.list, {});
  assert.equal("journalEntryId" in listedInvoices[0], false);
  const returns = await e.t.query(api.salesReturns.list, {
    invoiceId,
  });
  const note = returns.find((row) => row._id === returnId);
  assert.ok(note);
  assert.equal("journalEntryId" in note, false);
  assert.equal("reversalJournalEntryId" in note, false);
});

test("SIB-24 cross-branch product rejection leaves both branches unchanged", async () => {
  const e = await fixture();
  const other = await e.raw.run(async (ctx) => {
    const branchId = await ctx.db.insert("branches", {
      name: "الفرع الآخر",
      address: "الجيزة",
      isActive: true,
    });
    const productId = await ctx.db.insert("products", {
      name: "منتج فرع آخر",
      sku: "OTHER-1",
      costPrice: 20,
      inventoryValue: 100,
      sellPrice: 40,
      stock: 5,
      minStock: 0,
      unit: "قطعة",
      branchId,
      isActive: true,
    });
    return { branchId, productId };
  });
  const before = await counts(e);
  const otherBefore = await e.raw.run((ctx) => ctx.db.get(other.productId));
  await assert.rejects(
    e.t.mutation(api.invoices.create, {
      ...invoiceArgs(e, { requestId: "cross-branch-product" }),
      items: [
        {
          productId: other.productId,
          productName: "غير موثوق",
          quantity: 1,
          unitPrice: 1,
          discount: 0,
          total: 1,
        },
      ],
    }),
    /لا ينتمي إلى فرع الفاتورة/,
  );
  assert.deepEqual(await counts(e), before);
  assert.deepEqual(
    await e.raw.run((ctx) => ctx.db.get(other.productId)),
    otherBefore,
  );
});

test("SIB-25 three units at 10.3333 post exact COGS and inventory value 31", async () => {
  const e = await fixture();
  await e.raw.run(async (ctx) => {
    await ctx.db.patch(e.productId, {
      costPrice: 10.3333,
      inventoryValue: 103.33,
    });
  });
  const invoiceId = await createInvoice(e, {
    quantity: 3,
    requestId: "precise-cogs",
  });
  const invoice = await e.raw.run((ctx) => ctx.db.get(invoiceId));
  assert.equal(invoice?.cogsTotal, 31);
  const journalLines = await linesFor(e, invoice!.journalEntryId!);
  const cogs = journalLines.find(
    (line) => line.accountId === e.account("cogs"),
  );
  const inventory = journalLines.find(
    (line) => line.accountId === e.account("inventory"),
  );
  assert.equal(cogs?.debit, 31);
  assert.equal(inventory?.credit, 31);
  const movement = (
    await e.raw.run((ctx) =>
      ctx.db
        .query("inventoryMovements")
        .withIndex("by_product", (q) => q.eq("productId", e.productId))
        .collect(),
    )
  )[0];
  assert.equal(movement.valueDelta, -31);
});

test("SIB-26 zero-cost sale posts revenue without fake COGS lines", async () => {
  const e = await fixture();
  await e.raw.run(async (ctx) => {
    await ctx.db.patch(e.productId, {
      costPrice: 0,
      inventoryValue: 0,
    });
  });
  const invoiceId = await createInvoice(e, {
    quantity: 1,
    requestId: "zero-cost-sale",
  });
  const invoice = await e.raw.run((ctx) => ctx.db.get(invoiceId));
  assert.equal(invoice?.cogsTotal, 0);
  const journalLines = await linesFor(e, invoice!.journalEntryId!);
  assert.equal(journalLines.length, 2);
  assert.equal(
    journalLines.some(
      (line) =>
        line.accountId === e.account("cogs") ||
        line.accountId === e.account("inventory"),
    ),
    false,
  );
});

test("SIB-27 cumulative partial returns absorb exact sales and COGS totals", async () => {
  const e = await fixture();
  const invoiceId = await createInvoice(e, {
    quantity: 3,
    requestId: "cumulative-invoice",
  });
  await e.t.mutation(api.salesReturns.create, {
    invoiceId,
    items: [{ productId: e.productId, quantity: 1 }],
    reason: "الجزء الأول",
    date: "2026-01-12",
    requestId: "cumulative-first",
  });
  await e.t.mutation(api.salesReturns.create, {
    invoiceId,
    items: [{ productId: e.productId, quantity: 2 }],
    reason: "الجزء الأخير",
    date: "2026-01-13",
    requestId: "cumulative-last",
  });
  const invoice = await e.raw.run((ctx) => ctx.db.get(invoiceId));
  assert.equal(invoice?.creditedTotal, 300);
  assert.equal(invoice?.netTotal, 0);
  assert.equal(invoice?.status, "returned");
  assert.equal(await balance(e, "sales_returns"), 300);
  assert.equal(await balance(e, "accounts_receivable"), 0);
  assert.equal(await balance(e, "cogs"), 0);
  assert.equal(await balance(e, "inventory"), 500);
});

test("SIB-28 complete create return reverse cycle keeps all links and balances auditable", async () => {
  const e = await fixture();
  const invoiceId = await createInvoice(e, { initialPayment: 150 });
  const returnId = await e.t.mutation(api.salesReturns.create, {
    invoiceId,
    items: [{ productId: e.productId, quantity: 1 }],
    reason: "دورة كاملة",
    date: "2026-01-12",
    requestId: "complete-return",
    accountId: e.cashAccountId,
  });
  await e.t.mutation(api.salesReturns.reverse, {
    id: returnId,
    reason: "إغلاق الدورة",
    date: "2026-01-13",
    requestId: "complete-reverse",
  });
  const invoice = await e.raw.run((ctx) => ctx.db.get(invoiceId));
  const note = await e.raw.run((ctx) => ctx.db.get(returnId));
  assert.equal(invoice?.paid, 150);
  assert.equal(invoice?.remaining, 50);
  assert.equal(invoice?.status, "partial");
  assert.equal(note?.status, "reversed");
  assert.ok(invoice?.journalEntryId);
  assert.ok(note?.journalEntryId);
  assert.ok(note?.reversalJournalEntryId);
  assert.equal(await balance(e, "accounts_receivable"), 50);
  assert.equal(await balance(e, "cash"), 1150);
  assert.equal(await balance(e, "sales"), -200);
  assert.equal(await balance(e, "sales_returns"), 0);
  assert.equal(await balance(e, "cogs"), 100);
  assert.equal(await balance(e, "inventory"), 400);
  assert.equal((await counts(e)).payments, 0);
});
