import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { businessDate } from "../shared/businessDate.ts";

test("Cairo business date advances after local midnight while UTC is still previous day", () => {
  const instant = new Date("2026-08-14T23:14:00.000Z");
  assert.equal(instant.toISOString().slice(0, 10), "2026-08-14");
  assert.equal(businessDate(instant), "2026-08-15");
});

test("invoice creation uses the server business date and does not send a UTC-derived payment date", () => {
  const backend = readFileSync("convex/invoices.ts", "utf8");
  const frontend = readFileSync("src/components/NewInvoicePage.tsx", "utf8");
  assert.match(backend, /const transactionDate = args\.initialPayment\?\.paymentDate \?\? businessDate\(\)/);
  assert.match(backend, /const ledgerDate = transactionDate/);
  assert.match(backend, /date: transactionDate/);
  assert.doesNotMatch(frontend, /paymentDate: new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
});
