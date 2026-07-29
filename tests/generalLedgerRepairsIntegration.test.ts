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
  "../convex/repairs.ts": () => import("../convex/repairs.ts"),
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
      updatedAt: Date.now(),
    });
    const cashAccountId = await ctx.db.insert("financialAccounts", {
      name: "خزينة الصيانة",
      code: "REPAIR-CASH",
      uniqueKey: `${branchId}:REPAIR-CASH`,
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
      name: "عميل الصيانة",
      phone: "01012345678",
      balance: 0,
      totalPurchases: 0,
      branchId,
      isActive: true,
    });
    return { branchId, cashAccountId, customerId };
  });
  const t = raw.withIdentity({
    subject: "admin",
    tokenIdentifier: "admin",
  });
  await t.mutation(api.generalLedger.initialize, {
    cutoverDate: "2026-01-01",
    requestId: "repair-gl-init",
  });
  await t.mutation(api.generalLedger.createOrOpenPeriod, {
    periodKey: "2026-01",
  });
  const chart = await t.query(api.generalLedger.chart, { activeOnly: false });
  const account = (key: string) => {
    const found = chart.find((row) => row.systemKey === key);
    assert.ok(found, `missing chart account ${key}`);
    return found._id;
  };
  await t.mutation(api.generalLedger.confirmOpening, {
    branchId: seeded.branchId,
    openingDate: "2026-01-01",
    isZeroOpening: false,
    requestId: "repair-gl-opening",
    lines: [
      {
        accountId: account("cash"),
        debit: 1000,
        credit: 0,
        description: "خزينة الصيانة",
      },
      {
        accountId: account("opening_equity"),
        debit: 0,
        credit: 1000,
        description: "حقوق الافتتاح",
      },
    ],
  });
  await t.mutation(api.generalLedger.enableFinancialPosting, {
    cutoverDate: "2026-01-01",
    requestId: "repair-finance-bridge",
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

function repairArgs(
  e: Fixture,
  options?: {
    laborCost?: number;
    requestId?: string;
    customer?: boolean;
    deposit?: number;
    date?: string;
  },
) {
  const requestId = options?.requestId ?? "repair-create";
  const deposit = options?.deposit;
  const date = options?.date ?? "2026-01-10";
  return {
    ...(options?.customer === false ? {} : { customerId: e.customerId }),
    customerName: "عميل الصيانة",
    customerPhone: "01012345678",
    deviceType: "هاتف",
    deviceBrand: "اختبار",
    deviceModel: "R-1",
    problem: "عطل شحن",
    laborCost: options?.laborCost ?? 100,
    date,
    creationRequestId: requestId,
    branchId: e.branchId,
    ...(deposit
      ? {
          initialDeposit: {
            amount: deposit,
            accountId: e.cashAccountId,
            paymentDate: date,
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

async function entriesFor(e: Fixture, repairId: Id<"repairs">) {
  return e.raw.run(async (ctx) =>
    (
      await ctx.db
        .query("journalEntries")
        .withIndex("by_reference", (q) =>
          q.eq("referenceType", "repair").eq("referenceId", String(repairId)),
        )
        .collect()
    ).sort((a, b) => a.entryNumber.localeCompare(b.entryNumber)),
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
    const accountId = e.account(key);
    return (
      await ctx.db
        .query("generalLedgerAccountBalances")
        .withIndex("by_key", (q) =>
          q.eq("key", `${e.branchId}:${accountId}`),
        )
        .unique()
    )?.netDebitBalance ?? 0;
  });
}

async function snapshot(e: Fixture) {
  return e.raw.run(async (ctx) => {
    const tables = [
      "repairs",
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

async function cancel(
  e: Fixture,
  repairId: Id<"repairs">,
  options?: { requestId?: string; date?: string; reason?: string },
) {
  return e.t.mutation(api.repairs.updateStatus, {
    id: repairId,
    status: "cancelled",
    date: options?.date ?? "2026-01-20",
    requestId: options?.requestId ?? "repair-cancel",
    reason: options?.reason ?? "تعذر الإصلاح",
  });
}

test("RIB-01 unpaid repair posts receivable and service revenue", async () => {
  const e = await fixture();
  const id = await createRepair(e);
  const repair = await e.raw.run((ctx) => ctx.db.get(id));
  assert.ok(repair?.journalEntryId);
  assert.equal(repair.receivedDate, "2026-01-10");
  assert.equal(repair.totalCost, 100);
  assert.equal(repair.remaining, 100);
  const entries = await entriesFor(e, id);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].operationType, "repair_charge");
  assert.equal(entries[0].totalDebit, 100);
  assert.equal(entries[0].totalCredit, 100);
  assert.equal(await balance(e, "accounts_receivable"), 100);
  assert.equal(await balance(e, "sales"), -100);
});

test("RIB-02 partial deposit combines operational and financial journals", async () => {
  const e = await fixture();
  const id = await createRepair(e, { deposit: 30 });
  const repair = await e.raw.run((ctx) => ctx.db.get(id));
  assert.equal(repair?.deposit, 30);
  assert.equal(repair?.remaining, 70);
  const entries = await entriesFor(e, id);
  assert.deepEqual(
    entries.map((entry) => entry.sourceType),
    ["operational", "financial"],
  );
  assert.equal(await balance(e, "accounts_receivable"), 70);
  assert.equal(await balance(e, "cash"), 1030);
});

test("RIB-03 full deposit clears receivable without duplicating revenue", async () => {
  const e = await fixture();
  const id = await createRepair(e, { deposit: 100 });
  assert.equal((await e.raw.run((ctx) => ctx.db.get(id)))?.remaining, 0);
  assert.equal(await balance(e, "accounts_receivable"), 0);
  assert.equal(await balance(e, "sales"), -100);
  assert.equal(await balance(e, "cash"), 1100);
  assert.equal((await entriesFor(e, id)).length, 2);
});

test("RIB-04 zero labor creates no synthetic operational journal", async () => {
  const e = await fixture();
  const id = await createRepair(e, { laborCost: 0 });
  const repair = await e.raw.run((ctx) => ctx.db.get(id));
  assert.equal(repair?.totalCost, 0);
  assert.equal(repair?.journalEntryId, undefined);
  assert.equal((await entriesFor(e, id)).length, 0);
  assert.equal(await balance(e, "sales"), 0);
});

test("RIB-05 dormant operational gate preserves legacy repair creation", async () => {
  const e = await fixture({ operational: false });
  const id = await createRepair(e, { customer: false });
  const repair = await e.raw.run((ctx) => ctx.db.get(id));
  assert.equal(repair?.customerId, undefined);
  assert.equal(repair?.journalEntryId, undefined);
  assert.equal((await entriesFor(e, id)).length, 0);
});

test("RIB-06 operational posting requires a registered customer", async () => {
  const e = await fixture();
  const before = await snapshot(e);
  await assert.rejects(
    createRepair(e, { customer: false }),
    /عميل مسجل/,
  );
  assert.deepEqual(await snapshot(e), before);
});

test("RIB-07 identical create retry duplicates no repair or journal", async () => {
  const e = await fixture();
  const first = await createRepair(e, { requestId: "same-create" });
  const second = await createRepair(e, { requestId: "same-create" });
  assert.equal(second, first);
  const state = await snapshot(e);
  assert.equal((state.repairs as unknown[]).length, 1);
  assert.equal((await entriesFor(e, first)).length, 1);
  assert.equal(await balance(e, "accounts_receivable"), 100);
});

test("RIB-08 closed period rolls back the entire repair mutation", async () => {
  const e = await fixture();
  await e.t.mutation(api.generalLedger.closePeriod, {
    periodKey: "2026-01",
    reason: "إقفال يناير",
  });
  const before = await snapshot(e);
  await assert.rejects(createRepair(e), /غير مفتوحة/);
  assert.deepEqual(await snapshot(e), before);
});

test("RIB-09 pre-cutover repair rolls back all subledgers", async () => {
  const e = await fixture();
  const before = await snapshot(e);
  await assert.rejects(
    createRepair(e, { date: "2025-12-31" }),
    /تاريخ القطع|يسبق/,
  );
  assert.deepEqual(await snapshot(e), before);
});

test("RIB-10 inactive receivable account rejects atomically", async () => {
  const e = await fixture();
  await e.raw.run((ctx) =>
    ctx.db.patch(e.account("accounts_receivable"), { isActive: false }),
  );
  const before = await snapshot(e);
  await assert.rejects(createRepair(e), /accounts_receivable/);
  assert.deepEqual(await snapshot(e), before);
});

test("RIB-11 inactive revenue account rejects atomically", async () => {
  const e = await fixture();
  await e.raw.run((ctx) =>
    ctx.db.patch(e.account("sales"), { isActive: false }),
  );
  const before = await snapshot(e);
  await assert.rejects(createRepair(e), /sales/);
  assert.deepEqual(await snapshot(e), before);
});

test("RIB-12 journal stores document links and exact historical lines", async () => {
  const e = await fixture();
  const id = await createRepair(e, { laborCost: 31 });
  const entry = (await entriesFor(e, id))[0];
  assert.equal(entry.referenceType, "repair");
  assert.equal(entry.referenceId, String(id));
  assert.match(entry.referenceNumber ?? "", /^REP-/);
  const lines = await linesFor(e, entry._id);
  assert.deepEqual(
    lines.map((line) => [line.accountCodeSnapshot, line.debit, line.credit]),
    [
      ["1200", 31, 0],
      ["4100", 0, 31],
    ],
  );
});

test("RIB-13 cancellation reverses the exact service journal", async () => {
  const e = await fixture();
  const id = await createRepair(e);
  await cancel(e, id);
  const repair = await e.raw.run((ctx) => ctx.db.get(id));
  assert.equal(repair?.status, "cancelled");
  assert.ok(repair?.cancellationJournalEntryId);
  const entries = await entriesFor(e, id);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].status, "reversed");
  assert.equal(entries[0].reversalEntryId, entries[1]._id);
  assert.equal(entries[1].sourceType, "operational_reversal");
  assert.equal(await balance(e, "accounts_receivable"), 0);
  assert.equal(await balance(e, "sales"), 0);
});

test("RIB-14 refunded deposit then cancellation restores every ledger", async () => {
  const e = await fixture();
  const id = await createRepair(e, { deposit: 40 });
  await e.t.mutation(api.repairs.refundPayment, {
    repairId: id,
    amount: 40,
    accountId: e.cashAccountId,
    date: "2026-01-15",
    reason: "رد العربون قبل الإلغاء",
    requestId: "refund-before-cancel",
  });
  await cancel(e, id);
  assert.equal(await balance(e, "accounts_receivable"), 0);
  assert.equal(await balance(e, "sales"), 0);
  assert.equal(await balance(e, "cash"), 1000);
  const customer = await e.raw.run((ctx) =>
    ctx.db.query("customerBalances").first(),
  );
  assert.equal(customer?.receivableBalance, 0);
  assert.equal(customer?.totalPurchases, 0);
});

test("RIB-15 cancellation retry returns the same result without duplication", async () => {
  const e = await fixture();
  const id = await createRepair(e);
  const first = await cancel(e, id);
  const before = await snapshot(e);
  const second = await cancel(e, id, { reason: "  تعذر   الإصلاح  " });
  assert.equal(first, id);
  assert.equal(second, id);
  assert.deepEqual(await snapshot(e), before);
  assert.equal((await entriesFor(e, id)).length, 2);
});

test("RIB-16 conflicting cancellation fingerprint has no side effects", async () => {
  const e = await fixture();
  const id = await createRepair(e);
  await cancel(e, id);
  const before = await snapshot(e);
  await assert.rejects(
    cancel(e, id, { reason: "سبب مختلف" }),
    /طلب مختلف/,
  );
  assert.deepEqual(await snapshot(e), before);
});

test("RIB-17 cancellation cannot predate the repair journal", async () => {
  const e = await fixture();
  const id = await createRepair(e);
  const before = await snapshot(e);
  await assert.rejects(
    cancel(e, id, { date: "2026-01-09" }),
    /يسبق تاريخ الصيانة/,
  );
  assert.deepEqual(await snapshot(e), before);
});

test("RIB-18 legacy repair without original journal is blocked after cutover", async () => {
  const e = await fixture({ operational: false });
  const id = await createRepair(e);
  await e.raw.run(async (ctx) => {
    const settings = await ctx.db.query("generalLedgerSettings").first();
    assert.ok(settings);
    await ctx.db.patch(settings._id, { operationalPostingEnabled: true });
  });
  const before = await snapshot(e);
  await assert.rejects(cancel(e, id), /الصيانة القديمة/);
  assert.deepEqual(await snapshot(e), before);
});

test("RIB-19 outstanding deposit blocks cancellation without hidden reversal", async () => {
  const e = await fixture();
  const id = await createRepair(e, { deposit: 20 });
  const before = await snapshot(e);
  await assert.rejects(cancel(e, id), /استرداد عربون/);
  assert.deepEqual(await snapshot(e), before);
});

test("RIB-20 later collection posts cash only and never duplicates revenue", async () => {
  const e = await fixture();
  const id = await createRepair(e);
  await e.t.mutation(api.repairs.recordPayment, {
    repairId: id,
    amount: 25,
    accountId: e.cashAccountId,
    paymentDate: "2026-01-12",
    requestId: "repair-collection",
  });
  const entries = await entriesFor(e, id);
  assert.deepEqual(
    entries.map((entry) => entry.sourceType),
    ["operational", "financial"],
  );
  assert.equal(entries.filter((entry) => entry.operationType === "repair_charge").length, 1);
  assert.equal(await balance(e, "accounts_receivable"), 75);
  assert.equal(await balance(e, "sales"), -100);
  assert.equal(await balance(e, "cash"), 1025);
});

test("RIB-21 refund restores receivable through the financial bridge only", async () => {
  const e = await fixture();
  const id = await createRepair(e, { deposit: 40 });
  await e.t.mutation(api.repairs.refundPayment, {
    repairId: id,
    amount: 10,
    accountId: e.cashAccountId,
    date: "2026-01-12",
    reason: "رد جزئي",
    requestId: "repair-refund",
  });
  assert.equal(await balance(e, "accounts_receivable"), 70);
  assert.equal(await balance(e, "sales"), -100);
  assert.equal(await balance(e, "cash"), 1030);
  const entries = await entriesFor(e, id);
  assert.equal(entries.filter((entry) => entry.sourceType === "operational").length, 1);
  assert.equal(entries.filter((entry) => entry.sourceType === "financial").length, 2);
});

test("RIB-22 financial bridge rejects collection on an unregistered legacy repair", async () => {
  const e = await fixture({ operational: false });
  const id = await createRepair(e, { customer: false });
  const before = await snapshot(e);
  await assert.rejects(
    e.t.mutation(api.repairs.recordPayment, {
      repairId: id,
      amount: 10,
      accountId: e.cashAccountId,
      paymentDate: "2026-01-12",
      requestId: "legacy-collection",
    }),
    /عميل مسجل/,
  );
  assert.deepEqual(await snapshot(e), before);
});

test("RIB-23 public repair DTOs redact journal and idempotency internals", async () => {
  const e = await fixture();
  const id = await createRepair(e);
  const getDto = await e.t.query(api.repairs.get, { id });
  const listDto = await e.t.query(api.repairs.list, {});
  for (const dto of [getDto, listDto[0]]) {
    assert.ok(dto);
    for (const forbidden of [
      "journalEntryId",
      "cancellationJournalEntryId",
      "creationRequestId",
      "cancellationRequestId",
      "cancellationFingerprint",
    ]) {
      assert.equal(forbidden in dto, false);
    }
  }
});

test("RIB-24 complete deposit refund and cancel cycle reconciles without payments", async () => {
  const e = await fixture();
  const id = await createRepair(e, {
    laborCost: 100,
    deposit: 100,
    requestId: "complete-cycle",
  });
  await e.t.mutation(api.repairs.refundPayment, {
    repairId: id,
    amount: 100,
    accountId: e.cashAccountId,
    date: "2026-01-15",
    reason: "رد كامل",
    requestId: "complete-refund",
  });
  await cancel(e, id, {
    date: "2026-01-16",
    requestId: "complete-cancel",
    reason: "تعذر الإصلاح",
  });
  const state = await snapshot(e);
  assert.equal((state.payments as unknown[]).length, 0);
  assert.equal((state.repairs as Array<{ status: string }>)[0].status, "cancelled");
  assert.equal((state.financialTransactions as unknown[]).length, 2);
  assert.equal((state.customerLedgerEntries as unknown[]).length, 4);
  assert.equal((state.journalEntries as unknown[]).length, 5);
  assert.equal(await balance(e, "accounts_receivable"), 0);
  assert.equal(await balance(e, "sales"), 0);
  assert.equal(await balance(e, "cash"), 1000);
});
