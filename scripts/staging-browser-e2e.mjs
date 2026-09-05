import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream, readFileSync } from "node:fs";
import { access, mkdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, win32 } from "node:path";
import { once } from "node:events";
import { pipeline } from "node:stream/promises";
import { createBrotliDecompress } from "node:zlib";
import { pathToFileURL } from "node:url";
import chromiumPackage from "@sparticuz/chromium";
import { chromium } from "playwright-core";
import { stagingOrigins } from "./lib/staging-safety.mjs";

export const roles = [
  "admin",
  "manager",
  "sales",
  "customer_service",
  "technician",
  "accountant",
  "shipping",
  "viewer",
];

const navigationTargets = {
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
};

const navigationByRole = {
  admin: {
    visible: Object.keys(navigationTargets),
    hidden: [],
    smoke: ["فواتير المبيعات", "إدارة المخزون", "مركز التقارير"],
  },
  manager: {
    visible: [
      "فاتورة بيع جديدة", "فواتير المبيعات", "مرتجعات المبيعات", "عروض الأسعار", "طلبات البيع",
      "إضافة عميل", "قائمة العملاء", "متابعة العملاء",
      "فاتورة مشتريات جديدة", "فواتير المشتريات", "مرتجعات المشتريات", "الموردون",
      "إدارة المخزون", "أوامر الصيانة", "طلبات الشحن والتسويات",
      "نظرة عامة", "الخزائن والحسابات", "سندات القبض والصرف", "حسابات العملاء", "حسابات الموردين",
      "الفواتير الآجلة", "الشيكات والأقساط", "المصروفات", "مركز التقارير", "الفروع",
    ],
    hidden: ["المستخدمون والصلاحيات", "سجل العمليات", "إعدادات النظام"],
    smoke: ["فواتير المبيعات", "إدارة المخزون", "مركز التقارير"],
  },
  sales: {
    visible: [
      "فاتورة بيع جديدة", "فواتير المبيعات", "عروض الأسعار", "طلبات البيع",
      "إضافة عميل", "قائمة العملاء", "متابعة العملاء", "إدارة المخزون", "الفواتير الآجلة",
    ],
    hidden: ["مرتجعات المبيعات", "أوامر الصيانة", "طلبات الشحن والتسويات", "مركز التقارير", "الخزائن والحسابات", "المستخدمون والصلاحيات", "إعدادات النظام"],
    smoke: ["فواتير المبيعات", "طلبات البيع", "قائمة العملاء"],
  },
  customer_service: {
    visible: ["إضافة عميل", "قائمة العملاء", "متابعة العملاء", "طلبات البيع", "أوامر الصيانة"],
    hidden: ["فواتير المبيعات", "إدارة المخزون", "الخزائن والحسابات", "مركز التقارير", "المستخدمون والصلاحيات", "إعدادات النظام"],
    smoke: ["طلبات البيع", "أوامر الصيانة", "قائمة العملاء"],
  },
  technician: {
    visible: ["إدارة المخزون", "أوامر الصيانة", "متابعة العملاء"],
    hidden: ["فواتير المبيعات", "طلبات البيع", "الخزائن والحسابات", "مركز التقارير", "المستخدمون والصلاحيات"],
    smoke: ["أوامر الصيانة", "إدارة المخزون"],
  },
  accountant: {
    visible: [
      "فواتير المبيعات", "مرتجعات المبيعات", "عروض الأسعار", "قائمة العملاء", "مرتجعات المشتريات", "إدارة المخزون",
      "نظرة عامة", "الخزائن والحسابات", "سندات القبض والصرف", "حسابات العملاء", "حسابات الموردين",
      "الفواتير الآجلة", "الشيكات والأقساط", "المصروفات", "مركز التقارير",
    ],
    hidden: ["طلبات البيع", "أوامر الصيانة", "فواتير المشتريات", "الموردون", "الفروع", "المستخدمون والصلاحيات", "سجل العمليات", "إعدادات النظام"],
    smoke: ["الخزائن والحسابات", "حسابات الموردين", "مركز التقارير"],
  },
  shipping: {
    visible: ["طلبات البيع", "متابعة العملاء", "فاتورة مشتريات جديدة", "فواتير المشتريات", "طلبات الشحن والتسويات"],
    hidden: ["فواتير المبيعات", "إدارة المخزون", "أوامر الصيانة", "الخزائن والحسابات", "مركز التقارير", "المستخدمون والصلاحيات"],
    smoke: ["طلبات البيع", "فواتير المشتريات", "طلبات الشحن والتسويات"],
  },
  viewer: {
    visible: ["فواتير المبيعات", "عروض الأسعار", "طلبات البيع", "قائمة العملاء", "إدارة المخزون", "أوامر الصيانة", "الفواتير الآجلة"],
    hidden: ["فاتورة بيع جديدة", "متابعة العملاء", "المصروفات", "مركز التقارير", "الخزائن والحسابات", "المستخدمون والصلاحيات", "إعدادات النظام"],
    smoke: ["إدارة المخزون", "قائمة العملاء", "فواتير المبيعات"],
  },
};

