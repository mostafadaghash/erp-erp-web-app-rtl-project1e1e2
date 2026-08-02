import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const customers = await readFile("src/components/CustomersPage.tsx", "utf8");
const suppliers = await readFile("src/components/SuppliersPage.tsx", "utf8");

test("CUAT-01 customers require an explicit branch for unpinned admins", () => {
  assert.match(customers, /const canViewBranches = usePermission\("view_branches"\)/);
  assert.match(customers, /const \[selectedBranchId, setSelectedBranchId\] = useState\(""\)/);
  assert.match(customers, /const effectiveBranchId =[\s\S]*me\?\.branchId[\s\S]*selectedBranchId/);
  assert.match(
    customers,
    /const requiresBranchSelection = Boolean\([\s\S]*me && !me\.branchId[\s\S]*!selectedBranchId/,
  );
});

test("CUAT-02 customer list and balances use the same branch scope", () => {
  assert.match(customers, /const customerArgs =[\s\S]*effectiveBranchId[\s\S]*branchId: effectiveBranchId/);
  assert.match(customers, /api\.customers\.list, customerArgs/);
  assert.match(customers, /api\.customerLedger\.branchBalances,[\s\S]*branchId: effectiveBranchId/);
  assert.doesNotMatch(customers, /me\?\.branchId \? \{ branchId: me\.branchId \} : "skip"/);
});

test("CUAT-03 customer creation and ledger navigation preserve the visible branch", () => {
  assert.match(customers, /createCustomer\(\{ \.\.\.payload, branchId: effectiveBranchId \}\)/);
  assert.match(customers, /customer\.branchId \?\? effectiveBranchId/);
});

test("CUAT-04 changing customer branch clears branch-sensitive state", () => {
  assert.match(customers, /const handleCustomerBranchChange =[\s\S]*setSelectedBranchId\(value\)[\s\S]*setShowForm\(false\)[\s\S]*setEditingId\(null\)[\s\S]*setForm\(emptyForm\)/);
  assert.match(customers, /onChange=\{\(event\) => handleCustomerBranchChange\(event\.target\.value\)\}/);
});

test("CUAT-05 customer UI distinguishes branch selection, loading, true empty, and filtered empty", () => {
  assert.ok(customers.includes("اختر الفرع لعرض العملاء"));
  assert.ok(customers.includes("جارٍ تحميل العملاء"));
  assert.ok(customers.includes("لا يوجد عملاء في هذا الفرع"));
  assert.ok(customers.includes("لا توجد نتائج مطابقة للبحث"));
  assert.match(customers, /customersQuery === undefined/);
});

test("SUAT-01 supplier ledger scope never defaults to the first branch", () => {
  assert.match(suppliers, /const effectiveBranch = me\?\.branchId \?\? selectedBranch/);
  assert.doesNotMatch(suppliers, /branches\?\.\[0\]\?\._id/);
  assert.doesNotMatch(suppliers, /const pinnedBalanceArgs/);
});

test("SUAT-02 unpinned supplier ledger users choose a branch explicitly", () => {
  assert.match(
    suppliers,
    /const requiresLedgerBranchSelection = Boolean\([\s\S]*me &&[\s\S]*!me\.branchId[\s\S]*!selectedBranch/,
  );
  assert.ok(suppliers.includes("اختر فرع الأرصدة"));
  assert.match(suppliers, /value=\{selectedBranch \?\? ""\}/);
});

test("SUAT-03 supplier branch changes close the old ledger", () => {
  assert.match(suppliers, /const handleSupplierBranchChange =[\s\S]*setSelectedBranch[\s\S]*setLedgerTarget\(null\)/);
  assert.match(suppliers, /onChange=\{\(event\) => handleSupplierBranchChange\(event\.target\.value\)\}/);
});

test("SUAT-04 supplier balances and ledger actions wait for a loaded branch scope", () => {
  assert.match(suppliers, /const hasSupplierBalanceScope =[\s\S]*supplierBalances !== undefined[\s\S]*Boolean\(effectiveBranch\)/);
  assert.match(suppliers, /canViewSupplierLedger && hasSupplierBalanceScope/);
  assert.ok(suppliers.includes("جارٍ تحميل رصيد الفرع"));
});

test("SUAT-05 supplier UI distinguishes loading, true empty, and filtered empty", () => {
  assert.match(suppliers, /const suppliersQuery = useQuery\(api\.suppliers\.list\)/);
  assert.ok(suppliers.includes("جارٍ تحميل الموردين"));
  assert.ok(suppliers.includes("لا يوجد موردون"));
  assert.ok(suppliers.includes("لا توجد نتائج مطابقة للبحث"));
});

test("Contacts branch-state slice introduces no unsafe TypeScript escape", () => {
  assert.doesNotMatch(customers, /as any|@ts-ignore/);
  assert.doesNotMatch(suppliers, /as any|@ts-ignore/);
});
