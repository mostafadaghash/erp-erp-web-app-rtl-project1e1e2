import { expect, test } from "@playwright/test";
import { expectNav, hasCredentials, login, navigateTo, type E2ENavLabel, type E2ERole } from "./helpers";

const roleCases: Array<{
  role: Exclude<E2ERole, "admin">;
  visible: E2ENavLabel[];
  hidden: E2ENavLabel[];
}> = [
  {
    role: "manager",
    visible: ["فواتير المبيعات", "طلبات البيع", "أوامر الصيانة", "إدارة المخزون", "طلبات الشحن والتسويات", "مركز التقارير", "الفروع"],
    hidden: ["المستخدمون والصلاحيات", "سجل العمليات", "إعدادات النظام"],
  },
  {
    role: "accountant",
    visible: ["فواتير المبيعات", "مرتجعات المبيعات", "إدارة المخزون", "المصروفات", "الخزائن والحسابات", "حسابات الموردين", "مرتجعات المشتريات", "مركز التقارير"],
    hidden: ["طلبات البيع", "أوامر الصيانة", "الفروع", "المستخدمون والصلاحيات"],
  },
  {
    role: "sales",
    visible: ["فواتير المبيعات", "طلبات البيع", "إدارة المخزون", "قائمة العملاء", "عروض الأسعار"],
    hidden: ["أوامر الصيانة", "المصروفات", "مركز التقارير", "المستخدمون والصلاحيات"],
  },
  {
    role: "customer_service",
    visible: ["قائمة العملاء", "متابعة العملاء", "طلبات البيع", "أوامر الصيانة"],
    hidden: ["فواتير المبيعات", "الخزائن والحسابات", "مركز التقارير", "المستخدمون والصلاحيات"],
  },
  {
    role: "technician",
    visible: ["إدارة المخزون", "أوامر الصيانة", "متابعة العملاء"],
    hidden: ["فواتير المبيعات", "طلبات البيع", "الخزائن والحسابات", "المستخدمون والصلاحيات"],
  },
  {
    role: "shipping",
    visible: ["طلبات البيع", "فاتورة مشتريات جديدة", "فواتير المشتريات", "طلبات الشحن والتسويات"],
    hidden: ["فواتير المبيعات", "أوامر الصيانة", "الخزائن والحسابات", "المستخدمون والصلاحيات"],
  },
  {
    role: "viewer",
    visible: ["فواتير المبيعات", "طلبات البيع", "إدارة المخزون", "قائمة العملاء", "أوامر الصيانة", "عروض الأسعار"],
    hidden: ["المصروفات", "مركز التقارير", "الخزائن والحسابات", "المستخدمون والصلاحيات"],
  },
];

test.describe("role and branch access", () => {
  test("@roles admin exposes branch working context", async ({ page }) => {
    await login(page, "admin");
    await expectNav(page, "الفروع", true);

    const selector = page.getByTestId("working-branch-select");
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
        await expect(page.getByTestId("working-branch-select")).toHaveCount(0);
        await navigateTo(page, "الفروع");
        await expect(page.getByRole("heading", { name: "الفروع", exact: true })).toBeVisible();
        const totalStat = page.getByText("إجمالي الفروع", { exact: true }).locator("..");
        await expect(totalStat.getByText("1", { exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "فرع جديد", exact: true })).toHaveCount(0);
      }
    });
  }
});