const outputRoot = resolve("test-results/staging-e2e");
const packageRoot = resolve("node_modules/@sparticuz/chromium/bin");
const runtimeRoot = join(tmpdir(), "erp-staging-browser-runtime");
const browserPath = join(runtimeRoot, "chromium");

export function windowsBrowserCandidates(environment = process.env) {
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

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function inflateFile(source, destination) {
  await pipeline(
    createReadStream(source),
    createBrotliDecompress(),
    createWriteStream(destination, { mode: 0o700 }),
  );
}

async function inflateTar(source, destination) {
  await mkdir(destination, { recursive: true });
  const child = spawn(
    "tar",
    ["--no-same-owner", "-xf", "-", "-C", destination],
    { stdio: ["pipe", "ignore", "pipe"] },
  );
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  await pipeline(
    createReadStream(source),
    createBrotliDecompress(),
    child.stdin,
  );
  const [code] = await once(child, "close");
  if (code !== 0) throw new Error(`تعذر فك حزمة Chromium: ${stderr.trim()}`);
}

async function prepareWindowsBrowser() {
  for (const candidate of windowsBrowserCandidates()) {
    if (await exists(candidate)) return candidate;
  }
  throw new Error(
    "No supported browser was found on Windows. Install Chrome or Edge, or set E2E_BROWSER_EXECUTABLE to its full path.",
  );
}

async function prepareBrowser() {
  if (process.platform === "win32") return prepareWindowsBrowser();

  await mkdir(runtimeRoot, { recursive: true });
  await mkdir(join(runtimeRoot, "font-cache"), { recursive: true });
  await writeFile(
    join(runtimeRoot, "fonts.conf"),
    `<?xml version="1.0"?>
<fontconfig>
  <dir>/usr/share/fonts/truetype/dejavu</dir>
  <dir>${join(tmpdir(), "fonts")}</dir>
  <cachedir>${join(runtimeRoot, "font-cache")}</cachedir>
  <config></config>
</fontconfig>\n`,
  );
  const browserReady =
    (await exists(browserPath)) && (await stat(browserPath)).size > 100_000_000;
  if (!browserReady) {
    await inflateFile(join(packageRoot, "chromium.br"), browserPath);
  }
  if (!(await exists(join(tmpdir(), "fonts.conf")))) {
    await inflateTar(join(packageRoot, "fonts.tar.br"), tmpdir());
  }
  if (!(await exists(join(runtimeRoot, "libGLESv2.so")))) {
    await inflateTar(join(packageRoot, "swiftshader.tar.br"), runtimeRoot);
  }
  return browserPath;
}

export function stagingConfig() {
  const origins = stagingOrigins();

  let accounts;
  try {
    const environmentAccounts = process.env.E2E_ROLE_ACCOUNTS_JSON?.trim();
    const localAccounts = environmentAccounts
      ? environmentAccounts
      : readFileSync(resolve(".staging-role-accounts.json.local"), "utf8");
    accounts = JSON.parse(localAccounts);
  } catch {
    throw new Error(
      "E2E_ROLE_ACCOUNTS_JSON or .staging-role-accounts.json.local must be valid JSON",
    );
  }
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error("E2E_ROLE_ACCOUNTS_JSON must contain at least one account");
  }

  const seenRoles = new Set();
  const seenEmails = new Set();
  for (const account of accounts) {
    assert.equal(typeof account, "object");
    assert.ok(
      roles.includes(account.role),
      `Unsupported E2E role: ${account.role}`,
    );
    assert.match(account.email ?? "", /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i);
    assert.ok(
      typeof account.password === "string" && account.password.length >= 8,
      `Missing password for ${account.role}`,
    );
    assert.ok(!seenRoles.has(account.role), `Duplicate role: ${account.role}`);
    assert.ok(
      !seenEmails.has(account.email),
      "E2E account emails must be unique",
    );
    seenRoles.add(account.role);
    seenEmails.add(account.email);
  }

  const requireAllRoles = process.env.E2E_REQUIRE_ALL_ROLES === "true";
  if (requireAllRoles) {
    const missing = roles.filter((role) => !seenRoles.has(role));
    assert.deepEqual(
      missing,
      [],
      `Missing staging roles: ${missing.join(", ")}`,
    );
  } else {
    assert.ok(
      seenRoles.has("admin"),
      "At least the admin E2E account is required",
    );
  }

  return {
    baseUrl: origins.frontend.origin,
    convexDeploymentId: origins.convexDeploymentId,
    requireAllRoles,
    accounts: [...accounts].sort(
      (left, right) => roles.indexOf(left.role) - roles.indexOf(right.role),
    ),
  };
}

