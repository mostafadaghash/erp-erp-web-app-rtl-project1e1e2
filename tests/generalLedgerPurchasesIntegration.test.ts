import test, { before } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { symlink } from "node:fs/promises";
import { resolve } from "node:path";
import { convexTest } from "convex-test";
import schema from "../convex/schema.ts";
import { api } from "../convex/_generated/api.js";
import type { Id } from "../convex/_generated/dataModel";

const links = [
  ["convex/_generated/server", "server.js"],
  ["convex/lib/auth", "auth.ts"],
  ["convex/lib/finance", "finance.ts"],
  ["convex/lib/documentNumbers", "documentNumbers.ts"],
  ["convex/lib/references", "references.ts"],
  ["convex/lib/inventory", "inventory.ts"],
  ["convex/lib/supplierLedger", "supplierLedger.ts"],
  ["shared/businessRules", "businessRules.ts"],
  ["shared/inventoryRules", "inventoryRules.ts"],
  ["shared/purchaseReturnRules", "purchaseReturnRules.ts"],
  ["shared/supplierPaymentRules", "supplierPaymentRules.ts"],
] as const;

before(async () => {
  for (const [path, target] of links) {
    const absolute = resolve(path);
    if (!existsSync(absolute)) {
      await symlink(target, absolute);
    }
  }
});

const modules = {
  "../convex/_generated/api.js": () => import("../convex/_generated/api.js"),
  "../convex/_generated/server.js": () =>
    import("../convex/_generated/server.js"),
  "../convex/generalLedger.ts": () => import("../convex/generalLedger.ts"),
  "../convex/shipments.ts": () => import("../convex/shipments.ts"),
  "../convex/purchaseReturns.ts": () => import("../convex/purchaseReturns.ts"),
  "../convex/supplierPayments.ts": () =>
    import("../convex/supplierPayments.ts"),
};

type Fixture = Awaited<ReturnType<typeof fixture>>;

