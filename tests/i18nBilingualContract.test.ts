import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { messages, translateLegacyText } from "../src/i18n/catalog.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const appSource = read("../src/App.tsx");
const sidebarSource = read("../src/components/Sidebar.tsx");
const providerSource = read("../src/i18n/I18nProvider.tsx");
const settingsSource = read("../src/components/SettingsPage.tsx");

const expectedNavigation = [
  ["nav.dashboard", "لوحة التحكم", "Dashboard"],
  ["nav.sales", "المبيعات", "Sales"],
  ["nav.customers", "العملاء", "Customers"],
  ["nav.purchases", "المشتريات", "Purchases"],
  ["nav.inventory", "المخزون", "Inventory"],
  ["nav.repairs", "الصيانة", "Repairs"],
  ["nav.shipping", "الشحن", "Shipping"],
  ["nav.accounts", "الحسابات", "Accounts"],
  ["nav.reports", "التقارير", "Reports"],
  ["nav.settings", "الإعدادات", "Settings"],
] as const;

test("I18N-01 catalog provides Arabic and English navigation labels", () => {
  for (const [key, arabic, english] of expectedNavigation) {
    assert.equal(messages.ar[key], arabic);
    assert.equal(messages.en[key], english);
  }
});

test("I18N-02 catalog covers the primary shared actions", () => {
  for (const key of ["common.save", "common.cancel", "common.search", "common.print", "common.export", "common.refresh"] as const) {
    assert.ok(messages.ar[key]);
    assert.ok(messages.en[key]);
    assert.notEqual(messages.ar[key], messages.en[key]);
  }
});

test("I18N-03 English translations do not accidentally expose translation keys", () => {
  for (const [key, value] of Object.entries(messages.en)) {
    assert.ok(value.trim(), `${key} must have a non-empty English translation`);
    assert.notEqual(value, key, `${key} must not render its technical key`);
  }
});

test("I18N-04 legacy translator covers common current Arabic UI text", () => {
  const examples = [
    ["إضافة عميل جديد", "Add New Customer"],
    ["مرتجعات المبيعات", "Sales Returns"],
    ["الفواتير الآجلة", "Credit Invoices"],
    ["بحث شامل", "Global Search"],
    ["الأرباح والخسائر", "Profit & Loss"],
  ] as const;
  for (const [arabic, english] of examples) {
    assert.equal(translateLegacyText(arabic, "en"), english);
  }
});

test("I18N-05 order and repair business statuses are translated without changing backend values", () => {
  const statuses = [
    ["قيد الإنتظار", "Pending"],
    ["جاري التجهيز", "Processing"],
    ["تم التجهيز", "Prepared"],
    ["تم التسليم لشركة الشحن", "Handed to Shipping Company"],
    ["جاري الصيانة", "Under Repair"],
    ["ظهور مشكلة جديدة", "New Problem Found"],
  ] as const;
  for (const [arabic, english] of statuses) {
    assert.equal(translateLegacyText(arabic, "en"), english);
    assert.equal(translateLegacyText(arabic, "ar"), arabic);
  }
});

test("I18N-06 application shell is provider-driven instead of hardcoded RTL", () => {
  assert.match(appSource, /<I18nProvider>/);
  assert.match(appSource, /const \{ direction \} = useI18n\(\)/);
  assert.match(appSource, /dir=\{direction\}/);
  assert.match(appSource, /<LanguageSelect compact \/>/);
  assert.doesNotMatch(appSource, /dir="rtl"/);
});

test("I18N-07 main navigation consumes translation keys and bilingual dashboard labels", () => {
  assert.match(sidebarSource, /labelKey\?: TranslationKey/);
  assert.match(sidebarSource, /label\?: Record<Language, string>/);
  assert.match(sidebarSource, /labelKey: "nav\.sales"/);
  assert.match(sidebarSource, /labelKey: "nav\.purchases"/);
  assert.match(sidebarSource, /labelKey: "nav\.accounts"/);
  assert.match(sidebarSource, /const itemLabel = item\.label \? item\.label\[language\] : t\(item\.labelKey!\)/);
  assert.match(sidebarSource, /Operational Dashboard/);
  assert.match(sidebarSource, /Executive Dashboard/);
  assert.match(sidebarSource, /data-user-content/);
});

test("I18N-08 language setting is persistent locally and injected into the existing Settings page", () => {
  assert.match(providerSource, /LANGUAGE_STORAGE_KEY/);
  assert.match(providerSource, /localStorage\.setItem/);
  assert.match(providerSource, /erp-language-change/);
  assert.match(providerSource, /erp-language-selected/);
  assert.match(providerSource, /hydrateLanguage/);
  assert.match(providerSource, /data-testid='settings-page'/);
  assert.match(providerSource, /data-i18n-language-settings-host/);
  assert.match(providerSource, /language-setting-select/);
});

test("I18N-09 Settings page keeps its translation-safe portal integration contract", () => {
  assert.match(settingsSource, /data-testid="settings-page"/);
  assert.match(providerSource, /document\.querySelector<HTMLElement>\("\[data-testid='settings-page'\]"\)/);
  assert.match(providerSource, /settingsPage\.querySelector<HTMLElement>\("\[data-i18n-language-settings-host\]"\)/);
  assert.match(providerSource, /createPortal\(/);
});
