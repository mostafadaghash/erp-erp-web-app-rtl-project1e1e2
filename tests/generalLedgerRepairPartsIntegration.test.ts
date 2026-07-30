import test from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema.ts";
import { api } from "../convex/_generated/api.js";
import type { Id } from "../convex/_generated/dataModel";
import type { AuthUser } from "../convex/lib/auth.ts";
import { postJournal } from "../convex/lib/generalLedger.ts";
import {
  DEFAULT_CHART,
  GENERAL_LEDGER_CHART_VERSION,
} from "../convex/lib/generalLedgerTemplate.ts";

const modules = {
  "../convex/_generated/api.js": () => import("../convex/_generated/api.js"),
  "../convex/_generated/server.js": () =>
    import("../convex/_generated/server.js"),
  "../convex/repairs.ts": () => import("../convex/repairs.ts"),
};

type Fixture = Awaited<ReturnType<typeof fixture>>;

async function fixture(options?: { operational?: boolean }) {
  const raw = convexTest(schema, modules);
  const seeded = await raw.run(async (ctx) => {
    const now = Date.now();
    const branchId = await ctx.db.insert("branches", {
      name: "فرع قطع الصيانة",
      address: "القاهرة",
      isActive: true,
    });
    const otherBranchId = await ctx.db.insert("branches", {
      name: "فرع آخر",
      address: "الجيزة",
      isActive: true,
    });
    const employeeId = await ctx.db.insert("userProfiles", {
      userId: "admin",
      tokenIdentifier: "admin",
      name: "مدير النظام",
      role: "admin",
      branchId,
      permissions: [],
      isActive: true,
    });
    await ctx.db.insert("userProfiles", {
      userId: "viewer",
      tokenIdentifier: "viewer",
      name: "مشاهد",
      role: "viewer",
      branchId,
      permissions: [],
      isActive: true,
    });
    const user: AuthUser = {
      userId: "admin",
      employeeId,
      name: "مدير النظام",
      role: "admin",
      branchId,
      isActive: true,
      permissions: [],
    };
    await ctx.db.insert("settings", {
      storeName: "اختبار",
      storeType: "repair",
      primaryColor: "#000",
      secondaryColor: "#fff",
      currency: "EGP",
      taxRate: 0,
    });
    await ctx.db.insert("financeSettings", {
      isInitialized: true,
      cutoverDate: "2026-01-01",
      defaultClearingDelayDays: 0,
      updatedAt: now,
    });
    const accountIds = {} as Record<string, Id<"chartOfAccounts">>;
    const accountIdsByCode = new Map<string, Id<"chartOfAccounts">>();
    for (const account of DEFAULT_CHART) {
      const accountId = await ctx.db.insert("chartOfAccounts", {
        code: account.code,
        normalizedCode: account.code,
        nameAr: account.nameAr,
        parentId: account.parentCode
          ? accountIdsByCode.get(account.parentCode)
          : undefined,
        accountClass: account.accountClass,
        normalSide: account.normalSide,
        isContra: account.isContra ?? false,
        isPosting: account.isPosting,
        isSystem: true,
        systemKey: account.systemKey,
        isActive: true,
        createdAt: now,
        createdBy: user.userId,
      });
      accountIds[account.systemKey] = accountId;
      accountIdsByCode.set(account.code, accountId);
    }
    await ctx.db.insert("generalLedgerSettings", {
      baseCurrency: "EGP",
      chartVersion: GENERAL_LEDGER_CHART_VERSION,
      status: "foundation_ready",
      operationalPostingEnabled: options?.operational !== false,
      financialPostingEnabled: true,
      financialPostingCutoverDate: "2026-01-01",
      cutoverDate: "2026-01-01",
      initializedAt: now,
      initializedBy: user.userId,
      initializationRequestId: "repair-parts-gl-init",
      initializationFingerprint: "repair-parts-fixture",
    });
    await ctx.db.insert("accountingPeriods", {
      periodKey: "2026-01",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      status: "open",
    });
    const opening = await postJournal(ctx, user, {
      branchId,
      date: "2026-01-01",
      memo: "افتتاح اختبار قطع الصيانة",
      requestId: "repair-parts-opening",
      sourceType: "opening",
      operationType: "opening_balance",
      referenceType: "general_ledger_opening",
      referenceId: String(branchId),
      lines: [
        {
          accountId: accountIds.cash,
          debit: 1000,
          credit: 0,
          description: "خزينة الصيانة",
        },
        {
          accountId: accountIds.inventory,
          debit: 39,
          credit: 0,
          description: "مخزون قطع الصيانة",
        },
        {
          accountId: accountIds.opening_equity,
          debit: 0,
          credit: 1039,
          description: "حقوق الافتتاح",
        },
      ],
    });
    await ctx.db.insert("generalLedgerOpenings", {
      branchId,
      openingDate: "2026-01-01",
      status: "confirmed",
      isZeroOpening: false,
      openingEntryId: opening._id,
      requestId: "repair-parts-opening",
      fingerprint: "repair-parts-fixture",
      confirmedAt: now,
      confirmedBy: user.userId,
    });
    const cashAccountId = await ctx.db.insert("financialAccounts", {
      name: "خزينة الصيانة",
      code: "REPAIR-PARTS-CASH",
      uniqueKey: `${branchId}:REPAIR-PARTS-CASH`,
      type: "cash",
      branchId,
      isActive: true,
      currentBalance: 1000,
      allowNegative: false,
      settlementDelayDays: 0,
      createdAt: now,
      createdBy: "admin",
      updatedAt: now,
    });
    const customerId = await ctx.db.insert("customers", {
      name: "عميل قطع الصيانة",
      phone: "01012345678",
      balance: 0,
      totalPurchases: 0,
      branchId,
      isActive: true,
    });
    const productId = await ctx.db.insert("products", {
      name: "شاشة صيانة",
      sku: "REP-PART-1",
      costPrice: 10.3333,
      inventoryValue: 31,
      sellPrice: 20,
      stock: 3,
      minStock: 0,
      unit: "قطعة",
      branchId,
      isActive: true,
    });
    const secondProductId = await ctx.db.insert("products", {
      name: "بطارية صيانة",
      sku: "REP-PART-2",
      costPrice: 4,
      inventoryValue: 8,
      sellPrice: 7.5,
      stock: 2,
      minStock: 0,
      unit: "قطعة",
      branchId,
      isActive: true,
    });
    const otherProductId = await ctx.db.insert("products", {
      name: "قطعة فرع آخر",
      sku: "REP-PART-OTHER",
      costPrice: 6,
      inventoryValue: 12,
      sellPrice: 9,
      stock: 2,
      minStock: 0,
      unit: "قطعة",
      branchId: otherBranchId,
      isActive: true,
    });
    return {
      branchId,
      otherBranchId,
      cashAccountId,
      customerId,
      productId,
      secondProductId,
      otherProductId,
      accountIds,
    };
  });
  const t = raw.withIdentity({
    subject: "admin",
    tokenIdentifier: "admin",
  });
  const viewer = raw.withIdentity({
    subject: "viewer",
    tokenIdentifier: "viewer",
  });
  const account = (key: string) => {
    const found = seeded.accountIds[key];
    assert.ok(found, `missing chart account ${key}`);
    return found;
  };
  return { raw, t, viewer, account, ...seeded };
}

