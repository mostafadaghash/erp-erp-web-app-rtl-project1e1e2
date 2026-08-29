import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateFixtureDefinition } from "../scripts/staging-fixtures-setup.mjs";

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const fixtureScript = read("scripts/staging-fixtures-setup.mjs");
const stagingAll = read("scripts/staging-all.mjs");
const productsPage = read("src/components/ProductsPage.tsx");
const customersPage = read("src/components/CustomersPage.tsx");
const suppliersPage = read("src/components/SuppliersPage.tsx");
const treasuryPage = read("src/components/TreasuryPage.tsx");
const erpApp = read("src/components/ERPApp.tsx");
const finance = read("convex/finance.ts");
const packageJson = read("package.json");

const definition = {
  dataset: "disposable-staging",
  branchName: "E2E Branch",
  customerName: "E2E Customer",
  productName: "E2E Product",
  supplierName: "E2E Supplier",
  cashAccountName: "E2E Cash",
  codAccountName: "E2E COD",
  settlementAccountName: "E2E Bank",
};

test("fixture definition adds bounded synthetic defaults", () => {
  const fixture = validateFixtureDefinition(definition);
  assert.equal(fixture.customerPhone, "01000009001");
  assert.equal(fixture.supplierPhone, "01000009002");
  assert.equal(fixture.productSku, "E2E-PRODUCT");
  assert.equal(fixture.productOpeningStock, 20);
  assert.equal(fixture.cashOpeningBalance, 10_000);
  assert.throws(() => validateFixtureDefinition({ ...definition, dataset: "production" }), /disposable-staging/);
  assert.throws(() => validateFixtureDefinition({ ...definition, productOpeningStock: 100_000 }), /bounded positive integer/);
});

test("fixture setup is a first-class command in the full gate", () => {
  assert.match(packageJson, /"staging:fixtures:setup": "node scripts\/staging-fixtures-setup\.mjs"/);
  const setup = stagingAll.indexOf('runStep("business-fixture-setup"');
  const business = stagingAll.indexOf('runStep("mutable-business-cycles"');
  assert.ok(setup > 0 && business > setup);
  assert.match(stagingAll, /\["fixtures-config", \["run", "staging:fixtures:setup"/);
});

test("fixture setup stays browser-mediated and isolated to confirmed Staging", () => {
  assert.match(fixtureScript, /E2E_MUTATIONS_CONFIRMED/);
  assert.match(fixtureScript, /isolated-staging-only/);
  assert.match(fixtureScript, /stagingConfig\(\)/);
  assert.match(fixtureScript, /signIn\(page, config\.baseUrl, config\.admin\)/);
  assert.doesNotMatch(fixtureScript, /convex\s+run|ctx\.db|db\.insert|createFirstAdmin/);
});

test("fixture-facing pages expose stable non-secret automation selectors", () => {
  for (const id of ["customers-page", "customer-branch-select", "customer-create-open", "customer-search", "customer-card"]) {
    assert.match(customersPage, new RegExp(`data-testid="${id}"`));
  }
  for (const id of ["suppliers-page", "supplier-create-open", "supplier-search", "supplier-card"]) {
    assert.match(suppliersPage, new RegExp(`data-testid="${id}"`));
  }
  for (const id of ["products-page", "product-row", "product-name", "product-sku", "product-opening-stock", "product-stock-submit"]) {
    assert.match(productsPage, new RegExp(`data-testid="${id}"`));
  }
  for (const id of ["treasury-page", "finance-initialization", "finance-account-row", "finance-account-type", "finance-opening-balance"]) {
    assert.match(treasuryPage, new RegExp(`data-testid="${id}"`));
  }
  assert.match(erpApp, /data-testid="working-branch-select"/);
  assert.doesNotMatch(`${productsPage}\n${customersPage}\n${suppliersPage}\n${treasuryPage}\n${erpApp}`, /data-(?:password|secret|token)=/);
});

test("initialized finance is rejected before creating an unusable zero-balance fixture", () => {
  const preflight = fixtureScript.indexOf("Finance is already initialized and the named E2E cash account is missing");
  const createCash = fixtureScript.indexOf("const targetCash = await ensureAccount");
  assert.ok(preflight > 0 && createCash > preflight);
  assert.match(fixtureScript, /working-branch-select/);
  assert.match(fixtureScript, /Admin working branch does not match the fixture branch/);
});

test("COD clearing can be created through the same validated finance path", () => {
  assert.match(finance, /v\.literal\("cod_clearing"\)/);
  assert.match(treasuryPage, /cod_clearing: "شركات الشحن - مبالغ قيد التحصيل"/);
  assert.match(fixtureScript, /"cod_clearing"/);
});
