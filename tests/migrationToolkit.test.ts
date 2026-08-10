import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import {
  normalizePhone,
  prepareMigration,
} from "../scripts/migration/lib.mjs";

const validInput = () => ({
  schemaVersion: 1,
  sourceSystem: "legacy-test",
  cutoverDate: "2026-08-31",
  branches: [
    { legacyId: "b1", code: " main ", name: " الفرع   الرئيسي ", address: "Cairo" },
  ],
  customers: [
    { legacyId: "c1", branchCode: "main", name: "عميل", phone: "+20 100-000-0001", receivableBalance: 50, advanceBalance: 0 },
  ],
  suppliers: [
    { legacyId: "s1", name: "مورد", phone: "01000000002", balances: [{ branchCode: "main", balance: 80 }] },
  ],
  products: [
    { legacyId: "p1", sku: " abc-1 ", name: "منتج", supplierLegacyId: "s1", stock: 2, minStock: 0, costPrice: 10.25, sellPrice: 15 },
  ],
  financialAccounts: [
    { legacyId: "a1", branchCode: "main", code: " cash ", name: "الخزنة", type: "cash", balance: 100, allowNegative: false, settlementDelayDays: 0 },
  ],
  cod: [
    { legacyId: "d1", branchCode: "main", carrier: "Carrier", amount: 25, status: "with_carrier" },
  ],
  controlTotals: {
    stockQuantity: 2,
    inventoryValue: 20.5,
    customerReceivable: 50,
    customerAdvance: 0,
    supplierPayable: 80,
    financialAccountBalance: 100,
    codWithCarriers: 25,
  },
});

test("migration normalization is deterministic and rerunnable", () => {
  const first = prepareMigration(validInput());
  const second = prepareMigration(validInput());
  assert.equal(first.manifest.fingerprint, second.manifest.fingerprint);
  assert.equal(first.manifest.migrationRunId, second.manifest.migrationRunId);
  assert.equal(first.manifest.mode, "dry-run");
  assert.equal(first.applyPlan.writeEnabled, false);
  assert.equal(first.rejected.length, 0);
  assert.equal(first.manifest.reconciliationPassed, true);
  assert.equal(first.accepted.branches[0].code, "MAIN");
  assert.equal(first.accepted.products[0].sku, "ABC-1");
  assert.equal(first.accepted.products[0].inventoryValue, 20.5);
});

test("Egypt phone normalization accepts Arabic/Persian digits and country code", () => {
  assert.equal(normalizePhone("+20 ١٠٠ ١٢٣ ٤٥٦٧"), "01001234567");
  assert.equal(normalizePhone("0020-100-123-4567"), "01001234567");
  assert.equal(normalizePhone("۲۰ ۱۰۰ ۱۲۳ ۴۵۶۷"), "01001234567");
});

test("unknown branch and duplicate customer branch-phone are rejected", () => {
  const input = validInput();
  input.customers.push({
    legacyId: "c2",
    branchCode: "main",
    name: "عميل 2",
    phone: "01000000001",
    receivableBalance: 0,
    advanceBalance: 0,
  });
  input.financialAccounts.push({
    legacyId: "a2",
    branchCode: "missing",
    code: "bank",
    name: "Bank",
    type: "bank",
    balance: 0,
    allowNegative: false,
    settlementDelayDays: 0,
  });
  const result = prepareMigration(input);
  assert.ok(result.rejected.some((row) => row.entity === "customers" && row.errors.some((error) => error.includes("duplicate branch phone"))));
  assert.ok(result.rejected.some((row) => row.entity === "financialAccounts" && row.errors.some((error) => error.includes("unknown branchCode"))));
});

test("opening balance invariants reject contradictory customer and unsafe account balances", () => {
  const input = validInput();
  input.customers[0].receivableBalance = 50;
  input.customers[0].advanceBalance = 10;
  input.financialAccounts[0].balance = -1;
  input.financialAccounts[0].allowNegative = false;
  const result = prepareMigration(input);
  assert.ok(result.rejected.some((row) => row.entity === "customers" && row.errors.some((error) => error.includes("simultaneously"))));
  assert.ok(result.rejected.some((row) => row.entity === "financialAccounts" && row.errors.some((error) => error.includes("allowNegative=true"))));
});

test("reconciliation reports differences instead of hiding them", () => {
  const input = validInput();
  input.controlTotals.inventoryValue = 999;
  const result = prepareMigration(input);
  const inventory = result.reconciliation.find((row) => row.metric === "inventoryValue");
  assert.equal(inventory?.status, "difference");
  assert.equal(inventory?.actual, 20.5);
  assert.equal(result.manifest.reconciliationPassed, false);
});

test("migration example is itself acceptance-clean", async () => {
  const example = JSON.parse(await readFile("migration/example.input.json", "utf8"));
  const result = prepareMigration(example);
  assert.equal(result.rejected.length, 0);
  assert.equal(result.manifest.reconciliationPassed, true);
  assert.equal(result.applyPlan.steps.length, 8);
});

test("migration CLI source has no Convex write/import primitives", async () => {
  const source = await readFile("scripts/migration/prepare.mjs", "utf8");
  for (const forbidden of ["ConvexHttpClient", "ctx.db.insert", "ctx.db.patch", "convex import", "npx convex run"]) {
    assert.equal(source.includes(forbidden), false, `dry-run CLI must not contain ${forbidden}`);
  }
  assert.match(source, /No application data was written/);
});

test("migration CLI produces and verifies a complete dry-run package", async () => {
  const dir = await mkdtemp(join(tmpdir(), "erp-migration-"));
  try {
    const prepare = spawnSync(process.execPath, [
      "scripts/migration/prepare.mjs",
      "--input", "migration/example.input.json",
      "--output", dir,
      "--fail-on-rejects",
      "--fail-on-differences",
    ], { encoding: "utf8" });
    assert.equal(prepare.status, 0, prepare.stderr);
    assert.match(prepare.stdout, /No application data was written/);

    const verify = spawnSync(process.execPath, ["scripts/migration/verify-package.mjs", dir], { encoding: "utf8" });
    assert.equal(verify.status, 0, verify.stderr);
    assert.match(verify.stdout, /writes remain disabled/);

    for (const name of ["manifest.json", "accepted.json", "rejected.json", "mapping.json", "reconciliation.json", "apply-plan.json"]) {
      const value = JSON.parse(await readFile(join(dir, name), "utf8"));
      assert.ok(value !== undefined, `${name} should be valid JSON`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