function repairArgs(
  e: Fixture,
  options?: {
    laborCost?: number;
    requestId?: string;
    parts?: Array<{ productId: Id<"products">; quantity: number }>;
    customer?: boolean;
    deposit?: number;
  },
) {
  const requestId = options?.requestId ?? "repair-parts-create";
  const deposit = options?.deposit;
  return {
    ...(options?.customer === false ? {} : { customerId: e.customerId }),
    customerName: "عميل قطع الصيانة",
    customerPhone: "01012345678",
    deviceType: "هاتف",
    deviceBrand: "اختبار",
    deviceModel: "RP-1",
    problem: "تغيير قطعة",
    laborCost: options?.laborCost ?? 100,
    parts: options?.parts ?? [{ productId: e.productId, quantity: 1 }],
    date: "2026-01-10",
    creationRequestId: requestId,
    branchId: e.branchId,
    ...(deposit
      ? {
          initialDeposit: {
            amount: deposit,
            accountId: e.cashAccountId,
            paymentDate: "2026-01-10",
            requestId: `${requestId}:deposit`,
          },
        }
      : {}),
  };
}

async function createRepair(
  e: Fixture,
  options?: Parameters<typeof repairArgs>[1],
) {
  return e.t.mutation(api.repairs.create, repairArgs(e, options));
}

