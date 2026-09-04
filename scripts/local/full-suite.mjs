import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { access, mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import {
  launchStagingBrowser,
  observeRuntimeFailures,
  safeScreenshot,
  signIn,
} from "../staging-browser-e2e.mjs";

const frontendUrl = "http://localhost:5173";
const backendUrl = "http://127.0.0.1:3210";
const adminEmail = process.env.LOCAL_E2E_ADMIN_EMAIL?.trim().toLowerCase();
const adminPassword = process.env.LOCAL_E2E_ADMIN_PASSWORD;
const localRoleAccountsPath = resolve(".local-role-accounts.json.local");
const stagingRoleAccountsPath = resolve(".staging-role-accounts.json.local");
const outputRoot = resolve("test-results/local-e2e");

const fixtures = {
  dataset: "disposable-staging",
  branchName: "فرع التجربة",
  branchAddress: "عنوان تجريبي",
  customerName: "عميل التجربة المحلي",
  customerPhone: "01000000001",
  supplierName: "مورد التجربة المحلي",
  supplierPhone: "01000000002",
  productName: "صنف التجربة المحلي",
  productSku: "LOCAL-E2E-PRODUCT",
  productOpeningStock: 40,
  cashAccountName: "خزنة الاختبار المحلي",
  codAccountName: "تحصيل الشحن المحلي",
  settlementAccountName: "بنك الاختبار المحلي",
  cashOpeningBalance: 50000,
  city: "القاهرة",
  address: "عنوان اختبار محلي",
  shippingCompany: "شركة شحن اختبار محلي",
  operationDate: new Date().toISOString().slice(0, 10),
  purchaseUnitCost: 10,
  invoiceCollectionAmount: 1,
  repairLaborCost: 20,
  repairCollectionAmount: 5,
  expenseAmount: 1,
};

function childEnvironment() {
  const environment = {
    ...process.env,
    E2E_ENVIRONMENT: "staging",
    STAGING_BASE_URL: frontendUrl,
    STAGING_CONVEX_URL: "https://local-selfhosted.convex.cloud",
    STAGING_CONVEX_SITE_URL: "https://local-selfhosted.convex.site",
    STAGING_TARGET_CONFIRMATION: "localhost|local-selfhosted",
    E2E_MUTATIONS_CONFIRMED: "isolated-staging-only",
    E2E_ACCOUNT_BRANCH_NAME: fixtures.branchName,
    E2E_BUSINESS_FIXTURES_JSON: JSON.stringify(fixtures),
    E2E_REQUIRE_ALL_ROLES: "true",
    E2E_ADMIN_EMAIL: adminEmail,
    E2E_ADMIN_PASSWORD: adminPassword,
  };
  delete environment.VITE_CONVEX_URL;
  delete environment.VITE_ALLOWED_HOSTS;
  return environment;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function runCommand(command, args, environment = process.env) {
  const child = spawn(command, args, {
    cwd: resolve("."),
    env: environment,
    stdio: "inherit",
    shell: false,
  });
  const [code] = await once(child, "close");
  if (code !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${code}`);
  }
}

async function runNpm(script) {
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  await runCommand(command, ["run", script]);
}

async function assertLocalHealth() {
  const frontend = await fetch(frontendUrl, { signal: AbortSignal.timeout(10_000) });
  assert.ok(frontend.ok, `Local frontend returned HTTP ${frontend.status}`);
  const backend = await fetch(backendUrl, { signal: AbortSignal.timeout(10_000) });
  assert.ok(backend.ok, `Local Convex backend returned HTTP ${backend.status}`);
}

async function waitForToast(page, expected) {
  const handle = await page.waitForFunction(
    (message) => {
      const toasts = [...document.querySelectorAll("[data-sonner-toast]")];
      const success = toasts.find((toast) => toast.textContent?.includes(message));
      if (success) return { ok: true, text: success.textContent?.trim() ?? message };
      const error = toasts.find((toast) => toast.getAttribute("data-type") === "error");
      if (error) return { ok: false, text: error.textContent?.trim() ?? "unknown UI error" };
      return null;
    },
    expected,
    { timeout: 45_000 },
  );
  const outcome = await handle.jsonValue();
  await handle.dispose();
  if (!outcome?.ok) throw new Error(`UI error while waiting for ${expected}: ${outcome?.text ?? "unknown"}`);
}

async function openGroup(page, groupKey) {
  const navigation = page.getByRole("navigation", { name: "القائمة الرئيسية" });
  const group = navigation.getByTestId(`nav-group-${groupKey}`);
  await group.waitFor({ state: "visible", timeout: 30_000 });
  if ((await group.getAttribute("aria-expanded")) !== "true") await group.click();
  return navigation;
}

async function navigate(page, groupKey, pageId, expectedTestId) {
  const navigation = await openGroup(page, groupKey);
  const button = navigation.getByTestId(`nav-${pageId}`);
  await button.waitFor({ state: "visible", timeout: 30_000 });
  await button.click();
  await page.getByTestId(expectedTestId).waitFor({ state: "visible", timeout: 45_000 });
}

async function selectExact(select, label) {
  await select.waitFor({ state: "visible", timeout: 30_000 });
  await select.page().waitForFunction(
    ({ testId, label: expected }) => {
      const element = document.querySelector(`[data-testid="${testId}"]`);
      return element instanceof HTMLSelectElement && [...element.options].some((option) => option.value && option.text.trim() === expected);
    },
    { testId: await select.getAttribute("data-testid"), label },
    { timeout: 30_000 },
  );
  const options = await select.locator("option").evaluateAll((rows) => rows.map((row) => ({ value: row.value, label: row.textContent?.trim() ?? "" })));
  const matches = options.filter((option) => option.value && option.label === label);
  assert.equal(matches.length, 1, `Expected exactly one option named: ${label}`);
  await select.selectOption(matches[0].value);
  return matches[0];
}

async function ensureBranch(page) {
  await navigate(page, "administration", "branches", "branches-page").catch(async () => {
    const navigation = await openGroup(page, "administration");
    await navigation.getByTestId("nav-branches").click();
    await page.getByRole("main").getByRole("heading", { name: "الفروع", exact: true }).waitFor({ timeout: 30_000 });
  });

  const existing = page.getByRole("heading", { name: fixtures.branchName, exact: true });
  if (!(await existing.isVisible().catch(() => false))) {
    const create = page.getByRole("button", { name: "فرع جديد", exact: true });
    if (await create.isVisible().catch(() => false)) await create.click();
    else await page.getByRole("button", { name: "إضافة فرع", exact: true }).click();
    await page.getByRole("heading", { name: "فرع جديد", exact: true }).waitFor({ timeout: 15_000 });
    await page.locator('input[placeholder="مثال: الفرع الرئيسي"]').fill(fixtures.branchName);
    await page.locator('input[placeholder="عنوان الفرع"]').fill(fixtures.branchAddress);
    await page.getByRole("button", { name: "إضافة الفرع", exact: true }).click();
    await waitForToast(page, "تم إضافة الفرع بنجاح");
  }
  await page.getByRole("heading", { name: fixtures.branchName, exact: true }).waitFor({ timeout: 30_000 });
}

async function selectWorkingBranch(page) {
  const select = page.getByTestId("working-branch-select");
  const branch = await selectExact(select, fixtures.branchName);
  if ((await select.inputValue()) !== branch.value) {
    await select.selectOption(branch.value);
    await waitForToast(page, "تم تغيير فرع العمل");
  }
  return branch.value;
}

async function exactRow(page, testId, attribute, value) {
  const rows = page.getByTestId(testId);
  const count = await rows.count();
  for (let index = 0; index < count; index += 1) {
    if ((await rows.nth(index).getAttribute(attribute)) === value) return rows.nth(index);
  }
  return null;
}

async function ensureCustomer(page) {
  await navigate(page, "customers", "customers", "customers-page");
  const search = page.getByTestId("customer-search");
  await search.fill(fixtures.customerName);
  let row = await exactRow(page, "customer-card", "data-customer-name", fixtures.customerName);
  if (!row) {
    await page.getByTestId("customer-create-open").click();
    await page.getByTestId("new-customer-page").waitFor({ state: "visible", timeout: 30_000 });
    await page.getByTestId("new-customer-name").fill(fixtures.customerName);
    await page.getByTestId("new-customer-phone").fill(fixtures.customerPhone);
    await page.getByTestId("new-customer-address").fill(fixtures.address);
    await page.getByTestId("new-customer-save").click();
    await waitForToast(page, "تمت إضافة العميل بنجاح");
    await page.getByTestId("customers-page").waitFor({ state: "visible", timeout: 30_000 });
    await search.fill(fixtures.customerName);
    row = await exactRow(page, "customer-card", "data-customer-name", fixtures.customerName);
  }
  assert.ok(row, "Local customer fixture is missing");
  assert.equal(await row.getAttribute("data-customer-active"), "true");
}

async function ensureSupplier(page) {
  await navigate(page, "purchases", "suppliers", "suppliers-page");
  const search = page.getByTestId("supplier-search");
  await search.fill(fixtures.supplierName);
  let row = await exactRow(page, "supplier-card", "data-supplier-name", fixtures.supplierName);
  if (!row) {
    await page.getByTestId("supplier-create-open").click();
    await page.locator("#contact-name").fill(fixtures.supplierName);
    await page.locator("#contact-phone").fill(fixtures.supplierPhone);
    await page.locator("#contact-address").fill(fixtures.address);
    await page.getByRole("button", { name: "حفظ", exact: true }).click();
    await waitForToast(page, "تمت إضافة المورد");
    await search.fill(fixtures.supplierName);
    row = await exactRow(page, "supplier-card", "data-supplier-name", fixtures.supplierName);
  }
  assert.ok(row, "Local supplier fixture is missing");
  assert.equal(await row.getAttribute("data-supplier-active"), "true");
}

async function ensureProduct(page) {
  await navigate(page, "inventory", "inventory", "inventory-workspace-page");
  await page.getByTestId("products-page").waitFor({ state: "visible", timeout: 30_000 });
  const search = page.getByTestId("product-search");
  await search.fill(fixtures.productSku);
  let row = await exactRow(page, "product-row", "data-product-sku", fixtures.productSku);
  if (!row) {
    await page.getByTestId("product-create-open").click();
    await page.getByTestId("product-name").fill(fixtures.productName);
    await page.getByTestId("product-sku").fill(fixtures.productSku);
    await page.getByTestId("product-cost-price").fill("10");
    await page.getByTestId("product-sell-price").fill("100");
    await page.getByTestId("product-opening-stock").fill(String(fixtures.productOpeningStock));
    await page.getByTestId("product-min-stock").fill("2");
    const supplier = page.getByTestId("product-supplier");
    if (await supplier.count()) await selectExact(supplier, fixtures.supplierName);
    await page.getByTestId("product-submit").click();
    await waitForToast(page, "تمت إضافة الصنف بنجاح");
    await search.fill(fixtures.productSku);
    row = await exactRow(page, "product-row", "data-product-sku", fixtures.productSku);
  }
  assert.ok(row, "Local product fixture is missing");
  assert.equal(await row.getAttribute("data-product-name"), fixtures.productName);
  const currentStock = Number(await row.getAttribute("data-product-stock"));
  assert.ok(Number.isFinite(currentStock) && currentStock >= 0);
  if (currentStock < fixtures.productOpeningStock) {
    await row.getByTestId("product-stock-open").click();
    await page.getByTestId("product-stock-adjustment").fill(String(fixtures.productOpeningStock - currentStock));
    await page.getByTestId("product-stock-reason").fill("إعادة تعبئة Fixture اختبار محلي");
    await page.getByTestId("product-stock-submit").click();
    await waitForToast(page, "تم تعديل المخزون وتسجيل الحركة");
  }
}

async function financeAccountRow(page, name, branchId) {
  const rows = page.getByTestId("finance-account-row");
  const count = await rows.count();
  for (let index = 0; index < count; index += 1) {
    const row = rows.nth(index);
    if ((await row.getAttribute("data-account-name")) === name && (await row.getAttribute("data-account-branch-id")) === branchId) return row;
  }
  return null;
}

async function ensureFinanceAccount(page, branch, name, code, type) {
  let row = await financeAccountRow(page, name, branch.value);
  if (!row) {
    await page.getByTestId("finance-account-branch").selectOption(branch.value);
    await page.getByTestId("finance-account-name").fill(name);
    await page.getByTestId("finance-account-code").fill(code);
    await page.getByTestId("finance-account-type").selectOption(type);
    await page.getByTestId("finance-account-create").click();
    await waitForToast(page, "تم إنشاء الحساب بنجاح");
    row = await financeAccountRow(page, name, branch.value);
  }
  assert.ok(row, `Missing finance account: ${name}`);
  return row;
}

async function postOpeningBalance(page, row, amount) {
  if ((await row.getAttribute("data-opening-posted")) === "true") return;
  await row.getByTestId("finance-opening-balance").click();
  const heading = page.getByRole("heading", { name: "تسجيل الرصيد الافتتاحي", exact: true });
  await heading.waitFor({ state: "visible", timeout: 30_000 });
  const dialog = heading.locator("..").locator("..");
  await dialog.locator('input[type="number"]').fill(String(amount));
  await dialog.getByRole("button", { name: "حفظ", exact: true }).click();
  await page.waitForTimeout(250);
}

async function ensureFinance(page) {
  await navigate(page, "accounting", "treasury", "treasury-page");
  const branchSelect = page.getByTestId("finance-account-branch");
  const targetBranch = await selectExact(branchSelect, fixtures.branchName);
  const allBranches = (await branchSelect.locator("option").evaluateAll((rows) => rows.map((row) => ({ value: row.value, label: row.textContent?.trim() ?? "" })))).filter((row) => row.value);

  await page.waitForFunction(
    () => {
      const marker = document.querySelector('[data-testid="finance-initialization"]');
      return !marker || marker.getAttribute("data-state") !== "loading";
    },
    undefined,
    { timeout: 30_000 },
  );

  const marker = page.getByTestId("finance-initialization");
  let state = (await marker.count()) ? await marker.getAttribute("data-state") : "initialized";

  if (state !== "initialized") {
    await page.getByTestId("finance-cutover-date").fill(fixtures.operationDate);
    await page.getByTestId("finance-configure").click();
    await waitForToast(page, "تم حفظ تاريخ بدء التسجيل المالي");
  }

  const targetCash = await ensureFinanceAccount(page, targetBranch, fixtures.cashAccountName, "LOCAL-E2E-CASH", "cash");
  await ensureFinanceAccount(page, targetBranch, fixtures.codAccountName, "LOCAL-E2E-COD", "cod_clearing");
  await ensureFinanceAccount(page, targetBranch, fixtures.settlementAccountName, "LOCAL-E2E-BANK", "bank");

  if (state !== "initialized") {
    for (const branch of allBranches) {
      const activeCash = page.locator(`[data-testid="finance-account-row"][data-account-branch-id="${branch.value}"][data-account-type="cash"][data-account-active="true"]`);
      if ((await activeCash.count()) === 0) {
        await ensureFinanceAccount(page, branch, `خزنة اختبار - ${branch.label}`, `LOCAL-CASH-${branch.value.slice(-6)}`, "cash");
      }
    }

    const rows = page.getByTestId("finance-account-row");
    const count = await rows.count();
    for (let index = 0; index < count; index += 1) {
      const row = rows.nth(index);
      const isTarget = (await row.getAttribute("data-account-name")) === fixtures.cashAccountName && (await row.getAttribute("data-account-branch-id")) === targetBranch.value;
      await postOpeningBalance(page, row, isTarget ? fixtures.cashOpeningBalance : 0);
    }

    await page.getByTestId("finance-confirm").click();
    await page.getByTestId("finance-confirmation-dialog").waitFor({ state: "visible", timeout: 30_000 });
    await page.getByTestId("finance-confirm-final").click();
    await page.waitForFunction(() => !document.querySelector('[data-testid="finance-initialization"]'), undefined, { timeout: 45_000 });
    state = "initialized";
  }

  const refreshedCash = await financeAccountRow(page, fixtures.cashAccountName, targetBranch.value);
  assert.ok(refreshedCash, "Local cash fixture is missing");
  const balance = Number(await refreshedCash.getAttribute("data-account-balance"));
  assert.ok(balance >= 100, "Local E2E cash account needs funding before business scenarios");
}

async function setupBusinessFixtures(admin) {
  const browser = await launchStagingBrowser();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, locale: "ar-EG", timezoneId: "Africa/Cairo" });
  const page = await context.newPage();
  const runtimeFailures = observeRuntimeFailures(page, frontendUrl);
  try {
    await signIn(page, frontendUrl, admin);
    await ensureBranch(page);
    await selectWorkingBranch(page);
    await ensureCustomer(page);
    await ensureSupplier(page);
    await ensureProduct(page);
    await ensureFinance(page);
    assert.deepEqual(runtimeFailures, [], `Local fixture browser failures:\n${runtimeFailures.join("\n")}`);
    await mkdir(outputRoot, { recursive: true });
    await safeScreenshot(page, join(outputRoot, "fixtures-ready.png"));
  } finally {
    await context.close();
    await browser.close();
  }
}

async function readLocalRoleAccounts() {
  try {
    const parsed = JSON.parse(await readFile(localRoleAccountsPath, "utf8"));
    return Array.isArray(parsed) ? parsed.filter((account) => account?.role !== "admin") : [];
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function main() {
  assert.match(adminEmail ?? "", /^[^\s@]+@[^\s@]+\.[^\s@]+$/, "LOCAL_E2E_ADMIN_EMAIL is required");
  assert.ok(typeof adminPassword === "string" && adminPassword.length >= 8, "LOCAL_E2E_ADMIN_PASSWORD is required");
  await assertLocalHealth();

  if (process.env.LOCAL_E2E_SKIP_VERIFY !== "true") {
    console.log("\n=== Local Suite: repository verification ===");
    await runNpm("verify");
  }

  const admin = { role: "admin", email: adminEmail, password: adminPassword };
  const localRoles = await readLocalRoleAccounts();
  const previousStagingAccounts = (await exists(stagingRoleAccountsPath)) ? await readFile(stagingRoleAccountsPath) : null;
  const environment = childEnvironment();

  try {
    console.log("\n=== Local Suite: branch bootstrap ===");
    await setupBusinessFixtures(admin).catch(async (error) => {
      if (!String(error?.message ?? error).includes("Local E2E cash account needs funding")) throw error;
      throw error;
    });

    console.log("\n=== Local Suite: role account provisioning ===");
    await writeFile(stagingRoleAccountsPath, `${JSON.stringify([admin, ...localRoles], null, 2)}\n`, { mode: 0o600 });
    await runCommand(process.execPath, ["scripts/staging-account-setup.mjs"], environment);
    const provisioned = JSON.parse(await readFile(stagingRoleAccountsPath, "utf8"));
    const nonAdmin = provisioned.filter((account) => account?.role !== "admin");
    await writeFile(localRoleAccountsPath, `${JSON.stringify(nonAdmin, null, 2)}\n`, { mode: 0o600 });

    console.log("\n=== Local Suite: fixture verification ===");
    await setupBusinessFixtures(admin);

    console.log("\n=== Local Suite: full business browser scenarios ===");
    await runCommand(process.execPath, ["scripts/staging-business-e2e.mjs"], environment);

    console.log("\nLOCAL FULL SUITE: PASS");
    console.log("Roles: admin, manager, sales, customer_service, technician, accountant, shipping, viewer");
    console.log("Business scenarios: invoice/collection/return/refund, purchase/return/supplier payment, repair/collection, order/delivery/COD settlement, expense/disbursement");
  } finally {
    if (previousStagingAccounts) await writeFile(stagingRoleAccountsPath, previousStagingAccounts);
    else if (await exists(stagingRoleAccountsPath)) await unlink(stagingRoleAccountsPath);
  }
}

main().catch((error) => {
  console.error(`LOCAL FULL SUITE: FAIL - ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
