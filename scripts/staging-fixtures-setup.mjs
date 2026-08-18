import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import dotenv from "dotenv";
import {
  launchStagingBrowser,
  observeRuntimeFailures,
  redactEvidence,
  safeScreenshot,
  signIn,
  stagingConfig,
} from "./staging-browser-e2e.mjs";

dotenv.config({ path: ".env.staging.local", override: false });

const outputRoot = resolve("test-results/staging-fixtures");
const reportPath = join(outputRoot, "acceptance.json");
const requiredStrings = [
  "dataset",
  "branchName",
  "customerName",
  "productName",
  "supplierName",
  "cashAccountName",
  "codAccountName",
  "settlementAccountName",
];

function boundedInteger(value, fallback, name, maximum) {
  const result = value ?? fallback;
  assert.ok(Number.isInteger(result) && result > 0 && result <= maximum, `${name} must be a bounded positive integer`);
  return result;
}

export function validateFixtureDefinition(input) {
  assert.ok(input && typeof input === "object" && !Array.isArray(input), "E2E_BUSINESS_FIXTURES_JSON must be a JSON object");
  for (const field of requiredStrings) {
    assert.ok(typeof input[field] === "string" && input[field].trim(), `Missing business fixture: ${field}`);
  }
  assert.equal(input.dataset, "disposable-staging", "Fixture setup requires a disposable-staging dataset");
  return {
    ...input,
    customerPhone: input.customerPhone?.trim() || "01000009001",
    supplierPhone: input.supplierPhone?.trim() || "01000009002",
    productSku: input.productSku?.trim() || "E2E-PRODUCT",
    productOpeningStock: boundedInteger(input.productOpeningStock, 20, "productOpeningStock", 10_000),
    cashOpeningBalance: boundedInteger(input.cashOpeningBalance, 10_000, "cashOpeningBalance", 1_000_000),
  };
}

function setupConfig() {
  const staging = stagingConfig();
  assert.equal(process.env.E2E_MUTATIONS_CONFIRMED, "isolated-staging-only", "E2E_MUTATIONS_CONFIRMED must equal isolated-staging-only");
  let definition;
  try {
    definition = JSON.parse(process.env.E2E_BUSINESS_FIXTURES_JSON ?? "");
  } catch {
    throw new Error("E2E_BUSINESS_FIXTURES_JSON must be valid JSON");
  }
  const fixtures = validateFixtureDefinition(definition);
  const accountBranchName = process.env.E2E_ACCOUNT_BRANCH_NAME?.trim();
  if (accountBranchName) {
    assert.equal(
      accountBranchName,
      fixtures.branchName,
      "E2E_ACCOUNT_BRANCH_NAME must match E2E_BUSINESS_FIXTURES_JSON.branchName",
    );
  }
  const admin = staging.accounts.find((account) => account.role === "admin");
  assert.ok(admin, "Fixture setup requires the existing Staging admin account");
  return { ...staging, fixtures, admin };
}

async function writeReport(status, results, runtimeFailures, errorMessage) {
  await mkdir(outputRoot, { recursive: true });
  await writeFile(reportPath, `${JSON.stringify({
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    status,
    results,
    runtimeFailures,
    ...(errorMessage ? { error: redactEvidence(errorMessage) } : {}),
  }, null, 2)}\n`);
}

async function waitForToast(page, message) {
  await page.getByText(message, { exact: false }).last().waitFor({ state: "visible", timeout: 45_000 });
}

async function navigate(page, label, testId) {
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.getByTestId(testId).waitFor({ state: "visible", timeout: 30_000 });
}

async function selectExact(select, label) {
  await select.waitFor({ state: "visible", timeout: 30_000 });
  const testId = await select.getAttribute("data-testid");
  assert.ok(testId, "Fixture select requires a stable data-testid");
  await select.page().waitForFunction(
    ({ testId: id, label: expected }) => {
      const element = document.querySelector(`[data-testid="${id}"]`);
      return element instanceof HTMLSelectElement && [...element.options].some((option) => option.value && option.text.trim() === expected);
    },
    { testId, label },
    { timeout: 30_000 },
  );
  const options = await select.locator("option").evaluateAll((rows) => rows.map((row) => ({ value: row.value, label: row.textContent?.trim() ?? "" })));
  const matches = options.filter((option) => option.value && option.label === label);
  assert.equal(matches.length, 1, `Expected exactly one option named: ${label}`);
  await select.selectOption(matches[0].value);
  return matches[0];
}

