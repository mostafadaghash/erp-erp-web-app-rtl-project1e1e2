import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const customerLedgerBackend = await readFile("convex/customerLedger.ts", "utf8");
const customerLedgerPage = await readFile("src/components/CustomerLedgerPage.tsx", "utf8");
const customersPage = await readFile("src/components/CustomersPage.tsx", "utf8");
const suppliersPage = await readFile("src/components/SuppliersPage.tsx", "utf8");

test("CSF-01 disabled customers remain available to the historical ledger", () => {
  const optionsBlock = customerLedgerBackend.slice(
    customerLedgerBackend.indexOf("export const customerOptions"),
    customerLedgerBackend.indexOf("export const ledger"),
  );
  assert.doesNotMatch(optionsBlock, /filter\(customer => customer\.isActive !== false\)/);
  assert.match(optionsBlock, /isActive:\s*customer\.isActive !== false/);
  assert.match(customersPage, /canViewLedger[\s\S]*openLedger\(customer\)/);
});

test("CSF-02 customer ledger identifies disabled customers without hiding them", () => {
  assert.match(customerLedgerPage, /customer\.isActive === false/);
  assert.ok(customerLedgerPage.includes("معطل"));
  assert.ok(customerLedgerPage.includes("لا يوجد عملاء في هذا الفرع"));
  assert.doesNotMatch(customerLedgerPage, /لا يوجد عملاء نشطون في هذا الفرع/);
});

test("CSF-03 supplier historical ledger stays available for disabled suppliers", () => {
  assert.match(suppliersPage, /canViewSupplierLedger && hasSupplierBalanceScope/);
  const ledgerButton = suppliersPage.slice(
    suppliersPage.indexOf("canViewSupplierLedger && hasSupplierBalanceScope"),
    suppliersPage.indexOf("{canSetActive"),
  );
  assert.doesNotMatch(ledgerButton, /supplier\.isActive/);
});

test("CSF-04 supplier ledger exposes invoice and reversal metadata", () => {
  assert.match(suppliersPage, /entry\.externalInvoiceNumber/);
  assert.match(suppliersPage, /entry\.reversalDate/);
  assert.match(suppliersPage, /entry\.reversalReason/);
  assert.ok(suppliersPage.includes("فاتورة المورد"));
  assert.ok(suppliersPage.includes("سبب الإلغاء"));
});

test("CSF-05 supplier search waits for the supplier list", () => {
  assert.match(suppliersPage, /disabled=\{suppliersQuery === undefined\}/);
  assert.match(suppliersPage, /title=\{suppliersQuery === undefined/);
});

test("CSF-06 final UAT hardening preserves typed source", () => {
  for (const source of [customerLedgerBackend, customerLedgerPage, suppliersPage]) {
    assert.doesNotMatch(source, /as any|@ts-ignore/);
  }
});
