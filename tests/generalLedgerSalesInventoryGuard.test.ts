import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const invoices = readFileSync("convex/invoices.ts", "utf8");
const returns = readFileSync("convex/salesReturns.ts", "utf8");
const bridge = readFileSync("convex/lib/generalLedgerSales.ts", "utf8");
const gl = readFileSync("convex/lib/generalLedger.ts", "utf8");
const schema = readFileSync("convex/schema.ts", "utf8");
const tests = readFileSync(
  "tests/generalLedgerSalesInventoryIntegration.test.ts",
  "utf8",
);
const matrix = readFileSync(
  "tests/GENERAL_LEDGER_SALES_INVENTORY_COVERAGE_MATRIX.md",
  "utf8",
);

test("sales inventory guard requires 28 literal executable cases and matrix rows", () => {
  const names = [...tests.matchAll(/test\("(SIB-\d{2})/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(
    names,
    Array.from({ length: 28 }, (_, index) =>
      `SIB-${String(index + 1).padStart(2, "0")}`,
    ),
  );
  const rows = [...matrix.matchAll(/^\| (SIB-\d{2}) \|.*\| EXECUTABLE \|$/gm)];
  assert.equal(rows.length, 28);
  assert.equal(matrix.includes("PENDING"), false);
});

test("sales inventory guard requires public document mutations and runtime assertions", () => {
  for (const api of [
    "api.invoices.create",
    "api.invoices.update",
    "api.invoices.cancel",
    "api.salesReturns.create",
    "api.salesReturns.reverse",
  ]) {
    assert.ok(tests.includes(api), api);
  }
  assert.match(tests, /journalEntries/);
  assert.match(tests, /journalLines/);
  assert.match(tests, /inventoryMovements/);
  assert.match(tests, /customerLedgerEntries/);
  assert.match(tests, /financialTransactions/);
  assert.match(tests, /assert\.rejects/);
  assert.match(tests, /assert\.deepEqual/);
});

test("sales inventory guard keeps all posting inside document mutations", () => {
  assert.match(invoices, /postSalesInventoryJournal\(ctx, user,/);
  assert.match(returns, /postSalesInventoryJournal\(ctx, user,/);
  assert.match(bridge, /postJournal\(ctx, user,/);
  assert.match(bridge, /if \(!settings\?\.operationalPostingEnabled\) return null/);
  assert.match(bridge, /if \(!settings\.financialPostingEnabled\)/);
  assert.equal(/operationalPostingEnabled\s*:\s*true/.test(invoices), false);
  assert.equal(/operationalPostingEnabled\s*:\s*true/.test(returns), false);
  assert.equal(/operationalPostingEnabled\s*:\s*true/.test(bridge), false);
});

test("sales inventory guard enforces the accounting mappings and cash boundary", () => {
  for (const key of [
    "accounts_receivable",
    "sales",
    "sales_returns",
    "inventory",
    "cogs",
  ]) {
    assert.ok(bridge.includes(`"${key}"`), key);
  }
  assert.match(bridge, /debtReduction/);
  assert.equal(bridge.includes("cashRefund"), false);
  assert.match(bridge, /sales_return_reversal/);
  assert.match(bridge, /originalEntryId/);
});

test("sales inventory guard requires schema links sources and DTO redaction", () => {
  assert.match(schema, /v\.literal\("operational"\)/);
  assert.match(schema, /v\.literal\("operational_reversal"\)/);
  assert.match(schema, /journalEntryId:\s*v\.optional\(v\.id\("journalEntries"\)\)/);
  assert.match(schema, /reversalJournalEntryId:\s*v\.optional\(v\.id\("journalEntries"\)\)/);
  assert.match(invoices, /withoutJournalLinks/);
  assert.match(returns, /reversalJournalEntryId:\s*_reversalJournal/);
  assert.match(gl, /"operational"\|"operational_reversal"/);
});

test("sales inventory guard forbids destructive legacy or unsafe shortcuts", () => {
  const changed = [invoices, returns, bridge].join("\n");
  assert.equal(/ctx\.db\.delete/.test(changed), false);
  assert.equal(/insert\("payments"|patch\([^)]*payments/.test(changed), false);
  assert.equal(/\bas any\b|@ts-ign[o]re/.test(changed), false);
  assert.equal(
    /exercise\(|Placeholder|forEach\(.*test|map\(.*test/.test(tests),
    false,
  );
});
