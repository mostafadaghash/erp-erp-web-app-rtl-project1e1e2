import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const customers = readFileSync(
  new URL("../convex/customers.ts", import.meta.url),
  "utf8",
);
const suppliers = readFileSync(
  new URL("../convex/suppliers.ts", import.meta.url),
  "utf8",
);
const schema = readFileSync(
  new URL("../convex/schema.ts", import.meta.url),
  "utf8",
);
const rules = readFileSync(
  new URL("../shared/contactRules.ts", import.meta.url),
  "utf8",
);
const integration = readFileSync(
  new URL("./customerSupplierMasterIntegration.test.ts", import.meta.url),
  "utf8",
);
const ui = readFileSync(
  new URL("./customerSupplierUiRegression.test.ts", import.meta.url),
  "utf8",
);
const matrix = readFileSync(
  new URL("./CUSTOMER_SUPPLIER_MASTER_COVERAGE_MATRIX.md", import.meta.url),
  "utf8",
);

test("customer supplier guard requires 20 ordered executable CSM scenarios", () => {
  const names = [...integration.matchAll(/^test\("CSM-(\d{2}) /gm)].map(
    (match) => Number(match[1]),
  );
  assert.deepEqual(names, Array.from({ length: 20 }, (_, index) => index + 1));
  assert.doesNotMatch(
    integration,
    /exercise\(|Placeholder|case-\d+|\.(?:forEach|map)\([^)]*=>\s*test\(/,
  );
});

test("customer supplier coverage matrix has one executable row per scenario", () => {
  const rows = [...matrix.matchAll(/^\| CSM-(\d{2}) .*\| EXECUTABLE \|$/gm)];
  assert.equal(rows.length, 20);
  assert.deepEqual(
    rows.map((row) => Number(row[1])),
    Array.from({ length: 20 }, (_, index) => index + 1),
  );
  assert.doesNotMatch(matrix, /PENDING|PLACEHOLDER|TODO/i);
});

test("customer supplier UI regression remains independently enumerated", () => {
  assert.equal([...ui.matchAll(/^test\("CSU-(\d{2}) /gm)].length, 18);
  assert.doesNotMatch(ui, /\.(?:forEach|map)\([^)]*=>\s*test\(/);
});

test("customer and supplier phone uniqueness use dedicated indexes", () => {
  assert.match(schema, /customers:[\s\S]*index\("by_branch_phone", \["branchId", "phone"\]\)/);
  assert.match(schema, /suppliers:[\s\S]*index\("by_phone", \["phone"\]\)/);
  assert.match(customers, /withIndex\("by_branch_phone"/);
  assert.match(suppliers, /withIndex\("by_phone"/);
});

test("customer branch list is indexed and legacy financial fields stay redacted", () => {
  assert.match(customers, /query\("customers"\)[\s\S]{0,100}withIndex\("by_branch"/);
  assert.match(customers, /balance: _legacyBalance/);
  assert.match(customers, /totalPurchases: _legacyPurchases/);
});

test("supplier ledger paginates and maps an explicit safe item DTO", () => {
  assert.match(suppliers, /\.paginate\(args\.paginationOpts\)/);
  assert.match(suppliers, /page: page\.page\.map\(\(entry\) => \(\{/);
  for (const forbidden of [
    "idempotencyKey: entry",
    "userId: entry",
    "referenceId: entry",
    "reversalEntryId: entry",
    "originalEntryId: entry",
  ]) {
    assert.doesNotMatch(suppliers, new RegExp(forbidden));
  }
});

test("activation permissions align between backend and UI contract", () => {
  assert.match(customers, /requirePermission\(ctx, "delete_customers"\)/);
  assert.match(suppliers, /"delete_suppliers"/);
  assert.doesNotMatch(customers, /setActive[\s\S]{0,220}"edit_customers"/);
  assert.doesNotMatch(suppliers, /setActive[\s\S]{0,220}"edit_suppliers"/);
});

test("contact normalization is centralized and master-data paths stay safe", () => {
  for (const symbol of [
    "normalizeContactName",
    "normalizeContactPhone",
    "normalizeContactEmail",
    "normalizeOptionalContactText",
  ]) {
    assert.match(rules, new RegExp(`export function ${symbol}`));
    assert.match(`${customers}\n${suppliers}`, new RegExp(symbol));
  }
  for (const source of [customers, suppliers, rules]) {
    assert.doesNotMatch(
      source,
      /ctx\.db\.delete|insert\("payments"|patch\([^)]*payments|@ts-ignore|as any/,
    );
  }
});
