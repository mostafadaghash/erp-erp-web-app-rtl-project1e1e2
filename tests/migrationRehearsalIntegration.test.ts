import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { convexTest } from "convex-test";
import schema from "../convex/schema.ts";
import { internal } from "../convex/_generated/api.js";
import { symlink, unlink } from "./moduleLinkTestUtils.ts";

const links = [
  ["convex/_generated/server", "server.js"],
  ["convex/lib/auth", "auth.ts"],
  ["convex/lib/generalLedger", "generalLedger.ts"],
] as const;

before(async () => {
  for (const [path, target] of links) {
    if (!existsSync(resolve(path))) await symlink(target, resolve(path));
  }
  process.env.MIGRATION_REHEARSAL_ENABLED = "isolated-migration-rehearsal-only";
  process.env.MIGRATION_REHEARSAL_DEPLOYMENT = "temporary-migration-123";
});

after(async () => {
  delete process.env.MIGRATION_REHEARSAL_ENABLED;
  delete process.env.MIGRATION_REHEARSAL_DEPLOYMENT;
  for (const [path] of links) {
    if (existsSync(resolve(path))) await unlink(resolve(path));
  }
});

const modules = {
  "../convex/_generated/api.js": () => import("../convex/_generated/api.js"),
  "../convex/_generated/server.js": () => import("../convex/_generated/server.js"),
  "../convex/migrationRehearsal.ts": () => import("../convex/migrationRehearsal.ts"),
};

const fingerprint = "a".repeat(64);
const migrationRunId = "MIG-AAAAAAAAAAAAAAAA";
const targetDeployment = "temporary-migration-123";
const confirmation = `APPLY:${targetDeployment}:${migrationRunId}:${fingerprint.slice(0, 12)}`;

const accepted = () => ({
  branches: [
    { legacyId: "B-1", code: "MAIN", name: "الرئيسي", address: "القاهرة", isActive: true },
    { legacyId: "B-2", code: "WEST", name: "الغرب", address: "الجيزة", isActive: true },
  ],
  customers: [
    { legacyId: "C-1", branchCode: "MAIN", name: "عميل", phone: "01000000001", receivableBalance: 50, advanceBalance: 0, isActive: true },
  ],
  suppliers: [
    {
      legacyId: "S-1",
      name: "مورد",
      phone: "01000000002",
      isActive: true,
      balances: [
        { branchCode: "MAIN", balance: 80 },
        { branchCode: "WEST", balance: 20 },
      ],
    },
  ],
  products: [
    { legacyId: "P-1", branchCode: "MAIN", sku: "SKU-MAIN", name: "منتج رئيسي", supplierLegacyId: "S-1", stock: 2, minStock: 0, costPrice: 10.25, sellPrice: 15, inventoryValue: 20.5, unit: "قطعة", isActive: true },
    { legacyId: "P-2", branchCode: "WEST", sku: "SKU-WEST", name: "منتج الغرب", stock: 1, minStock: 0, costPrice: 30, sellPrice: 40, inventoryValue: 30, unit: "قطعة", isActive: true },
  ],
  financialAccounts: [
    { legacyId: "A-1", branchCode: "MAIN", code: "CASH", name: "خزنة الرئيسي", type: "cash" as const, balance: 100, allowNegative: false, settlementDelayDays: 0, isActive: true },
    { legacyId: "A-2", branchCode: "WEST", code: "CASH", name: "خزنة الغرب", type: "cash" as const, balance: 200, allowNegative: false, settlementDelayDays: 0, isActive: true },
  ],
  cod: [
    { legacyId: "D-1", branchCode: "MAIN", carrier: "شركة الشحن", amount: 25, status: "with_carrier" as const },
  ],
});

const applyArgs = (rows = accepted()) => ({
  targetDeployment,
  confirmation,
  migrationRunId,
  fingerprint,
  cutoverDate: "2026-08-31",
  sourceSystem: "integration-test",
  accepted: rows,
});

const migrationApi = (internal as unknown as {
  migrationRehearsal: {
    apply: Parameters<ReturnType<typeof convexTest>["mutation"]>[0];
    reconcile: Parameters<ReturnType<typeof convexTest>["query"]>[0];
  };
}).migrationRehearsal;

test("migration rehearsal applies and reconciles two branch openings without COD double counting", async () => {
  const t = convexTest(schema, modules);
  const first = await t.mutation(migrationApi.apply, applyArgs());
  assert.equal(first.duplicate, false);
  assert.deepEqual(first.counts, {
    branches: 2,
    customers: 1,
    suppliers: 1,
    products: 2,
    financialAccounts: 2,
    codWithCarriers: 1,
  });

  const reconciliation = await t.query(migrationApi.reconcile, {
    targetDeployment,
    migrationRunId,
    fingerprint,
    controls: {
      stockQuantity: 3,
      inventoryValue: 50.5,
      customerReceivable: 50,
      customerAdvance: 0,
      supplierPayable: 100,
      financialAccountBalance: 300,
      codWithCarriers: 25,
    },
    expectedCounts: {
      branches: 2,
      customers: 1,
      suppliers: 1,
      products: 2,
      financialAccounts: 2,
      codWithCarriers: 1,
    },
    expectedProductBindings: [
      { sku: "SKU-MAIN", branchCode: "MAIN" },
      { sku: "SKU-WEST", branchCode: "WEST" },
    ],
  });
  assert.equal(reconciliation.passed, true);
  assert.deepEqual(reconciliation.differences, []);
  assert.equal(reconciliation.actual.financialAccountBalance, 300);
  assert.equal(reconciliation.actual.codWithCarriers, 25);

  const state = await t.run(async (ctx) => {
    const branches = await ctx.db.query("branches").collect();
    const branchCodes = new Map(branches.map((branch) => [String(branch._id), branch.code]));
    const products = await ctx.db.query("products").collect();
    return {
      productBindings: products.map((product) => `${product.sku}|${product.branchId ? branchCodes.get(String(product.branchId)) : "MISSING"}`).sort(),
      supplierBalance: (await ctx.db.query("supplierBalances").collect()).reduce((sum, row) => sum + row.balance, 0),
      generatedCodBalance: (await ctx.db.query("financialAccounts").collect()).filter((row) => row.code.startsWith("MIGCOD-")).reduce((sum, row) => sum + row.currentBalance, 0),
      financeInitialized: (await ctx.db.query("financeSettings").first())?.isInitialized,
    };
  });
  assert.deepEqual(state.productBindings, ["SKU-MAIN|MAIN", "SKU-WEST|WEST"]);
  assert.equal(state.supplierBalance, 100);
  assert.equal(state.generatedCodBalance, 25);
  assert.equal(state.financeInitialized, true);

  const duplicate = await t.mutation(migrationApi.apply, applyArgs());
  assert.equal(duplicate.duplicate, true);
});

test("migration rehearsal rolls back every write when a product branch mapping is invalid", async () => {
  const t = convexTest(schema, modules);
  const rows = accepted();
  rows.products[1].branchCode = "MISSING";
  await assert.rejects(t.mutation(migrationApi.apply, applyArgs(rows)), /Unknown product branchCode/);
  const counts = await t.run(async (ctx) => ({
    branches: (await ctx.db.query("branches").collect()).length,
    users: (await ctx.db.query("userProfiles").collect()).length,
    suppliers: (await ctx.db.query("suppliers").collect()).length,
    products: (await ctx.db.query("products").collect()).length,
    auditLogs: (await ctx.db.query("auditLogs").collect()).length,
  }));
  assert.deepEqual(counts, { branches: 0, users: 0, suppliers: 0, products: 0, auditLogs: 0 });
});