async function verifySecurityHeaders(baseUrl) {
  const response = await fetch(baseUrl, {
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers: { "User-Agent": "erp-staging-browser-acceptance/1.0" },
  });
  assert.ok(response.ok, `Staging root returned HTTP ${response.status}`);
  const headers = response.headers;
  const csp = headers.get("content-security-policy") ?? "";
  assert.match(csp, /default-src\s+'self'/i);
  assert.match(csp, /frame-ancestors\s+'none'/i);
  assert.match(headers.get("strict-transport-security") ?? "", /max-age=/i);
  assert.equal(headers.get("x-content-type-options")?.toLowerCase(), "nosniff");
  assert.equal(headers.get("x-frame-options")?.toUpperCase(), "DENY");
  assert.ok(headers.get("referrer-policy"));
  assert.ok(headers.get("permissions-policy"));
  assert.notEqual(headers.get("access-control-allow-origin"), "*");
  return {
    contentSecurityPolicy: true,
    strictTransportSecurity: true,
    contentTypeProtection: true,
    frameProtection: true,
    referrerPolicy: true,
    permissionsPolicy: true,
    wildcardCors: false,
  };
}

export async function gotoStagingPage(page, url) {
  const response = await page.goto(url, {
    waitUntil: "commit",
    timeout: 45_000,
  });
  assert.ok(response, "Staging navigation did not return a document response");
  return response;
}

export async function signIn(page, baseUrl, account) {
  await gotoStagingPage(page, baseUrl);
  await page
    .getByRole("heading", { name: "تسجيل الدخول", exact: true })
    .waitFor({ timeout: 45_000 });
  await page.locator('input[name="email"]').fill(account.email);
  await page.locator('input[name="password"]').fill(account.password);
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await page
    .getByRole("main")
    .getByRole("heading", { name: "لوحة التحكم", exact: true })
    .waitFor({ timeout: 45_000 });
}

async function openNavigationGroup(navigation, groupKey, required) {
  const groupButton = navigation.getByTestId(`nav-group-${groupKey}`);
  if (!(await groupButton.count())) {
    if (required) throw new Error(`Missing navigation group: ${groupKey}`);
    return false;
  }
  if ((await groupButton.getAttribute("aria-expanded")) !== "true") {
    await groupButton.click();
  }
  return true;
}