async function exactRow(page, testId, attribute, value) {
  const rows = page.getByTestId(testId);
  const count = await rows.count();
  for (let index = 0; index < count; index += 1) {
    if ((await rows.nth(index).getAttribute(attribute)) === value) return rows.nth(index);
  }
  return null;
}

async function waitForExactRow(page, testId, attribute, value) {
  await page.waitForFunction(
    ({ testId: id, attribute: field, value: expected }) =>
      [...document.querySelectorAll(`[data-testid="${id}"]`)].some(
        (element) => element.getAttribute(field) === expected,
      ),
    { testId, attribute, value },
    { timeout: 45_000 },
  );
  return exactRow(page, testId, attribute, value);
}

async function ensureAdminWorkingBranch(page, fixtures, targetBranchId) {
  const workingBranch = page.getByTestId("working-branch-select");
  await workingBranch.waitFor({ state: "visible", timeout: 30_000 });
  if ((await workingBranch.inputValue()) !== targetBranchId) {
    const selected = await selectExact(workingBranch, fixtures.branchName);
    assert.equal(selected.value, targetBranchId, "Named fixture branch resolved to a different branch ID");
    await waitForToast(page, "تم تغيير فرع العمل");
  }
  assert.equal(
    await workingBranch.inputValue(),
    targetBranchId,
    "Admin working branch does not match the fixture branch",
  );
}

async function ensureCustomer(page, fixtures, targetBranchId) {
  await navigate(page, "العملاء", "customers-page");
  const branchSelect = page.getByTestId("customer-branch-select");
  const branch = await branchSelect.count()
    ? await selectExact(branchSelect, fixtures.branchName)
    : { value: targetBranchId, label: fixtures.branchName };
  assert.equal(branch.value, targetBranchId, "Customer fixture branch does not match the finance fixture branch");
  await page.getByTestId("customer-search").fill(fixtures.customerName);
  let row = await exactRow(page, "customer-card", "data-customer-name", fixtures.customerName);
  if (!row) {
    await page.getByTestId("customer-create-open").click();
    await page.locator("#contact-name").fill(fixtures.customerName);
    await page.locator("#contact-phone").fill(fixtures.customerPhone);
    await page.locator("#contact-address").fill("E2E fixture - disposable Staging only");
    await page.getByRole("button", { name: "حفظ", exact: true }).click();
    await waitForToast(page, "تمت إضافة العميل");
    row = await waitForExactRow(page, "customer-card", "data-customer-name", fixtures.customerName);
  }
  assert.ok(row, "Customer fixture did not appear after setup");
  assert.equal(await row.getAttribute("data-customer-active"), "true", "Customer fixture must be active");
  assert.equal(await row.getAttribute("data-customer-branch-id"), targetBranchId, "Customer fixture belongs to a different branch");
  return { fixture: "customer", status: "ready" };
}

async function ensureSupplier(page, fixtures) {
  await navigate(page, "الموردين", "suppliers-page");
  await page.getByTestId("supplier-search").fill(fixtures.supplierName);
  let row = await exactRow(page, "supplier-card", "data-supplier-name", fixtures.supplierName);
  if (!row) {
    await page.getByTestId("supplier-create-open").click();
    await page.locator("#contact-name").fill(fixtures.supplierName);
    await page.locator("#contact-phone").fill(fixtures.supplierPhone);
    await page.locator("#contact-address").fill("E2E fixture - disposable Staging only");
    await page.getByRole("button", { name: "حفظ", exact: true }).click();
    await waitForToast(page, "تمت إضافة المورد");
    row = await waitForExactRow(page, "supplier-card", "data-supplier-name", fixtures.supplierName);
  }
  assert.ok(row, "Supplier fixture did not appear after setup");
  assert.equal(await row.getAttribute("data-supplier-active"), "true", "Supplier fixture must be active");
  return { fixture: "supplier", status: "ready" };
}