async function snapshot(e: Fixture) {
  return e.raw.run(async (ctx) => {
    const tables = [
      "repairs",
      "products",
      "inventoryMovements",
      "customerBalances",
      "customerLedgerEntries",
      "financialAccounts",
      "financialTransactions",
      "financialMovements",
      "journalEntries",
      "journalLines",
      "generalLedgerAccountBalances",
      "generalLedgerPeriodBalances",
      "generalLedgerDailyMovements",
      "documentCounters",
      "auditLogs",
      "payments",
    ] as const;
    const result: Record<string, unknown> = {};
    for (const table of tables) {
      result[table] = (await ctx.db.query(table).collect()).sort((a, b) =>
        String(a._id).localeCompare(String(b._id)),
      );
    }
    return result;
  });
}

async function entriesFor(e: Fixture, repairId: Id<"repairs">) {
  return e.raw.run((ctx) =>
    ctx.db
      .query("journalEntries")
      .withIndex("by_reference", (q) =>
        q.eq("referenceType", "repair").eq("referenceId", String(repairId)),
      )
      .collect(),
  );
}

async function linesFor(e: Fixture, entryId: Id<"journalEntries">) {
  return e.raw.run((ctx) =>
    ctx.db
      .query("journalLines")
      .withIndex("by_entry", (q) => q.eq("entryId", entryId))
      .collect(),
  );
}

async function balance(e: Fixture, key: string) {
  return e.raw.run(async (ctx) => {
    const row = await ctx.db
      .query("generalLedgerAccountBalances")
      .withIndex("by_key", (q) =>
        q.eq("key", `${e.branchId}:${e.account(key)}`),
      )
      .unique();
    return row?.netDebitBalance ?? 0;
  });
}

async function cancel(
  e: Fixture,
  repairId: Id<"repairs">,
  options?: { requestId?: string; reason?: string; date?: string },
) {
  return e.t.mutation(api.repairs.updateStatus, {
    id: repairId,
    status: "cancelled",
    date: options?.date ?? "2026-01-20",
    reason: options?.reason ?? "إلغاء الإصلاح",
    requestId: options?.requestId ?? "repair-parts-cancel",
  });
}

test("RPB-01 one repair part posts revenue inventory and historical COGS", async () => {
  const e = await fixture();
  const id = await createRepair(e);
  const repair = await e.raw.run((ctx) => ctx.db.get(id));
  const product = await e.raw.run((ctx) => ctx.db.get(e.productId));
  assert.equal(repair?.laborCost, 100);
  assert.equal(repair?.partsTotal, 20);
  assert.equal(repair?.partsCogsTotal, 10.33);
  assert.equal(repair?.totalCost, 120);
  assert.equal(product?.stock, 2);
  assert.equal(product?.inventoryValue, 20.67);
  assert.equal(await balance(e, "accounts_receivable"), 120);
  assert.equal(await balance(e, "sales"), -120);
  assert.equal(await balance(e, "cogs"), 10.33);
  assert.equal(await balance(e, "inventory"), 28.67);
});

test("RPB-02 full-stock issue removes the exact remaining inventory value", async () => {
  const e = await fixture();
  const id = await createRepair(e, {
    laborCost: 0,
    parts: [{ productId: e.productId, quantity: 3 }],
  });
  const repair = await e.raw.run((ctx) => ctx.db.get(id));
  const product = await e.raw.run((ctx) => ctx.db.get(e.productId));
  assert.equal(repair?.partsCogsTotal, 31);
  assert.equal(repair?.parts[0].inventoryValueRemoved, 31);
  assert.equal(product?.stock, 0);
  assert.equal(product?.inventoryValue, 0);
});

