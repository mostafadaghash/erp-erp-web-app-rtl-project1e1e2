import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { symlink, unlink } from "./moduleLinkTestUtils.ts";
import { resolve } from "node:path";
import { convexTest } from "convex-test";
import schema from "../convex/schema.ts";
import { api } from "../convex/_generated/api.js";
import type { Id } from "../convex/_generated/dataModel.js";

const links = [
  ["convex/_generated/server", "server.js"],
  ["convex/lib/auth", "auth.ts"],
  ["convex/lib/finance", "finance.ts"],
  ["convex/lib/inventory", "inventory.ts"],
  ["convex/lib/documentNumbers", "documentNumbers.ts"],
  ["convex/lib/permissions", "permissions.ts"],
  ["convex/lib/references", "references.ts"],
  ["convex/lib/supplierLedger", "supplierLedger.ts"],
  ["shared/businessRules", "businessRules.ts"],
  ["shared/inventoryRules", "inventoryRules.ts"],
  ["shared/purchaseReturnRules", "purchaseReturnRules.ts"],
  ["shared/supplierPaymentRules", "supplierPaymentRules.ts"],
] as const;

before(async () => {
  for (const [path, target] of links)
    if (!existsSync(resolve(path))) await symlink(target, resolve(path));
});
after(async () => {
  for (const [path] of links)
    if (existsSync(resolve(path))) await unlink(resolve(path));
});

const modules = {
  "../convex/_generated/api.js": () => import("../convex/_generated/api.js"),
  "../convex/_generated/server.js": () =>
    import("../convex/_generated/server.js"),
  "../convex/purchaseReturns.ts": () => import("../convex/purchaseReturns.ts"),
  "../convex/supplierPayments.ts": () =>
    import("../convex/supplierPayments.ts"),
};

type ItemSeed = {
  quantity: number;
  lineTotal: number;
  stock: number;
  inventoryValue: number;
  name?: string;
};
type FixtureOptions = {
  items?: ItemSeed[];
  payable?: number;
  paid?: number;
  supplierFreight?: number;
  externalFreight?: number;
  balance?: number;
  role?: string;
  permissions?: string[];
  user?: string;
  branchName?: string;
  cutoverDate?: string;
};

