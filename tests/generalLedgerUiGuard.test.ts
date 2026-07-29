import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ui = readFileSync("src/components/GeneralLedgerPage.tsx", "utf8");
const tests = readFileSync(
  "tests/generalLedgerFoundationUiRegression.test.ts",
  "utf8",
);
const matrix = readFileSync(
  "tests/GENERAL_LEDGER_UI_COVERAGE_MATRIX.md",
  "utf8",
);

test("GL UI guard requires forty literal independent acceptance tests", () => {
  const names = [...tests.matchAll(/^test\("GLUI-(\d{2}) /gm)].map(
    (match) => match[1],
  );
  assert.deepEqual(
    names,
    Array.from({ length: 40 }, (_, index) =>
      String(index + 1).padStart(2, "0"),
    ),
  );
  assert.doesNotMatch(tests, /forEach\([^)]*test|map\([^)]*test|exercise\(/);
});

test("GL UI guard requires a complete executable coverage matrix", () => {
  const rows = [
    ...matrix.matchAll(/^\| GLUI-(\d{2}) .*\| (EXECUTABLE|PENDING) \|$/gm),
  ];
  assert.equal(rows.length, 40);
  assert.equal(rows.filter((row) => row[2] === "EXECUTABLE").length, 40);
  assert.doesNotMatch(matrix, /\| PENDING \|/);
});

test("GL UI guard requires all public UI workflows", () => {
  for (const apiName of [
    "availableBranches",
    "status",
    "chart",
    "accountPicker",
    "openingStatus",
    "initialize",
    "createAccount",
    "deactivateAccount",
    "confirmOpening",
    "postManualJournal",
    "reverseJournal",
    "createOrOpenPeriod",
    "closePeriod",
    "reopenPeriod",
    "periods",
    "entriesPaginated",
    "entryDetails",
    "entryForPrint",
    "accountLedgerPaginated",
    "trialBalance",
    "trialBalanceForPrint",
  ]) {
    assert.match(ui, new RegExp(`generalLedger\\.${apiName}\\b`), apiName);
  }
});

test("GL UI guard rejects unsafe or superficial regressions", () => {
  assert.doesNotMatch(
    ui,
    /\bas any\b|@ts-ignore|window\.prompt|window\.confirm/,
  );
  assert.doesNotMatch(ui, /__generalLedgerPrint|Placeholder|TODO/);
  assert.match(ui, /usePaginatedQuery/);
  assert.match(ui, /escapeHtml/);
  assert.match(ui, /operationalPostingEnabled/);
  assert.match(ui, /if \(busy\) return/);
});
