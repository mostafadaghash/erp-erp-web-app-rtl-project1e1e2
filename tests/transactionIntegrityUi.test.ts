import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("transaction integrity mutations are wired into their pages", () => {
  assert.match(source("src/components/InvoicesPage.tsx"), /useMutation\(api\.invoices\.cancel\)/);
  assert.match(source("src/components/ExpensesPage.tsx"), /useMutation\(api\.expenses\.void\)/);
  assert.match(source("src/components/CustomersPage.tsx"), /useMutation\(api\.customers\.setActive\)/);
  assert.match(source("src/components/SuppliersPage.tsx"), /useMutation\(api\.suppliers\.setActive\)/);
});

test("repair UI follows the typed backend status contract", () => {
  const repairs = source("src/components/RepairsPage.tsx");
  assert.doesNotMatch(repairs, /deliveredDate/);
  assert.match(repairs, /REPAIR_TRANSITIONS\[currentStatus\]\.map/);
  assert.match(repairs, /applyStatus\(cancelTarget\._id, "cancelled", cancelReason\.trim\(\)\)/);
  assert.match(repairs, /r\.status !== "delivered" && r\.status !== "cancelled"/);
  assert.doesNotMatch(repairs, /status: string/);
});

test("document counters use indexed collision checks without full-table reads on the counter path", () => {
  const counters = source("convex/lib/documentNumbers.ts");
  for (const index of ["by_invoice_number", "by_order_number", "by_shipment_number", "by_repair_number", "by_delivery_number"]) {
    assert.match(counters, new RegExp(`withIndex\\("${index}"`));
  }
  assert.match(counters, /const numbers = counter \? \[\] : await legacyNumbersForYear/);
  assert.match(counters, /while \(await documentNumberExists/);
  assert.doesNotMatch(counters, /query\("(?:invoices|orders|shipments|repairs|deliveries)"\)\.collect\(\)/);
});