async function ensureProduct(page, fixtures, targetBranchId) {
  await ensureAdminWorkingBranch(page, fixtures, targetBranchId);
  await navigate(page, "الأصناف", "products-page");
  await page.getByTestId("product-search").fill(fixtures.productName);
  let row = await exactRow(page, "product-row", "data-product-name", fixtures.productName);
  if (!row) {
    await page.getByTestId("product-create-open").click();
    await page.getByTestId("product-name").fill(fixtures.productName);
    await page.getByTestId("product-sku").fill(fixtures.productSku);
    await page.getByTestId("product-cost-price").fill("10");
    await page.getByTestId("product-sell-price").fill("100");
    await page.getByTestId("product-opening-stock").fill(String(fixtures.productOpeningStock));
    await page.getByTestId("product-min-stock").fill("2");
    await selectExact(page.getByTestId("product-supplier"), fixtures.supplierName);
    await page.getByTestId("product-submit").click();
    await waitForToast(page, "تمت إضافة المنتج بنجاح");
    row = await waitForExactRow(page, "product-row", "data-product-name", fixtures.productName);
  }
  assert.ok(row, "Product fixture did not appear after setup");
  assert.equal(await row.getAttribute("data-product-active"), "true", "Product fixture must be active");
  assert.equal(await row.getAttribute("data-product-branch-id"), targetBranchId, "Product fixture belongs to a different branch");
  const currentStock = Number(await row.getAttribute("data-product-stock"));
  assert.ok(Number.isFinite(currentStock) && currentStock >= 0, "Product fixture stock is invalid");
  if (currentStock < fixtures.productOpeningStock) {
    await row.getByTestId("product-stock-open").click();
    await page.getByTestId("product-stock-adjustment").fill(String(fixtures.productOpeningStock - currentStock));
    await page.getByTestId("product-stock-reason").fill("إعادة تعبئة Fixture اختبار Staging");
    await page.getByTestId("product-stock-submit").click();
    await waitForToast(page, "تم تعديل المخزون وتسجيل الحركة");
  }
  return { fixture: "product", status: currentStock < fixtures.productOpeningStock ? "replenished" : "ready" };
}

async function accountRow(page, name, branchId) {
  const rows = page.getByTestId("finance-account-row");
  const count = await rows.count();
  for (let index = 0; index < count; index += 1) {
    const row = rows.nth(index);
    if ((await row.getAttribute("data-account-name")) === name && (await row.getAttribute("data-account-branch-id")) === branchId) return row;
  }
  return null;
}

async function ensureAccount(page, branch, name, code, type) {
  let row = await accountRow(page, name, branch.value);
  if (!row) {
    await page.getByTestId("finance-account-branch").selectOption(branch.value);
    await page.getByTestId("finance-account-name").fill(name);
    await page.getByTestId("finance-account-code").fill(code);
    await page.getByTestId("finance-account-type").selectOption(type);
    await page.getByTestId("finance-account-create").click();
    await waitForToast(page, "تم إنشاء الحساب برصيد صفر");
    await page.waitForFunction(
      ({ name: expectedName, branchId }) =>
        [...document.querySelectorAll('[data-testid="finance-account-row"]')].some(
          (element) => element.getAttribute("data-account-name") === expectedName && element.getAttribute("data-account-branch-id") === branchId,
        ),
      { name, branchId: branch.value },
      { timeout: 45_000 },
    );
    row = await accountRow(page, name, branch.value);
  }
  assert.ok(row, `Financial account fixture did not appear: ${name}`);
  assert.equal(await row.getAttribute("data-account-type"), type, `${name} has the wrong account type`);
  assert.equal(await row.getAttribute("data-account-active"), "true", `${name} must be active`);
  return row;
}

async function postOpeningBalance(page, row, amount) {
  if ((await row.getAttribute("data-opening-posted")) === "true") return;
  page.once("dialog", (dialog) => dialog.accept(String(amount)));
  await row.getByTestId("finance-opening-balance").click();
  await page.waitForFunction(
    ({ name, branchId }) => [...document.querySelectorAll('[data-testid="finance-account-row"]')].some((element) => element.getAttribute("data-account-name") === name && element.getAttribute("data-account-branch-id") === branchId && element.getAttribute("data-opening-posted") === "true"),
    { name: await row.getAttribute("data-account-name"), branchId: await row.getAttribute("data-account-branch-id") },
    { timeout: 45_000 },
  );
}

