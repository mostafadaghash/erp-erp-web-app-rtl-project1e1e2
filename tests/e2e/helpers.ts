import { expect, type Page } from "@playwright/test";

export type E2ERole = "admin" | "manager" | "accountant" | "sales" | "viewer";

const envKeys: Record<E2ERole, [string, string]> = {
  admin: ["E2E_ADMIN_EMAIL", "E2E_ADMIN_PASSWORD"],
  manager: ["E2E_MANAGER_EMAIL", "E2E_MANAGER_PASSWORD"],
  accountant: ["E2E_ACCOUNTANT_EMAIL", "E2E_ACCOUNTANT_PASSWORD"],
  sales: ["E2E_SALES_EMAIL", "E2E_SALES_PASSWORD"],
  viewer: ["E2E_VIEWER_EMAIL", "E2E_VIEWER_PASSWORD"],
};

export function hasCredentials(role: E2ERole) {
  const [emailKey, passwordKey] = envKeys[role];
  return Boolean(process.env[emailKey]?.trim() && process.env[passwordKey]?.trim());
}

function credentials(role: E2ERole) {
  const [emailKey, passwordKey] = envKeys[role];
  const email = process.env[emailKey]?.trim();
  const password = process.env[passwordKey]?.trim();
  if (!email || !password) throw new Error(`Missing E2E credentials for role: ${role}`);
  return { email, password };
}

export async function login(page: Page, role: E2ERole) {
  const { email, password } = credentials(role);
  await page.goto("/");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page.getByRole("button", { name: "لوحة التحكم", exact: true })).toBeAttached();
  await expect(page.getByText("غير مصرح بالوصول", { exact: true })).toHaveCount(0);
}

export async function openNavigation(page: Page) {
  const viewport = page.viewportSize();
  if (viewport && viewport.width < 1024) {
    const menuButton = page.locator("header button").first();
    await expect(menuButton).toBeVisible();
    await menuButton.click();
  }
}

export async function navigateTo(page: Page, label: string) {
  await openNavigation(page);
  const button = page.getByRole("button", { name: label, exact: true });
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.getByText("غير مصرح بالوصول", { exact: true })).toHaveCount(0);
}

export async function expectNav(page: Page, label: string, visible: boolean) {
  await openNavigation(page);
  const button = page.getByRole("button", { name: label, exact: true });
  if (visible) await expect(button).toBeVisible();
  else await expect(button).toHaveCount(0);
}

export async function expectRtlAndNoHorizontalOverflow(page: Page) {
  const state = await page.evaluate(() => ({
    direction: getComputedStyle(document.body).direction,
    overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
  }));
  expect(state.direction).toBe("rtl");
  expect(state.overflow).toBeLessThanOrEqual(2);
}
