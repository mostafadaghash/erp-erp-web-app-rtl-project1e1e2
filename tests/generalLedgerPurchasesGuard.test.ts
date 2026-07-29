import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const shipments = readFileSync("convex/shipments.ts", "utf8");
const returns = readFileSync("convex/purchaseReturns.ts", "utf8");
const bridge = readFileSync("convex/lib/generalLedgerPurchases.ts", "utf8");
const schema = readFileSync("convex/schema.ts", "utf8");
const tests = readFileSync(
  "tests/generalLedgerPurchasesIntegration.test.ts",
  "utf8",
);
const matrix = readFileSync(
  "tests/GENERAL_LEDGER_PURCHASES_COVERAGE_MATRIX.md",
  "utf8",
);

test("purchase GL guard requires 28 literal executable scenarios and matrix rows", () => {
  const names = [...tests.matchAll(/test\("(PIB-\d{2})/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(
    names,
    Array.from(
      { length: 28 },
      (_, index) => `PIB-${String(index + 1).padStart(2, "0")}`,
    ),
  );
  const rows = [...matrix.matchAll(/^\| (PIB-\d{2}) \|.*\| EXECUTABLE \|$/gm)];
  assert.equal(rows.length, 28);
  assert.equal(matrix.includes("PENDING"), false);
});

test("purchase GL guard requires real purchase public mutations and database evidence", () => {
  for (const api of [
    "api.shipments.receive",
    "api.purchaseReturns.create",
    "api.purchaseReturns.reverse",
    "api.supplierPayments.create",
  ]) {
    assert.ok(tests.includes(api), api);
  }
  for (const table of [
    "purchaseReceipts",
    "purchaseReturns",
    "inventoryMovements",
    "supplierBalances",
    "supplierLedgerEntries",
    "financialTransactions",
    "journalEntries",
    "journalLines",
    "generalLedgerAccountBalances",
    "payments",
  ]) {
    assert.ok(tests.includes(`"${table}"`), table);
  }
  assert.match(tests, /assert\.rejects/);
  assert.match(tests, /assert\.deepEqual/);
});

test("purchase GL guard keeps posting inside receipt return and reversal mutations", () => {
  assert.match(shipments, /postPurchaseReceiptJournal\(ctx, user,/);
  assert.match(returns, /postPurchaseReturnJournal\(ctx,\s*user,/);
  assert.match(returns, /reversePurchaseReturnJournal\(ctx,\s*user,/);
  assert.match(bridge, /postJournal\(ctx, user,/);
  assert.match(
    bridge,
    /if \(!settings\?\.operationalPostingEnabled\) return null/,
  );
  assert.match(bridge, /if \(!settings\.financialPostingEnabled\)/);
  assert.equal(/operationalPostingEnabled\s*:\s*true/.test(shipments), false);
  assert.equal(/operationalPostingEnabled\s*:\s*true/.test(returns), false);
  assert.equal(/operationalPostingEnabled\s*:\s*true/.test(bridge), false);
});

test("purchase GL guard enforces liability valuation and cash-boundary mappings", () => {
  for (const key of [
    "inventory",
    "accounts_payable",
    "other_liabilities",
    "other_revenue",
    "other_expenses",
  ]) {
    assert.ok(bridge.includes(`"${key}"`), key);
  }
  assert.match(bridge, /landedCents !== payableCents \+ externalFreightCents/);
  assert.match(bridge, /differenceCents = creditCents - inventoryCents/);
  assert.equal(bridge.includes("cashRefund"), false);
  assert.match(bridge, /originalLines\.map/);
  assert.match(bridge, /sourceType: "operational_reversal"/);
});

test("purchase GL guard requires schema links and public DTO redaction evidence", () => {
  const receiptSchema = schema.slice(
    schema.indexOf("purchaseReceipts: defineTable"),
    schema.indexOf("purchaseReturns: defineTable"),
  );
  const returnSchema = schema.slice(
    schema.indexOf("purchaseReturns: defineTable"),
    schema.indexOf("// الفئات"),
  );
  assert.match(
    receiptSchema,
    /journalEntryId:\s*v\.optional\(v\.id\("journalEntries"\)\)/,
  );
  assert.match(
    returnSchema,
    /journalEntryId:\s*v\.optional\(v\.id\("journalEntries"\)\)/,
  );
  assert.match(
    returnSchema,
    /reversalJournalEntryId:\s*v\.optional\(v\.id\("journalEntries"\)\)/,
  );
  assert.match(tests, /public purchase return DTOs redact journal/);
  assert.match(tests, /"journalEntryId" in list\.page\[0\]/);
  assert.equal(
    /journalEntryId/.test(returns.match(/const dto[\s\S]*?;\n/)?.[0] ?? ""),
    false,
  );
});

test("purchase GL guard forbids destructive legacy writes and generated placeholders", () => {
  const changed = [shipments, returns, bridge].join("\n");
  assert.equal(/ctx\.db\.delete/.test(changed), false);
  assert.equal(/insert\("payments"|patch\([^)]*payments/.test(changed), false);
  assert.equal(/\bas any\b|@ts-ign[o]re/.test(changed), false);
  assert.equal(
    /exercise\(|Placeholder|case-\d+|forEach\(.*test|map\(.*test/.test(tests),
    false,
  );
});
