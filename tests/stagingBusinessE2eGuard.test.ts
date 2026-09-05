import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateFixtureDefinition } from "../scripts/staging-fixtures-setup.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const business = read("../scripts/staging-business-e2e.mjs");
const workflow = read("../.github/workflows/staging-acceptance.yml");
const matrix = read("./STAGING_BUSINESS_E2E_MATRIX.md");
const runbook = read("../docs/STAGING_ACCEPTANCE_RUNBOOK.md");

// The broad contract assertions intentionally stay source-based: they protect the
// mutation safety fences, stable browser selectors, and documented business flow
// without requiring live Staging credentials in the repository test suite.

test("business E2E remains fenced to confirmed disposable staging data", () => {
  assert.match(business, /E2E_MUTATIONS_CONFIRMED/);
  assert.match(business, /isolated-staging-only/);
  assert.match(business, /fixtures\.dataset/);
  assert.match(business, /disposable-staging/);
  assert.match(business, /E2E_BUSINESS_FIXTURES_JSON/);
  assert.match(business, /E2E_ACCOUNT_BRANCH_NAME/);
  assert.match(business, /stagingConfig\(\)/);
});

test("business fixture definition validates bounded disposable inputs", () => {
  const valid = validateFixtureDefinition({
    dataset: "disposable-staging",
    branchName: "فرع اختبار",
    customerName: "عميل اختبار",
    productName: "صنف اختبار",
    supplierName: "مورد اختبار",
    cashAccountName: "خزنة اختبار",
    codAccountName: "تحصيل شحن اختبار",
    settlementAccountName: "بنك اختبار",
  });
  assert.equal(valid.dataset, "disposable-staging");
  assert.ok(valid.customerPhone);
  assert.ok(valid.supplierPhone);
  assert.ok(valid.productSku);
  assert.ok(valid.productOpeningStock > 0);
  assert.ok(valid.cashOpeningBalance > 0);
  assert.throws(() => validateFixtureDefinition({}), /Missing business fixture/);
  assert.throws(
    () => validateFixtureDefinition({ ...valid, dataset: "production" }),
    /disposable-staging/,
  );
});

test("mutable business runner covers current end-to-end scenario set", () => {
  for (const scenario of [
    "invoice_collection_sales_return",
    "invoice_collection_refund",
    "purchase_receipt_return_supplier_payment",
    "repair_collection",
    "order_delivery_cod_settlement",
    "expense_disbursement",
  ]) {
    assert.match(business, new RegExp(scenario));
  }
});

