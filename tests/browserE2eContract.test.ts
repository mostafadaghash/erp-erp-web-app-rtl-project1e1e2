import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(path, "utf8");

function sourceFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) files.push(...sourceFiles(path));
    else if (/\.(?:ts|tsx)$/.test(entry)) files.push(path);
  }
  return files;
}

const frontendSource = sourceFiles("src").map(read).join("\n");
const sidebar = read("src/components/Sidebar.tsx");
const catalog = read("src/i18n/catalog.ts");
const stagingBrowser = read("scripts/staging-browser-e2e.mjs");
const stagingBusiness = read("scripts/staging-business-e2e.mjs");
const stagingFixtures = read("scripts/staging-fixtures-setup.mjs");
const localFullSuite = read("scripts/local/full-suite.mjs");
const localFixtureBootstrap = read("scripts/local/fixture-bootstrap.mjs");
const stagingAccounts = read("scripts/staging-account-setup.mjs");
const playwrightHelpers = read("tests/e2e/helpers.ts");
const playwrightFlows = read("tests/e2e/operational-flows.spec.ts");
const playwrightRoles = read("tests/e2e/roles-branches.spec.ts");
const playwrightSmoke = read("tests/e2e/staging-smoke.spec.ts");

const browserSources = {
  "staging-browser-e2e": stagingBrowser,
  "staging-business-e2e": stagingBusiness,
  "staging-fixtures-setup": stagingFixtures,
  "local-full-suite": localFullSuite,
  "local-fixture-bootstrap": localFixtureBootstrap,
  "staging-account-setup": stagingAccounts,
  "playwright-helpers": playwrightHelpers,
  "playwright-operational-flows": playwrightFlows,
  "playwright-roles": playwrightRoles,
  "playwright-smoke": playwrightSmoke,
};

const currentNavigation = [
  ["لوحة التحكم", "dashboard"],
  ["فاتورة بيع جديدة", "new-invoice"],
  ["فواتير المبيعات", "invoices"],
  ["مرتجعات المبيعات", "sales-returns"],
  ["عروض الأسعار", "quotes"],
  ["طلبات البيع", "orders"],
  ["إضافة عميل", "new-customer"],
  ["قائمة العملاء", "customers"],
  ["متابعة العملاء", "follow-ups"],
  ["فاتورة مشتريات جديدة", "new-purchase-invoice"],
  ["فواتير المشتريات", "shipments"],
  ["مرتجعات المشتريات", "purchase-returns"],
  ["الموردون", "suppliers"],
  ["إدارة المخزون", "inventory"],
  ["أوامر الصيانة", "repairs"],
  ["طلبات الشحن والتسويات", "deliveries"],
  ["نظرة عامة", "accounts-home"],
  ["الخزائن والحسابات", "treasury"],
  ["سندات القبض والصرف", "vouchers"],
  ["حسابات العملاء", "customer-ledger"],
  ["حسابات الموردين", "supplier-payments"],
  ["الفواتير الآجلة", "credit-invoices"],
  ["الشيكات والأقساط", "payment-schedules"],
  ["المصروفات", "expenses"],
  ["مركز التقارير", "reports"],
  ["الفروع", "branches"],
  ["المستخدمون والصلاحيات", "employees"],
  ["سجل العمليات", "audit-logs"],
  ["إعدادات النظام", "settings"],
] as const;

function literalTestIds(source: string): string[] {
  return [...source.matchAll(/getByTestId\(\s*["']([^"']+)["']\s*\)/g)].map((match) => match[1]);
}

test("BROWSER-CONTRACT-01 current navigation names and stable IDs exist in the product shell", () => {
  for (const [label, id] of currentNavigation) {
    assert.ok(sidebar.includes(`id: "${id}"`), `Sidebar is missing current navigation id: ${id}`);
    assert.ok(catalog.includes(label), `Arabic catalog is missing current navigation label: ${label}`);
  }
  for (const [label, id] of currentNavigation) {
    assert.ok(
      stagingBrowser.includes(`"${label}":`) && stagingBrowser.includes(`item: "${id}"`),
      `Staging browser navigation is not aligned for: ${label}`,
    );
    assert.ok(
      playwrightHelpers.includes(`"${label}":`) && playwrightHelpers.includes(`item: "${id}"`),
      `Playwright navigation is not aligned for: ${label}`,
    );
  }
});

test("BROWSER-CONTRACT-02 executable browser navigation contains no retired ERP labels", () => {
  const navigationAutomation = [
    stagingBrowser,
    stagingFixtures,
    playwrightHelpers,
    playwrightRoles,
    playwrightSmoke,
  ].join("\n");
  assert.doesNotMatch(
    navigationAutomation,
    /أوامر البيع|دليل الأصناف|إدارة الشحن|عمليات الشحن|الخزائن والبنوك|سجل المراجعة|المحاسبة العامة|تصدير البيانات|المبيعات والفواتير|الأوردرات|الشحنات الواردة|التوصيلات|مدفوعات الموردين|الموظفون والصلاحيات/,
  );
});

test("BROWSER-CONTRACT-03 literal browser test IDs resolve to the current frontend source", () => {
  const unresolved: string[] = [];
  for (const [sourceName, source] of Object.entries(browserSources)) {
    for (const testId of new Set(literalTestIds(source))) {
      if (testId.startsWith("nav-")) continue;
      if (!frontendSource.includes(testId)) unresolved.push(`${sourceName}: ${testId}`);
    }
  }
  assert.deepEqual(unresolved, [], `Browser selectors missing from frontend source:\n${unresolved.join("\n")}`);
});

test("BROWSER-CONTRACT-04 mutable purchases use the dedicated purchase invoice page, not the legacy create modal", () => {
  for (const marker of [
    'item: "new-purchase-invoice"',
    'page: "new-purchase-invoice-page"',
    'getByTestId("purchase-supplier-select")',
    'getByTestId("purchase-product-search")',
    'getByTestId("purchase-submit")',
    'getByTestId("shipment-receive-submit")',
  ]) assert.match(stagingBusiness, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(stagingBusiness, /getByTestId\("shipment-create-form"\)|getByTestId\("shipment-create-open"\)/);
});

test("BROWSER-CONTRACT-05 local finance automation scopes the current modal instead of traversing DOM parents", () => {
  assert.match(localFullSuite, /locator\("div\.fixed\.inset-0"\)\.filter\(\{ has: heading \}\)\.last\(\)/);
  assert.match(stagingFixtures, /locator\("div\.fixed\.inset-0"\)\.filter\(\{ has: heading \}\)\.last\(\)/);
  assert.doesNotMatch(localFullSuite, /heading\.locator\("\.\."\)\.locator\("\.\."\)/);
  assert.doesNotMatch(stagingFixtures, /heading\.locator\("\.\."\)\.locator\("\.\."\)/);
});
