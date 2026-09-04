import assert from "node:assert/strict";
import {
  launchStagingBrowser,
  observeRuntimeFailures,
  signIn,
} from "../staging-browser-e2e.mjs";

const frontendUrl = "http://localhost:5173";
const adminEmail = process.env.LOCAL_E2E_ADMIN_EMAIL?.trim().toLowerCase();
const adminPassword = process.env.LOCAL_E2E_ADMIN_PASSWORD;

const fixture = {
  branchName: "فرع التجربة",
  branchAddress: "عنوان تجريبي",
  customerName: "عميل التجربة المحلي",
  customerPhone: "01000000001",
  customerAddress: "عنوان اختبار محلي",
};

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

async function ensureBranch(page) {
  const navigation = await openGroup(page, "administration");
  const button = navigation.getByTestId("nav-branches");
  await button.waitFor({ state: "visible", timeout: 30_000 });
  await button.click();
  const main = page.getByRole("main");
  await main.getByRole("heading", { name: "الفروع", exact: true }).waitFor({ timeout: 30_000 });

  const existing = main.getByRole("heading", { name: fixture.branchName, exact: true });
  if (!(await existing.isVisible().catch(() => false))) {
    const create = main.getByRole("button", { name: "فرع جديد", exact: true });
    if (await create.isVisible().catch(() => false)) await create.click();
    else await main.getByRole("button", { name: "إضافة فرع", exact: true }).click();
    await main.getByRole("heading", { name: "فرع جديد", exact: true }).waitFor({ timeout: 15_000 });
    await main.locator('input[placeholder="مثال: الفرع الرئيسي"]').fill(fixture.branchName);
    await main.locator('input[placeholder="عنوان الفرع"]').fill(fixture.branchAddress);
    await main.getByRole("button", { name: "إضافة الفرع", exact: true }).click();
    await waitForToast(page, "تم إضافة الفرع بنجاح");
  }
  await existing.waitFor({ state: "visible", timeout: 30_000 });
}

async function selectWorkingBranch(page) {
  const select = page.getByTestId("working-branch-select");
  await select.waitFor({ state: "visible", timeout: 30_000 });
  const options = await select.locator("option").evaluateAll((rows) =>
    rows.map((row) => ({ value: row.value, label: row.textContent?.trim() ?? "" })),
  );
  const matches = options.filter((option) => option.value && option.label === fixture.branchName);
  assert.equal(matches.length, 1, `Expected exactly one working branch named: ${fixture.branchName}`);
  const target = matches[0];
  const before = await select.inputValue();
  if (before !== target.value) {
    await select.selectOption(target.value);
    await waitForToast(page, "تم تغيير فرع العمل");
  }
  await page.waitForFunction(
    (value) => document.querySelector('[data-testid="working-branch-select"]')?.value === value,
    target.value,
    { timeout: 30_000 },
  );
}

async function typeLikeUser(locator, value) {
  await locator.waitFor({ state: "visible", timeout: 30_000 });
  await locator.click();
  await locator.press("Control+A");
  await locator.press("Backspace");
  await locator.pressSequentially(value, { delay: 20 });
  await locator.press("Tab");
  await locator.page().waitForFunction(
    ({ testId, expected }) => {
      const field = document.querySelector(`[data-testid="${testId}"]`);
      return field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement
        ? field.value === expected
        : false;
    },
    { testId: await locator.getAttribute("data-testid"), expected: value },
    { timeout: 10_000 },
  );
}

async function ensureCustomer(page) {
  const navigation = await openGroup(page, "customers");
  const button = navigation.getByTestId("nav-customers");
  await button.waitFor({ state: "visible", timeout: 30_000 });
  await button.click();
  const customers = page.getByTestId("customers-page");
  await customers.waitFor({ state: "visible", timeout: 45_000 });

  const search = customers.getByTestId("customer-search");
  await search.waitFor({ state: "visible", timeout: 30_000 });
  await search.fill(fixture.customerName);
  let row = customers.getByTestId("customer-card").filter({ hasText: fixture.customerName }).first();
  if (await row.count()) return;

  await customers.getByTestId("customer-create-open").click();
  const activePanel = page.locator('section[data-workspace-page="new-customer"][aria-hidden="false"]');
  await activePanel.waitFor({ state: "visible", timeout: 30_000 });
  const form = activePanel.getByTestId("new-customer-page");
  await form.waitFor({ state: "visible", timeout: 30_000 });

  await typeLikeUser(form.getByTestId("new-customer-name"), fixture.customerName);
  await typeLikeUser(form.getByTestId("new-customer-phone"), fixture.customerPhone);
  await typeLikeUser(form.getByTestId("new-customer-address"), fixture.customerAddress);

  const branch = form.getByTestId("new-customer-branch");
  if (await branch.count()) {
    const options = await branch.locator("option").evaluateAll((rows) =>
      rows.map((option) => ({ value: option.value, label: option.textContent?.trim() ?? "" })),
    );
    const exact = options.find((option) => option.value && option.label === fixture.branchName);
    assert.ok(exact, `Customer branch option is missing: ${fixture.branchName}`);
    if ((await branch.inputValue()) !== exact.value) await branch.selectOption(exact.value);
  }

  const save = form.getByTestId("new-customer-save");
  await save.waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(100);
  await save.click();
  await waitForToast(page, "تمت إضافة العميل بنجاح");

  await customers.waitFor({ state: "visible", timeout: 30_000 });
  await search.fill(fixture.customerName);
  row = customers.getByTestId("customer-card").filter({ hasText: fixture.customerName }).first();
  await row.waitFor({ state: "visible", timeout: 30_000 });
}

async function main() {
  assert.match(adminEmail ?? "", /^[^\s@]+@[^\s@]+\.[^\s@]+$/, "LOCAL_E2E_ADMIN_EMAIL is required");
  assert.ok(typeof adminPassword === "string" && adminPassword.length >= 8, "LOCAL_E2E_ADMIN_PASSWORD is required");

  const browser = await launchStagingBrowser();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    locale: "ar-EG",
    timezoneId: "Africa/Cairo",
  });
  const page = await context.newPage();
  const runtimeFailures = observeRuntimeFailures(page, frontendUrl);

  try {
    await signIn(page, frontendUrl, { role: "admin", email: adminEmail, password: adminPassword });
    await ensureBranch(page);
    await selectWorkingBranch(page);
    await ensureCustomer(page);
    assert.deepEqual(runtimeFailures, [], `Local fixture bootstrap browser failures:\n${runtimeFailures.join("\n")}`);
    console.log("LOCAL FIXTURE BOOTSTRAP: PASS - branch and customer ready");
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`LOCAL FIXTURE BOOTSTRAP: FAIL - ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