test("mutable business runner uses current grouped navigation targets", () => {
  for (const target of [
    'salesInvoices: { group: "sales", item: "invoices", page: "invoices-page" }',
    'salesReturns: { group: "sales", item: "sales-returns", page: "sales-returns-page" }',
    'orders: { group: "sales", item: "orders", page: "orders-page" }',
    'newPurchase: { group: "purchases", item: "new-purchase-invoice", page: "new-purchase-invoice-page" }',
    'purchases: { group: "purchases", item: "shipments", page: "shipments-page" }',
    'purchaseReturns: { group: "purchases", item: "purchase-returns", page: "purchase-returns-page" }',
    'supplierPayments: { group: "accounting", item: "supplier-payments", page: "supplier-payments-page" }',
    'repairs: { group: "service", item: "repairs", page: "repairs-page" }',
    'deliveries: { group: "shipping", item: "deliveries", page: "deliveries-page" }',
    'expenses: { group: "accounting", item: "expenses", page: "expenses-page" }',
  ]) {
    assert.match(business, new RegExp(target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("invoice cycle is credit-first and uses explicit finance account selectors", () => {
  assert.match(business, /invoice-payment-method/);
  assert.match(business, /selectOption\("credit"\)/);
  assert.match(business, /invoice-collection-account/);
  assert.match(business, /invoice-refund-account/);
  assert.match(business, /invoiceCollectionAmount/);
});

test("sales return uses the current invoice picker and quantity field", () => {
  assert.match(business, /sales-return-invoice-picker/);
  assert.match(business, /sales-return-start/);
  assert.match(business, /sales-return-form/);
  assert.match(business, /كمية إرجاع/);
  assert.match(business, /sales-return-submit/);
});

test("sales order lifecycle uses current intake, pricing, and state transition controls", () => {
  assert.match(business, /createOrderAndLinkedInvoice\(/);
  assert.match(business, /order-create-open/);
  assert.match(business, /order-intake-submit/);
  assert.match(business, /order-intake-item/);
  assert.match(business, /order-intake-quantity/);
  assert.match(business, /order-price-open/);
  assert.match(business, /order-price-input/);
  assert.match(business, /order-price-submit/);
  assert.match(business, /data-status-action/);
  assert.match(business, /for \(const state of \["confirmed", "preparing", "ready"\]\)/);
  assert.match(business, /waitForEntityState/);
  assert.match(business, /تم إنشاء طلب البيع وإضافته للمتابعة/);
  assert.match(business, /تم تسعير جميع أصناف الطلب/);
});

test("order confirmation resolves the server-created linked invoice instead of creating a duplicate", () => {
  assert.match(business, /invoicesBefore/);
  assert.match(business, /waitForNewEntity\(page, "invoice-row", "data-invoice-number", invoicesBefore\)/);
  assert.doesNotMatch(business, /createInvoice[\s\S]{0,500}createDeliveryCycle/);
});

test("purchase cycle uses the dedicated current purchase invoice page", () => {
  assert.match(business, /navigate\(page, "newPurchase"\)/);
  assert.match(business, /new-purchase-invoice-page/);
  assert.match(business, /purchase-supplier-select/);
  assert.match(business, /purchase-product-search/);
  assert.match(business, /purchase-product-result/);
  assert.match(business, /data-purchase-quantity/);
  assert.match(business, /data-purchase-unit-cost/);
  assert.match(business, /purchase-shipping-cost/);
  assert.match(business, /purchase-notes/);
  assert.match(business, /purchase-submit/);
  assert.match(business, /تم إنشاء فاتورة المشتريات وحفظها بانتظار الاستلام/);
  assert.doesNotMatch(business, /shipment-create-form|shipment-supplier-select|shipment-item-row|shipment-product-select|shipment-item-quantity|shipment-item-unit-cost|shipment-submit/);
});

test("purchase receipt, return, and supplier payment use current stable selectors", () => {
  for (const id of [
    "shipment-status-next",
    "shipment-receive-form",
    "shipment-receive-date",
    "shipment-external-invoice",
    "shipment-receive-submit",
    "purchase-return-supplier",
    "purchase-return-receipt",
    "purchase-return-item",
    "purchase-return-quantity",
    "purchase-return-reason",
    "purchase-return-submit",
    "supplier-payment-supplier",
    "supplier-payment-account",
    "supplier-payment-receipt",
    "supplier-payment-allocation",
    "supplier-payment-notes",
    "supplier-payment-submit",
  ]) {
    assert.match(business, new RegExp(id));
  }
  assert.match(business, /PUR-\\d\{4\}-\\d\+/);
});

test("repair and expense cycles use current current-page contracts", () => {
  for (const id of [
    "repair-create-open",
    "repair-create-form",
    "repair-customer-select",
    "repair-device-brand",
    "repair-device-model",
    "repair-problem",
    "repair-labor-cost",
    "repair-submit",
    "repair-collect-open",
    "repair-collection-form",
    "repair-collection-amount",
    "repair-collection-account",
    "repair-collection-date",
    "repair-collection-submit",
    "expense-create-open",
    "expense-create-form",
    "expense-account",
    "expense-submit",
  ]) {
    assert.match(business, new RegExp(id));
  }
});

test("delivery cycle binds order and linked invoice then validates COD settlement", () => {
  for (const id of [
    "delivery-create-open",
    "delivery-action-modal",
    "delivery-order-select",
    "delivery-invoice-select",
    "delivery-city",
    "delivery-address",
    "delivery-company",
    "delivery-tracking",
    "delivery-carrier-fee",
    "delivery-action-date",
    "delivery-action-submit",
    "delivery-ship-open",
    "delivery-confirm-open",
    "delivery-confirmation-account",
    "delivery-settlement-open",
    "delivery-settlement-source",
    "delivery-settlement-item",
    "delivery-settlement-destination",
  ]) {
    assert.match(business, new RegExp(id));
  }
  assert.match(business, /تم إنشاء الشحنة بنجاح/);
  assert.match(business, /تم تسجيل إرسال الشحنة/);
  assert.match(business, /تم تسجيل التسليم والتحصيل بنجاح/);
  assert.match(business, /تمت تسوية مبالغ التحصيل بنجاح/);
});

test("browser business evidence remains redacted and runtime-failure aware", () => {
  assert.match(business, /observeRuntimeFailures/);
  assert.match(business, /redactEvidence/);
  assert.match(business, /safeScreenshot/);
  assert.match(business, /acceptance\.json/);
});

test("invoice refund requires an explicit account and a stable idempotency key", () => {
  const invoices = read("../src/components/InvoicesPage.tsx");
  assert.doesNotMatch(invoices, /prompt\(|refundAccounts\[0\]/);
  assert.match(invoices, /refundAccountPicker, canRefund && refundTarget \? \{\} : "skip"/);
  assert.match(invoices, /requestId: refundRequestId\.current/);
  assert.doesNotMatch(invoices, /catch[\s\S]{0,300}refundRequestId\.current\s*=/);
});

test("GitHub mutable job is manual, staging-protected, and follows read-only role smoke", () => {
  assert.match(workflow, /run_business_cycles:[\s\S]*default: false/);
  assert.match(workflow, /mutable-business-cycles:[\s\S]*if: \$\{\{ inputs\.run_business_cycles \}\}/);
  assert.match(workflow, /mutable-business-cycles:[\s\S]*needs: browser-e2e/);
  assert.match(workflow, /environment: staging/);
  assert.match(workflow, /E2E_MUTATIONS_CONFIRMED: isolated-staging-only/);
  assert.match(workflow, /test:e2e-business-staging -- --validate-config/);
});

test("staging business matrix contains fourteen honest current acceptance rows", () => {
  const rows = matrix.match(/^\| SBE-\d{2} \|.*\| IMPLEMENTED_NOT_RUN \|$/gm) ?? [];
  assert.equal(rows.length, 14);
  assert.deepEqual(rows.map((row) => row.match(/SBE-\d{2}/)?.[0]), Array.from({ length: 14 }, (_, index) => `SBE-${String(index + 1).padStart(2, "0")}`));
  assert.doesNotMatch(matrix, /PASSED|COMPLETE|EXECUTED/);
  for (const label of ["فاتورة مبيعات", "مرتجع مبيعات", "طلب بيع", "شحنة", "فاتورة مشتريات", "مرتجع مشتريات", "أمر صيانة"]) {
    assert.match(matrix, new RegExp(label));
  }
  assert.doesNotMatch(matrix, /سند توصيل|رقما الشحنة|رقم الصيانة/);
});

test("runbook requires disposable data, reset discipline, and forbids production mutation", () => {
  assert.match(runbook, /فرع Staging وهمي قابل للمسح/);
  assert.match(runbook, /E2E_BUSINESS_FIXTURES_JSON/);
  assert.match(runbook, /disposable-staging/);
  assert.match(runbook, /لا تنفذ هذا الأمر على Production/);
  assert.match(runbook, /امسح بيانات الفرع التجريبي أو أعد Seed/);
});
