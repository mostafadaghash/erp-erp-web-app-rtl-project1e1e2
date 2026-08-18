import { expect, test, type Locator, type Page } from "@playwright/test";
import { login, navigateTo } from "./helpers";

function inputNextToLabel(page: Page, label: string) {
  return page.getByText(label, { exact: true }).locator("..").locator("input, textarea").first();
}

async function selectFirstRealOption(select: Locator) {
  await expect(select).toBeVisible();
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

    await navigateTo(page, "المبيعات");
    await page
      .getByTestId("invoices-page")
      .getByRole("button", { name: "فاتورة بيع جديدة", exact: true })
      .click();
    await expect(page.getByTestId("new-invoice-page")).toBeVisible();

    await inputNextToLabel(page, "اسم العميل *").fill(`E2E Invoice ${Date.now()}`);
    const search = page.getByTestId("invoice-product-search");
    await search.fill(productQuery!);

    const productResult = page.getByTestId("invoice-product-result").first();
    await expect(productResult).toBeVisible();
    await productResult.click();

    const issue = page.getByTestId("invoice-submit");
    await expect(issue).toBeEnabled();
    await expect(page.getByText("ملخص الفاتورة", { exact: true })).toBeVisible();
  });

  test("@flows purchase form resolves staging supplier and costs", async ({ page }) => {
    await login(page, "admin");
    await navigateTo(page, "المشتريات");
    await page.getByTestId("shipment-create-open").click();
    await expect(page.getByTestId("shipment-create-form")).toBeVisible();

    await selectFirstRealOption(page.getByTestId("shipment-supplier-select"));
    const item = page.getByTestId("shipment-item-row").first();
    await item.getByPlaceholder("اسم الصنف *").fill(`E2E Purchase Item ${Date.now()}`);
    await item.getByTestId("shipment-item-unit-cost").fill("100");

    await expect(page.getByText("الإجمالي الكلي", { exact: true })).toBeVisible();
    await expect(page.getByTestId("shipment-submit")).toBeVisible();
  });

  test("@flows repair intake reaches a valid pre-submit state", async ({ page }) => {
    await login(page, "admin");
    await navigateTo(page, "أوامر الصيانة");

    const branch = page.getByTestId("repair-branch-select");
    if (await branch.isVisible().catch(() => false)) await selectFirstRealOption(branch);

    await page.getByTestId("repair-create-open").click();
    await expect(page.getByTestId("repair-create-form")).toBeVisible();

    const suffix = Date.now().toString().slice(-7);
    await inputNextToLabel(page, "اسم العميل *").fill(`E2E Repair ${suffix}`);
    await inputNextToLabel(page, "رقم الهاتف *").fill(`010${suffix}`);
    await page.getByTestId("repair-device-brand").fill("Sony");
    await page.getByTestId("repair-device-model").fill("PlayStation 5");
    await page.getByTestId("repair-problem").fill("E2E staging intake validation");
    await page.getByTestId("repair-labor-cost").fill("100");

    await expect(page.getByTestId("repair-submit")).toBeEnabled();
  });

  test("@flows shipping COD surface is bound to a staging branch and creation flow", async ({ page }) => {
    await login(page, "admin");
    await navigateTo(page, "عمليات الشحن");
    await expect(page.getByTestId("deliveries-page")).toBeVisible();

    const branch = page.getByTestId("delivery-branch-select");
    if (await branch.isVisible().catch(() => false)) {
      const value = await branch.inputValue();
      if (!value) await selectFirstRealOption(branch);
    }

    for (const label of ["COD لدى شركات الشحن", "COD تمت تسويته", "COD معكوس", "رسوم شركات الشحن"]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }

    const create = page.getByTestId("delivery-create-open");
    await expect(create).toBeEnabled();
    await create.click();
    await expect(page.getByTestId("delivery-action-modal")).toBeVisible();
    await expect(page.getByTestId("delivery-order-select")).toBeAttached();
    await expect(page.getByTestId("delivery-invoice-select")).toBeAttached();
  });
});