test("RPB-03 multiple parts derive server prices and exact aggregate COGS", async () => {
  const e = await fixture();
  const id = await createRepair(e, {
    laborCost: 50,
    parts: [
      { productId: e.secondProductId, quantity: 2 },
      { productId: e.productId, quantity: 1 },
    ],
    deposit: 40,
  });
  const repair = await e.raw.run((ctx) => ctx.db.get(id));
  assert.equal(repair?.partsTotal, 35);
  assert.equal(repair?.partsCogsTotal, 18.33);
  assert.equal(repair?.totalCost, 85);
  assert.equal(repair?.deposit, 40);
  assert.equal(repair?.remaining, 45);
  assert.deepEqual(
    repair?.parts.map((part) => [part.name, part.lineTotal]),
    [
      ["شاشة صيانة", 20],
      ["بطارية صيانة", 15],
    ],
  );
});

test("RPB-04 part-only repair posts sales and COGS without labor", async () => {
  const e = await fixture();
  const id = await createRepair(e, { laborCost: 0 });
  const repair = await e.raw.run((ctx) => ctx.db.get(id));
  assert.equal(repair?.totalCost, 20);
  assert.equal(await balance(e, "accounts_receivable"), 20);
  assert.equal(await balance(e, "sales"), -20);
  assert.equal(await balance(e, "cogs"), 10.33);
});

test("RPB-05 free part posts COGS and inventory without synthetic revenue", async () => {
  const e = await fixture();
  await e.raw.run((ctx) => ctx.db.patch(e.productId, { sellPrice: 0 }));
  const id = await createRepair(e, { laborCost: 0, customer: false });
  const entry = (await entriesFor(e, id))[0];
  const lines = await linesFor(e, entry._id);
  assert.equal(lines.length, 2);
  assert.deepEqual(
    lines.map((line) => [line.accountCodeSnapshot, line.debit, line.credit]),
    [
      ["5000", 10.33, 0],
      ["1300", 0, 10.33],
    ],
  );
  assert.equal(await balance(e, "accounts_receivable"), 0);
  assert.equal(await balance(e, "sales"), 0);
});

test("RPB-06 labor-only repair preserves the existing no-parts contract", async () => {
  const e = await fixture();
  const id = await createRepair(e, { parts: [] });
  const repair = await e.raw.run((ctx) => ctx.db.get(id));
  assert.deepEqual(repair?.parts, []);
  assert.equal(repair?.partsTotal, 0);
  assert.equal(repair?.partsCogsTotal, 0);
  assert.equal((await e.raw.run((ctx) => ctx.db.query("inventoryMovements").collect())).length, 0);
});

test("RPB-07 insufficient part stock rolls back every document and ledger", async () => {
  const e = await fixture();
  const before = await snapshot(e);
  await assert.rejects(
    createRepair(e, {
      parts: [{ productId: e.productId, quantity: 4 }],
    }),
    /المخزون غير كاف/,
  );
  assert.deepEqual(await snapshot(e), before);
});

test("RPB-08 inactive repair part is rejected atomically", async () => {
  const e = await fixture();
  await e.raw.run((ctx) => ctx.db.patch(e.productId, { isActive: false }));
  const before = await snapshot(e);
  await assert.rejects(createRepair(e), /غير موجودة أو غير نشطة/);
  assert.deepEqual(await snapshot(e), before);
});

test("RPB-09 admin cannot mix a part from another repair branch", async () => {
  const e = await fixture();
  const before = await snapshot(e);
  await assert.rejects(
    createRepair(e, {
      parts: [{ productId: e.otherProductId, quantity: 1 }],
    }),
    /لا تنتمي إلى فرع/,
  );
  assert.deepEqual(await snapshot(e), before);
});

test("RPB-10 zero negative and fractional part quantities are rejected", async () => {
  for (const quantity of [0, -1, 1.5]) {
    const e = await fixture();
    const before = await snapshot(e);
    await assert.rejects(
      createRepair(e, {
        parts: [{ productId: e.productId, quantity }],
      }),
      /عددًا صحيحًا أكبر من صفر/,
    );
    assert.deepEqual(await snapshot(e), before);
  }
});

