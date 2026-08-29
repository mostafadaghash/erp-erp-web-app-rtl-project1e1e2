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
  assert.match(repairs, /await transitionStatus\(\{/);
  assert.match(repairs, /status: transitionNext/);
  assert.match(repairs, /requestId: transitionRequestId/);
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

test("initial-payment forms retain request ids on retry and block double submit", () => {
  for (const path of ["src/components/NewInvoicePage.tsx", "src/components/OrdersPage.tsx", "src/components/RepairsPage.tsx"]) {
    const page = source(path);
    assert.match(page, /creationRequestId:/);
    assert.match(page, /initial(?:Payment|Deposit):/);
    assert.match(page, /accountId:/);
    if (path !== "src/components/NewInvoicePage.tsx") assert.match(page, /paymentDate:/);
    assert.match(page, /if \(saving\) return/);
    assert.match(page, /disabled=\{[^}]*saving/);
  }
  assert.doesNotMatch(source("src/components/NewInvoicePage.tsx"), /paymentMethod:/);
  assert.doesNotMatch(source("src/components/OrdersPage.tsx"), /initialDeposit:[^\n]*paymentMethod:/);
  assert.doesNotMatch(source("src/components/RepairsPage.tsx"), /initialDeposit:[^\n]*paymentMethod:/);
});

test("collection account pickers do not expose balances", () => {
  const finance = source("convex/finance.ts");
  assert.match(finance, /collectionAccountPicker[\s\S]*?\.map\(\(\{ _id, name, type, branchId \}\)/);
  assert.doesNotMatch(finance.split("\n").find(line => line.includes("collectionAccountPicker")) ?? "", /currentBalance/);
});
