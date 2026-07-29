import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const repairs = fs.readFileSync("convex/repairs.ts", "utf8");
const bridge = fs.readFileSync(
  "convex/lib/generalLedgerRepairs.ts",
  "utf8",
);
const inventory = fs.readFileSync("convex/lib/inventory.ts", "utf8");
const rules = fs.readFileSync("shared/inventoryRules.ts", "utf8");
const schema = fs.readFileSync("convex/schema.ts", "utf8");
const integration = fs.readFileSync(
  "tests/generalLedgerRepairPartsIntegration.test.ts",
  "utf8",
);
const matrix = fs.readFileSync(
  "tests/GENERAL_LEDGER_REPAIR_PARTS_COVERAGE_MATRIX.md",
  "utf8",
);

test("repair parts guard requires 24 literal executable scenarios and rows", () => {
  assert.equal((integration.match(/^test\("RPB-[0-9]{2}/gm) ?? []).length, 24);
  assert.equal((matrix.match(/^\| RPB-[0-9]{2} /gm) ?? []).length, 24);
  assert.equal((matrix.match(/\| EXECUTABLE \|$/gm) ?? []).length, 24);
  assert.doesNotMatch(matrix, /PENDING|PLACEHOLDER/);
});

test("repair parts guard requires public create cancel picker and database assertions", () => {
  for (const marker of [
    "api.repairs.create",
    "api.repairs.updateStatus",
    "api.repairs.partPicker",
    "inventoryMovements",
    "generalLedgerAccountBalances",
    "assert.deepEqual(await snapshot(e), before)",
  ]) {
    assert.equal(integration.includes(marker), true, `missing ${marker}`);
  }
});

test("repair parts guard keeps all stock writes inside the inventory helper", () => {
  assert.match(repairs, /changeProductStock\(ctx, user/);
  assert.match(repairs, /repairPartIssue/);
  assert.match(repairs, /repairPartReversal/);
  assert.match(rules, /repair_part_issue/);
  assert.match(rules, /repair_part_reversal/);
  assert.match(inventory, /ctx\.db\.patch\(product\._id/);
  assert.doesNotMatch(repairs, /ctx\.db\.patch\(part\.productId/);
  assert.doesNotMatch(repairs, /inventoryValue\s*:/);
});

test("repair parts guard enforces revenue COGS inventory mapping and exact reversal", () => {
  for (const key of [
    '"accounts_receivable"',
    '"sales"',
    '"cogs"',
    '"inventory"',
  ]) {
    assert.match(bridge, new RegExp(key));
  }
  assert.match(bridge, /debit:\s*line\.credit/);
  assert.match(bridge, /credit:\s*line\.debit/);
  assert.match(repairs, /valueDelta:\s*part\.inventoryValueRemoved/);
  assert.doesNotMatch(bridge, /operationalPostingEnabled\s*:\s*true/);
});

test("repair parts guard requires historical schema fields fingerprint and redaction", () => {
  for (const marker of [
    "productId: v.optional(v.id(\"products\"))",
    "historicalUnitCost: v.optional(v.number())",
    "inventoryValueRemoved: v.optional(v.number())",
    "partsCogsTotal: v.optional(v.number())",
    "creationFingerprint: v.optional(v.string())",
  ]) {
    assert.match(schema, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(repairs, /creationFingerprint === creationFingerprint/);
  assert.match(repairs, /partsCogsTotal:\s*_partsCogsTotal/);
  assert.match(repairs, /inventoryValueRemoved:\s*_inventoryValueRemoved/);
});

test("repair parts guard requires indexed branch picker with a strict allowlist", () => {
  assert.match(schema, /\.index\("by_branch", \["branchId"\]\)/);
  assert.match(repairs, /\.withIndex\("by_branch"/);
  for (const key of ["_id", "name", "sku", "stock", "unit", "sellPrice"]) {
    assert.match(repairs, new RegExp(`\\b${key}\\b`));
  }
  assert.doesNotMatch(
    repairs.slice(
      repairs.indexOf("export const partPicker"),
      repairs.indexOf("export const getByTracking"),
    ),
    /costPrice|inventoryValue/,
  );
});

test("repair parts guard forbids placeholders destructive writes and unsafe escapes", () => {
  for (const source of [repairs, bridge, integration]) {
    assert.doesNotMatch(source, /as any|@ts-ignore/);
  }
  assert.doesNotMatch(repairs + bridge, /ctx\.db\.delete/);
  assert.doesNotMatch(
    repairs + bridge,
    /insert\("payments"|patch\([^)]*payments/,
  );
  assert.doesNotMatch(
    integration,
    /exercise\(|Placeholder|case-[0-9]+|forEach\(.*test|map\(.*test/,
  );
});
