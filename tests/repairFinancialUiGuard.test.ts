import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const page = fs.readFileSync("src/components/RepairsPage.tsx", "utf8");
const matrix = fs.readFileSync("tests/REPAIR_FINANCIAL_UI_COVERAGE_MATRIX.md", "utf8");
const regression = fs.readFileSync("tests/repairFinancialUiRegression.test.ts", "utf8");

test("repair financial UI guard requires fourteen literal scenarios and rows", () => {
  const names = [...regression.matchAll(/test\("RFU-(\d{2})/g)].map((match) => match[1]);
  const rows = [...matrix.matchAll(/^\| RFU-(\d{2}) /gm)].map((match) => match[1]);
  const expected = Array.from({ length: 14 }, (_, index) => String(index + 1).padStart(2, "0"));
  assert.deepEqual(names, expected);
  assert.deepEqual(rows, expected);
  assert.equal((matrix.match(/\| EXECUTABLE \|$/gm) ?? []).length, 14);
});

test("repair financial UI guard forbids prompt and automatic first-account selection", () => {
  assert.doesNotMatch(page, /\bprompt\(/);
  assert.doesNotMatch(page, /collectionAccounts\[0\]|refundAccounts\[0\]/);
  assert.match(page, /اختر حساب تحصيل تابعًا لفرع أمر الصيانة/);
  assert.match(page, /اختر حساب استرداد تابعًا لفرع أمر الصيانة/);
});

test("repair financial UI guard requires separate modal-gated account pickers", () => {
  assert.match(page, /canCollect && \(showForm \|\| collectionTarget\)/);
  assert.match(page, /canRefund && refundTarget/);
  assert.match(page, /targetCollectionAccounts/);
  assert.match(page, /targetRefundAccounts/);
});

test("repair financial UI guard requires stable retries and busy protection", () => {
  assert.match(page, /requestId: collectionRequestId/);
  assert.match(page, /requestId: refundRequestId/);
  assert.match(page, /if \(!collectionTarget \|\| financialBusy\) return/);
  assert.match(page, /if \(!refundTarget \|\| financialBusy\) return/);
  assert.match(page, /disabled=\{financialBusy !== null/);
});

test("repair financial UI guard preserves backend accounting ownership", () => {
  assert.doesNotMatch(page, /financialTransactions|financialMovements|customerLedgerEntries/);
  assert.doesNotMatch(page, /currentBalance\s*:|deposit\s*:\s*roundMoney|remaining\s*:\s*roundMoney/);
  assert.match(page, /useMutation\(api\.repairs\.recordPayment\)/);
  assert.match(page, /useMutation\(api\.repairs\.refundPayment\)/);
});
