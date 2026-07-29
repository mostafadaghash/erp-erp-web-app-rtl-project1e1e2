import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const repairs = fs.readFileSync("convex/repairs.ts", "utf8");
const bridge = fs.readFileSync(
  "convex/lib/generalLedgerRepairs.ts",
  "utf8",
);
const schema = fs.readFileSync("convex/schema.ts", "utf8");
const integration = fs.readFileSync(
  "tests/generalLedgerRepairsIntegration.test.ts",
  "utf8",
);
const matrix = fs.readFileSync(
  "tests/GENERAL_LEDGER_REPAIRS_COVERAGE_MATRIX.md",
  "utf8",
);

test("repair GL guard requires 24 literal executable scenarios and rows", () => {
  assert.equal((integration.match(/^test\("RIB-[0-9]{2}/gm) ?? []).length, 24);
  assert.equal((matrix.match(/^\| RIB-[0-9]{2} /gm) ?? []).length, 24);
  assert.equal((matrix.match(/\| EXECUTABLE \|$/gm) ?? []).length, 24);
  assert.doesNotMatch(matrix, /PENDING|PLACEHOLDER/);
});

test("repair GL guard requires real public document mutations", () => {
  for (const apiName of [
    "api.repairs.create",
    "api.repairs.recordPayment",
    "api.repairs.refundPayment",
    "api.repairs.updateStatus",
  ]) {
    assert.match(integration, new RegExp(apiName.replaceAll(".", "\\.")));
  }
  assert.match(integration, /assert\.deepEqual\(await snapshot\(e\), before\)/);
});

test("repair GL guard keeps revenue and reversal inside repair mutations", () => {
  assert.match(repairs, /postRepairRevenueJournal\(ctx, user/);
  assert.match(repairs, /reverseRepairRevenueJournal\(ctx, user/);
  assert.match(repairs, /postFinancialTransaction\(ctx, user/);
  assert.match(repairs, /postCustomerLedgerEntry\(ctx, user/);
  assert.doesNotMatch(bridge, /operationalPostingEnabled\s*:\s*true/);
});

test("repair GL guard enforces accounting mappings and exact reversal", () => {
  assert.match(bridge, /"accounts_receivable"/);
  assert.match(bridge, /"sales"/);
  assert.match(bridge, /debit:\s*line\.credit/);
  assert.match(bridge, /credit:\s*line\.debit/);
  assert.match(bridge, /sourceType:\s*"operational_reversal"/);
  assert.match(bridge, /financialPostingEnabled/);
});

test("repair GL guard requires schema links and DTO redaction", () => {
  assert.match(schema, /journalEntryId:\s*v\.optional\(v\.id\("journalEntries"\)\)/);
  assert.match(
    schema,
    /cancellationJournalEntryId:\s*v\.optional\(v\.id\("journalEntries"\)\)/,
  );
  assert.match(repairs, /function publicRepair/);
  assert.match(repairs, /cancellationFingerprint/);
});

test("repair GL guard forbids legacy destructive and unsafe shortcuts", () => {
  for (const source of [repairs, bridge, integration]) {
    assert.doesNotMatch(source, /as any|@ts-ignore/);
  }
  assert.doesNotMatch(repairs + bridge, /ctx\.db\.delete/);
  assert.doesNotMatch(repairs + bridge, /insert\("payments"|patch\([^)]*payments/);
  assert.doesNotMatch(integration, /exercise\(|forEach\(.*test|map\(.*test/);
});
