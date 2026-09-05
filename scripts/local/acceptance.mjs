import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { win32 } from "node:path";
import { chromium } from "playwright-core";

const baseUrl = process.env.LOCAL_FRONTEND_URL?.trim() || "http://localhost:5173";
const email = process.env.LOCAL_ACCEPTANCE_EMAIL?.trim();
const password = process.env.LOCAL_ACCEPTANCE_PASSWORD;
const branchName = process.env.LOCAL_ACCEPTANCE_BRANCH_NAME?.trim() || "فرع التجربة";
const branchAddress = process.env.LOCAL_ACCEPTANCE_BRANCH_ADDRESS?.trim() || "عنوان تجريبي";
const customerName = process.env.LOCAL_ACCEPTANCE_CUSTOMER_NAME?.trim() || "عميل التجربة المحلي";
const customerPhone = process.env.LOCAL_ACCEPTANCE_CUSTOMER_PHONE?.trim() || "01000000001";
const customerAddress = process.env.LOCAL_ACCEPTANCE_CUSTOMER_ADDRESS?.trim() || "عنوان عميل تجريبي";

function validateLocalTarget(value) {
  const url = new URL(value);
  assert.ok(
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname),
    "Local acceptance refuses non-local frontend targets",
  );
  assert.equal(url.protocol, "http:", "Local acceptance expects the local HTTP frontend");
  assert.ok(!url.username && !url.password && !url.search && !url.hash, "Local frontend URL must not contain credentials, query, or fragment");
  return url.origin;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function browserCandidates(environment = process.env) {
  const configured = environment.E2E_BROWSER_EXECUTABLE?.trim();
  const roots = [
    environment.PROGRAMFILES,
    environment["PROGRAMFILES(X86)"],
    environment.LOCALAPPDATA,
  ].filter((value) => typeof value === "string" && value.trim());
  const candidates = configured ? [configured] : [];
  for (const root of roots) {
    candidates.push(
      win32.join(root, "Google", "Chrome", "Application", "chrome.exe"),
      win32.join(root, "Microsoft", "Edge", "Application", "msedge.exe"),
    );
  }
  return [...new Set(candidates)];
}

async function resolveBrowser() {
  for (const candidate of browserCandidates()) {
    if (await exists(candidate)) return candidate;
  }
  throw new Error("لم يتم العثور على Chrome أو Edge على Windows");
}

async function openNavigationGroup(page, testId) {
  const navigation = page.getByRole("navigation", { name: "القائمة الرئيسية" });
  const group = navigation.getByTestId(testId);
  await group.waitFor({ state: "visible", timeout: 30_000 });
  if ((await group.getAttribute("aria-expanded")) !== "true") {
    await group.click();
  }
  return navigation;
}

async function gotoBranches(page) {
  const navigation = await openNavigationGroup(page, "nav-group-administration");
  const branches = navigation.getByTestId("nav-branches");
  await branches.waitFor({ state: "visible", timeout: 30_000 });
  await branches.click();
  await page
    .getByRole("main")
    .getByRole("heading", { name: "الفروع", exact: true })
    .waitFor({ timeout: 30_000 });
}

async function gotoCustomers(page) {
  const navigation = await openNavigationGroup(page, "nav-group-customers");
  const customers = navigation.getByTestId("nav-customers");
  await customers.waitFor({ state: "visible", timeout: 30_000 });
  await customers.click();
  await page.getByTestId("customers-page").waitFor({ state: "visible", timeout: 30_000 });
}

async function signIn(page, origin) {
  const response = await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 30_000 });
  assert.ok(response?.ok(), `Local frontend returned HTTP ${response?.status() ?? "unknown"}`);

  const loginHeading = page.getByRole("heading", { name: "تسجيل الدخول", exact: true });
  if (await loginHeading.isVisible().catch(() => false)) {
    assert.ok(email, "LOCAL_ACCEPTANCE_EMAIL is required");
    assert.ok(password && password.length >= 8, "LOCAL_ACCEPTANCE_PASSWORD is required");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  }

  await page
    .getByRole("main")
    .getByRole("heading", { name: "لوحة التحكم", exact: true })
    .waitFor({ timeout: 45_000 });
}