test("RPB-11 duplicate repair part identifiers are rejected", async () => {
  const e = await fixture();
  const before = await snapshot(e);
  await assert.rejects(
    createRepair(e, {
      parts: [
        { productId: e.productId, quantity: 1 },
        { productId: e.productId, quantity: 1 },
      ],
    }),
    /تكرار قطعة الغيار/,
  );
  assert.deepEqual(await snapshot(e), before);
});

test("RPB-12 server product price must have exact cent precision", async () => {
  const e = await fixture();
  await e.raw.run((ctx) => ctx.db.patch(e.productId, { sellPrice: 1.001 }));
  const before = await snapshot(e);
  await assert.rejects(createRepair(e), /دقة قرشين/);
  assert.deepEqual(await snapshot(e), before);
});

test("RPB-13 identical creation retry duplicates no inventory or journals", async () => {
  const e = await fixture();
  const first = await createRepair(e, { requestId: "same-parts-create" });
  const before = await snapshot(e);
  const second = await createRepair(e, { requestId: "same-parts-create" });
  assert.equal(second, first);
  assert.deepEqual(await snapshot(e), before);
});

test("RPB-14 changed parts under one creation requestId are rejected", async () => {
  const e = await fixture();
  await createRepair(e, { requestId: "parts-conflict" });
  const before = await snapshot(e);
  await assert.rejects(
    createRepair(e, {
      requestId: "parts-conflict",
      parts: [{ productId: e.productId, quantity: 2 }],
    }),
    /بيانات مختلفة/,
  );
  assert.deepEqual(await snapshot(e), before);
});

test("RPB-15 matching retry is resolved before mutable product state checks", async () => {
  const e = await fixture();
  const first = await createRepair(e, { requestId: "retry-before-state" });
  await e.raw.run((ctx) =>
    ctx.db.patch(e.productId, { isActive: false, sellPrice: 99 }),
  );
  const before = await snapshot(e);
  const second = await createRepair(e, { requestId: "retry-before-state" });
  assert.equal(second, first);
  assert.deepEqual(await snapshot(e), before);
});

test("RPB-16 operational journal stores exact four-account mapping", async () => {
  const e = await fixture();
  const id = await createRepair(e, { laborCost: 31 });
  const entry = (await entriesFor(e, id))[0];
  const lines = await linesFor(e, entry._id);
  assert.equal(entry.totalDebit, 61.33);
  assert.equal(entry.totalCredit, 61.33);
  assert.deepEqual(
    lines.map((line) => [line.accountCodeSnapshot, line.debit, line.credit]),
    [
      ["1200", 51, 0],
      ["4100", 0, 51],
      ["5000", 10.33, 0],
      ["1300", 0, 10.33],
    ],
  );
});

test("RPB-17 inactive COGS account rolls back consumed inventory", async () => {
  const e = await fixture();
  await e.raw.run((ctx) => ctx.db.patch(e.account("cogs"), { isActive: false }));
  const before = await snapshot(e);
  await assert.rejects(createRepair(e), /cogs/);
  assert.deepEqual(await snapshot(e), before);
});

test("RPB-18 inactive inventory account rolls back consumed inventory", async () => {
  const e = await fixture();
  await e.raw.run((ctx) =>
    ctx.db.patch(e.account("inventory"), { isActive: false }),
  );
  const before = await snapshot(e);
  await assert.rejects(createRepair(e), /inventory/);
  assert.deepEqual(await snapshot(e), before);
});

test("RPB-19 dormant operational gate still records physical part issue only", async () => {
  const e = await fixture({ operational: false });
  const id = await createRepair(e);
  const product = await e.raw.run((ctx) => ctx.db.get(e.productId));
  assert.equal(product?.stock, 2);
  assert.equal(product?.inventoryValue, 20.67);
  assert.equal((await entriesFor(e, id)).length, 0);
  assert.equal(
    (await e.raw.run((ctx) => ctx.db.query("inventoryMovements").collect()))
      .length,
    1,
  );
});

