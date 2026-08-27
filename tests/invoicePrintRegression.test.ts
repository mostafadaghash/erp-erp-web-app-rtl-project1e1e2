import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const printTemplate = read("src/components/PrintTemplate.tsx");
const styles = read("src/index.css");

test("invoice preview stays above the invoice details dialog", () => {
  assert.match(printTemplate, /z-\[100\]/);
  assert.match(printTemplate, /role="dialog"/);
  assert.match(printTemplate, /aria-modal="true"/);
});

test("browser printing isolates the dedicated print document", () => {
  assert.match(styles, /body \* \{ visibility: hidden !important; \}/);
  assert.match(styles, /\.print-only,\s*\.print-only \* \{ visibility: visible !important; \}/);
  assert.match(styles, /\.print-only \{[\s\S]*display: block !important;[\s\S]*position: absolute !important;/);
  assert.doesNotMatch(printTemplate, /document\.write/);
});

test("V1 invoice printing offers exactly the three approved layouts", () => {
  for (const layout of ["a4-compact", "a4-detailed", "thermal-80"]) {
    assert.match(printTemplate, new RegExp(`value="${layout}"`));
    assert.match(styles, new RegExp(`print-layout-${layout}`));
  }

  assert.match(printTemplate, /A4 مختصر/);
  assert.match(printTemplate, /A4 تفصيلي/);
  assert.match(printTemplate, /حراري 80mm/);
  assert.match(styles, /size: 80mm auto/);
});

test("thermal invoices remove wide columns while detailed A4 keeps ruled rows", () => {
  assert.match(printTemplate, /!isThermal && <th[\s\S]*سعر الوحدة/);
  assert.match(printTemplate, /isDetailed && Array\.from/);
  assert.match(styles, /\.print-detail-blank-row/);
});
