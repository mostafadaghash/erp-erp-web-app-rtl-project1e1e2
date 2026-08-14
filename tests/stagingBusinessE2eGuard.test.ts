import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const read = (path: string) => readFileSync(path, "utf8");
const script = read("scripts/staging-business-e2e.mjs");
const workflow = read(".github/workflows/staging-acceptance.yml");
const runbook = read("docs/STAGING_ACCEPTANCE_RUNBOOK.md");
const matrix = read("tests/STAGING_BUSINESS_E2E_MATRIX.md");

const fixtures = {
  dataset: "disposable-staging",
  branchName: "E2E Branch",
  customerName: "E2E Customer",
  productName: "E2E Product",
  supplierName: "E2E Supplier",
  cashAccountName: "E2E Cash",
  codAccountName: "E2E COD",
  settlementAccountName: "E2E Bank",
  city: "Cairo",
  address: "E2E Address",
  shippingCompany: "E2E Carrier",
  operationDate: "2026-08-07",
};
const accounts = [
  { role: "admin", email: "admin@example.invalid", password: "not-a-real-password" },
  { role: "manager", email: "manager@example.invalid", password: "not-a-real-password" },
  { role: "accountant", email: "accountant@example.invalid", password: "not-a-real-password" },
];
const validationEnv = {
  ...process.env,
  STAGING_BASE_URL: "https://isolated-staging.example.invalid",
  STAGING_CONVEX_URL: "https://erp-stage.convex.cloud",
  STAGING_CONVEX_SITE_URL: "https://erp-stage.convex.site",
  STAGING_TARGET_CONFIRMATION: "isolated-staging.example.invalid|erp-stage",
  E2E_ENVIRONMENT: "staging",
  E2E_REQUIRE_ALL_ROLES: "false",
  E2E_MUTATIONS_CONFIRMED: "isolated-staging-only",
  E2E_ROLE_ACCOUNTS_JSON: JSON.stringify(accounts),
  E2E_BUSINESS_FIXTURES_JSON: JSON.stringify(fixtures),
};

function validate(overrides: Record<string, string | undefined> = {}) {
  const env = { ...validationEnv, ...overrides };
  for (const [key, value] of Object.entries(env)) if (value === undefined) delete env[key];
  return spawnSync(process.execPath, ["scripts/staging-business-e2e.mjs", "--validate-config"], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
  });
}

test("staging mutable suite validates an isolated disposable configuration without a browser", () => {
  const result = validate();
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.operatorRole, "manager");
  assert.equal(output.dataset, "disposable-staging");
  assert.equal(output.scenarios.length, 6);
  assert.doesNotMatch(result.stdout, /not-a-real-password|@example\.invalid/);
});

test("staging mutable suite refuses missing confirmation, production hosts, and non-disposable data", () => {
  const noConfirmation = validate({ E2E_MUTATIONS_CONFIRMED: undefined });
  assert.notEqual(noConfirmation.status, 0);
  assert.match(noConfirmation.stderr, /isolated-staging-only/);

  const production = validate({ STAGING_BASE_URL: "https://production.example.invalid" });
  assert.notEqual(production.status, 0);
  assert.match(production.stderr, /refuses production-looking hosts/);

  const wrongDataset = validate({
    E2E_BUSINESS_FIXTURES_JSON: JSON.stringify({ ...fixtures, dataset: "production-copy" }),
  });
  assert.notEqual(wrongDataset.status, 0);
  assert.match(wrongDataset.stderr, /disposable-staging/);
});

test("business browser script executes all required public UI cycles and stores redacted evidence", () => {
  for (const marker of [
    "createInvoice(",
    "collectInvoice(",
    "refundInvoice(",
    "createSalesReturn(",
    "createOrder(",
    "createDeliveryCycle(",
    "createPurchaseCycle(",
    "createRepairCycle(",
    "createExpenseCycle(",
    'join(outputRoot, "acceptance.json")',
    "observeRuntimeFailures",
  ]) assert.match(script, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(script, /console\.log\([^\n]*(password|email)|documents?\.write/);
  assert.match(script, /getByTestId\("invoices-page"\)\.getByRole\("button", \{ name: "فاتورة جديدة", exact: true \}\)/);
  assert.doesNotMatch(script, /page\.getByRole\("button", \{ name: "فاتورة جديدة", exact: true \}\)/);
});

test("mutable UI selectors cover sales, purchase, repair, and COD forms", () => {
  const sources = [
    "src/components/NewInvoicePage.tsx",
    "src/components/InvoicesPage.tsx",
    "src/components/SalesReturnsPanel.tsx",
    "src/components/OrdersPage.tsx",
    "src/components/DeliveriesPage.tsx",
    "src/components/ShipmentsPage.tsx",
    "src/components/SupplierPaymentsPage.tsx",
    "src/components/PurchaseReturnsPage.tsx",
    "src/components/RepairsPage.tsx",
    "src/components/ExpensesPage.tsx",
  ].map(read).join("\n");
  for (const selector of [
    "invoice-submit",
    "invoice-collection-submit",
    "invoice-refund-submit",
    "sales-return-submit",
    "order-submit",
    "delivery-action-submit",
    "shipment-receive-submit",
    "supplier-payment-submit",
    "purchase-return-submit",
    "repair-collection-submit",
    "expense-submit",
  ]) assert.match(sources, new RegExp(`data-testid="${selector}"`));
});

test("invoice collection no longer guesses the first account through a prompt", () => {
  const invoices = read("src/components/InvoicesPage.tsx");
  assert.doesNotMatch(invoices, /prompt\("المبلغ المراد تحصيله"\)|collectionAccounts\[0\]/);
  assert.match(invoices, /collectionAccountPicker, canCollect && collectTarget \? \{\} : "skip"/);
  assert.match(invoices, /requestId: collectionRequestId\.current/);
  assert.doesNotMatch(invoices, /catch[\s\S]{0,300}collectionRequestId\.current\s*=/);
});

test("invoice refund requires an explicit account and a stable idempotency key", () => {
  const invoices = read("src/components/InvoicesPage.tsx");
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

test("staging business matrix contains fourteen honest not-yet-run acceptance rows", () => {
  const rows = matrix.match(/^\| SBE-\d{2} \|.*\| IMPLEMENTED_NOT_RUN \|$/gm) ?? [];
  assert.equal(rows.length, 14);
  assert.deepEqual(rows.map((row) => row.match(/SBE-\d{2}/)?.[0]), Array.from({ length: 14 }, (_, index) => `SBE-${String(index + 1).padStart(2, "0")}`));
  assert.doesNotMatch(matrix, /PASSED|COMPLETE|EXECUTED/);
});

test("runbook requires disposable data, reset discipline, and forbids production mutation", () => {
  assert.match(runbook, /فرع Staging وهمي قابل للمسح/);
  assert.match(runbook, /E2E_BUSINESS_FIXTURES_JSON/);
  assert.match(runbook, /disposable-staging/);
  assert.match(runbook, /لا تنفذ هذا الأمر على Production/);
  assert.match(runbook, /امسح بيانات الفرع التجريبي أو أعد Seed/);
});
