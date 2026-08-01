import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile("src/components/RepairsPage.tsx", "utf8");
const repairs = await readFile("convex/repairs.ts", "utf8");
const customers = await readFile("convex/customers.ts", "utf8");

test("RBR-01 repair list accepts a branch scope and uses the branch/date index", () => {
  assert.match(repairs, /export const list = query\(\{[\s\S]*args:\s*\{\s*branchId:\s*v\.optional\(v\.id\("branches"\)\)/);
  assert.match(repairs, /withIndex\("by_branch_received",\s*\(q\)\s*=>\s*q\.eq\("branchId",\s*branchId\)\)/);
  assert.doesNotMatch(repairs, /query\("repairs"\)\.order\("desc"\)\.collect\(\)/);
});

test("RBR-02 repair list returns no mixed admin data before a branch is chosen", () => {
  assert.match(repairs, /const branchId =[\s\S]*requestedBranchId[\s\S]*user\.branchId/);
  assert.match(repairs, /if \(!branchId\) return \[\]/);
});

test("RBR-03 repair customer picker is branch scoped", () => {
  assert.match(customers, /export const repairPicker = query\(\{[\s\S]*branchId:\s*v\.optional\(v\.id\("branches"\)\)/);
  assert.match(customers, /withIndex\("by_branch",\s*\(q\)\s*=>\s*q\.eq\("branchId",\s*branchId\)\)/);
  assert.doesNotMatch(customers, /filterByBranch\(await ctx\.db\.query\("customers"\)\.collect\(\),\s*user\)/);
});

test("RBR-04 UI passes the selected branch to repairs and customer pickers", () => {
  assert.match(page, /const repairBranchArgs =[\s\S]*branchId:\s*selectedBranchId as Id<"branches">/);
  assert.match(page, /useQuery\(api\.repairs\.list,\s*repairBranchArgs\)/);
  assert.match(page, /api\.customers\.repairPicker,[\s\S]*customerPickerArgs/);
});

test("RBR-05 opening a new repair starts from a clean creation state", () => {
  assert.match(page, /const resetCreateState = \(\) => \{[\s\S]*setParts\(\[\]\)[\s\S]*setAccountId\(""\)[\s\S]*setRequestId\(crypto\.randomUUID\(\)\)[\s\S]*setForm\(emptyRepairForm\(\)\)/);
  assert.match(page, /const openNewRepair = \(\) => \{[\s\S]*resetCreateState\(\);[\s\S]*setShowForm\(true\)/);
});

test("RBR-06 changing branches closes and clears branch-sensitive creation state", () => {
  assert.match(page, /const handleBranchChange = \(value: string\) => \{[\s\S]*setSelectedBranchId\(value\)[\s\S]*resetCreateState\(\)[\s\S]*setShowForm\(false\)/);
  assert.match(page, /onChange=\{\(event\) => handleBranchChange\(event\.target\.value\)\}/);
});

test("RBR-07 closing the create modal also discards stale creation data", () => {
  assert.match(page, /const closeCreateForm = \(\) => \{[\s\S]*resetCreateState\(\)[\s\S]*setShowForm\(false\)/);
  assert.match(page, /onClick=\{closeCreateForm\}/);
});

test("RBR-08 UI distinguishes branch selection, loading, and true empty results", () => {
  assert.ok(page.includes("اختر الفرع لعرض طلبات الصيانة"));
  assert.ok(page.includes("جارٍ تحميل طلبات الصيانة"));
  assert.match(page, /repairsQuery === undefined/);
  assert.match(page, /requiresBranchSelection/);
});
