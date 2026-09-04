import { expect, type Page } from "@playwright/test";

export type E2ERole =
  | "admin"
  | "manager"
  | "accountant"
  | "sales"
  | "customer_service"
  | "technician"
  | "shipping"
  | "viewer";

export const NAV_TARGETS = {
  "لوحة التحكم": { item: "dashboard" },
  "فاتورة بيع جديدة": { group: "sales", item: "new-invoice" },
  "فواتير المبيعات": { group: "sales", item: "invoices" },
  "مرتجعات المبيعات": { group: "sales", item: "sales-returns" },
  "عروض الأسعار": { group: "sales", item: "quotes" },
  "طلبات البيع": { group: "sales", item: "orders" },
  "إضافة عميل": { group: "customers", item: "new-customer" },
  "قائمة العملاء": { group: "customers", item: "customers" },
  "متابعة العملاء": { group: "customers", item: "follow-ups" },
  "فاتورة مشتريات جديدة": { group: "purchases", item: "new-purchase-invoice" },
  "فواتير المشتريات": { group: "purchases", item: "shipments" },
  "مرتجعات المشتريات": { group: "purchases", item: "purchase-returns" },
  "الموردون": { group: "purchases", item: "suppliers" },
  "إدارة المخزون": { group: "inventory", item: "inventory" },
  "أوامر الصيانة": { group: "service", item: "repairs" },
  "طلبات الشحن والتسويات": { group: "shipping", item: "deliveries" },
  "نظرة عامة": { group: "accounting", item: "accounts-home" },
  "الخزائن والحسابات": { group: "accounting", item: "treasury" },
  "سندات القبض والصرف": { group: "accounting", item: "vouchers" },
  "حسابات العملاء": { group: "accounting", item: "customer-ledger" },
  "حسابات الموردين": { group: "accounting", item: "supplier-payments" },
  "الفواتير الآجلة": { group: "accounting", item: "credit-invoices" },
  "الشيكات والأقساط": { group: "accounting", item: "payment-schedules" },
  "المصروفات": { group: "accounting", item: "expenses" },
  "مركز التقارير": { group: "reports", item: "reports" },
  "الفروع": { group: "administration", item: "branches" },
  "المستخدمون والصلاحيات": { group: "administration", item: "employees" },
  "سجل العمليات": { group: "administration", item: "audit-logs" },
  "إعدادات النظام": { group: "administration", item: "settings" },
} as const;

export type E2ENavLabel = keyof typeof NAV_TARGETS;

const envKeys: Record<E2ERole, [string, string]> = {
  admin: ["E2E_ADMIN_EMAIL", "E2E_ADMIN_PASSWORD"],
  manager: ["E2E_MANAGER_EMAIL", "E2E_MANAGER_PASSWORD"],
  accountant: ["E2E_ACCOUNTANT_EMAIL", "E2E_ACCOUNTANT_PASSWORD"],
  sales: ["E2E_SALES_EMAIL", "E2E_SALES_PASSWORD"],
  customer_service: ["E2E_CUSTOMER_SERVICE_EMAIL", "E2E_CUSTOMER_SERVICE_PASSWORD"],
  technician: ["E2E_TECHNICIAN_EMAIL", "E2E_TECHNICIAN_PASSWORD"],
  shipping: ["E2E_SHIPPING_EMAIL", "E2E_SHIPPING_PASSWORD"],
  viewer: ["E2E_VIEWER_EMAIL", "E2E_VIEWER_PASSWORD"],
};

function roleAccountsFromJson() {
  const raw = process.env.E2E_ROLE_ACCOUNTS_JSON?.trim();
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("E2E_ROLE_ACCOUNTS_JSON must be valid JSON");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("E2E_ROLE_ACCOUNTS_JSON must be a JSON array");
  }
  return parsed as Array<{ role?: string; email?: string; password?: string }>;
}

export function hasCredentials(role: E2ERole) {
  const jsonAccount = roleAccountsFromJson().find((account) => account.role === role);
  if (jsonAccount) return Boolean(jsonAccount.email?.trim() && jsonAccount.password?.trim());
  const [emailKey, passwordKey] = envKeys[role];
  return Boolean(process.env[emailKey]?.trim() && process.env[passwordKey]?.trim());
}

function credentials(role: E2ERole) {
  const jsonAccount = roleAccountsFromJson().find((account) => account.role === role);
  if (jsonAccount) {
    const email = jsonAccount.email?.trim();
    const password = jsonAccount.password?.trim();
    if (!email || !password) throw new Error(`Missing E2E credentials for role: ${role}`);
    return { email, password };
  }
  const [emailKey, passwordKey] = envKeys[role];
  const email = process.env[emailKey]?.trim();
  const password = process.env[passwordKey]?.trim();
  if (!email || !password) throw new Error(`Missing E2E credentials for role: ${role}`);
  return { email, password };
}

export async function login(page: Page, role: E2ERole) {
  const { email, password } = credentials(role);
  await page.goto("/", { waitUntil: "commit" });
  await expect(page.getByRole("heading", { name: "تسجيل الدخول", exact: true })).toBeVisible({ timeout: 45_000 });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page.getByTestId("nav-dashboard")).toBeAttached({ timeout: 45_000 });
  await expect(page.getByTestId("current-user-role")).toHaveAttribute("data-user-role", role);
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

async function navigationButton(page: Page, label: E2ENavLabel, required: boolean) {
  await openNavigation(page);
  const target = NAV_TARGETS[label];
  const navigation = page.getByRole("navigation", { name: "القائمة الرئيسية" });
  if (!("group" in target)) {
    const button = navigation.getByTestId(`nav-${target.item}`);
    if (required) await expect(button).toBeVisible();
    return button;
  }
  const group = navigation.getByTestId(`nav-group-${target.group}`);
  if ((await group.count()) === 0) {
    if (required) throw new Error(`Missing navigation group for ${label}`);
    return null;
  }
  if ((await group.getAttribute("aria-expanded")) !== "true") await group.click();
  const button = navigation.getByTestId(`nav-${target.item}`);
  if (required) await expect(button).toBeVisible();
  return button;
}

export async function navigateTo(page: Page, label: E2ENavLabel) {
  const button = await navigationButton(page, label, true);
  if (!button) throw new Error(`Missing navigation target: ${label}`);
  await button.click();
  await expect(page.getByText("غير مصرح بالوصول", { exact: true })).toHaveCount(0);
}

export async function expectNav(page: Page, label: E2ENavLabel, visible: boolean) {
  const button = await navigationButton(page, label, false);
  if (!button) {
    expect(visible).toBe(false);
    return;
  }
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