export async function sidebarNavigationButton(page, label, { required = true } = {}) {
  const target = navigationTargets[label];
  assert.ok(target, `Missing navigation target mapping for: ${label}`);
  const navigation = page.getByRole("navigation", { name: "القائمة الرئيسية" });
  if (!target.group) {
    const button = navigation.getByTestId(`nav-${target.item}`);
    if (required) await button.waitFor({ state: "visible", timeout: 30_000 });
    return button;
  }
  const available = await openNavigationGroup(navigation, target.group, required);
  if (!available) return null;
  const button = navigation.getByTestId(`nav-${target.item}`);
  if (required) await button.waitFor({ state: "visible", timeout: 30_000 });
  return button;
}

export async function navigateSidebar(page, label) {
  const target = navigationTargets[label];
  assert.ok(target, `Missing navigation target mapping for: ${label}`);
  const button = await sidebarNavigationButton(page, label);
  assert.ok(button);
  await button.click();
  if (target.group) {
    await page.waitForFunction(
      (key) => document.querySelector(`[data-testid="nav-group-${key}"]`)?.getAttribute("aria-expanded") === "false",
      target.group,
      { timeout: 30_000 },
    );
  }
}

async function assertRoleNavigation(page, role) {
  const rule = navigationByRole[role];
  assert.ok(rule, `Missing navigation rule for ${role}`);

  for (const label of rule.visible) {
    await sidebarNavigationButton(page, label);
  }
  for (const label of rule.hidden) {
    const button = await sidebarNavigationButton(page, label, { required: false });
    assert.equal(
      button ? await button.count() : 0,
      0,
      `${role} unexpectedly sees ${label}`,
    );
  }

  const pages = [];
  for (const label of rule.smoke) {
    await navigateSidebar(page, label);
    await page.locator("main h1").first().waitFor({ timeout: 30_000 });
    const activeButton = await sidebarNavigationButton(page, label);
    assert.equal(await activeButton.getAttribute("aria-current"), "page");
    pages.push({
      navigation: label,
      heading: await page.locator("main h1").first().innerText(),
    });
  }
  return pages;
}

export function redactEvidence(value) {
  return String(value)
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[redacted-email]")
    .replace(/https?:\/\/[^\s)]+/gi, "[redacted-url]")
    .slice(0, 400);
}

export function observeRuntimeFailures(page, baseUrl) {
  const failures = [];
  page.on("pageerror", (error) =>
    failures.push(`pageerror: ${redactEvidence(error.message)}`),
  );
  page.on("console", (message) => {
    if (message.type() === "error") {
      const location = message.location().url;
      let source = "";
      if (location) {
        try {
          const target = new URL(location);
          source =
            target.origin === baseUrl
              ? ` ${target.pathname}`
              : ` ${target.origin}`;
        } catch {
          source = "";
        }
      }
      failures.push(
        `console.error${source}: ${redactEvidence(message.text())}`,
      );
    }
  });
  page.on("requestfailed", (request) => {
    if (["document", "xhr", "fetch"].includes(request.resourceType())) {
      failures.push(
        `requestfailed: ${request.resourceType()} ${redactEvidence(request.failure()?.errorText ?? "unknown")}`,
      );
    }
  });
  page.on("response", (response) => {
    const type = response.request().resourceType();
    if (
      response.status() >= 500 &&
      ["document", "xhr", "fetch"].includes(type)
    ) {
      const target = new URL(response.url());
      failures.push(
        `HTTP ${response.status()} ${target.origin === baseUrl ? target.pathname : target.origin}`,
      );
    }
  });
  return failures;
}

export async function safeScreenshot(page, path) {
  const sensitiveInputs = page.locator(
    'input[type="password"], input[type="email"], input[name="email"]',
  );
  await page.screenshot({
    path,
    fullPage: true,
    mask: (await sensitiveInputs.count()) ? [sensitiveInputs] : [],
  });
}

