import { expect, test, type Locator, type Page } from "@playwright/test";
import { login, navigateTo } from "./helpers";

function inputNextToLabel(page: Page, label: string) {
  return page.getByText(label, { exact: true }).locator("..").locator("input, textarea").first();
}

async function selectFirstRealOption(select: Locator) {
  const options = select.locator("option");
  const count = await options.count();
  expect(count).toBeGreaterThan(1);
  const value = await options.nth(1).getAttribute("value");
  expect(value).toBeTruthy();
  await select.selectOption(value!);
}

test.describe("critical operational flow readiness", () => {
  test("@flows sales invoice can be prepared from a real staging product", async ({ page }) => {
    await login(page, "admin");
    const productQuery = process.env.E2E_PRODUCT_QUERY?.trim();
    expect(productQuery, "E2E_PRODUCT_QUERY must identify a seeded staging product").toBeTruthy();

    await page.getByRole("button", { name: "فاتورة جديدة", exact: true }).first().click();
    await expect(page.getByRole("heading", { name: "فاتورة جديدة", exact: true })).toBeVisible();

    await inputNextToLabel(page, "اسم العميل *").fill(`E2E Invoice ${Date.now()}`);
    const search = page.getByPlaceholder("ابحث عن منتج...");
    await search.fill(productQuery!);

    const productResult = page.getByText(/متوفر:/).first().locator("xpath=ancestor::button[1]");
    await expect(productResult).toBeVisible();
    await productResult.click();

    const issue = page.getByRole("button", { name: "إصدار الفاتورة", exact: true });
    await expect(issue).toBeEnabled();
    await expect(page.getByText("ملخص الفاتورة", { exact: true })).toBeVisible();
  });

  test("@flows purchase shipment form resolves staging supplier and costs", async ({ page }) => {
    await login(page, "admin");
    await navigateTo(page, "الشحنات الواردة");
    await page.getByRole("button", { name: "شحنة جديدة", exact: true }).click();
    await expect(page.getByRole("heading", { name: "شحنة جديدة", exact: true })).toBeVisible();

    const supplierSelect = page.getByText("اختر مورداً", { exact: true }).locator("..").locator("select");
    await selectFirstRealOption(supplierSelect);
    await page.getByPlaceholder("اسم المنتج *").fill(`E2E Purchase Item ${Date.now()}`);
    await page.getByPlaceholder("تكلفة الوحدة").fill("100");

    await expect(page.getByText("الإجمالي الكلي", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "حفظ الشحنة", exact: true })).toBeVisible();
  });

  test("@flows repair intake reaches a valid pre-submit state", async ({ page }) => {
    await login(page, "admin");
    await navigateTo(page, "الصيانة");

    const branch = page.getByLabel("فرع أمر الصيانة");
    if (await branch.isVisible().catch(() => false)) await selectFirstRealOption(branch);

    await page.getByRole("button", { name: "طلب صيانة جديد", exact: true }).click();
    await expect(page.getByRole("heading", { name: "طلب صيانة جديد", exact: true })).toBeVisible();

    const suffix = Date.now().toString().slice(-7);
    await inputNextToLabel(page, "اسم العميل *").fill(`E2E Repair ${suffix}`);
    await inputNextToLabel(page, "رقم الهاتف *").fill(`010${suffix}`);
    await page.getByPlaceholder("مثال: Samsung, Apple").fill("Sony");
    await page.getByPlaceholder("مثال: Galaxy S23").fill("PlayStation 5");
    await page.getByPlaceholder("اشرح المشكلة بالتفصيل...").fill("E2E staging intake validation");
    await inputNextToLabel(page, "تكلفة العمالة (ج.م)").fill("100");

    await expect(page.getByRole("button", { name: "حفظ طلب الصيانة", exact: true })).toBeEnabled();
  });

  test("@flows COD delivery surface is bound to a staging branch and creation flow", async ({ page }) => {
    await login(page, "admin");
    await navigateTo(page, "التوصيلات");
    await expect(page.getByRole("heading", { name: "التوصيل والتحصيل COD", exact: true })).toBeVisible();

    const branch = page.locator("select.form-input.max-w-xs");
    if (await branch.isVisible().catch(() => false)) {
      const value = await branch.inputValue();
      if (!value) await selectFirstRealOption(branch);
    }

    for (const label of ["COD لدى شركات الشحن", "COD تمت تسويته", "COD معكوس", "رسوم شركات الشحن"]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }

    const create = page.getByRole("button", { name: "إنشاء من طلب وفاتورة", exact: true });
    await expect(create).toBeEnabled();
    await create.click();
    await expect(page.getByRole("heading", { name: "إنشاء سند توصيل", exact: true })).toBeVisible();
    await expect(page.getByRole("option", { name: "اختر طلباً جاهزاً", exact: true })).toBeAttached();
    await expect(page.getByRole("option", { name: "اختر الفاتورة المؤهلة", exact: true })).toBeAttached();
  });
});