test("RPB-20 cancellation restores exact inventory and reverses the journal", async () => {
  const e = await fixture();
  const id = await createRepair(e, {
    laborCost: 50,
    parts: [{ productId: e.productId, quantity: 3 }],
  });
  await cancel(e, id);
  const repair = await e.raw.run((ctx) => ctx.db.get(id));
  const product = await e.raw.run((ctx) => ctx.db.get(e.productId));
  const movements = await e.raw.run((ctx) =>
    ctx.db.query("inventoryMovements").collect(),
  );
  assert.equal(repair?.status, "cancelled");
  assert.equal(product?.stock, 3);
  assert.equal(product?.inventoryValue, 31);
  assert.deepEqual(
    movements.map((movement) => [movement.type, movement.valueDelta]),
    [
      ["repair_part_issue", -31],
      ["repair_part_reversal", 31],
    ],
  );
  assert.equal(await balance(e, "accounts_receivable"), 0);
  assert.equal(await balance(e, "sales"), 0);
  assert.equal(await balance(e, "cogs"), 0);
  assert.equal(await balance(e, "inventory"), 39);
});

test("RPB-21 matching cancellation retry duplicates no stock movement", async () => {
  const e = await fixture();
  const id = await createRepair(e);
  await cancel(e, id, { requestId: "same-parts-cancel" });
  const before = await snapshot(e);
  await cancel(e, id, {
    requestId: "same-parts-cancel",
    reason: "  إلغاء   الإصلاح  ",
  });
  assert.deepEqual(await snapshot(e), before);
  assert.equal(
    (await e.raw.run((ctx) => ctx.db.query("inventoryMovements").collect()))
      .length,
    2,
  );
});

test("RPB-22 conflicting cancellation request cannot restore stock twice", async () => {
  const e = await fixture();
  const id = await createRepair(e);
  await cancel(e, id);
  const before = await snapshot(e);
  await assert.rejects(
    cancel(e, id, { requestId: "other-cancel" }),
    /طلب مختلف/,
  );
  assert.deepEqual(await snapshot(e), before);
});

test("RPB-23 closed cancellation period rolls back inventory restoration", async () => {
  const e = await fixture();
  const id = await createRepair(e);
  await e.raw.run(async (ctx) => {
    const period = await ctx.db
      .query("accountingPeriods")
      .withIndex("by_key", (q) => q.eq("periodKey", "2026-01"))
      .unique();
    assert.ok(period);
    await ctx.db.patch(period._id, { status: "closed" });
  });
  const before = await snapshot(e);
  await assert.rejects(cancel(e, id), /غير مفتوحة/);
  assert.deepEqual(await snapshot(e), before);
});

test("RPB-24 picker and repair DTOs expose only authorized cost fields", async () => {
  const e = await fixture();
  const id = await createRepair(e);
  const picker = await e.t.query(api.repairs.partPicker, {
    branchId: e.branchId,
  });
  assert.deepEqual(
    Object.keys(picker[0]).sort(),
    ["_id", "branchId", "name", "sellPrice", "sku", "stock", "unit"].sort(),
  );
  for (const forbidden of ["costPrice", "inventoryValue", "minStock"]) {
    assert.equal(forbidden in picker[0], false);
  }
  const adminDto = await e.t.query(api.repairs.get, { id });
  const viewerDto = await e.viewer.query(api.repairs.get, { id });
  assert.equal(adminDto?.partsCogsTotal, 10.33);
  assert.equal(adminDto?.parts[0].inventoryValueRemoved, 10.33);
  assert.equal("partsCogsTotal" in (viewerDto ?? {}), false);
  assert.equal(
    "inventoryValueRemoved" in (viewerDto?.parts[0] ?? {}),
    false,
  );
  for (const forbidden of [
    "creationRequestId",
    "creationFingerprint",
    "journalEntryId",
  ]) {
    assert.equal(forbidden in (adminDto ?? {}), false);
    assert.equal(forbidden in (viewerDto ?? {}), false);
  }
});
