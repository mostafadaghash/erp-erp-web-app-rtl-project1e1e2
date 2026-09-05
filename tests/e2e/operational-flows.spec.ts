import { expect, test, type Locator } from "@playwright/test";
import { login, navigateTo } from "./helpers";

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

    await navigateTo(page, "فواتير المبيعات");
    await page.getByTestId("invoices-page").getByRole("button", { name: "فاتورة بيع جديدة", exact: true }).click();
    await expect(page.getByTestId("new-invoice-page")).toBeVisible();

    await selectFirstRealOption(page.getByTestId("invoice-customer-select"));
    const search = page.getByTestId("invoice-product-search");
    await search.fill(productQuery!);
    const productResult = page.getByTestId("invoice-product-result").first();
    await expect(productResult).toBeVisible();
    await productResult.click();

    await page.getByTestId("invoice-payment-method").selectOption("credit");
    await expect(page.getByTestId("invoice-submit")).toBeEnabled();
    await expect(page.getByText("ملخص الفاتورة", { exact: true })).toBeVisible();
  });

  test("@flows purchase invoice resolves staging supplier, product, and cost", async ({ page }) => {
    await login(page, "admin");
    const productQuery = process.env.E2E_PRODUCT_QUERY?.trim();
    expect(productQuery, "E2E_PRODUCT_QUERY must identify a seeded staging product").toBeTruthy();

    await navigateTo(page, "فاتورة مشتريات جديدة");
    await expect(page.getByTestId("new-purchase-invoice-page")).toBeVisible();
    await selectFirstRealOption(page.getByTestId("purchase-supplier-select"));

    await page.getByTestId("purchase-product-search").fill(productQuery!);
    const productResult = page.getByTestId("purchase-product-result").first();
    await expect(productResult).toBeVisible();
    await productResult.click();
    await page.locator("[data-purchase-unit-cost]").first().fill("100");

    await expect(page.getByText("الإجمالي الكلي", { exact: true })).toBeVisible();
    await expect(page.getByTestId("purchase-submit")).toBeEnabled();
  });

  test("@flows repair intake reaches a valid pre-submit state", async ({ page }) => {
    await login(page, "admin");
    await navigateTo(page, "أوامر الصيانة");

    const branch = page.getByTestId("repair-branch-select");
    if (await branch.isVisible().catch(() => false)) await selectFirstRealOption(branch);

    await page.getByTestId("repair-create-open").click();
    await expect(page.getByTestId("repair-create-form")).toBeVisible();
    await selectFirstRealOption(page.getByTestId("repair-customer-select"));
    await page.getByTestId("repair-device-brand").fill("Sony");
    await page.getByTestId("repair-device-model").fill("PlayStation 5");
    await page.getByTestId("repair-problem").fill("E2E staging intake validation");
    await page.getByTestId("repair-labor-cost").fill("100");

    await expect(page.getByTestId("repair-submit")).toBeEnabled();
  });

  test("@flows shipping COD surface is bound to a staging branch and creation flow", async ({ page }) => {
    await login(page, "admin");
    await navigateTo(page, "طلبات الشحن والتسويات");
    await expect(page.getByTestId("deliveries-page")).toBeVisible();

    const branch = page.getByTestId("delivery-branch-select");
    if (await branch.isVisible().catch(() => false)) {
      const value = await branch.inputValue();
      if (!value) await selectFirstRealOption(branch);
    }

    for (const label of ["COD لدى شركات الشحن", "COD تمت تسويته", "COD ملغي", "رسوم شركات الشحن"]) {
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