async function fixture(options: FixtureOptions = {}) {
  const raw = convexTest(schema, modules);
  const user = options.user ?? "admin-user";
  const ids = await raw.run(async (ctx) => {
    const branchId = await ctx.db.insert("branches", {
      name: options.branchName ?? "الرئيسي",
      address: "القاهرة",
      isActive: true,
    });
    const supplierId = await ctx.db.insert("suppliers", {
      name: "مورد الاختبار",
      phone: "0100",
      balance: 9999,
      isActive: true,
    });
    await ctx.db.insert("financeSettings", {
      isInitialized: true,
      cutoverDate: options.cutoverDate ?? "2025-01-01",
      defaultClearingDelayDays: 0,
      updatedAt: Date.now(),
    });
    await ctx.db.insert("userProfiles", {
      userId: user,
      tokenIdentifier: user,
      name: "مستخدم القبول",
      role: options.role ?? "admin",
      branchId,
      permissions: options.permissions ?? [],
      isActive: true,
    });
    await ctx.db.insert("supplierBalances", {
      key: `${supplierId}:${branchId}`,
      supplierId,
      branchId,
      balance: options.balance ?? 200,
      updatedAt: Date.now(),
    });
    const seeds = options.items ?? [
      { quantity: 3, lineTotal: 100, stock: 10, inventoryValue: 120 },
    ];
    const productIds: Id<"products">[] = [];
    for (const [index, seed] of seeds.entries()) {
      productIds.push(
        await ctx.db.insert("products", {
          name: seed.name ?? `منتج ${index + 1}`,
          sku: `SKU-${user}-${index}`,
          costPrice: seed.lineTotal / seed.quantity,
          inventoryValue: seed.inventoryValue,
          sellPrice: 50,
          stock: seed.stock,
          minStock: 0,
          unit: "قطعة",
          branchId,
          isActive: true,
        }),
      );
    }
    const supplierFreight = options.supplierFreight ?? 10;
    const externalFreight = options.externalFreight ?? 0;
    const payable =
      options.payable ??
      seeds.reduce((sum, seed) => sum + seed.lineTotal, 0) + supplierFreight;
    const paid = options.paid ?? 0;
    const shipmentId = await ctx.db.insert("shipments", {
      shipmentNumber: `S-${user}`,
      supplierId,
      supplierName: "مورد الاختبار",
      items: [],
      totalCost: payable,
      shippingCost: supplierFreight + externalFreight,
      grandTotal: payable,
      status: "arrived",
      branchId,
    });
    const receiptId = await ctx.db.insert("purchaseReceipts", {
      receiptNumber: `PUR-${user}`,
      shipmentId,
      shipmentNumber: `S-${user}`,
      supplierId,
      supplierName: "مورد الاختبار",
      receiptDate: "2026-01-10",
      items: seeds.map((seed, index) => ({
        productId: productIds[index],
        productName: seed.name ?? `منتج ${index + 1}`,
        quantity: seed.quantity,
        unitCost: seed.lineTotal / seed.quantity,
        lineTotal: seed.lineTotal,
        allocatedFreight: 0,
        landedUnitCost: seed.lineTotal / seed.quantity,
        inventoryValueAdded: seed.lineTotal,
      })),
      goodsTotal: seeds.reduce((sum, seed) => sum + seed.lineTotal, 0),
      totalFreight: supplierFreight + externalFreight,
      supplierFreightAmount: supplierFreight,
      externalFreightAmount: externalFreight,
      totalLandedCost: payable,
      payableAmount: payable,
      paidAmount: paid,
      remainingAmount: payable - paid,
      status: paid === 0 ? "unpaid" : paid === payable ? "paid" : "partial",
      branchId,
      arrivalRequestId: `arrival-${user}`,
      createdBy: user,
      createdAt: Date.now(),
    });
    return { branchId, supplierId, receiptId, productIds };
  });
  return {
    raw,
    client: raw.withIdentity({ subject: user, tokenIdentifier: user }),
    user,
    ...ids,
  };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;
async function account(
  e: Fixture,
  options: {
    branchId?: Id<"branches">;
    active?: boolean;
    type?: "cash" | "bank" | "paymob_clearing";
    balance?: number;
  } = {},
) {
  return e.raw.run(async (ctx) =>
    ctx.db.insert("financialAccounts", {
      uniqueKey: `account-${Math.random()}`,
      code: `A-${Math.random()}`,
      name: "الخزينة",
      type: options.type ?? "cash",
      branchId: options.branchId ?? e.branchId,
      isActive: options.active ?? true,
      currentBalance: options.balance ?? 100,
      allowNegative: false,
      settlementDelayDays: 0,
      createdAt: Date.now(),
      createdBy: e.user,
      updatedAt: Date.now(),
    }),
  );
}

function createArgs(
  e: Fixture,
  requestId: string,
  overrides: Partial<{
    date: string;
    reason: string;
    externalCreditNoteNumber: string;
    freightCreditAmount: number;
    refundAccountId: Id<"financialAccounts">;
    items: { receiptItemIndex: number; quantity: number }[];
    branchId: Id<"branches">;
  }> = {},
) {
  return {
    purchaseReceiptId: e.receiptId,
    branchId: e.branchId,
    date: "2026-02-01",
    reason: "اختبار قبول فعلي",
    freightCreditAmount: 0,
    requestId,
    items: [{ receiptItemIndex: 0, quantity: 1 }],
    ...overrides,
  };
}

async function rows(e: Fixture) {
  return e.raw.run(async (ctx) => ({
    returns: await ctx.db.query("purchaseReturns").collect(),
    receipts: await ctx.db.query("purchaseReceipts").collect(),
    ledgers: await ctx.db.query("supplierLedgerEntries").collect(),
    transactions: await ctx.db.query("financialTransactions").collect(),
    movements: await ctx.db.query("financialMovements").collect(),
    inventory: await ctx.db.query("inventoryMovements").collect(),
    products: await ctx.db.query("products").collect(),
    balances: await ctx.db.query("supplierBalances").collect(),
    payments: await ctx.db.query("payments").collect(),
  }));
}

test("PRT-01 مرتجع جزئي يخفض مديونية غير مدفوعة فقط", async () => {
  const e = await fixture();
  const before = await rows(e);
  const id = await e.client.mutation(
    api.purchaseReturns.create,
    createArgs(e, "prt-01"),
  );
  const after = await rows(e);
  const row = after.returns[0];
  assert.equal(row._id, id);
  assert.equal(row.cashRefund, 0);
  assert.equal(row.debtReduction, row.totalCredit);
  assert.equal(after.receipts[0].netPayableAmount, 76.67);
  assert.equal(after.receipts[0].remainingAmount, 76.67);
  assert.equal(after.receipts[0].paidAmount, 0);
  assert.equal(after.balances[0].balance, 166.67);
  assert.equal(before.balances[0].balance, 200);
  assert.equal(after.transactions.length, 0);
  assert.deepEqual(
    [after.products[0].stock, after.products[0].inventoryValue],
    [9, 108],
  );
  assert.equal(after.inventory.length, 1);
  assert.equal(after.inventory[0].quantityDelta, -1);
});

test("PRT-02 مرتجع مدفوع بالكامل ورد نقدي", async () => {
  const e = await fixture({ payable: 100, paid: 100, supplierFreight: 0 });
  const refundAccountId = await account(e);
  const before = await rows(e);
  await e.client.mutation(
    api.purchaseReturns.create,
    createArgs(e, "prt-02", { refundAccountId }),
  );
  const after = await rows(e);
  const row = after.returns[0];
  assert.deepEqual([row.debtReduction, row.cashRefund], [0, 33.33]);
  assert.deepEqual(
    [after.receipts[0].paidAmount, after.receipts[0].remainingAmount],
    [66.67, 0],
  );
  assert.equal(after.balances[0].balance, before.balances[0].balance);
  assert.equal(after.transactions.length, 1);
  assert.equal(after.movements[0].signedAmount, 33.33);
});

test("PRT-03 مرتجع مختلط", async () => {
  const e = await fixture({
    items: [{ quantity: 1, lineTotal: 70, stock: 5, inventoryValue: 70 }],
    payable: 100,
    paid: 60,
    supplierFreight: 30,
  });
  const refundAccountId = await account(e);
  const before = await rows(e);
  await e.client.mutation(
    api.purchaseReturns.create,
    createArgs(e, "prt-03", { refundAccountId }),
  );
  const after = await rows(e);
  const row = after.returns[0];
  assert.deepEqual([row.debtReduction, row.cashRefund], [40, 30]);
  assert.deepEqual(
    [
      after.receipts[0].netPayableAmount,
      after.receipts[0].paidAmount,
      after.receipts[0].remainingAmount,
    ],
    [30, 30, 0],
  );
  assert.equal(after.balances[0].balance, before.balances[0].balance - 40);
  assert.equal(after.movements[0].signedAmount, 30);
  assert.equal(after.transactions[0].referenceId, String(row._id));
});

test("PRT-04 مرتجع شحن فقط دون مخزون", async () => {
  const e = await fixture({ items: [], payable: 10, supplierFreight: 10 });
  await e.client.mutation(
    api.purchaseReturns.create,
    createArgs(e, "prt-04", { items: [], freightCreditAmount: 4 }),
  );
  const state = await rows(e);
  const row = state.returns[0];
  assert.deepEqual(
    [row.goodsCredit, row.inventoryValueRemoved, row.freightCredit],
    [0, 0, 4],
  );
  assert.equal(state.inventory.length, 0);
  assert.equal(state.receipts[0].returnedFreightTotal, 4);
  assert.equal(state.ledgers[0].amountDelta, -4);
});

test("PRT-05 رفض طلب فارغ", async () => {
  const e = await fixture();
  const before = await rows(e);
  await assert.rejects(
    e.client.mutation(
      api.purchaseReturns.create,
      createArgs(e, "prt-05", { items: [], freightCreditAmount: 0 }),
    ),
    /يجب اختيار بند/,
  );
  assert.deepEqual(await rows(e), before);
});

test("PRT-06 إعادة إنشاء بنفس requestId", async () => {
  const e = await fixture();
  const args = createArgs(e, "prt-06");
  const first = await e.client.mutation(api.purchaseReturns.create, args);
  const once = await rows(e);
  const second = await e.client.mutation(api.purchaseReturns.create, args);
  assert.equal(second, first);
  assert.deepEqual(await rows(e), once);
  assert.deepEqual(
    [
      once.returns.length,
      once.inventory.length,
      once.ledgers.length,
      once.transactions.length,
    ],
    [1, 1, 1, 0],
  );
});

test("PRT-07 رفض بصمة مختلفة", async () => {
  const e = await fixture();
  await e.client.mutation(api.purchaseReturns.create, createArgs(e, "prt-07"));
  const snapshot = await rows(e);
  await assert.rejects(
    e.client.mutation(
      api.purchaseReturns.create,
      createArgs(e, "prt-07", { date: "2026-02-02" }),
    ),
    /بيانات مختلفة/,
  );
  assert.deepEqual(await rows(e), snapshot);
});

test("PRT-08 رفض رقم إشعار مكرر", async () => {
  const e = await fixture({ items: [], payable: 10, supplierFreight: 10 });
  await e.client.mutation(
    api.purchaseReturns.create,
    createArgs(e, "prt-08-a", {
      items: [],
      freightCreditAmount: 1,
      externalCreditNoteNumber: "Note  1",
    }),
  );
  const snapshot = await rows(e);
  await assert.rejects(
    e.client.mutation(
      api.purchaseReturns.create,
      createArgs(e, "prt-08-b", {
        items: [],
        freightCreditAmount: 1,
        externalCreditNoteNumber: "note 1",
      }),
    ),
    /مسجل سابقاً/,
  );
  assert.deepEqual(await rows(e), snapshot);
});

test("PRT-09 تطبيع رقم الإشعار ونطاق المورد والفرع", async () => {
  const e = await fixture({ items: [], payable: 10, supplierFreight: 10 });
  const id = await e.client.mutation(
    api.purchaseReturns.create,
    createArgs(e, "prt-09-a", {
      items: [],
      freightCreditAmount: 1,
      externalCreditNoteNumber: "  AbC   12 ",
    }),
  );
  const row = await e.raw.run((ctx) => ctx.db.get(id));
  assert.equal(row?.externalCreditNoteNumber, "AbC 12");
  assert.equal(row?.externalCreditNoteKey, "abc 12");
  await e.raw.run(async (ctx) => {
    const otherSupplierId = await ctx.db.insert("suppliers", {
      name: "مورد آخر",
      phone: "9",
      balance: 0,
      isActive: true,
    });
    const saved = await ctx.db.get(id);
    if (saved) await ctx.db.patch(id, { supplierId: otherSupplierId });
  });
  const scoped = await e.client.mutation(
    api.purchaseReturns.create,
    createArgs(e, "prt-09-scoped", {
      items: [],
      freightCreditAmount: 1,
      externalCreditNoteNumber: "abc 12",
    }),
  );
  assert.ok(scoped);
  await assert.rejects(
    e.client.mutation(
      api.purchaseReturns.create,
      createArgs(e, "prt-09-long", {
        items: [],
        freightCreditAmount: 1,
        externalCreditNoteNumber: "x".repeat(101),
      }),
    ),
    /100/,
  );
  await assert.rejects(
    e.client.mutation(
      api.purchaseReturns.create,
      createArgs(e, "prt-09-empty", {
        items: [],
        freightCreditAmount: 1,
        externalCreditNoteNumber: "   ",
      }),
    ),
    /فارغاً/,
  );
});

test("PRT-10 ترقيم PRN متسلسل", async () => {
  const e = await fixture({ items: [], payable: 10, supplierFreight: 10 });
  const a = await e.client.mutation(
    api.purchaseReturns.create,
    createArgs(e, "prt-10-a", { items: [], freightCreditAmount: 1 }),
  );
  const b = await e.client.mutation(
    api.purchaseReturns.create,
    createArgs(e, "prt-10-b", { items: [], freightCreditAmount: 1 }),
  );
  const values = await e.raw.run(async (ctx) => [
    (await ctx.db.get(a))?.returnNumber,
    (await ctx.db.get(b))?.returnNumber,
  ]);
  assert.deepEqual(values, ["PRN-2026-00001", "PRN-2026-00002"]);
});

test("PRT-11 فصل PRN بين السنوات", async () => {
  const e = await fixture({ items: [], payable: 10, supplierFreight: 10 });
  const oldId = await e.client.mutation(
    api.purchaseReturns.create,
    createArgs(e, "prt-11-old", {
      date: "2025-02-01",
      items: [],
      freightCreditAmount: 1,
    }),
  );
  const newId = await e.client.mutation(
    api.purchaseReturns.create,
    createArgs(e, "prt-11-new", {
      date: "2026-02-01",
      items: [],
      freightCreditAmount: 1,
    }),
  );
  const values = await e.raw.run(async (ctx) => [
    (await ctx.db.get(oldId))?.returnNumber,
    (await ctx.db.get(newId))?.returnNumber,
  ]);
  assert.deepEqual(values, ["PRN-2025-00001", "PRN-2026-00001"]);
});

test("PRT-12 الائتمان التراكمي", async () => {
  const e = await fixture({ supplierFreight: 0, payable: 100 });
  await e.client.mutation(
    api.purchaseReturns.create,
    createArgs(e, "prt-12-a"),
  );
  await e.client.mutation(
    api.purchaseReturns.create,
    createArgs(e, "prt-12-b"),
  );
  const state = await rows(e);
  assert.deepEqual(
    state.returns.map((row) => row.goodsCredit),
    [33.33, 33.34],
  );
  assert.equal(state.receipts[0].returnedGoodsTotal, 66.67);
});

test("PRT-13 فرق التقريب التاريخي", async () => {
  const e = await fixture({ supplierFreight: 0, payable: 100 });
  for (const requestId of ["prt-13-a", "prt-13-b", "prt-13-c"])
    await e.client.mutation(
      api.purchaseReturns.create,
      createArgs(e, requestId),
    );
  const state = await rows(e);
  assert.deepEqual(
    state.returns.map((row) => row.goodsCredit),
    [33.33, 33.34, 33.33],
  );
  assert.equal(
    state.returns.reduce((sum, row) => sum + row.goodsCredit, 0),
    100,
  );
  assert.equal(state.receipts[0].returnedGoodsTotal, 100);
});

test("PRT-14 رفض تجاوز الكمية", async () => {
  const e = await fixture({ supplierFreight: 0, payable: 100 });
  await e.client.mutation(
    api.purchaseReturns.create,
    createArgs(e, "prt-14-a", {
      items: [{ receiptItemIndex: 0, quantity: 2 }],
    }),
  );
  const snapshot = await rows(e);
  await assert.rejects(
    e.client.mutation(
      api.purchaseReturns.create,
      createArgs(e, "prt-14-b", {
        items: [{ receiptItemIndex: 0, quantity: 2 }],
      }),
    ),
    /تتجاوز المتاح/,
  );
  assert.deepEqual(await rows(e), snapshot);
});

test("PRT-15 رفض كمية غير صحيحة", async () => {
  for (const [label, quantity] of [
    ["zero", 0],
    ["negative", -1],
    ["fraction", 1.5],
    ["nan", Number.NaN],
  ] as const) {
    const e = await fixture();
    const before = await rows(e);
    await assert.rejects(
      e.client.mutation(
        api.purchaseReturns.create,
        createArgs(e, `prt-15-${label}`, {
          items: [{ receiptItemIndex: 0, quantity }],
        }),
      ),
      /كمية المرتجع|finite|number/i,
    );
    assert.deepEqual(await rows(e), before);
  }
});

test("PRT-16 ترتيب receiptItemIndex", async () => {
  const e = await fixture({
    items: [
      { quantity: 2, lineTotal: 20, stock: 5, inventoryValue: 50 },
      { quantity: 2, lineTotal: 40, stock: 5, inventoryValue: 100 },
    ],
    payable: 60,
    supplierFreight: 0,
  });
  const id = await e.client.mutation(
    api.purchaseReturns.create,
    createArgs(e, "prt-16", {
      items: [
        { receiptItemIndex: 1, quantity: 1 },
        { receiptItemIndex: 0, quantity: 1 },
      ],
    }),
  );
  const state = await rows(e);
  const row = await e.raw.run((ctx) => ctx.db.get(id));
  assert.deepEqual(
    row?.items.map((item) => item.receiptItemIndex),
    [0, 1],
  );
  assert.deepEqual(
    state.inventory.map((movement) => movement.productId),
    e.productIds,
  );
});

test("PRT-17 رفض تكرار البند", async () => {
  const e = await fixture();
  const before = await rows(e);
  await assert.rejects(
    e.client.mutation(
      api.purchaseReturns.create,
      createArgs(e, "prt-17", {
        items: [
          { receiptItemIndex: 0, quantity: 1 },
          { receiptItemIndex: 0, quantity: 1 },
        ],
      }),
    ),
    /تكرار/,
  );
  assert.deepEqual(await rows(e), before);
});

test("PRT-18 رفض تجاوز الشحن", async () => {
  const e = await fixture({ items: [], payable: 5, supplierFreight: 5 });
  const before = await rows(e);
  await assert.rejects(
    e.client.mutation(
      api.purchaseReturns.create,
      createArgs(e, "prt-18", { items: [], freightCreditAmount: 5.01 }),
    ),
    /يتجاوز الرصيد/,
  );
  assert.deepEqual(await rows(e), before);
});

test("PRT-19 استبعاد الشحن الخارجي", async () => {
  const e = await fixture({
    items: [],
    payable: 4,
    supplierFreight: 4,
    externalFreight: 20,
  });
  await e.client.mutation(
    api.purchaseReturns.create,
    createArgs(e, "prt-19-a", { items: [], freightCreditAmount: 4 }),
  );
  const snapshot = await rows(e);
  assert.equal(snapshot.returns[0].totalCredit, 4);
  await assert.rejects(
    e.client.mutation(
      api.purchaseReturns.create,
      createArgs(e, "prt-19-b", { items: [], freightCreditAmount: 1 }),
    ),
    /يتجاوز الرصيد/,
  );
  assert.deepEqual(await rows(e), snapshot);
});

test("PRT-20 المتوسط المتحرك", async () => {
  const e = await fixture({
    items: [{ quantity: 4, lineTotal: 48, stock: 10, inventoryValue: 120 }],
    payable: 48,
    supplierFreight: 0,
  });
  const id = await e.client.mutation(
    api.purchaseReturns.create,
    createArgs(e, "prt-20", { items: [{ receiptItemIndex: 0, quantity: 2 }] }),
  );
  const state = await rows(e);
  const row = await e.raw.run((ctx) => ctx.db.get(id));
  assert.equal(row?.inventoryValueRemoved, 24);
  assert.deepEqual(
    [state.products[0].stock, state.products[0].inventoryValue],
    [8, 96],
  );
  assert.deepEqual(
    [
      state.inventory[0].stockBefore,
      state.inventory[0].stockAfter,
      state.inventory[0].inventoryValueBefore,
      state.inventory[0].inventoryValueAfter,
    ],
    [10, 8, 120, 96],
  );
});

test("PRT-21 تصفير قيمة المخزون", async () => {
  const e = await fixture({
    items: [{ quantity: 3, lineTotal: 36, stock: 3, inventoryValue: 35.99 }],
    payable: 36,
    supplierFreight: 0,
  });
  await e.client.mutation(
    api.purchaseReturns.create,
    createArgs(e, "prt-21", { items: [{ receiptItemIndex: 0, quantity: 3 }] }),
  );
  const state = await rows(e);
  assert.deepEqual(
    [state.products[0].stock, state.products[0].inventoryValue],
    [0, 0],
  );
  assert.equal(state.returns[0].inventoryValueRemoved, 35.99);
});

test("PRT-22 رفض نقص المخزون", async () => {
  const e = await fixture({
    items: [{ quantity: 3, lineTotal: 30, stock: 1, inventoryValue: 10 }],
    payable: 30,
    paid: 30,
    supplierFreight: 0,
  });
  const refundAccountId = await account(e);
  const before = await rows(e);
  await assert.rejects(
    e.client.mutation(
      api.purchaseReturns.create,
      createArgs(e, "prt-22", {
        items: [{ receiptItemIndex: 0, quantity: 2 }],
        refundAccountId,
      }),
    ),
    /لا يكفي/,
  );
  assert.deepEqual(await rows(e), before);
});

test("PRT-23 Rollback متعدد البنود", async () => {
  const e = await fixture({
    items: [
      { quantity: 2, lineTotal: 20, stock: 5, inventoryValue: 50 },
      { quantity: 2, lineTotal: 20, stock: 0, inventoryValue: 0 },
    ],
    payable: 40,
    supplierFreight: 0,
  });
  const before = await rows(e);
  await assert.rejects(
    e.client.mutation(
      api.purchaseReturns.create,
      createArgs(e, "prt-23", {
        items: [
          { receiptItemIndex: 0, quantity: 1 },
          { receiptItemIndex: 1, quantity: 1 },
        ],
      }),
    ),
    /لا يكفي/,
  );
  assert.deepEqual(await rows(e), before);
});

test("PRT-24 تحديث الكميات المرتجعة", async () => {
  const e = await fixture();
  await e.client.mutation(
    api.purchaseReturns.create,
    createArgs(e, "prt-24-a"),
  );
  let eligible = await e.client.query(api.purchaseReturns.eligibleReceipts, {
    supplierId: e.supplierId,
    branchId: e.branchId,
  });
  assert.deepEqual(
    [
      eligible[0].items[0].originalQuantity,
      eligible[0].items[0].returnedQuantity,
      eligible[0].items[0].availableQuantity,
    ],
    [3, 1, 2],
  );
  await e.client.mutation(
    api.purchaseReturns.create,
    createArgs(e, "prt-24-b"),
  );
  eligible = await e.client.query(api.purchaseReturns.eligibleReceipts, {
    supplierId: e.supplierId,
    branchId: e.branchId,
  });
  assert.deepEqual(
    [
      eligible[0].items[0].returnedQuantity,
      eligible[0].items[0].availableQuantity,
    ],
    [2, 1],
  );
});

test("PRT-25 netPayable دون payable", async () => {
  const e = await fixture();
  await e.client.mutation(
    api.purchaseReturns.create,
    createArgs(e, "prt-25", { freightCreditAmount: 2 }),
  );
  const receipt = (await rows(e)).receipts[0];
  assert.equal(receipt.payableAmount, 110);
  assert.deepEqual(
    [
      receipt.netPayableAmount,
      receipt.creditedTotal,
      receipt.returnedGoodsTotal,
      receipt.returnedFreightTotal,
    ],
    [74.67, 35.33, 33.33, 2],
  );
});

test("PRT-26 اشتقاق حالة المستند", async () => {
  const cases = [
    { paid: 0, expected: "unpaid" },
    { paid: 50, expected: "partial" },
    { paid: 100, expected: "paid" },
  ] as const;
  for (const [index, item] of cases.entries()) {
    const e = await fixture({
      items: [],
      payable: 100,
      paid: item.paid,
      supplierFreight: 100,
      user: `status-${index}`,
    });
    const refundAccountId = item.paid ? await account(e) : undefined;
    await e.client.mutation(
      api.purchaseReturns.create,
      createArgs(e, `prt-26-${index}`, {
        items: [],
        freightCreditAmount: 10,
        refundAccountId,
      }),
    );
    const receipt = (await rows(e)).receipts[0];
    assert.equal(receipt.status, item.expected);
    assert.equal(
      receipt.paidAmount + receipt.remainingAmount,
      receipt.netPayableAmount,
    );
  }
});

test("PRT-27 خفض رصيد المورد", async () => {
  const e = await fixture({ paid: 60, payable: 110 });
  const before = await rows(e);
  await e.client.mutation(api.purchaseReturns.create, createArgs(e, "prt-27"));
  const after = await rows(e);
  const row = after.returns[0];
  assert.equal(after.balances[0].balance, 166.67);
  assert.equal(before.balances[0].balance, 200);
  assert.equal(row.debtReduction, 33.33);
  assert.deepEqual(
    after.ledgers.map((entry) => entry.amountDelta),
    [-row.totalCredit],
  );
  assert.equal(after.ledgers[0].balanceAfter, after.balances[0].balance);
});

test("PRT-28 زيادة حساب الرد", async () => {
  const e = await fixture({ payable: 100, paid: 100, supplierFreight: 0 });
  const refundAccountId = await account(e, { balance: 25 });
  await e.client.mutation(
    api.purchaseReturns.create,
    createArgs(e, "prt-28", { refundAccountId }),
  );
  const state = await rows(e);
  const movement = state.movements[0];
  assert.deepEqual(
    [movement.balanceBefore, movement.balanceAfter, movement.signedAmount],
    [25, 58.33, 33.33],
  );
  assert.equal(movement.transactionId, state.transactions[0]._id);
  assert.equal(state.transactions[0].referenceId, String(state.returns[0]._id));
});

test("PRT-29 رفض حساب معطل", async () => {
  const e = await fixture({ payable: 100, paid: 100, supplierFreight: 0 });
  const refundAccountId = await account(e, { active: false });
  const before = await rows(e);
  await assert.rejects(
    e.client.mutation(
      api.purchaseReturns.create,
      createArgs(e, "prt-29", { refundAccountId }),
    ),
    /معطل/,
  );
  assert.deepEqual(await rows(e), before);
});

test("PRT-30 رفض حساب فرع آخر", async () => {
  const e = await fixture({ payable: 100, paid: 100, supplierFreight: 0 });
  const otherBranchId = await e.raw.run((ctx) =>
    ctx.db.insert("branches", {
      name: "فرع آخر",
      address: "الجيزة",
      isActive: true,
    }),
  );
  const refundAccountId = await account(e, { branchId: otherBranchId });
  const before = await rows(e);
  await assert.rejects(
    e.client.mutation(
      api.purchaseReturns.create,
      createArgs(e, "prt-30", { refundAccountId }),
    ),
    /لا ينتمي/,
  );
  assert.deepEqual(await rows(e), before);
});

test("PRT-31 رفض clearing", async () => {
  const e = await fixture({ payable: 100, paid: 100, supplierFreight: 0 });
  const refundAccountId = await account(e, { type: "paymob_clearing" });
  const before = await rows(e);
  await assert.rejects(
    e.client.mutation(
      api.purchaseReturns.create,
      createArgs(e, "prt-31", { refundAccountId }),
    ),
    /حساب وسيط/,
  );
  assert.deepEqual(await rows(e), before);
});

test("PRT-32 رفض التاريخ واحترام تاريخ القطع", async () => {
  const invalid = await fixture();
  await assert.rejects(
    invalid.client.mutation(
      api.purchaseReturns.create,
      createArgs(invalid, "prt-32-invalid", { date: "2026-99-99" }),
    ),
    /غير صالح/,
  );
  const cutover = await fixture({ cutoverDate: "2026-02-01", user: "cutover" });
  await assert.rejects(
    cutover.client.mutation(
      api.purchaseReturns.create,
      createArgs(cutover, "prt-32-before", { date: "2026-01-31" }),
    ),
    /يسبق تاريخ القطع/,
  );
  const id = await cutover.client.mutation(
    api.purchaseReturns.create,
    createArgs(cutover, "prt-32-valid", { date: "2026-02-01" }),
  );
  assert.equal(
    (await cutover.raw.run((ctx) => ctx.db.get(id)))?.status,
    "posted",
  );
});

test("PRT-33 صلاحية الإنشاء للأدوار المعتمدة", async () => {
  for (const role of ["admin", "manager", "accountant"]) {
    const e = await fixture({ role, user: `allowed-${role}` });
    const id = await e.client.mutation(
      api.purchaseReturns.create,
      createArgs(e, `prt-33-${role}`),
    );
    assert.equal(
      (await e.raw.run((ctx) => ctx.db.get(id)))?.createdBy,
      `allowed-${role}`,
    );
  }
});

test("PRT-34 رفض غير المصرح", async () => {
  const e = await fixture({
    role: "viewer",
    permissions: ["view_products"],
    user: "viewer-user",
  });
  const before = await rows(e);
  await assert.rejects(
    e.client.mutation(api.purchaseReturns.create, createArgs(e, "prt-34")),
    /create_purchase_returns/,
  );
  assert.deepEqual(await rows(e), before);
});

test("PRT-35 عزل manager", async () => {
  const e = await fixture({
    role: "manager",
    user: "branch-manager",
    items: [],
    payable: 10,
    supplierFreight: 10,
  });
  const own = await e.client.mutation(
    api.purchaseReturns.create,
    createArgs(e, "prt-35-own", { items: [], freightCreditAmount: 1 }),
  );
  const foreign = await e.raw.run(async (ctx) => {
    const branchId = await ctx.db.insert("branches", {
      name: "المعزول",
      address: "x",
      isActive: true,
    });
    const supplierId = await ctx.db.insert("suppliers", {
      name: "مورد معزول",
      phone: "2",
      balance: 0,
      isActive: true,
    });
    const shipmentId = await ctx.db.insert("shipments", {
      shipmentNumber: "S-F",
      supplierId,
      supplierName: "مورد معزول",
      items: [],
      totalCost: 10,
      shippingCost: 10,
      grandTotal: 10,
      status: "arrived",
      branchId,
    });
    const receiptId = await ctx.db.insert("purchaseReceipts", {
      receiptNumber: "PUR-F",
      shipmentId,
      shipmentNumber: "S-F",
      supplierId,
      supplierName: "مورد معزول",
      receiptDate: "2026-01-01",
      items: [],
      goodsTotal: 0,
      totalFreight: 10,
      supplierFreightAmount: 10,
      externalFreightAmount: 0,
      totalLandedCost: 10,
      payableAmount: 10,
      paidAmount: 0,
      remainingAmount: 10,
      status: "unpaid",
      branchId,
      arrivalRequestId: "foreign",
      createdBy: "foreign",
      createdAt: Date.now(),
    });
    return { branchId, supplierId, receiptId };
  });
  await assert.rejects(
    e.client.mutation(api.purchaseReturns.create, {
      ...createArgs(e, "prt-35-foreign", { items: [], freightCreditAmount: 1 }),
      branchId: foreign.branchId,
      purchaseReceiptId: foreign.receiptId,
    }),
    /فرع آخر/,
  );
  const page = await e.client.query(api.purchaseReturns.list, {
    branchId: foreign.branchId,
    paginationOpts: { numItems: 10, cursor: null },
  });
  assert.deepEqual(
    page.page.map((row) => row._id),
    [own],
  );
});

test("PRT-36 سياسة admin تمنع خلط الفروع والموردين", async () => {
  const e = await fixture({ payable: 100, paid: 100, supplierFreight: 0 });
  const secondBranch = await e.raw.run((ctx) =>
    ctx.db.insert("branches", { name: "الثاني", address: "x", isActive: true }),
  );
  const foreignAccount = await account(e, { branchId: secondBranch });
  const before = await rows(e);
  await assert.rejects(
    e.client.mutation(
      api.purchaseReturns.create,
      createArgs(e, "prt-36-mix", { refundAccountId: foreignAccount }),
    ),
    /لا ينتمي/,
  );
  assert.deepEqual(await rows(e), before);
  const ownAccount = await account(e);
  const id = await e.client.mutation(
    api.purchaseReturns.create,
    createArgs(e, "prt-36-valid", { refundAccountId: ownAccount }),
  );
  assert.equal(
    (await e.raw.run((ctx) => ctx.db.get(id)))?.branchId,
    e.branchId,
  );
});

test("PRT-37 pagination معزولة بلا تكرار", async () => {
  const e = await fixture({ items: [], payable: 10, supplierFreight: 10 });
  const foreign = await e.raw.run(async (ctx) => {
    const branchId = await ctx.db.insert("branches", {
      name: "فرع PRT-37 الثاني",
      address: "الإسكندرية",
      isActive: true,
    });
    const supplierId = await ctx.db.insert("suppliers", {
      name: "مورد PRT-37 الثاني",
      phone: "0200",
      balance: 777,
      isActive: true,
    });
    await ctx.db.insert("supplierBalances", {
      key: `${supplierId}:${branchId}`,
      supplierId,
      branchId,
      balance: 20,
      updatedAt: Date.now(),
    });
    const shipmentId = await ctx.db.insert("shipments", {
      shipmentNumber: "S-PRT-37-FOREIGN",
      supplierId,
      supplierName: "مورد PRT-37 الثاني",
      items: [],
      totalCost: 10,
      shippingCost: 10,
      grandTotal: 10,
      status: "arrived",
      branchId,
    });
    const receiptId = await ctx.db.insert("purchaseReceipts", {
      receiptNumber: "PUR-PRT-37-FOREIGN",
      shipmentId,
      shipmentNumber: "S-PRT-37-FOREIGN",
      supplierId,
      supplierName: "مورد PRT-37 الثاني",
      receiptDate: "2026-01-11",
      items: [],
      goodsTotal: 0,
      totalFreight: 10,
      supplierFreightAmount: 10,
      externalFreightAmount: 0,
      totalLandedCost: 10,
      payableAmount: 10,
      paidAmount: 0,
      remainingAmount: 10,
      status: "unpaid",
      branchId,
      arrivalRequestId: "arrival-prt-37-foreign",
      createdBy: e.user,
      createdAt: Date.now(),
    });
    return { branchId, supplierId, receiptId };
  });
  const ownIds: Id<"purchaseReturns">[] = [];
  for (const key of ["a", "b", "c"])
    ownIds.push(
      await e.client.mutation(
        api.purchaseReturns.create,
        createArgs(e, `prt-37-${key}`, {
          items: [],
          freightCreditAmount: 1,
        }),
      ),
    );
  const foreignId = await e.client.mutation(api.purchaseReturns.create, {
    purchaseReceiptId: foreign.receiptId,
    branchId: foreign.branchId,
    date: "2026-02-01",
    reason: "اختبار عزل الفرع الثاني",
    freightCreditAmount: 1,
    requestId: "prt-37-foreign",
    items: [],
  });
  const seen: string[] = [];
  const cursors: string[] = [];
  let cursor: string | null = null;
  let done = false;
  while (!done) {
    const page = await e.client.query(api.purchaseReturns.list, {
      branchId: e.branchId,
      paginationOpts: { numItems: 1, cursor },
    });
    assert.ok(page.page.length <= 1);
    seen.push(...page.page.map((row) => String(row._id)));
    if (!page.isDone) {
      assert.notEqual(page.continueCursor, cursor);
      cursors.push(page.continueCursor);
    }
    cursor = page.continueCursor;
    done = page.isDone;
  }
  assert.deepEqual(new Set(seen), new Set(ownIds.map(String)));
  assert.equal(new Set(seen).size, 3);
  assert.equal(seen.length, 3);
  assert.equal(seen.includes(String(foreignId)), false);
  assert.equal(new Set(cursors).size, cursors.length);
  assert.ok(cursors.length >= 2);
  const foreignRows = [];
  cursor = null;
  done = false;
  while (!done) {
    const page = await e.client.query(api.purchaseReturns.list, {
      branchId: foreign.branchId,
      paginationOpts: { numItems: 1, cursor },
    });
    foreignRows.push(...page.page);
    cursor = page.continueCursor;
    done = page.isDone;
  }
  assert.deepEqual(foreignRows.map((row) => row._id), [foreignId]);
  assert.equal(foreignRows[0].branchId, foreign.branchId);
  assert.equal(foreignRows[0].supplierName, "مورد PRT-37 الثاني");
  assert.equal(foreignRows[0].receiptNumber, "PUR-PRT-37-FOREIGN");
});

test("PRT-38 DTO redaction وقت التشغيل", async () => {
  const e = await fixture({ payable: 100, paid: 100, supplierFreight: 0 });
  const refundAccountId = await account(e);
  const id = await e.client.mutation(
    api.purchaseReturns.create,
    createArgs(e, "prt-38", { refundAccountId }),
  );
  const source = await e.raw.run((ctx) => ctx.db.get(id));
  assert.ok(source);
  assert.equal(source.idempotencyKey, `purchase_return:${e.user}:prt-38`);
  assert.equal(source.requestId, "prt-38");
  assert.ok(source.requestFingerprint);
  assert.ok(source.supplierLedgerEntryId);
  assert.ok(source.supplierRefundLedgerEntryId);
  assert.ok(source.financialTransactionId);
  const page = await e.client.query(api.purchaseReturns.list, {
    branchId: e.branchId,
    paginationOpts: { numItems: 10, cursor: null },
  });
  const dto = page.page[0];
  assert.deepEqual(Object.keys(dto).sort(), [
    "_id", "branchId", "cashRefund", "date", "debtReduction",
    "receiptNumber", "returnNumber", "status", "supplierName", "totalCredit",
  ]);
  assert.equal(dto._id, id);
  assert.equal(Object.values(dto).includes(e.user), false);

  const suppliers = await e.client.query(api.purchaseReturns.supplierOptions, {});
  const supplierDto = suppliers.find((row) => row._id === e.supplierId);
  assert.ok(supplierDto);
  assert.deepEqual(Object.keys(supplierDto).sort(), ["_id", "name"]);

  const receipts = await e.client.query(api.purchaseReturns.eligibleReceipts, {
    supplierId: e.supplierId,
    branchId: e.branchId,
  });
  assert.equal(receipts.length, 1);
  const receiptDto = receipts[0];
  assert.deepEqual(Object.keys(receiptDto).sort(), [
    "_id", "availableFreight", "items", "paidAmount", "payableAmount",
    "receiptDate", "receiptNumber", "remainingAmount",
    "returnedFreightTotal", "supplierFreightAmount",
  ]);
  assert.deepEqual(Object.keys(receiptDto.items[0]).sort(), [
    "availableQuantity", "historicalLineTotal", "historicalUnitCost",
    "originalQuantity", "productName", "receiptItemIndex", "returnedQuantity",
  ]);
  assert.equal(Object.values(receiptDto).includes(e.user), false);

  const accounts = await e.client.query(
    api.purchaseReturns.supplierRefundAccountPicker,
    { branchId: e.branchId },
  );
  const accountDto = accounts.find((row) => row._id === refundAccountId);
  assert.ok(accountDto);
  assert.deepEqual(Object.keys(accountDto).sort(), ["_id", "branchId", "name", "type"]);
});

test("PRT-39 Print DTO والصلاحية واسم المستخدم", async () => {
  const e = await fixture();
  const id = await e.client.mutation(
    api.purchaseReturns.create,
    createArgs(e, "prt-39"),
  );
  const byUser = await e.client.query(api.purchaseReturns.getForPrint, {
    purchaseReturnId: id,
  });
  assert.equal(byUser.createdBy, "مستخدم القبول");
  await e.raw.run(async (ctx) => {
    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", e.user))
      .unique();
    if (profile)
      await ctx.db.patch(profile._id, {
        userId: "legacy-name",
        tokenIdentifier: e.user,
      });
  });
  const byToken = await e.client.query(api.purchaseReturns.getForPrint, {
    purchaseReturnId: id,
  });
  assert.equal(byToken.createdBy, "مستخدم القبول");
  await e.raw.run(async (ctx) => {
    await ctx.db.patch(id, { createdBy: "missing-profile-identifier" });
    const byMissingUser = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", "missing-profile-identifier"))
      .first();
    const byMissingToken = await ctx.db
      .query("userProfiles")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", "missing-profile-identifier"))
      .first();
    assert.equal(byMissingUser, null);
    assert.equal(byMissingToken, null);
  });
  const unknown = await e.client.query(api.purchaseReturns.getForPrint, {
    purchaseReturnId: id,
  });
  assert.equal(unknown.createdBy, "مستخدم غير معروف");
  assert.equal(JSON.stringify(unknown).includes("missing-profile-identifier"), false);
  assert.deepEqual(Object.keys(unknown).sort(), [
    "branchName", "cashRefund", "createdBy", "date", "debtReduction",
    "freightCredit", "goodsCredit", "items", "receiptNumber", "returnNumber",
    "status", "supplierName", "totalCredit",
  ]);
  assert.deepEqual(Object.keys(unknown.items[0]).sort(), [
    "goodsCreditAmount", "historicalUnitCost", "productName", "quantityReturned",
  ]);
  const source = await e.raw.run((ctx) => ctx.db.get(id));
  assert.ok(source);
  const {
    _id: sourceId,
    _creationTime: sourceCreationTime,
    ...sourceData
  } = source;
  assert.ok(sourceId);
  assert.ok(sourceCreationTime);
  const denied = await fixture({
    role: "manager",
    permissions: ["view_purchase_returns"],
    user: "no-print",
  });
  const deniedId = await denied.raw.run(async (ctx) => {
    const receipt = await ctx.db.get(denied.receiptId);
    assert.ok(receipt);
    return ctx.db.insert("purchaseReturns", {
      ...sourceData,
      branchId: denied.branchId,
      purchaseReceiptId: denied.receiptId,
      shipmentId: receipt.shipmentId,
      supplierId: denied.supplierId,
      idempotencyKey: "denied-print",
      requestId: "denied",
      requestFingerprint: "denied",
    });
  });
  await assert.rejects(
    denied.client.query(api.purchaseReturns.getForPrint, {
      purchaseReturnId: deniedId,
    }),
    /print_purchase_returns/,
  );
});

test("PRT-40 إلغاء خفض الدين", async () => {
  const e = await fixture();
  const before = await rows(e);
  const id = await e.client.mutation(
    api.purchaseReturns.create,
    createArgs(e, "prt-40"),
  );
  await e.client.mutation(api.purchaseReturns.reverse, {
    purchaseReturnId: id,
    date: "2026-02-02",
    reason: "تصحيح الدين",
    requestId: "prt-40-reverse",
  });
  const after = await rows(e);
  assert.equal(after.returns[0].status, "reversed");
  assert.deepEqual(
    [
      after.receipts[0].netPayableAmount,
      after.balances[0].balance,
      after.products[0].stock,
      after.products[0].inventoryValue,
    ],
    [110, before.balances[0].balance, 10, 120],
  );
  assert.deepEqual(
    after.ledgers.map((row) => row.amountDelta),
    [-33.33, 33.33],
  );
  assert.deepEqual(
    after.inventory.map((row) => row.quantityDelta),
    [-1, 1],
  );
});

test("PRT-41 إلغاء الرد النقدي", async () => {
  const e = await fixture({ payable: 100, paid: 100, supplierFreight: 0 });
  const refundAccountId = await account(e);
  const id = await e.client.mutation(
    api.purchaseReturns.create,
    createArgs(e, "prt-41", { refundAccountId }),
  );
  await e.client.mutation(api.purchaseReturns.reverse, {
    purchaseReturnId: id,
    date: "2026-02-02",
    reason: "تصحيح النقد",
    requestId: "prt-41-reverse",
  });
  const state = await rows(e);
  assert.deepEqual(
    state.movements.map((row) => row.signedAmount),
    [33.33, -33.33],
  );
  assert.equal(state.transactions[0].status, "reversed");
  assert.equal(
    state.transactions[0].reversalTransactionId,
    state.transactions[1]._id,
  );
  assert.equal(
    state.transactions[1].originalTransactionId,
    state.transactions[0]._id,
  );
});

test("PRT-42 إلغاء مختلط", async () => {
  const e = await fixture({
    items: [{ quantity: 1, lineTotal: 70, stock: 5, inventoryValue: 70 }],
    payable: 100,
    paid: 60,
    supplierFreight: 30,
  });
  const refundAccountId = await account(e);
  const before = await rows(e);
  const id = await e.client.mutation(
    api.purchaseReturns.create,
    createArgs(e, "prt-42", { refundAccountId }),
  );
  await e.client.mutation(api.purchaseReturns.reverse, {
    purchaseReturnId: id,
    date: "2026-02-02",
    reason: "تصحيح المختلط",
    requestId: "prt-42-reverse",
  });
  const state = await rows(e);
  assert.deepEqual(
    [
      state.receipts[0].netPayableAmount,
      state.receipts[0].paidAmount,
      state.receipts[0].remainingAmount,
    ],
    [100, 60, 40],
  );
  assert.equal(state.balances[0].balance, before.balances[0].balance);
  assert.deepEqual(
    [state.products[0].stock, state.products[0].inventoryValue],
    [5, 70],
  );
  assert.equal(state.transactions.length, 2);
});

test("PRT-43 Retry الإلغاء", async () => {
  const e = await fixture();
  const id = await e.client.mutation(
    api.purchaseReturns.create,
    createArgs(e, "prt-43"),
  );
  const args = {
    purchaseReturnId: id,
    date: "2026-02-02",
    reason: "إعادة آمنة",
    requestId: "prt-43-reverse",
  };
  const first = await e.client.mutation(api.purchaseReturns.reverse, args);
  const once = await rows(e);
  const second = await e.client.mutation(api.purchaseReturns.reverse, args);
  assert.equal(second, first);
  assert.deepEqual(await rows(e), once);
});

test("PRT-44 رفض إلغاء مختلف", async () => {
  const e = await fixture();
  const id = await e.client.mutation(
    api.purchaseReturns.create,
    createArgs(e, "prt-44"),
  );
  await e.client.mutation(api.purchaseReturns.reverse, {
    purchaseReturnId: id,
    date: "2026-02-02",
    reason: "الأول",
    requestId: "prt-44-reverse",
  });
  const snapshot = await rows(e);
  await assert.rejects(
    e.client.mutation(api.purchaseReturns.reverse, {
      purchaseReturnId: id,
      date: "2026-02-03",
      reason: "مختلف",
      requestId: "prt-44-other",
    }),
    /طلب مختلف/,
  );
  assert.deepEqual(await rows(e), snapshot);
});

test("PRT-45 Rollback نقص الخزينة", async () => {
  const e = await fixture({ payable: 100, paid: 100, supplierFreight: 0 });
  const refundAccountId = await account(e, { balance: 0 });
  const id = await e.client.mutation(
    api.purchaseReturns.create,
    createArgs(e, "prt-45", { refundAccountId }),
  );
  await e.raw.run(async (ctx) => {
    const accountRow = await ctx.db.get(refundAccountId);
    if (accountRow) await ctx.db.patch(refundAccountId, { currentBalance: 0 });
  });
  const before = await rows(e);
  await assert.rejects(
    e.client.mutation(api.purchaseReturns.reverse, {
      purchaseReturnId: id,
      date: "2026-02-02",
      reason: "رصيد ناقص",
      requestId: "prt-45-reverse",
    }),
    /الرصيد|سالب/,
  );
  assert.deepEqual(await rows(e), before);
  assert.equal(before.returns[0].status, "posted");
});

test("PRT-46 استعادة جميع الأرصدة التشغيلية", async () => {
  const e = await fixture({
    items: [{ quantity: 1, lineTotal: 70, stock: 5, inventoryValue: 70 }],
    payable: 100,
    paid: 60,
    supplierFreight: 30,
  });
  const refundAccountId = await account(e);
  const before = await rows(e);
  const accountBefore = await e.raw.run((ctx) => ctx.db.get(refundAccountId));
  const id = await e.client.mutation(
    api.purchaseReturns.create,
    createArgs(e, "prt-46", { refundAccountId }),
  );
  await e.client.mutation(api.purchaseReturns.reverse, {
    purchaseReturnId: id,
    date: "2026-02-02",
    reason: "استعادة دقيقة",
    requestId: "prt-46-reverse",
  });
  const after = await rows(e);
  const accountAfter = await e.raw.run((ctx) => ctx.db.get(refundAccountId));
  assert.deepEqual(
    [
      after.products[0].stock,
      after.products[0].inventoryValue,
      after.receipts[0].netPayableAmount,
      after.receipts[0].paidAmount,
      after.receipts[0].remainingAmount,
      after.balances[0].balance,
      accountAfter?.currentBalance,
    ],
    [
      before.products[0].stock,
      before.products[0].inventoryValue,
      100,
      60,
      40,
      before.balances[0].balance,
      accountBefore?.currentBalance,
    ],
  );
  assert.equal(after.returns[0].status, "reversed");
});

test("PRT-47 توافق إلغاء دفعة المورد", async () => {
  const e = await fixture({
    payable: 100,
    paid: 0,
    supplierFreight: 0,
    balance: 200,
  });
  const accountId = await account(e, { balance: 200 });
  const paymentId = await e.client.mutation(api.supplierPayments.create, {
    supplierId: e.supplierId,
    branchId: e.branchId,
    accountId,
    date: "2026-02-01",
    requestId: "prt-47-payment",
    allocations: [{ purchaseReceiptId: e.receiptId, amount: 60 }],
  });
  const returnId = await e.client.mutation(
    api.purchaseReturns.create,
    createArgs(e, "prt-47-return", {
      items: [{ receiptItemIndex: 0, quantity: 2 }],
      refundAccountId: accountId,
    }),
  );
  const inconsistent = await rows(e);
  await assert.rejects(
    e.client.mutation(api.supplierPayments.reverse, {
      paymentId,
      date: "2026-02-03",
      reason: "إلغاء الدفعة",
      requestId: "prt-47-payment-reverse",
    }),
    /لا يمكن إلغاء دفعة المورد قبل إلغاء إشعار خصم الشراء/,
  );
  assert.deepEqual(await rows(e), inconsistent);
  await e.client.mutation(api.purchaseReturns.reverse, {
    purchaseReturnId: returnId,
    date: "2026-02-03",
    reason: "إلغاء الإشعار أولاً",
    requestId: "prt-47-return-reverse",
  });
  await e.client.mutation(api.supplierPayments.reverse, {
    paymentId,
    date: "2026-02-03",
    reason: "إلغاء الدفعة",
    requestId: "prt-47-payment-reverse",
  });
  const final = await rows(e);
  assert.equal(final.receipts[0].paidAmount, 0);
  assert.equal(final.receipts[0].remainingAmount, 100);
  assert.equal(final.balances[0].balance, 200);
});

test("PRT-48 لا payments قديم ولا حذف ولا تكرار", async () => {
  const e = await fixture({ payable: 100, paid: 100, supplierFreight: 0 });
  const refundAccountId = await account(e);
  const args = createArgs(e, "prt-48", { refundAccountId });
  const id = await e.client.mutation(api.purchaseReturns.create, args);
  await e.client.mutation(api.purchaseReturns.create, args);
  const reverseArgs = {
    purchaseReturnId: id,
    date: "2026-02-02",
    reason: "تدقيق نهائي",
    requestId: "prt-48-reverse",
  };
  await e.client.mutation(api.purchaseReturns.reverse, reverseArgs);
  await e.client.mutation(api.purchaseReturns.reverse, reverseArgs);
  const state = await rows(e);
  assert.equal(state.payments.length, 0);
  assert.deepEqual(
    [state.returns.length, state.returns[0].status],
    [1, "reversed"],
  );
  assert.equal(
    new Set(state.transactions.map((row) => row.idempotencyKey)).size,
    state.transactions.length,
  );
  assert.equal(
    new Set(state.ledgers.map((row) => row.idempotencyKey)).size,
    state.ledgers.length,
  );
  assert.deepEqual(
    state.inventory.map((row) => row.quantityDelta),
    [-1, 1],
  );
  assert.equal(
    state.returns.filter(
      (row) => row.idempotencyKey === state.returns[0].idempotencyKey,
    ).length,
    1,
  );
});

