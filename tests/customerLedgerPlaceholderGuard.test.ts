import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const required = new Map<string, string[]>([
  ["CL-06", ["api.invoices.create"]], ["CL-07", ["api.invoices.create"]],
  ["CL-08", ["api.invoices.create"]], ["CL-09", ["api.invoices.create"]],
  ["CL-10", ["api.invoices.recordPayment"]], ["CL-11", ["api.invoices.recordPayment"]],
  ["CL-12", ["api.invoices.refundPayment"]], ["CL-13", ["api.invoices.update"]],
  ["CL-14", ["api.invoices.update"]], ["CL-15", ["api.invoices.cancel"]],
  ["CL-16", ["api.salesReturns.create"]], ["CL-17", ["api.salesReturns.create"]],
  ["CL-18", ["api.salesReturns.reverse"]], ["CL-19", ["api.orders.create"]],
  ["CL-20", ["api.orders.addPayment"]], ["CL-21", ["api.orders.refundDeposit"]],
  ["CL-22", ["api.orders.create", "api.orders.addPayment"]],
  ["CL-23", ["api.repairs.create"]], ["CL-24", ["api.repairs.create"]],
  ["CL-25", ["api.repairs.recordPayment"]], ["CL-26", ["api.repairs.refundPayment"]],
  ["CL-27", ["api.repairs.updateStatus"]],
  ["CL-28", ["api.repairs.refundPayment", "api.repairs.updateStatus"]],
]);

test("customer-ledger document scenarios cannot regress to placeholders", async () => {
  const source = await readFile(new URL("./customerLedgerIntegration.test.ts", import.meta.url), "utf8");
  for (const [id, calls] of required) {
    const start = source.indexOf(`test("${id}`);
    assert.ok(start >= 0, `${id} is missing`);
    const next = source.indexOf("\ntest(\"", start + 1);
    const body = source.slice(start, next < 0 ? source.length : next);
    for (const call of calls) assert.ok(body.includes(call), `${id} must call ${call}`);
    assert.equal(body.includes("initializeOpeningBalance"), false, `${id} must use its document API, not an opening balance`);
    assert.ok(body.includes("mutation("), `${id} must execute a Convex mutation`);
    assert.match(body, /assert\.(?:deepEqual|equal|ok|rejects)/, `${id} must assert an observed result`);
    assert.ok(body.length > 250, `${id} test body is suspiciously empty`);
    assert.equal(/assert\.(?:equal|deepEqual)\((?:true|false|\d+),(?:true|false|\d+)\)/.test(body), false, `${id} only asserts constants`);
  }
});

test("coverage matrix keeps forty distinct, non-boilerplate scenario outcomes", async () => {
  const matrix = await readFile(new URL("./CUSTOMER_LEDGER_COVERAGE_MATRIX.md", import.meta.url), "utf8");
  const rows = matrix.split("\n").filter(line => /^\| CL-\d{2} \|/.test(line));
  assert.equal(rows.length, 40);
  assert.equal(new Set(rows).size, 40);
  assert.equal(matrix.includes("document, balances, ledger and side effects reconcile"), false);
  const outcomes = rows.map(row => row.split("|")[5]?.trim());
  assert.equal(new Set(outcomes).size, 40, "every scenario needs a unique numeric outcome");
});
