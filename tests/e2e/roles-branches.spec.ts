import { expect, test } from "@playwright/test";
import { expectNav, hasCredentials, login, openNavigation, type E2ERole } from "./helpers";

const roleCases: Array<{
  role: Exclude<E2ERole, "admin">;
  visible: string[];
  hidden: string[];
}> = [
  {
    role: "manager",
    visible: ["المبيعات والفواتير", "الأوردرات", "الصيانة", "التقارير", "الفروع"],
    hidden: ["الموظفون والصلاحيات", "سجل العمليات", "الإعدادات"],
  },
  {
    role: "accountant",
    visible: ["المبيعات والفواتير", "المصروفات", "الخزائن والحسابات", "التقارير", "الأستاذ العام"],
    hidden: ["الأوردرات", "الصيانة", "الفروع", "الموظفون والصلاحيات"],
  },
  {
    role: "sales",
    visible: ["المبيعات والفواتير", "الأوردرات", "المنتجات والمخزون", "العملاء"],
    hidden: ["الصيانة", "المصروفات", "التقارير", "الموظفون والصلاحيات"],
  },
  {
    role: "viewer",
    visible: ["المبيعات والفواتير", "الأوردرات", "المنتجات والمخزون", "العملاء", "الصيانة"],
    hidden: ["المصروفات", "التقارير", "الخزائن والحسابات", "الموظفون والصلاحيات"],
  },
];

test.describe("role and branch access", () => {
  test("@roles admin exposes branch working context", async ({ page }) => {
    await login(page, "admin");
    await openNavigation(page);
    await expect(page.getByRole("button", { name: "الفروع", exact: true })).toBeVisible();

    const selector = page.getByLabel("فرع العمل الحالي");
    await expect(selector).toBeVisible();
    expect(await selector.locator("option").count()).toBeGreaterThanOrEqual(2);
  });

  for (const roleCase of roleCases) {
    test(`@roles ${roleCase.role} navigation matches server role permissions`, async ({ page }) => {
      test.skip(!hasCredentials(roleCase.role), `No staging credentials configured for ${roleCase.role}`);
      await login(page, roleCase.role);

      for (const label of roleCase.visible) await expectNav(page, label, true);
      for (const label of roleCase.hidden) await expectNav(page, label, false);

      if (roleCase.role === "manager") {
        await expect(page.getByLabel("فرع العمل الحالي")).toHaveCount(0);
      }
    });
  }
});