export async function launchStagingBrowser() {
  const executablePath = await prepareBrowser();
  if (process.platform === "win32") {
    return chromium.launch({ executablePath, headless: true });
  }

  chromiumPackage.setGraphicsMode = false;
  return chromium.launch({
    executablePath,
    args: chromiumPackage.args.filter(
      (argument) => argument !== "--single-process",
    ),
    headless: true,
    env: {
      ...process.env,
      FONTCONFIG_PATH: runtimeRoot,
      XDG_CACHE_HOME: join(runtimeRoot, "cache"),
    },
  });
}

async function runRole(browser, config, account) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "ar-EG",
    timezoneId: "Africa/Cairo",
  });
  const page = await context.newPage();
  const failures = observeRuntimeFailures(page, config.baseUrl);
  try {
    await signIn(page, config.baseUrl, account);
    assert.equal(await page.locator("html").getAttribute("lang"), "ar");
    assert.equal((await page.locator('[dir="rtl"]').count()) > 0, true);
    const visitedPages = await assertRoleNavigation(page, account.role);
    await safeScreenshot(
      page,
      join(outputRoot, `${account.role}-role-smoke.png`),
    );
    assert.deepEqual(failures, [], `${account.role} browser runtime failures`);
    const signOutButton = page.getByRole("button", { name: "تسجيل الخروج", exact: true });
    await signOutButton.click();
    await signOutButton.waitFor({ state: "detached", timeout: 45_000 });
    await page.locator('input[name="email"]').waitFor({ state: "visible", timeout: 45_000 });
    await page.locator('input[name="password"]').waitFor({ state: "visible", timeout: 45_000 });
    return { role: account.role, visitedPages, logout: true };
  } catch (error) {
    await safeScreenshot(page, join(outputRoot, `${account.role}-failure.png`));
    throw error;
  } finally {
    await context.close();
  }
}

async function runMobileAdmin(browser, config, account) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "ar-EG",
    timezoneId: "Africa/Cairo",
  });
  const page = await context.newPage();
  try {
    await signIn(page, config.baseUrl, account);
    const openNavigation = page.getByRole("button", {
      name: "فتح القائمة الرئيسية",
    });
    await openNavigation.focus();
    assert.equal(
      await openNavigation.evaluate((element) => document.activeElement === element),
      true,
    );
    await page.keyboard.press("Enter");
    await page
      .getByRole("button", { name: "إغلاق القائمة الرئيسية" })
      .waitFor();
    await safeScreenshot(page, join(outputRoot, "admin-mobile-navigation.png"));
    const closeNavigation = page.getByRole("button", {
      name: "إغلاق القائمة الرئيسية",
    });
    await closeNavigation.focus();
    await page.keyboard.press("Enter");
    return { width: 390, height: 844, navigation: true, keyboard: true };
  } finally {
    await context.close();
  }
}

async function main() {
  const config = stagingConfig();
  if (process.argv.includes("--validate-config")) {
    console.log(
      JSON.stringify({
        target: config.baseUrl,
        roles: config.accounts.map((account) => account.role),
        requireAllRoles: config.requireAllRoles,
      }),
    );
    return;
  }

  await mkdir(outputRoot, { recursive: true });
  const securityHeaders = await verifySecurityHeaders(config.baseUrl);
  const browser = await launchStagingBrowser();

  const results = [];
  const failures = [];
  try {
    for (const account of config.accounts) {
      try {
        results.push(await runRole(browser, config, account));
      } catch (error) {
        failures.push({
          role: account.role,
          message: redactEvidence(
            error instanceof Error ? error.message : "Unknown browser failure",
          ),
        });
      }
    }
    const admin = config.accounts.find((account) => account.role === "admin");
    assert.ok(admin);
    const mobile = await runMobileAdmin(browser, config, admin);
    const report = {
      target: config.baseUrl,
      browser: await browser.version(),
      generatedAt: new Date().toISOString(),
      securityHeaders,
      roles: results,
      mobile,
      failures,
    };
    await writeFile(
      join(outputRoot, "acceptance.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    assert.deepEqual(failures, []);
    console.log(
      `Staging browser acceptance passed for ${results.length} roles.`,
    );
  } finally {
    await browser.close();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
