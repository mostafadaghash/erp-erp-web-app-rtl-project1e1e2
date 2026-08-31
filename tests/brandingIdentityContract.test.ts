import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const brandMarkSource = readFileSync("src/components/BrandMark.tsx", "utf8");
const brandingSource = readFileSync("src/lib/branding.ts", "utf8");
const appSource = readFileSync("src/App.tsx", "utf8");
const sidebarSource = readFileSync("src/components/Sidebar.tsx", "utf8");
const settingsSource = readFileSync("src/components/SettingsPage.tsx", "utf8");
const printSource = readFileSync("src/components/PrintTemplate.tsx", "utf8");
const indexSource = readFileSync("index.html", "utf8");

test("BRAND-01 logo mark preserves aspect ratio and allows horizontal branding", () => {
  assert.match(brandMarkSource, /max-w-\[15rem\]/);
  assert.match(brandMarkSource, /max-h-full max-w-full object-contain/);
  assert.match(brandMarkSource, /inline-flex w-fit/);
  assert.doesNotMatch(brandMarkSource, /object-cover/);
});

test("BRAND-02 login, navigation and settings preview share the aspect-safe brand mark", () => {
  assert.match(appSource, /<BrandMark[\s\S]*?size="lg"[\s\S]*?inverse/);
  assert.match(sidebarSource, /<BrandMark[\s\S]*?size="md"/);
  assert.match(settingsSource, /<BrandMark[\s\S]*?size="lg"/);
  assert.match(settingsSource, /accept="image\/png,image\/jpeg,image\/webp,image\/svg\+xml,image\/x-icon"/);
  assert.match(settingsSource, /object-contain/);
});

test("BRAND-03 browser favicon always has a branded custom-or-default source", () => {
  assert.match(brandingSource, /DEFAULT_FAVICON_PATH = "\/favicon\.svg"/);
  assert.match(brandingSource, /data-brand-favicon/);
  assert.match(brandingSource, /favicon\.href = brand\.faviconUrl/);
  assert.match(brandingSource, /favicon\.href = DEFAULT_FAVICON_PATH/);
  assert.match(brandingSource, /favicon\.removeAttribute\("type"\)/);
  assert.match(indexSource, /data-brand-favicon="true"/);
  assert.match(indexSource, /sizes="any"/);
});

test("BRAND-04 printed documents keep uploaded logos inside safe bounds without stretching", () => {
  assert.match(printSource, /\.erp-print-logo \{ width: 52px; height: 52px; object-fit: contain; \}/);
  assert.match(printSource, /<img className="erp-print-logo" src=\{settings\.logoUrl\}/);
  assert.doesNotMatch(printSource, /erp-print-logo[^\n]*object-fit:\s*cover/);
});
