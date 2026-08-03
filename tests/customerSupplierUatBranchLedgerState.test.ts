import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const customers = await readFile("src/components/CustomersPage.tsx", "utf8");
const suppliers = await readFile("src/components/SuppliersPage.tsx", "utf8");
const ledger = await readFile("src/components/CustomerLedgerPage.tsx", "utf8");

test("CSU-01 customer summary cards do not present loading as zero", () => {
  assert.match(customers, /const customersLoaded = customersQuery !== undefined/);
  assert.match(customers, /value=\{customersLoaded \? customers\.length : "—"\}/);
  assert.match(customers, /const balancesLoading =[\s\S]*balances === undefined/);
  assert.match(customers, /balancesLoading\s*\?\s*"…"/);
});

test("CSU-02 customer search is disabled until a branch list is ready", () => {
  assert.match(customers, /disabled=\{!customersLoaded\}/);
  assert.match(customers, /title=\{!customersLoaded \? "اختر الفرع وانتظر تحميل العملاء" : undefined\}/);
});

test("CSU-03 missing customer branch access is explicit instead of infinite loading", () => {
  assert.match(customers, /const missingCustomerBranchAccess = Boolean/);
  assert.ok(customers.includes("لا يوجد فرع عمل متاح لعرض العملاء"));
});

test("CSU-04 supplier branch context is explicit without making suppliers branch-owned", () => {
  assert.ok(suppliers.includes("اختر فرعًا لعرض أرصدة ودفاتر الموردين"));
  assert.ok(suppliers.includes("جارٍ تحميل أرصدة الموردين للفرع المحدد"));
  assert.ok(suppliers.includes("لا توجد فروع نشطة لعرض أرصدة الموردين"));
  const handler = suppliers.slice(
    suppliers.indexOf("const handleSupplierBranchChange"),
    suppliers.indexOf("const closeForm"),
  );
  assert.match(handler, /setLedgerTarget\(null\)/);
  assert.doesNotMatch(handler, /setShowForm|setEditingId|setForm/);
});

test("CSU-05 customer ledger never silently selects the first admin branch", () => {
  assert.doesNotMatch(ledger, /branches\?\.\[0\]/);
  assert.ok(ledger.includes("اختر الفرع لعرض دفتر العملاء"));
  assert.match(ledger, /<option value="">اختر الفرع<\/option>/);
});

test("CSU-06 changing customer-ledger branch clears branch-sensitive state", () => {
  assert.match(
    ledger,
    /const resetLedgerContext = \(\) => \{[\s\S]*setCustomerId\(null\)[\s\S]*setPrintTarget\(false\)[\s\S]*setOpening\(emptyOpening\)[\s\S]*retryRequestId\.current = requestId\(\)/,
  );
  assert.match(
    ledger,
    /const handleBranchChange = \(value: string\) => \{[\s\S]*setBranchId\([\s\S]*resetLedgerContext\(\)/,
  );
});

test("CSU-07 customer options expose loading and true-empty states", () => {
  assert.ok(ledger.includes("جارٍ تحميل عملاء الفرع"));
  assert.ok(ledger.includes("لا يوجد عملاء نشطون في هذا الفرع"));
  assert.match(ledger, /options === undefined/);
  assert.match(ledger, /options\.customers\.length === 0/);
});

test("CSU-08 customer ledger exposes first-load, load-more, and exhausted-empty states", () => {
  assert.match(ledger, /status === "LoadingFirstPage"/);
  assert.match(ledger, /status === "LoadingMore"/);
  assert.match(ledger, /status === "Exhausted" && results\.length === 0/);
  assert.ok(ledger.includes("جارٍ تحميل حركات العميل"));
  assert.ok(ledger.includes("لا توجد حركات لهذا العميل في الفرع المحدد"));
});

test("CSU-09 opening balance is validated before mutation", () => {
  assert.match(ledger, /const openingValidationReason = \(\(\) => \{/);
  assert.ok(ledger.includes("الأرصدة الافتتاحية يجب أن تكون غير سالبة ومقربة إلى قرشين"));
  assert.match(ledger, /if \(openingValidationReason\) \{[\s\S]*toast\.error\(openingValidationReason\)/);
  assert.match(ledger, /disabled=\{busy \|\| Boolean\(openingValidationReason\) \|\| !options\?\.cutoverDate\}/);
});

test("CSU-10 print loading is recoverable and separate from opening-balance busy state", () => {
  assert.match(ledger, /printTarget \? "إلغاء تجهيز الكشف" : "طباعة كشف حساب"/);
  assert.match(ledger, /onClick=\{printTarget \? \(\) => setPrintTarget\(false\) : handlePrint\}/);
  assert.doesNotMatch(ledger, /setBusy\(true\);\s*setPrintTarget\(true\)/);
});

test("CSU-11 this UI hardening introduces no unsafe TypeScript escape", () => {
  for (const source of [customers, suppliers, ledger]) {
    assert.doesNotMatch(source, /as any|@ts-ignore/);
  }
});
