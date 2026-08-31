import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import {
  CURRENCY_DEFINITIONS,
  DEFAULT_CURRENCY_CODE,
  SUPPORTED_CURRENCY_CODES,
  normalizeCurrencyCode,
} from "../shared/currency.ts";
import { formatCurrencyValue } from "../src/lib/currency.ts";

const ROOTS = ["src", "convex", "shared"];
const ALLOWED_CENTRAL_FILES = new Set([
  "src/lib/currency.ts",
  "shared/currency.ts",
  "convex/lib/currency.ts",
  // Historical chart schema/version identifier. It is not a display or accounting amount currency.
  "convex/lib/generalLedgerTemplate.ts",
]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
const HARDCODED_CURRENCY = /(?:\bEGP\b|ج\.م)/g;

function extension(path: string) {
  const match = path.match(/(\.[^.\\/]+)$/);
  return match?.[1] ?? "";
}

function collectFiles(dir: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const normalized = path.replaceAll("\\", "/");
    if (normalized.includes("/node_modules/") || normalized.includes("/convex/_generated/")) continue;
    const stats = statSync(path);
    if (stats.isDirectory()) result.push(...collectFiles(path));
    else if (SOURCE_EXTENSIONS.has(extension(path))) result.push(path);
  }
  return result;
}

test("CURRENCY-01 currency codes and legacy EGP labels are centralized", () => {
  const violations: string[] = [];
  for (const root of ROOTS) {
    for (const file of collectFiles(root)) {
      const repoPath = relative(".", file).replaceAll("\\", "/");
      if (ALLOWED_CENTRAL_FILES.has(repoPath)) continue;
      const lines = readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line, index) => {
        HARDCODED_CURRENCY.lastIndex = 0;
        if (HARDCODED_CURRENCY.test(line)) violations.push(`${repoPath}:${index + 1}: ${line.trim()}`);
      });
    }
  }

  assert.equal(
    violations.length,
    0,
    `Hard-coded currency references must use the central currency module:\n${violations.join("\n")}`,
  );
});

test("CURRENCY-02 supported base currencies are exactly EGP, USD and SAR", () => {
  assert.deepEqual(SUPPORTED_CURRENCY_CODES, ["EGP", "USD", "SAR"]);
  assert.equal(DEFAULT_CURRENCY_CODE, "EGP");
  assert.equal(CURRENCY_DEFINITIONS.EGP.labelAr, "جنيه مصري");
  assert.equal(CURRENCY_DEFINITIONS.USD.labelAr, "دولار أمريكي");
  assert.equal(CURRENCY_DEFINITIONS.SAR.labelAr, "ريال سعودي");
  assert.equal(normalizeCurrencyCode("usd"), "USD");
  assert.equal(normalizeCurrencyCode("sar"), "SAR");
  assert.equal(normalizeCurrencyCode("unsupported"), DEFAULT_CURRENCY_CODE);
});

test("CURRENCY-03 formatter follows the selected base currency", () => {
  const egp = formatCurrencyValue(1234.5, "EGP");
  const usd = formatCurrencyValue(1234.5, "USD");
  const sar = formatCurrencyValue(1234.5, "SAR");
  assert.notEqual(egp, usd);
  assert.notEqual(usd, sar);
  assert.notEqual(egp, sar);
  assert.equal(formatCurrencyValue(1234.5, "invalid"), egp);
});

test("CURRENCY-04 system settings persist an enabled base-currency selector", () => {
  const settingsPage = readFileSync("src/components/SettingsPage.tsx", "utf8");
  const settingsBackend = readFileSync("convex/settings.ts", "utf8");
  const schema = readFileSync("convex/schema.ts", "utf8");

  assert.match(settingsPage, /data-testid="settings-currency"/);
  assert.match(settingsPage, /SUPPORTED_CURRENCY_CODES\.map/);
  assert.match(settingsPage, /currency: form\.currency/);
  assert.doesNotMatch(settingsPage, /settings-currency[^>]*disabled/);
  assert.match(settingsBackend, /currency: currencyValidator/);
  assert.match(settingsBackend, /baseCurrency !== normalizedArgs\.currency/);
  assert.match(schema, /baseCurrency:currencyValidator/);
  assert.match(schema, /currency: currencyValidator/);
});

test("CURRENCY-05 core financial surfaces use the central formatter", () => {
  const files = [
    "src/components/Dashboard.tsx",
    "src/components/ReportsPage.tsx",
    "src/components/CRMPage.tsx",
    "src/components/ExpensesPage.tsx",
    "src/components/GeneralLedgerPage.tsx",
    "src/components/NewInvoicePage.tsx",
    "src/components/NewPurchaseInvoicePage.tsx",
    "src/components/OrdersPage.tsx",
    "src/components/PaymentSchedulesPage.tsx",
    "src/components/ProductsPage.tsx",
    "src/components/PurchaseReturnsPage.tsx",
    "src/components/RepairWorkEditDialog.tsx",
    "src/components/RepairsPage.tsx",
    "src/components/ShipmentsPage.tsx",
    "src/components/SupplierPaymentsPage.tsx",
    "src/components/SuppliersPage.tsx",
    "src/components/VouchersPage.tsx",
  ];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /formatCurrency/, `${file} must use the central formatter`);
  }

  const printSource = readFileSync("src/components/PrintTemplate.tsx", "utf8");
  assert.match(printSource, /formatCurrencyValue\(value, settings\?\.currency\)/);
});