async function ensureBranch(page) {
  await gotoBranches(page);
  const existing = page.getByRole("heading", { name: branchName, exact: true });
  if (!(await existing.isVisible().catch(() => false))) {
    const create = page.getByRole("button", { name: "فرع جديد", exact: true });
    if (await create.isVisible().catch(() => false)) {
      await create.click();
    } else {
      await page.getByRole("button", { name: "إضافة فرع", exact: true }).click();
    }

    await page.getByRole("heading", { name: "فرع جديد", exact: true }).waitFor({ timeout: 15_000 });
    await page.locator('input[placeholder="مثال: الفرع الرئيسي"]').fill(branchName);
    await page.locator('input[placeholder="عنوان الفرع"]').fill(branchAddress);
    await page.getByRole("button", { name: "إضافة الفرع", exact: true }).click();
    await page.getByText("تم إضافة الفرع بنجاح", { exact: true }).waitFor({ timeout: 30_000 });
  }

  await page.getByRole("heading", { name: branchName, exact: true }).waitFor({ timeout: 30_000 });
  await page.getByText(branchAddress, { exact: true }).waitFor({ timeout: 30_000 });
  assert.ok(await page.getByText("نشط", { exact: true }).first().isVisible(), "Expected an active branch state");
}

async function selectWorkingBranch(page) {
  const select = page.getByTestId("working-branch-select");
  await select.waitFor({ state: "visible", timeout: 30_000 });
  const options = await select.locator("option").evaluateAll((rows) =>
    rows.map((row) => ({ value: row.value, label: row.textContent?.trim() ?? "" })),
  );
  const match = options.find((option) => option.value && option.label === branchName);
  assert.ok(match, `Working branch option not found: ${branchName}`);

  if ((await select.inputValue()) !== match.value) {
    await select.selectOption(match.value);
    await page.getByText("تم تغيير فرع العمل", { exact: true }).waitFor({ timeout: 30_000 });
  }
  await page.waitForFunction(
    ({ testId, value }) => document.querySelector(`[data-testid="${testId}"]`)?.value === value,
    { testId: "working-branch-select", value: match.value },
    { timeout: 30_000 },
  );
}

async function ensureCustomer(page) {
  await gotoCustomers(page);
  const existing = page
    .getByTestId("customer-card")
    .filter({ has: page.locator(`td:first-child p`, { hasText: customerName }) });

  if ((await existing.count()) === 0) {
    await page.getByTestId("customer-create-open").click();
    await page.getByTestId("new-customer-page").waitFor({ state: "visible", timeout: 30_000 });
    await page.getByTestId("new-customer-name").fill(customerName);
    await page.getByTestId("new-customer-phone").fill(customerPhone);
    await page.getByTestId("new-customer-address").fill(customerAddress);
    await page.getByTestId("new-customer-save").click();
    await page.getByText("تمت إضافة العميل بنجاح", { exact: true }).waitFor({ timeout: 30_000 });
    await gotoCustomers(page);
  }

  const row = page.locator(
    `[data-testid="customer-card"][data-customer-name="${customerName.replaceAll('"', '\\"')}"]`,
  );
  await row.waitFor({ state: "visible", timeout: 30_000 });
  assert.equal((await row.getAttribute("data-customer-active")), "true", "Expected an active customer");
  assert.match((await row.innerText()), new RegExp(customerPhone.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

async function main() {
  const origin = validateLocalTarget(baseUrl);
  const browserPath = await resolveBrowser();
  const browser = await chromium.launch({ executablePath: browserPath, headless: true });
  const context = await browser.newContext({ locale: "ar-EG" });
  const page = await context.newPage();
  const runtimeFailures = [];

  page.on("pageerror", (error) => runtimeFailures.push(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) => {
    if (["document", "xhr", "fetch"].includes(request.resourceType())) {
      runtimeFailures.push(`requestfailed: ${request.resourceType()} ${request.failure()?.errorText ?? "unknown"}`);
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 500 && ["document", "xhr", "fetch"].includes(response.request().resourceType())) {
      runtimeFailures.push(`HTTP ${response.status()} ${new URL(response.url()).pathname}`);
    }
  });

  try {
    await signIn(page, origin);
    await ensureBranch(page);
    await selectWorkingBranch(page);
    await ensureCustomer(page);
    assert.deepEqual(runtimeFailures, [], `Runtime failures detected:\n${runtimeFailures.join("\n")}`);
    console.log("Local acceptance: PASS");
    console.log(`Branch: ${branchName} (${branchAddress}) - active and selected`);
    console.log(`Customer: ${customerName} (${customerPhone}) - active`);
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`Local acceptance: FAIL - ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