async function fixture(options?: {
  operational?: boolean;
  unitCost?: number;
  shippingCost?: number;
  quantity?: number;
}) {
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
    const supplierId = await ctx.db.insert("suppliers", {
      name: "مورد الاختبار",
      phone: "01000000000",
      balance: 77,
      isActive: true,
    });
    const productId = await ctx.db.insert("products", {
      name: "منتج الاختبار",
      sku: crypto.randomUUID(),
      costPrice: 10,
      inventoryValue: 100,
      sellPrice: 20,
      stock: 10,
      minStock: 0,
      unit: "قطعة",
      branchId,
      isActive: true,
    });
    const quantity = options?.quantity ?? 3;
    const unitCost = options?.unitCost ?? 10;
    const shippingCost = options?.shippingCost ?? 1;
    const goods = quantity * unitCost;
    const shipmentId = await ctx.db.insert("shipments", {
      shipmentNumber: `SHP-${crypto.randomUUID()}`,
      supplierId,
      supplierName: "غير موثوق",
      items: [
        {
          productId,
          productName: "غير موثوق",
          quantity,
          unitCost,
          total: goods,
        },
      ],
      totalCost: goods,
      shippingCost,
      grandTotal: goods + shippingCost,
      status: "in_transit",
      branchId,
    });
    return { branchId, cashAccountId, supplierId, productId, shipmentId };
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
        debit: 100,
        credit: 0,
        description: "المخزون الافتتاحي",
      },
      {
        accountId: account("opening_equity"),
        debit: 0,
        credit: 1100,
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

async function receive(
  e: Fixture,
  options?: {
    supplierFreightAmount?: number;
    requestId?: string;
    date?: string;
  },
) {
  return await e.t.mutation(api.shipments.receive, {
    shipmentId: e.shipmentId,
    receiptDate: options?.date ?? "2026-01-10",
    requestId: options?.requestId ?? "receipt-request",
    supplierFreightAmount: options?.supplierFreightAmount ?? 0,
  });
}

async function purchaseReturn(
  e: Fixture,
  receiptId: Id<"purchaseReceipts">,
  options?: {
    quantity?: number;
    freight?: number;
    requestId?: string;
    date?: string;
    refund?: boolean;
    items?: Array<{ receiptItemIndex: number; quantity: number }>;
  },
) {
  return await e.t.mutation(api.purchaseReturns.create, {
    purchaseReceiptId: receiptId,
    branchId: e.branchId,
    date: options?.date ?? "2026-01-11",
    reason: "مرتجع اختبار",
    freightCreditAmount: options?.freight ?? 0,
    requestId: options?.requestId ?? "return-request",
    items:
      options?.items ??
      (options?.quantity === 0
        ? []
        : [{ receiptItemIndex: 0, quantity: options?.quantity ?? 1 }]),
    ...(options?.refund ? { refundAccountId: e.cashAccountId } : {}),
  });
}

async function payReceipt(
  e: Fixture,
  receiptId: Id<"purchaseReceipts">,
  amount: number,
  requestId = `supplier-payment-${amount}`,
) {
  return await e.t.mutation(api.supplierPayments.create, {
    supplierId: e.supplierId,
    branchId: e.branchId,
    accountId: e.cashAccountId,
    date: "2026-01-10",
    requestId,
    allocations: [{ purchaseReceiptId: receiptId, amount }],
  });
}

async function referenceEntries(
  e: Fixture,
  referenceType: string,
  referenceId: string,
) {
  return await e.raw.run(async (ctx) =>
    (
      await ctx.db
        .query("journalEntries")
        .withIndex("by_reference", (q) =>
          q.eq("referenceType", referenceType).eq("referenceId", referenceId),
        )
        .collect()
    ).sort((left, right) => left.entryNumber.localeCompare(right.entryNumber)),
  );
}

async function journalLines(e: Fixture, entryId: Id<"journalEntries">) {
  return await e.raw.run(async (ctx) =>
    ctx.db
      .query("journalLines")
      .withIndex("by_entry", (q) => q.eq("entryId", entryId))
      .collect(),
  );
}

async function accountBalance(e: Fixture, key: string) {
  return await e.raw.run(async (ctx) => {
    const row = await ctx.db
      .query("generalLedgerAccountBalances")
      .withIndex("by_key", (q) =>
        q.eq("key", `${e.branchId}:${e.account(key)}`),
      )
      .unique();
    return row?.netDebitBalance ?? 0;
  });
}

async function operationalSnapshot(e: Fixture) {
  return await e.raw.run(async (ctx) => ({
    shipments: await ctx.db.query("shipments").collect(),
    receipts: await ctx.db.query("purchaseReceipts").collect(),
    returns: await ctx.db.query("purchaseReturns").collect(),
    products: await ctx.db.query("products").collect(),
    inventory: await ctx.db.query("inventoryMovements").collect(),
    supplierBalances: await ctx.db.query("supplierBalances").collect(),
    supplierLedger: await ctx.db.query("supplierLedgerEntries").collect(),
    financialAccounts: await ctx.db.query("financialAccounts").collect(),
    transactions: await ctx.db.query("financialTransactions").collect(),
    movements: await ctx.db.query("financialMovements").collect(),
    journals: await ctx.db.query("journalEntries").collect(),
    journalLines: await ctx.db.query("journalLines").collect(),
    accountBalances: await ctx.db
      .query("generalLedgerAccountBalances")
      .collect(),
    periodBalances: await ctx.db.query("generalLedgerPeriodBalances").collect(),
    dailyBalances: await ctx.db.query("generalLedgerDailyBalances").collect(),
    counters: await ctx.db.query("documentCounters").collect(),
    payments: await ctx.db.query("payments").collect(),
  }));
}

function lineFor(
  lines: Awaited<ReturnType<typeof journalLines>>,
  accountId: Id<"chartOfAccounts">,
) {
  const found = lines.find((row) => row.accountId === accountId);
  assert.ok(found);
  return found;
}

test("PIB-01 external freight posts inventory payable and freight liability", async () => {
  const e = await fixture();
  const receipt = await receive(e);
  const row = await e.raw.run((ctx) => ctx.db.get(receipt.purchaseReceiptId));
  assert.ok(row?.journalEntryId);
  const lines = await journalLines(e, row.journalEntryId);
  assert.deepEqual(
    {
      inventory: lineFor(lines, e.account("inventory")).debit,
      payable: lineFor(lines, e.account("accounts_payable")).credit,
      external: lineFor(lines, e.account("other_liabilities")).credit,
    },
    { inventory: 31, payable: 30, external: 1 },
  );
});

test("PIB-02 supplier freight credits accounts payable for full landed cost", async () => {
  const e = await fixture();
  const receipt = await receive(e, { supplierFreightAmount: 1 });
  const row = await e.raw.run((ctx) => ctx.db.get(receipt.purchaseReceiptId));
  assert.ok(row?.journalEntryId);
  const lines = await journalLines(e, row.journalEntryId);
  assert.equal(lineFor(lines, e.account("inventory")).debit, 31);
  assert.equal(lineFor(lines, e.account("accounts_payable")).credit, 31);
  assert.equal(
    lines.some((item) => item.accountId === e.account("other_liabilities")),
    false,
  );
});

test("PIB-03 split freight reconciles landed value to both liabilities", async () => {
  const e = await fixture({ shippingCost: 10 });
  const receipt = await receive(e, { supplierFreightAmount: 4 });
  const row = await e.raw.run((ctx) => ctx.db.get(receipt.purchaseReceiptId));
  assert.ok(row?.journalEntryId);
  const lines = await journalLines(e, row.journalEntryId);
  assert.deepEqual(
    [
      lineFor(lines, e.account("inventory")).debit,
      lineFor(lines, e.account("accounts_payable")).credit,
      lineFor(lines, e.account("other_liabilities")).credit,
    ],
    [40, 34, 6],
  );
});

test("PIB-04 free goods with external freight post only inventory and freight liability", async () => {
  const e = await fixture({ unitCost: 0, shippingCost: 1 });
  const receipt = await receive(e);
  const row = await e.raw.run((ctx) => ctx.db.get(receipt.purchaseReceiptId));
  assert.ok(row?.journalEntryId);
  const lines = await journalLines(e, row.journalEntryId);
  assert.deepEqual(
    [
      lineFor(lines, e.account("inventory")).debit,
      lineFor(lines, e.account("other_liabilities")).credit,
    ],
    [1, 1],
  );
});

test("PIB-05 free goods with supplier freight post inventory and supplier liability", async () => {
  const e = await fixture({ unitCost: 0, shippingCost: 1 });
  const receipt = await receive(e, { supplierFreightAmount: 1 });
  const row = await e.raw.run((ctx) => ctx.db.get(receipt.purchaseReceiptId));
  assert.ok(row?.journalEntryId);
  const lines = await journalLines(e, row.journalEntryId);
  assert.deepEqual(
    [
      lineFor(lines, e.account("inventory")).debit,
      lineFor(lines, e.account("accounts_payable")).credit,
    ],
    [1, 1],
  );
});

test("PIB-06 zero-value free receipt remains valid without a synthetic journal", async () => {
  const e = await fixture({ unitCost: 0, shippingCost: 0 });
  const receipt = await receive(e);
  const row = await e.raw.run((ctx) => ctx.db.get(receipt.purchaseReceiptId));
  assert.equal(row?.journalEntryId, undefined);
  assert.deepEqual(
    await referenceEntries(
      e,
      "purchase_receipt",
      String(receipt.purchaseReceiptId),
    ),
    [],
  );
});

test("PIB-07 receipt retry returns one operational journal without duplicate balances", async () => {
  const e = await fixture();
  const first = await receive(e);
  const before = await operationalSnapshot(e);
  const retry = await receive(e);
  assert.equal(retry.purchaseReceiptId, first.purchaseReceiptId);
  assert.deepEqual(await operationalSnapshot(e), before);
  assert.equal(
    (
      await referenceEntries(
        e,
        "purchase_receipt",
        String(first.purchaseReceiptId),
      )
    ).length,
    1,
  );
});

test("PIB-08 closed period rolls back receipt stock supplier and journal effects", async () => {
  const e = await fixture();
  await e.t.mutation(api.generalLedger.closePeriod, {
    periodKey: "2026-01",
    reason: "إغلاق اختبار",
  });
  const beforeState = await operationalSnapshot(e);
  await assert.rejects(receive(e), /الفترة المالية غير مفتوحة/);
  assert.deepEqual(await operationalSnapshot(e), beforeState);
});

test("PIB-09 disabled inventory account rolls the entire receipt mutation back", async () => {
  const e = await fixture();
  await e.raw.run((ctx) =>
    ctx.db.patch(e.account("inventory"), { isActive: false }),
  );
  const beforeState = await operationalSnapshot(e);
  await assert.rejects(receive(e), /inventory/);
  assert.deepEqual(await operationalSnapshot(e), beforeState);
});

test("PIB-10 dormant operational switch preserves the audited purchase flow without GL writes", async () => {
  const e = await fixture({ operational: false });
  const receipt = await receive(e);
  const row = await e.raw.run((ctx) => ctx.db.get(receipt.purchaseReceiptId));
  assert.equal(row?.journalEntryId, undefined);
  assert.equal((await operationalSnapshot(e)).receipts.length, 1);
  assert.deepEqual(
    await referenceEntries(
      e,
      "purchase_receipt",
      String(receipt.purchaseReceiptId),
    ),
    [],
  );
});

test("PIB-11 operational cutover rejects an earlier receipt with complete rollback", async () => {
  const e = await fixture();
  await e.raw.run(async (ctx) => {
    const settings = await ctx.db.query("generalLedgerSettings").first();
    assert.ok(settings);
    await ctx.db.patch(settings._id, {
      financialPostingCutoverDate: "2026-01-11",
    });
  });
  const beforeState = await operationalSnapshot(e);
  await assert.rejects(receive(e), /يسبق تاريخ الربط التشغيلي/);
  assert.deepEqual(await operationalSnapshot(e), beforeState);
});

test("PIB-12 receipt journal stores operational source and auditable document references", async () => {
  const e = await fixture();
  const receipt = await receive(e);
  const entries = await referenceEntries(
    e,
    "purchase_receipt",
    String(receipt.purchaseReceiptId),
  );
  assert.equal(entries.length, 1);
  assert.deepEqual(
    {
      sourceType: entries[0].sourceType,
      operationType: entries[0].operationType,
      referenceNumber: entries[0].referenceNumber,
    },
    {
      sourceType: "operational",
      operationType: "purchase_receipt",
      referenceNumber: receipt.receiptNumber,
    },
  );
});

test("PIB-13 debt-only return exposes a valuation loss instead of hiding it", async () => {
  const e = await fixture();
  const receipt = await receive(e);
  const returnId = await purchaseReturn(e, receipt.purchaseReceiptId);
  const row = await e.raw.run((ctx) => ctx.db.get(returnId));
  assert.ok(row?.journalEntryId);
  assert.equal(row.totalCredit, 10);
  assert.equal(row.inventoryValueRemoved, 10.08);
  const lines = await journalLines(e, row.journalEntryId);
  assert.deepEqual(
    [
      lineFor(lines, e.account("accounts_payable")).debit,
      lineFor(lines, e.account("inventory")).credit,
      lineFor(lines, e.account("other_expenses")).debit,
    ],
    [10, 10.08, 0.08],
  );
});

test("PIB-14 lower current inventory valuation posts an explicit valuation gain", async () => {
  const e = await fixture();
  const receipt = await receive(e);
  await e.raw.run((ctx) =>
    ctx.db.patch(e.productId, { inventoryValue: 65, costPrice: 5 }),
  );
  const returnId = await purchaseReturn(e, receipt.purchaseReceiptId);
  const row = await e.raw.run((ctx) => ctx.db.get(returnId));
  assert.ok(row?.journalEntryId);
  const lines = await journalLines(e, row.journalEntryId);
  assert.deepEqual(
    [
      lineFor(lines, e.account("accounts_payable")).debit,
      lineFor(lines, e.account("inventory")).credit,
      lineFor(lines, e.account("other_revenue")).credit,
    ],
    [10, 5, 5],
  );
});

test("PIB-15 equal historical and current valuation needs no difference account", async () => {
  const e = await fixture({ shippingCost: 0 });
  const receipt = await receive(e);
  const returnId = await purchaseReturn(e, receipt.purchaseReceiptId);
  const row = await e.raw.run((ctx) => ctx.db.get(returnId));
  assert.ok(row?.journalEntryId);
  const lines = await journalLines(e, row.journalEntryId);
  assert.equal(lines.length, 2);
  assert.deepEqual(
    [
      lineFor(lines, e.account("accounts_payable")).debit,
      lineFor(lines, e.account("inventory")).credit,
    ],
    [10, 10],
  );
});

test("PIB-16 freight-only supplier credit posts AP against explicit other income", async () => {
  const e = await fixture();
  const receipt = await receive(e, { supplierFreightAmount: 1 });
  const returnId = await purchaseReturn(e, receipt.purchaseReceiptId, {
    quantity: 0,
    freight: 1,
  });
  const row = await e.raw.run((ctx) => ctx.db.get(returnId));
  assert.ok(row?.journalEntryId);
  const lines = await journalLines(e, row.journalEntryId);
  assert.deepEqual(
    [
      lineFor(lines, e.account("accounts_payable")).debit,
      lineFor(lines, e.account("other_revenue")).credit,
    ],
    [1, 1],
  );
  assert.equal(
    (await operationalSnapshot(e)).inventory.filter(
      (movement) => movement.referenceId === String(returnId),
    ).length,
    0,
  );
});

test("PIB-17 cash-only return splits the cash journal from purchase valuation", async () => {
  const e = await fixture({ shippingCost: 0 });
  const receipt = await receive(e);
  await payReceipt(e, receipt.purchaseReceiptId, 30);
  const returnId = await purchaseReturn(e, receipt.purchaseReceiptId, {
    refund: true,
  });
  const row = await e.raw.run((ctx) => ctx.db.get(returnId));
  assert.ok(row?.journalEntryId);
  assert.ok(row.financialTransactionId);
  assert.deepEqual([row.debtReduction, row.cashRefund], [0, 10]);
  const entries = await referenceEntries(
    e,
    "purchase_return",
    String(returnId),
  );
  assert.equal(entries.length, 2);
  assert.deepEqual(entries.map((entry) => entry.sourceType).sort(), [
    "financial",
    "operational",
  ]);
  assert.equal(await accountBalance(e, "accounts_payable"), 0);
});

test("PIB-18 mixed return leaves AP movement equal to supplier debt reduction", async () => {
  const e = await fixture({ shippingCost: 0 });
  const receipt = await receive(e);
  await payReceipt(e, receipt.purchaseReceiptId, 20);
  const returnId = await purchaseReturn(e, receipt.purchaseReceiptId, {
    quantity: 2,
    refund: true,
  });
  const row = await e.raw.run((ctx) => ctx.db.get(returnId));
  assert.deepEqual(
    [row?.totalCredit, row?.debtReduction, row?.cashRefund],
    [20, 10, 10],
  );
  assert.equal(await accountBalance(e, "accounts_payable"), 0);
  const supplierBalance = await e.raw.run((ctx) =>
    ctx.db
      .query("supplierBalances")
      .withIndex("by_supplier_branch", (q) =>
        q.eq("supplierId", e.supplierId).eq("branchId", e.branchId),
      )
      .unique(),
  );
  assert.equal(supplierBalance?.balance, 0);
});

test("PIB-19 purchase return retry duplicates neither operational nor financial journals", async () => {
  const e = await fixture({ shippingCost: 0 });
  const receipt = await receive(e);
  const first = await purchaseReturn(e, receipt.purchaseReceiptId);
  const beforeState = await operationalSnapshot(e);
  const retry = await purchaseReturn(e, receipt.purchaseReceiptId);
  assert.equal(retry, first);
  assert.deepEqual(await operationalSnapshot(e), beforeState);
});

test("PIB-20 return request fingerprint conflict preserves all ledgers and inventory", async () => {
  const e = await fixture({ shippingCost: 0 });
  const receipt = await receive(e);
  await purchaseReturn(e, receipt.purchaseReceiptId);
  const beforeState = await operationalSnapshot(e);
  await assert.rejects(
    purchaseReturn(e, receipt.purchaseReceiptId, {
      quantity: 2,
      requestId: "return-request",
    }),
    /بيانات مختلفة/,
  );
  assert.deepEqual(await operationalSnapshot(e), beforeState);
});

test("PIB-21 closed period rolls back purchase return inventory supplier and finance writes", async () => {
  const e = await fixture({ shippingCost: 0 });
  const receipt = await receive(e);
  await e.t.mutation(api.generalLedger.closePeriod, {
    periodKey: "2026-01",
    reason: "إغلاق اختبار",
  });
  const beforeState = await operationalSnapshot(e);
  await assert.rejects(
    purchaseReturn(e, receipt.purchaseReceiptId),
    /الفترة المالية غير مفتوحة/,
  );
  assert.deepEqual(await operationalSnapshot(e), beforeState);
});

test("PIB-22 disabled AP account rolls the whole purchase return back", async () => {
  const e = await fixture({ shippingCost: 0 });
  const receipt = await receive(e);
  await e.raw.run((ctx) =>
    ctx.db.patch(e.account("accounts_payable"), { isActive: false }),
  );
  const beforeState = await operationalSnapshot(e);
  await assert.rejects(
    purchaseReturn(e, receipt.purchaseReceiptId),
    /accounts_payable/,
  );
  assert.deepEqual(await operationalSnapshot(e), beforeState);
});

test("PIB-23 debt-only reversal restores inventory AP supplier and original journal status", async () => {
  const e = await fixture({ shippingCost: 0 });
  const receipt = await receive(e);
  const returnId = await purchaseReturn(e, receipt.purchaseReceiptId);
  await e.t.mutation(api.purchaseReturns.reverse, {
    purchaseReturnId: returnId,
    date: "2026-01-12",
    reason: "عكس اختبار",
    requestId: "reverse-request",
  });
  const row = await e.raw.run((ctx) => ctx.db.get(returnId));
  assert.equal(row?.status, "reversed");
  assert.ok(row?.journalEntryId);
  assert.ok(row.reversalJournalEntryId);
  const original = await e.raw.run((ctx) => ctx.db.get(row.journalEntryId!));
  const reversal = await e.raw.run((ctx) =>
    ctx.db.get(row.reversalJournalEntryId!),
  );
  assert.deepEqual(
    [original?.status, original?.reversalEntryId, reversal?.originalEntryId],
    ["reversed", reversal?._id, original?._id],
  );
  assert.equal(await accountBalance(e, "inventory"), 130);
  assert.equal(await accountBalance(e, "accounts_payable"), -30);
});

test("PIB-24 cash-only reversal reverses both financial and operational journals exactly", async () => {
  const e = await fixture({ shippingCost: 0 });
  const receipt = await receive(e);
  await payReceipt(e, receipt.purchaseReceiptId, 30);
  const returnId = await purchaseReturn(e, receipt.purchaseReceiptId, {
    refund: true,
  });
  await e.t.mutation(api.purchaseReturns.reverse, {
    purchaseReturnId: returnId,
    date: "2026-01-12",
    reason: "عكس نقدي",
    requestId: "reverse-cash",
  });
  const row = await e.raw.run((ctx) => ctx.db.get(returnId));
  assert.ok(row?.reversalFinancialTransactionId);
  assert.ok(row.reversalJournalEntryId);
  assert.equal(await accountBalance(e, "accounts_payable"), 0);
  assert.equal(await accountBalance(e, "inventory"), 130);
  const account = await e.raw.run((ctx) => ctx.db.get(e.cashAccountId));
  assert.equal(account?.currentBalance, 970);
});

test("PIB-25 reversal retry is idempotent and a conflicting request leaves state unchanged", async () => {
  const e = await fixture({ shippingCost: 0 });
  const receipt = await receive(e);
  const returnId = await purchaseReturn(e, receipt.purchaseReceiptId);
  const args = {
    purchaseReturnId: returnId,
    date: "2026-01-12",
    reason: "عكس ثابت",
    requestId: "reverse-fixed",
  };
  const first = await e.t.mutation(api.purchaseReturns.reverse, args);
  const beforeState = await operationalSnapshot(e);
  const retry = await e.t.mutation(api.purchaseReturns.reverse, args);
  assert.equal(retry, first);
  assert.deepEqual(await operationalSnapshot(e), beforeState);
  await assert.rejects(
    e.t.mutation(api.purchaseReturns.reverse, {
      ...args,
      reason: "سبب مختلف",
    }),
    /طلب مختلف/,
  );
  assert.deepEqual(await operationalSnapshot(e), beforeState);
});

test("PIB-26 closed reversal period rolls back stock finance supplier and journal reversal", async () => {
  const e = await fixture({ shippingCost: 0 });
  const receipt = await receive(e);
  const returnId = await purchaseReturn(e, receipt.purchaseReceiptId);
  await e.t.mutation(api.generalLedger.closePeriod, {
    periodKey: "2026-01",
    reason: "إغلاق قبل العكس",
  });
  const beforeState = await operationalSnapshot(e);
  await assert.rejects(
    e.t.mutation(api.purchaseReturns.reverse, {
      purchaseReturnId: returnId,
      date: "2026-01-12",
      reason: "عكس مغلق",
      requestId: "reverse-closed",
    }),
    /الفترة المالية غير مفتوحة/,
  );
  assert.deepEqual(await operationalSnapshot(e), beforeState);
});

test("PIB-27 public purchase return DTOs redact journal and idempotency internals", async () => {
  const e = await fixture({ shippingCost: 0 });
  const receipt = await receive(e);
  await purchaseReturn(e, receipt.purchaseReceiptId);
  const list = await e.t.query(api.purchaseReturns.list, {
    branchId: e.branchId,
    paginationOpts: { numItems: 10, cursor: null },
  });
  assert.equal(list.page.length, 1);
  const keys = Object.keys(list.page[0]).sort();
  assert.deepEqual(keys, [
    "_id",
    "branchId",
    "cashRefund",
    "date",
    "debtReduction",
    "receiptNumber",
    "returnNumber",
    "status",
    "supplierName",
    "totalCredit",
  ]);
  assert.equal("journalEntryId" in list.page[0], false);
  assert.equal("requestFingerprint" in list.page[0], false);
});

test("PIB-28 end-to-end receipt payment mixed return and reversal reconcile every ledger without legacy payments", async () => {
  const e = await fixture({ shippingCost: 0 });
  const receipt = await receive(e);
  await payReceipt(e, receipt.purchaseReceiptId, 20);
  const returnId = await purchaseReturn(e, receipt.purchaseReceiptId, {
    quantity: 2,
    refund: true,
  });
  await e.t.mutation(api.purchaseReturns.reverse, {
    purchaseReturnId: returnId,
    date: "2026-01-12",
    reason: "إعادة الدورة",
    requestId: "reverse-cycle",
  });
  const state = await operationalSnapshot(e);
  const receiptRow = state.receipts[0];
  const product = state.products.find((row) => row._id === e.productId);
  const supplier = state.supplierBalances[0];
  assert.deepEqual(
    {
      receiptPaid: receiptRow.paidAmount,
      receiptRemaining: receiptRow.remainingAmount,
      receiptStatus: receiptRow.status,
      stock: product?.stock,
      inventoryValue: product?.inventoryValue,
      supplierBalance: supplier.balance,
      cash: state.financialAccounts[0].currentBalance,
      glInventory: await accountBalance(e, "inventory"),
      glPayable: await accountBalance(e, "accounts_payable"),
      legacyPayments: state.payments.length,
    },
    {
      receiptPaid: 20,
      receiptRemaining: 10,
      receiptStatus: "partial",
      stock: 13,
      inventoryValue: 130,
      supplierBalance: 10,
      cash: 980,
      glInventory: 130,
      glPayable: -10,
      legacyPayments: 0,
    },
  );
});
