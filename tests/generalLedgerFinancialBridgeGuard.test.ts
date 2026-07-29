import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const integration = readFileSync(
  "tests/generalLedgerFoundationIntegration.test.ts",
  "utf8",
);
const matrix = readFileSync(
  "tests/GENERAL_LEDGER_FINANCIAL_BRIDGE_COVERAGE_MATRIX.md",
  "utf8",
);
const api = readFileSync("convex/generalLedger.ts", "utf8");
const finance = readFileSync("convex/lib/finance.ts", "utf8");
const bridge = readFileSync("convex/lib/generalLedgerOperations.ts", "utf8");
const schema = readFileSync("convex/schema.ts", "utf8");
const page = readFileSync("src/components/GeneralLedgerPage.tsx", "utf8");

test("financial bridge guard requires 28 literal executable cases and matrix rows", () => {
  const names = integration.match(/^test\("FGB-\d{2}/gm) ?? [];
  const rows = matrix.match(/^\| FGB-\d{2} .* \| EXECUTABLE \|$/gm) ?? [];
  assert.equal(names.length, 28);
  assert.equal(rows.length, 28);
  assert.deepEqual(
    names.map((name) => name.match(/FGB-\d{2}/)?.[0]),
    Array.from(
      { length: 28 },
      (_, index) => `FGB-${String(index + 1).padStart(2, "0")}`,
    ),
  );
  assert.doesNotMatch(matrix, /PENDING|PLACEHOLDER/);
});

test("financial bridge guard requires schema links fingerprints and one-way activation", () => {
  assert.match(schema, /financialPostingEnabled:v\.optional\(v\.boolean\(\)\)/);
  assert.match(schema, /v\.literal\("financial"\)/);
  assert.match(schema, /v\.literal\("financial_reversal"\)/);
  assert.match(schema, /requestFingerprint: v\.optional\(v\.string\(\)\)/);
  assert.match(
    schema,
    /index\("by_financial_transaction",\["financialTransactionId"\]\)/,
  );
  assert.match(api, /enableFinancialPosting/);
  assert.doesNotMatch(
    api,
    /disableFinancialPosting|operationalPostingEnabled:true/,
  );
});

test("financial bridge guard keeps posting inside the central finance mutation", () => {
  const movements = finance.indexOf('ctx.db.insert("financialMovements"');
  const posting = finance.indexOf(
    "postFinancialTransactionJournal(ctx, user, transactionId)",
  );
  const audit = finance.indexOf('ctx.db.insert("auditLogs"');
  assert.ok(movements >= 0 && movements < posting && posting < audit);
  assert.match(finance, /requestFingerprint/);
  assert.match(finance, /معرف الطلب مستخدم بحركة مالية مختلفة/);
  assert.doesNotMatch(
    finance + bridge,
    /db\.(?:insert|patch)\("payments"|ctx\.db\.delete/,
  );
});

test("financial bridge guard enforces mappings cutover reconciliation and reversals", () => {
  for (const key of [
    "cash",
    "banks",
    "wallets",
    "cod_receivable",
    "accounts_receivable",
    "accounts_payable",
    "other_liabilities",
    "sales_returns",
    "general_operating_expenses",
    "shipping_fees",
    "opening_equity",
  ])
    assert.match(bridge, new RegExp(`"${key}"`));
  assert.match(bridge, /financialPostingReadiness/);
  assert.match(bridge, /financialPostingCutoverDate/);
  assert.match(bridge, /by_financial_transaction/);
  assert.match(bridge, /sourceType: "financial_reversal"/);
  assert.match(bridge, /التحويلات بين الفروع/);
});

test("financial bridge guard protects the activation UI and stable request ID", () => {
  assert.match(page, /financialPostingReadinessStatus/);
  assert.match(page, /enableFinancialPosting/);
  assert.match(page, /financialPostingRequestId\.current/);
  assert.match(page, /!financialReadiness\?\.ready/);
  assert.match(page, /ربط الخزائن والبنوك والمحافظ وCOD/);
  assert.doesNotMatch(
    page,
    /\bas\s+any\b|@ts-ign[o]re|window\.prompt|window\.confirm/,
  );
});

test("financial bridge guard preserves full operational posting boundary", () => {
  assert.match(api, /operationalPostingEnabled:false/);
  assert.match(integration, /status\.operationalPostingEnabled,false/);
  assert.match(integration, /state\.payments\.length,0/);
  assert.doesNotMatch(
    bridge,
    /inventoryMovements|customerLedgerEntries|supplierLedgerEntries/,
  );
});
