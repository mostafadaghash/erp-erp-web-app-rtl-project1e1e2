import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  LANGUAGE_META,
  containsArabic,
  getDirection,
  getLocale,
  messages,
  translateKey,
  translateLegacyText,
  type TranslationKey,
} from "../src/i18n/catalog.ts";

const appSource = readFileSync("src/App.tsx", "utf8");
const sidebarSource = readFileSync("src/components/Sidebar.tsx", "utf8");
const providerSource = readFileSync("src/i18n/I18nProvider.tsx", "utf8");
const bridgeSource = readFileSync("src/i18n/domBridge.ts", "utf8");
const directionCss = readFileSync("src/i18n/i18n.css", "utf8");

const MODULE_SAMPLES = [
  ["العملاء", "Customers"],
  ["الموردون", "Suppliers"],
  ["المبيعات", "Sales"],
  ["المشتريات", "Purchases"],
  ["المخزون", "Inventory"],
  ["الحسابات", "Accounts"],
  ["الصيانة", "Repairs"],
  ["الشحن", "Shipping"],
  ["التقارير", "Reports"],
] as const;

const ORDER_STATUS_SAMPLES = [
  ["قيد الانتظار", "Pending"],
  ["جاري التجهيز", "Processing"],
  ["تم التجهيز", "Prepared"],
  ["تم التسليم لشركة الشحن", "Handed to Shipping Company"],
  ["تم تسليم الأوردر", "Order Delivered"],
  ["ملغي", "Cancelled"],
] as const;

const REPAIR_STATUS_SAMPLES = [
  ["جاري الصيانة", "Under Repair"],
  ["ظهور مشكلة جديدة", "New Problem Found"],
  ["تم الإصلاح", "Repaired"],
  ["تم التسليم", "Delivered"],
  ["مرفوض من العميل", "Rejected by Customer"],
  ["مرفوض من الفني", "Rejected by Technician"],
] as const;

test("I18N-01 Arabic and English catalogs have identical translation keys", () => {
  const arKeys = Object.keys(messages.ar).sort();
  const enKeys = Object.keys(messages.en).sort();
  assert.deepEqual(enKeys, arKeys);
  assert.ok(arKeys.length >= 150, "central catalog should cover the main ERP surface");

  for (const key of arKeys as TranslationKey[]) {
    assert.ok(messages.ar[key].trim(), `${key} is missing Arabic copy`);
    assert.ok(messages.en[key].trim(), `${key} is missing English copy`);
  }
});

test("I18N-02 language metadata switches locale and direction correctly", () => {
  assert.equal(getDirection("ar"), "rtl");
  assert.equal(getDirection("en"), "ltr");
  assert.equal(getLocale("ar"), "ar-EG");
  assert.equal(getLocale("en"), "en-GB");
  assert.equal(LANGUAGE_META.ar.nativeLabel, "العربية");
  assert.equal(LANGUAGE_META.en.nativeLabel, "English");
});

test("I18N-03 core shell keys render in both languages", () => {
  assert.equal(translateKey("ar", "nav.dashboard"), "لوحة التحكم");
  assert.equal(translateKey("en", "nav.dashboard"), "Dashboard");
  assert.equal(translateKey("en", "header.globalSearch"), "Global Search");
  assert.equal(translateKey("en", "settings.title"), "System Settings");
  assert.equal(translateKey("en", "common.save"), "Save");
  assert.equal(translateKey("en", "common.cancel"), "Cancel");
});

test("I18N-04 every requested business module has a deterministic English presentation", () => {
  for (const [arabic, english] of MODULE_SAMPLES) {
    const translated = translateLegacyText(arabic, "en", { fallbackToTransliteration: true });
    assert.equal(translated, english);
    assert.equal(containsArabic(translated), false);
  }
});

test("I18N-05 order and repair business statuses are translated without changing backend values", () => {
  for (const [arabic, english] of [...ORDER_STATUS_SAMPLES, ...REPAIR_STATUS_SAMPLES]) {
    assert.equal(translateLegacyText(arabic, "en", { fallbackToTransliteration: true }), english);
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

test("I18N-07 main navigation consumes translation keys", () => {
  assert.match(sidebarSource, /labelKey: TranslationKey/);
  assert.match(sidebarSource, /labelKey: "nav\.sales"/);
  assert.match(sidebarSource, /labelKey: "nav\.purchases"/);
  assert.match(sidebarSource, /labelKey: "nav\.accounts"/);
  assert.match(sidebarSource, /\{t\(item\.labelKey\)\}/);
  assert.match(sidebarSource, /data-user-content/);
});

test("I18N-08 language setting is persistent and injected into the existing Settings page", () => {
  assert.match(providerSource, /LANGUAGE_STORAGE_KEY/);
  assert.match(providerSource, /localStorage\.setItem/);
  assert.match(providerSource, /erp-language-change/);
  assert.match(providerSource, /data-testid='settings-page'/);
  assert.match(providerSource, /data-i18n-language-settings-host/);
  assert.match(providerSource, /language-setting-select/);
});

test("I18N-09 compatibility bridge covers legacy text, alerts, attributes and nested direction", () => {
  assert.match(bridgeSource, /MutationObserver/);
  assert.match(bridgeSource, /placeholder/);
  assert.match(bridgeSource, /aria-label/);
  assert.match(bridgeSource, /translateLegacyText/);
  assert.match(bridgeSource, /syncElementDirection/);
  assert.match(bridgeSource, /data-user-content/);
});

test("I18N-10 LTR rules explicitly cover navigation, tables, arrows and print layouts", () => {
  assert.match(directionCss, /html\[dir="ltr"\] table/);
  assert.match(directionCss, /lucide-chevron-left/);
  assert.match(directionCss, /erp-nav-dropdown/);
  assert.match(directionCss, /@media print/);
  assert.match(directionCss, /html\[dir="ltr"\] \.print-root/);
});