async function ensureFinance(page, fixtures) {
  await navigate(page, "الخزائن والبنوك", "treasury-page");
  const branchSelect = page.getByTestId("finance-account-branch");
  await branchSelect.waitFor({ state: "visible", timeout: 30_000 });
  const options = (await branchSelect.locator("option").evaluateAll((rows) => rows.map((row) => ({ value: row.value, label: row.textContent?.trim() ?? "" })))).filter((option) => option.value);
  const matches = options.filter((option) => option.label === fixtures.branchName);
  assert.equal(matches.length, 1, `Fixture branch must match exactly one active branch: ${fixtures.branchName}`);
  const targetBranch = matches[0];
  await page.waitForFunction(
    () => ![null, "loading"].includes(document.querySelector('[data-testid="finance-initialization"]')?.getAttribute("data-state") ?? null),
    undefined,
    { timeout: 30_000 },
  );
  let state = await page.getByTestId("finance-initialization").getAttribute("data-state");
  if (state !== "initialized") {
    await page.getByTestId("finance-cutover-date").fill(fixtures.operationDate ?? new Date().toISOString().slice(0, 10));
    await page.getByTestId("finance-configure").click();
    await page.waitForFunction(() => document.querySelector('[data-testid="finance-initialization"]')?.getAttribute("data-state") === "configuring", undefined, { timeout: 30_000 });
    state = "configuring";
  }

  if (state === "initialized") {
    const existingCash = await accountRow(page, fixtures.cashAccountName, targetBranch.value);
    assert.ok(existingCash, "Finance is already initialized and the named E2E cash account is missing; reset this disposable Staging dataset before fixture setup");
    const existingBalance = Number(await existingCash.getAttribute("data-account-balance"));
    assert.ok(existingBalance >= 100, "Finance is already initialized and the named E2E cash account is not funded; reset this disposable Staging dataset before fixture setup");
  }

  const targetCash = await ensureAccount(page, targetBranch, fixtures.cashAccountName, "E2E-CASH", "cash");
  await ensureAccount(page, targetBranch, fixtures.codAccountName, "E2E-COD", "cod_clearing");
  await ensureAccount(page, targetBranch, fixtures.settlementAccountName, "E2E-BANK", "bank");
  if (state !== "initialized") {
    for (const branch of options) {
      const hasCash = await page.locator(`[data-testid="finance-account-row"][data-account-branch-id="${branch.value}"][data-account-type="cash"][data-account-active="true"]`).count();
      if (!hasCash) await ensureAccount(page, branch, `E2E Cash - ${branch.label}`, `E2E-CASH-${branch.value.slice(-8)}`, "cash");
    }
    const rows = page.getByTestId("finance-account-row");
    const count = await rows.count();
    for (let index = 0; index < count; index += 1) {
      const row = rows.nth(index);
      const isTargetCash = (await row.getAttribute("data-account-name")) === fixtures.cashAccountName && (await row.getAttribute("data-account-branch-id")) === targetBranch.value;
      await postOpeningBalance(page, row, isTargetCash ? fixtures.cashOpeningBalance : 0);
    }
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByTestId("finance-confirm").click();
    await page.waitForFunction(() => document.querySelector('[data-testid="finance-initialization"]')?.getAttribute("data-state") === "initialized", undefined, { timeout: 45_000 });
  }

  const refreshedCash = await accountRow(page, fixtures.cashAccountName, targetBranch.value);
  assert.ok(refreshedCash);
  const cashBalance = Number(await refreshedCash.getAttribute("data-account-balance"));
  assert.ok(cashBalance >= 100, "E2E cash account needs at least 100 EGP for mutable acceptance");
  return { fixture: "finance", status: "ready", branchId: targetBranch.value };
}

async function main() {
  const config = setupConfig();
  if (process.argv.includes("--validate-config")) {
    console.log(JSON.stringify({
      mode: "validate-only",
      target: config.baseUrl,
      dataset: config.fixtures.dataset,
      branchName: config.fixtures.branchName,
      productOpeningStock: config.fixtures.productOpeningStock,
      cashOpeningBalance: config.fixtures.cashOpeningBalance,
      fixtures: ["customer", "supplier", "product", "cash", "cod_clearing", "bank"],
    }));
    return;
  }

  await mkdir(outputRoot, { recursive: true });
  const browser = await launchStagingBrowser();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, locale: "ar-EG", timezoneId: "Africa/Cairo" });
  const page = await context.newPage();
  const runtimeFailures = observeRuntimeFailures(page, config.baseUrl);
  const results = [];
  try {
    await signIn(page, config.baseUrl, config.admin);
    const finance = await ensureFinance(page, config.fixtures);
    results.push({ fixture: finance.fixture, status: finance.status });
    await ensureAdminWorkingBranch(page, config.fixtures, finance.branchId);
    results.push(await ensureCustomer(page, config.fixtures, finance.branchId));
    results.push(await ensureSupplier(page, config.fixtures));
    results.push(await ensureProduct(page, config.fixtures, finance.branchId));
    assert.deepEqual(runtimeFailures, [], "Staging fixture setup browser failures");
    await safeScreenshot(page, join(outputRoot, "fixtures-ready.png"));
    await writeReport("passed", results, runtimeFailures);
    console.log("Staging business fixtures are ready and finance is initialized.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown fixture setup failure";
    await safeScreenshot(page, join(outputRoot, "failure.png"));
    await writeReport("failed", results, runtimeFailures, message);
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await main();
  } catch (error) {
    console.error(redactEvidence(error instanceof Error ? error.message : error));
    process.exitCode = 1;
  }
}
