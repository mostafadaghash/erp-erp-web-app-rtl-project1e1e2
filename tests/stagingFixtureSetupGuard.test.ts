import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const fixtureScript = readFileSync("scripts/staging-fixtures-setup.mjs", "utf8");
const customersPage = readFileSync("src/components/CustomersPage.tsx", "utf8");
const suppliersPage = readFileSync("src/components/SuppliersPage.tsx", "utf8");
const productsPage = readFileSync("src/components/ProductsPage.tsx", "utf8");
const treasuryPage = readFileSync("src/components/TreasuryPage.tsx", "utf8");
const erpApp = readFileSync("src/components/ERPApp.tsx", "utf8");
const finance = readFileSync("convex/finance.ts", "utf8");

test("fixture setup is locked to disposable staging data", () => {
  assert.match(fixtureScript, /disposable-staging/);
  assert.match(fixtureScript, /E2E_MUTATIONS_CONFIRMED/);
  assert.match(fixtureScript, /isolated-staging-only/);
});

test("fixture definition requires the complete named business surface", () => {
  for (const field of [
    "dataset",
    "branchName",
    "customerName",
    "productName",
    "supplierName",
    "cashAccountName",
    "codAccountName",
    "settlementAccountName",
  ]) {
    assert.match(fixtureScript, new RegExp(`\"${field}\"`));
  }
  assert.match(fixtureScript, /productOpeningStock/);
  assert.match(fixtureScript, /cashOpeningBalance/);
});

test("fixture creation uses stable exact row identities and branch alignment", () => {
  assert.match(fixtureScript, /data-customer-name/);
  assert.match(fixtureScript, /data-supplier-name/);
  assert.match(fixtureScript, /data-product-sku/);
  assert.match(fixtureScript, /data-account-name/);
  assert.match(fixtureScript, /data-account-branch-id/);
  assert.match(fixtureScript, /ensureAdminWorkingBranch/);
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

test("initialized finance is validated as funded before fixture account creation proceeds", () => {
  const preflight = fixtureScript.indexOf("Finance is already initialized and the named E2E cash account is missing");
  const createCash = fixtureScript.indexOf("await ensureAccount(page, targetBranch, fixtures.cashAccountName");
  assert.ok(preflight > 0 && createCash > preflight);
  assert.match(fixtureScript, /existingBalance >= 100/);
  assert.match(fixtureScript, /working-branch-select/);
  assert.match(fixtureScript, /Admin working branch does not match the fixture branch/);
});

test("COD clearing can be created through the same validated finance path", () => {
  assert.match(finance, /v\.literal\("cod_clearing"\)/);
  assert.match(treasuryPage, /cod_clearing: "شركات الشحن - مبالغ قيد التحصيل"/);
  assert.match(fixtureScript, /"cod_clearing"/);
});
