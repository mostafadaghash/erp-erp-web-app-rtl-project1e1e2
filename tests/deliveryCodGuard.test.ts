import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

function testBody(source: string, id: string) {
  const start = source.indexOf(`test("${id}`);
  assert.notEqual(start, -1, `missing ${id}`);
  const arrow = source.indexOf("=>", start);
  const brace = source.indexOf("{", arrow);
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}" && --depth === 0) return source.slice(brace, index + 1);
  }
  assert.fail(`unterminated ${id}`);
}

test("delivery COD acceptance guard", async () => {
  const source = await readFile("tests/deliveryCodIntegration.test.ts", "utf8");
  const matrix = await readFile("tests/DELIVERY_COD_COVERAGE_MATRIX.md", "utf8");
  const deliveriesSource = await readFile("convex/deliveries.ts", "utf8");
  const matches = [...source.matchAll(/^test\("COD-(\d{2})[^\n]+/gm)];
  assert.equal(matches.length, 56);
  assert.deepEqual(matches.map(match => match[1]), Array.from({ length: 56 }, (_, index) => String(index + 1).padStart(2, "0")));
  const rows = matrix.split("\n").filter(line => /^\| COD-\d{2} /.test(line));
  assert.equal(rows.length, 56);
  assert.equal(rows.filter(line => line.includes("| EXECUTABLE |")).length, 36);
  assert.equal(rows.filter(line => line.includes("| PENDING |")).length, 20);
  for (let number = 1; number <= 56; number += 1) {
    const row = rows.find(line => line.startsWith(`| COD-${String(number).padStart(2, "0")} `));
    assert.ok(row);
    assert.match(row, number <= 36 ? /\| EXECUTABLE \|/ : /\| PENDING \|/);
  }
  for (let number = 1; number <= 36; number += 1) {
    const id = `COD-${String(number).padStart(2, "0")}`;
    const body = testBody(source, id);
    if (number <= 24 || (number >= 25 && number !== 33)) assert.match(body, /api\.deliveries\.createFromOrderInvoice/, `${id} must call createFromOrderInvoice in its test body`);
    if (number >= 13 && number <= 24) assert.match(body, /api\.deliveries\.updateStatus/, `${id} must call updateStatus in its test body`);
    if (number >= 14 && number <= 24) assert.match(body, /api\.deliveries\.confirmDelivered/, `${id} must call confirmDelivered in its test body`);
    assert.doesNotMatch(body, /api\.deliveries\.getStats[\s\S]*api\.deliveries\.get/);
  }
  assert.match(testBody(source, "COD-19"), /confirmDelivered[\s\S]*confirmDelivered[\s\S]*assert\.equal\(second,first\)[\s\S]*confirmations\.length/);
  assert.match(testBody(source, "COD-20"), /beforeSnapshot[\s\S]*assert\.rejects[\s\S]*afterSnapshot[\s\S]*deepEqual/);
  assert.match(testBody(source, "COD-21"), /accountActive:false[\s\S]*assert\.rejects/);
  assert.match(testBody(source, "COD-22"), /accountType:"(?:cash|bank)"[\s\S]*assert\.rejects/);
  assert.match(testBody(source, "COD-23"), /otherBranchId[\s\S]*assert\.rejects[\s\S]*codClearingAccountId:e\.accountId/);
  assert.match(testBody(source, "COD-24"), /cutoffDate="2026-07-10"[\s\S]*assert\.rejects[\s\S]*2026-07-09[\s\S]*2026-07-10/);
  const required: Record<string, RegExp> = {
    "COD-25": /(?=[\s\S]*createFromOrderInvoice)(?=[\s\S]*updateStatus)(?=[\s\S]*confirmDelivered)(?=[\s\S]*assert\.rejects)/,
    "COD-26": /createFromOrderInvoice[\s\S]*updateStatus[\s\S]*returned/, "COD-27": /(?=[\s\S]*confirmDelivered)(?=[\s\S]*updateStatus)(?=[\s\S]*returned)(?=[\s\S]*assert\.rejects)/,
    "COD-28": /updateStatus[\s\S]*cancelled[\s\S]*reason/, "COD-29": /(?=[\s\S]*manager)(?=[\s\S]*shipping)(?=[\s\S]*otherBranchId)(?=[\s\S]*تأكيد Manager)(?=[\s\S]*تأكيد Shipping)(?=[\s\S]*confirmDelivered)(?=[\s\S]*listPaginated)(?=[\s\S]*accountPicker)(?=[\s\S]*assert\.rejects)/, "COD-30": /(?=[\s\S]*admin)(?=[\s\S]*accountant)(?=[\s\S]*otherBranchId)(?=[\s\S]*Cash branch one)(?=[\s\S]*Bank branch two)(?=[\s\S]*accountPicker)(?=[\s\S]*confirmDelivered)(?=[\s\S]*assert\.rejects)(?=[\s\S]*length>0)/,
    "COD-31": /(?=[\s\S]*Shipping)(?=[\s\S]*createCodSettlement)(?=[\s\S]*assert\.rejects)/, "COD-32": /(?=[\s\S]*Viewer)(?=[\s\S]*Sales)(?=[\s\S]*assert\.rejects)/,
    "COD-33": /(?=[\s\S]*active COD)(?=[\s\S]*disabled COD)(?=[\s\S]*active cash)(?=[\s\S]*active bank)(?=[\s\S]*clearing غير مسموح)(?=[\s\S]*otherBranchId)(?=[\s\S]*allowlist)/, "COD-34": /(?=[\s\S]*34-a)(?=[\s\S]*34-b)(?=[\s\S]*34-c)(?=[\s\S]*34-x)(?=[\s\S]*34-z)(?=[\s\S]*Manager)(?=[\s\S]*Admin)(?=[\s\S]*numItems:1)(?=[\s\S]*continueCursor)(?=[\s\S]*isDone)(?=[\s\S]*seen\.includes)/,
    "COD-35": /(?=[\s\S]*printDelivery)(?=[\s\S]*by_token)(?=[\s\S]*by_user)(?=[\s\S]*مستخدم غير معروف)(?=[\s\S]*مستخدم بلا صلاحية)(?=[\s\S]*otherBranchId)(?=[\s\S]*allowlist)(?=[\s\S]*createdBy[^\n]*false)/, "COD-36": /(?=[\s\S]*createCodSettlement)(?=[\s\S]*codSettlements)(?=[\s\S]*codSettlementItems)/,
  };
  for (const [id, pattern] of Object.entries(required)) assert.match(testBody(source, id), pattern, `${id} executable evidence missing`);
  const executableRows = rows.slice(0, 36).join("\n");
  assert.doesNotMatch(executableRows, /deliveries\.getStats\s*\+\s*deliveries\.get/);
  assert.match(executableRows, /COD-08[^\n]*appliedDeposit=0[^\n]*0 customerLedgerEntries[^\n]*0 financialTransactions/);
  assert.match(executableRows, /COD-09[^\n]*paid 0→25[^\n]*remaining 100→75[^\n]*order_deposit_application[^\n]*0 financialTransactions/);
  for (const id of ["02", "03", "04", "05", "06", "07", "10", "12"]) assert.match(executableRows, new RegExp(`COD-${id}[^\\n]*(رفض|Rollback)[^\\n]*(Rollback|ثابت|لم تتغير)`));
  assert.doesNotMatch(source, /Placeholder|exercise\s*\(|case-\d+|forEach\([^\n]*test|map\([^\n]*test/);
  const printBody = deliveriesSource.slice(deliveriesSource.indexOf("export const printDelivery"));
  assert.match(printBody, /const creator=d\.createdBy/);
  assert.match(printBody, /withIndex\("by_user"/);
  assert.match(printBody, /withIndex\("by_token"/);
  assert.doesNotMatch(printBody, /query\("userProfiles"\)\.collect\(\)/);
  assert.doesNotMatch(printBody, /employeeName\s*:\s*creator/);
});
