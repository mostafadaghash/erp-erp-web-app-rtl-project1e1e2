import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const printTemplate = read("src/components/PrintTemplate.tsx");

test("invoice preview stays above the invoice details dialog", () => {
  assert.match(printTemplate, /style=\{\{ zIndex: 100 \}\}/);
  assert.match(printTemplate, /role="dialog"/);
  assert.match(printTemplate, /aria-modal="true"/);
});

test("browser printing isolates the dedicated print document", () => {
  assert.match(printTemplate, /document\.createElement\("iframe"\)/);
  assert.match(printTemplate, /printDocument\.write/);
  assert.match(printTemplate, /previewRef\.current\.innerHTML/);
  assert.match(printTemplate, /printWindow\.print\(\)/);
  assert.match(printTemplate, /frame\.remove\(\)/);
});

test("invoice printing offers the four layouts inherited from main", () => {
  for (const layout of ["a4-classic", "a4-compact", "receipt-80", "receipt-57"]) {
    assert.match(printTemplate, new RegExp(`id: "${layout}"`));
    assert.match(printTemplate, new RegExp(`layout-${layout}`));
  }

  assert.match(printTemplate, /A4 كلاسيك/);
  assert.match(printTemplate, /A4 مختصر/);
  assert.match(printTemplate, /حراري 80mm/);
  assert.match(printTemplate, /حراري 57mm/);
  assert.match(printTemplate, /size: 80mm auto/);
  assert.match(printTemplate, /size: 57mm auto/);
});

test("receipt layouts hide nonessential columns while retaining invoice totals", () => {
  assert.match(printTemplate, /\.layout-receipt-80 \.erp-print-table \.col-no/);
  assert.match(printTemplate, /\.layout-receipt-80 \.erp-print-table \.col-discount/);
  assert.match(printTemplate, /\.layout-receipt-57 \.erp-print-table \.col-no/);
  assert.match(printTemplate, /className="col-total"/);
  assert.match(printTemplate, /erp-print-total-final/);
});
