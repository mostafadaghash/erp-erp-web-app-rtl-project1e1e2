import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const customers = readFileSync(
  new URL("../src/components/CustomersPage.tsx", import.meta.url),
  "utf8",
);
const suppliers = readFileSync(
  new URL("../src/components/SuppliersPage.tsx", import.meta.url),
  "utf8",
);
const app = readFileSync(
  new URL("../src/components/ERPApp.tsx", import.meta.url),
  "utf8",
);
const customerLedger = readFileSync(
  new URL("../src/components/CustomerLedgerPage.tsx", import.meta.url),
  "utf8",
);

test("CSU-01 customer edit is wired to the real update mutation", () => {
  assert.match(customers, /useMutation\(api\.customers\.update\)/);
  assert.match(customers, /await updateCustomer\(\{ id: editingId, \.\.\.payload \}\)/);
});

test("CSU-02 customer modal supports create and edit with one trusted form", () => {
  assert.match(customers, /editingId \? "تعديل بيانات العميل" : "إضافة عميل جديد"/);
  assert.match(customers, /openEdit\(customer/);
  assert.match(customers, /openCreate/);
});

test("CSU-03 customer save has a busy guard and disables modal actions", () => {
  assert.match(customers, /if \(saving \|\| !form\.name\.trim\(\) \|\| !form\.phone\.trim\(\)\) return/);
  assert.match(customers, /disabled=\{saving\}/);
  assert.match(customers, /saving \? "جارٍ الحفظ\.\.\." : "حفظ"/);
});

test("CSU-04 customer activation UI uses delete_customers like the backend", () => {
  assert.match(customers, /usePermission\("delete_customers"\)/);
  assert.match(customers, /\{canSetActive && \(/);
  assert.doesNotMatch(customers, /canEdit && <button[\s\S]{0,300}handleSetActive/);
});

test("CSU-05 customer list waits for the user and supplies branch scope", () => {
  assert.match(customers, /const customerArgs = me[\s\S]{0,180}"skip"/);
  assert.match(customers, /useQuery\(api\.customers\.list, customerArgs\)/);
});

test("CSU-06 customer balances are skipped without ledger permission or branch", () => {
  assert.match(
    customers,
    /canViewLedger && me\?\.branchId \? \{ branchId: me\.branchId \} : "skip"/,
  );
});

test("CSU-07 customer card exposes direct ledger navigation with both IDs", () => {
  assert.match(customers, /onOpenLedger\(customer\._id, branchId\)/);
  assert.match(customers, /دفتر العميل/);
});

test("CSU-08 application shell carries the selected customer into ledger page", () => {
  assert.match(app, /customerLedgerTarget/);
  assert.match(app, /<CustomersPage onOpenLedger=\{openCustomerLedger\}/);
  assert.match(app, /initialCustomerId=\{customerLedgerTarget\?\.customerId\}/);
  assert.match(app, /initialBranchId=\{customerLedgerTarget\?\.branchId\}/);
});

test("CSU-09 customer ledger honors an initial branch and customer target", () => {
  assert.match(customerLedger, /initialCustomerId\?: Id<"customers">/);
  assert.match(customerLedger, /initialBranchId\?: Id<"branches">/);
  assert.match(customerLedger, /setCustomerId\(initialCustomerId\)/);
  assert.match(customerLedger, /setBranchId\(initialBranchId\)/);
});

test("CSU-10 supplier edit is wired to the real update mutation", () => {
  assert.match(suppliers, /useMutation\(api\.suppliers\.update\)/);
  assert.match(suppliers, /await updateSupplier\(\{ id: editingId, \.\.\.payload \}\)/);
});

test("CSU-11 supplier activation UI uses delete_suppliers like the backend", () => {
  assert.match(suppliers, /usePermission\("delete_suppliers"\)/);
  assert.match(suppliers, /\{canSetActive && \(/);
});

test("CSU-12 supplier branch choices are permission-gated", () => {
  assert.match(
    suppliers,
    /api\.suppliers\.availableBranches,[\s\S]{0,100}canViewLedger \? \{\} : "skip"/,
  );
  assert.match(suppliers, /aria-label="فرع أرصدة الموردين"/);
});

test("CSU-13 supplier balances are skipped until a permitted branch exists", () => {
  assert.match(
    suppliers,
    /canViewLedger && effectiveBranch[\s\S]{0,100}\{ branchId: effectiveBranch \}[\s\S]{0,50}"skip"/,
  );
});

test("CSU-14 supplier ledger uses Convex pagination with selected supplier and branch", () => {
  assert.match(suppliers, /usePaginatedQuery\(api\.suppliers\.ledger, ledgerArgs/);
  assert.match(suppliers, /supplierId: ledgerTarget\._id/);
  assert.match(suppliers, /branchId: effectiveBranch/);
});

test("CSU-15 supplier ledger supports incremental loading without client offsets", () => {
  assert.match(suppliers, /ledgerStatus === "CanLoadMore"/);
  assert.match(suppliers, /loadMoreLedger\(15\)/);
  assert.doesNotMatch(suppliers, /Number\(cursor\)|\.slice\([^)]*cursor/);
});

test("CSU-16 customer and supplier failures display real Convex messages", () => {
  assert.match(customers, /getErrorMessage\(/);
  assert.match(suppliers, /getErrorMessage\(/);
});

test("CSU-17 operational master-data UI has no prompt or unsafe TypeScript escape", () => {
  for (const source of [customers, suppliers, app, customerLedger]) {
    assert.doesNotMatch(source, /window\.prompt|@ts-ignore|as any/);
  }
});

test("CSU-18 both edit forms submit every visible contact field", () => {
  for (const source of [customers, suppliers]) {
    for (const field of ["name", "phone", "email", "address", "notes"]) {
      assert.match(source, new RegExp(`${field}: form\\.${field}`), field);
    }
  }
});
