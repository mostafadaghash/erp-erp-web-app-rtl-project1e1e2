import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const contactForm = await readFile("src/lib/contactForm.ts", "utf8");
const customersPage = await readFile("src/components/CustomersPage.tsx", "utf8");
const suppliersPage = await readFile("src/components/SuppliersPage.tsx", "utf8");
const customersApi = await readFile("convex/customers.ts", "utf8");
const suppliersApi = await readFile("convex/suppliers.ts", "utf8");

test("CSA-01 optional contact fields remain explicit in normalized mutation payloads", () => {
  assert.match(contactForm, /email:\s*email \?\? ""/);
  assert.match(contactForm, /address:\s*address \?\? ""/);
  assert.match(contactForm, /notes:\s*notes \?\? ""/);
  assert.match(contactForm, /normalizedForm:\s*payload/);
});

test("CSA-02 customer and supplier create and update actions share the validated payload", () => {
  assert.match(customersPage, /await updateCustomer\(\{ id: editingId, \.\.\.payload \}\)/);
  assert.match(customersPage, /await createCustomer\(\{ \.\.\.payload, branchId: effectiveBranchId \}\)/);
  assert.match(suppliersPage, /await updateSupplier\(\{ id: editingId, \.\.\.payload \}\)/);
  assert.match(suppliersPage, /await createSupplier\(payload\)/);
});

test("CSA-03 explicit empty update fields are normalized and removed by the backend patch", () => {
  for (const source of [customersApi, suppliersApi]) {
    assert.match(source, /email: args\.email !== undefined \? args\.email :/);
    assert.match(source, /address: args\.address !== undefined \? args\.address :/);
    assert.match(source, /notes: args\.notes !== undefined \? args\.notes :/);
    assert.match(source, /await ctx\.db\.patch\(id, normalized\)/);
  }
});

test("CSA-04 phone uniqueness is enforced for both create and update", () => {
  assert.match(customersApi, /assertUniqueCustomerPhone\(ctx, branchId, normalized\.phone\)/);
  assert.match(customersApi, /assertUniqueCustomerPhone\([\s\S]*customer\.branchId,[\s\S]*normalized\.phone,[\s\S]*customer\._id/);
  assert.match(suppliersApi, /assertUniqueSupplierPhone\(ctx, normalized\.phone\)/);
  assert.match(suppliersApi, /assertUniqueSupplierPhone\(ctx, normalized\.phone, supplier\._id\)/);
});

test("CSA-05 activation and deactivation are permissioned, audited, and replace deletion", () => {
  assert.match(customersApi, /requirePermission\(ctx, "delete_customers"\)/);
  assert.match(customersApi, /action: args\.isActive \? "activate" : "deactivate"/);
  assert.match(customersApi, /استخدم تعطيل العميل بدلاً من الحذف/);
  assert.match(suppliersApi, /requireModulePermission\(ctx, "delete_suppliers", "suppliers"\)/);
  assert.match(suppliersApi, /action: args\.isActive \? "activate" : "deactivate"/);
  assert.match(suppliersApi, /استخدم تعطيل المورد بدلاً من الحذف/);
});

test("CSA-06 action buttons confirm state changes and surface backend errors", () => {
  for (const source of [customersPage, suppliersPage]) {
    assert.match(source, /window\.confirm\(message\)/);
    assert.match(source, /disabled=\{updatingId !== null\}/);
    assert.match(source, /getErrorMessage\(/);
  }
});

test("CSA-07 supplier ledger stays branch-scoped and cursor-paginated", () => {
  assert.match(suppliersApi, /requirePermission\(ctx, "view_supplier_ledger"\)/);
  assert.match(suppliersApi, /assertBranchAccess\(user, \{ branchId: args\.branchId \}\)/);
  assert.match(suppliersApi, /paginationOptsValidator/);
  assert.match(suppliersApi, /\.paginate\(args\.paginationOpts\)/);
  assert.match(suppliersPage, /usePaginatedQuery\(api\.suppliers\.ledger/);
  assert.match(suppliersPage, /ledgerStatus === "CanLoadMore"/);
  assert.match(suppliersPage, /ledgerStatus === "LoadingMore"/);
});

test("CSA-08 customer branch ownership and supplier global ownership remain distinct", () => {
  assert.match(customersApi, /resolveWriteBranch\(user, args\.branchId\)/);
  assert.match(customersApi, /assertBranchAccess\(user, customer\)/);
  assert.doesNotMatch(suppliersApi, /resolveWriteBranch/);
  assert.doesNotMatch(suppliersApi, /branchId: v\.optional\(v\.id\("branches"\)\)/);
});
