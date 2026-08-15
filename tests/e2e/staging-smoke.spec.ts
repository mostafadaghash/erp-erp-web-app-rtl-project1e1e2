import { expect, test } from "@playwright/test";
import { expectRtlAndNoHorizontalOverflow, login, navigateTo, openNavigation } from "./helpers";

test.describe("staging browser smoke", () => {
  test("@smoke admin login and critical ERP navigation", async ({ page }) => {
    await login(page, "admin");
    await expectRtlAndNoHorizontalOverflow(page);

    for (const label of [
      "المبيعات",
      "الأصناف",
      "أوامر الصيانة",
      "عمليات الشحن",
      "الخزائن والبنوك",
      "مركز التقارير",
    ]) {
      await navigateTo(page, label);
      await expectRtlAndNoHorizontalOverflow(page);
    }
  });

  test("@mobile mobile RTL shell remains usable with keyboard focus", async ({ page }) => {
    await login(page, "admin");
    await expectRtlAndNoHorizontalOverflow(page);
    await openNavigation(page);
    await expect(page.getByRole("button", { name: "لوحة التحكم", exact: true })).toBeVisible();

    await page.keyboard.press("Tab");
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName ?? "");
    expect(["BUTTON", "A", "INPUT", "SELECT"]).toContain(focusedTag);
  });

  test("@smoke print stylesheet keeps A4 document surface bounded and RTL", async ({ page }) => {
    await login(page, "admin");
    await page.emulateMedia({ media: "print" });
    const result = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.className = "print-page";
      probe.textContent = "PRINT-E2E";
      document.body.appendChild(probe);
      const style = getComputedStyle(probe);
      const value = {
        direction: style.direction,
        maxWidth: parseFloat(style.maxWidth),
        width: probe.getBoundingClientRect().width,
      };
      probe.remove();
      return value;
    });

    expect(result.direction).toBe("rtl");
    expect(result.maxWidth).toBeGreaterThan(700);
    expect(result.maxWidth).toBeLessThan(850);
    expect(result.width).toBeLessThanOrEqual(result.maxWidth + 1);
  });
});
