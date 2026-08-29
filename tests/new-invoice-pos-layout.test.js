import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path) => readFileSync(join(process.cwd(), path), "utf8");

test("new sales invoice keeps the dense POS workspace contract", () => {
  const page = read("src/components/NewInvoicePage.tsx");
  const css = read("src/new-invoice-pos-final.css");
  const main = read("src/main.tsx");

  assert.match(page, /pos-invoice-v3/);
  assert.match(page, /pos-invoice-bottom-bar/);
  assert.match(page, /رقم الصنف/);
  assert.match(page, /خصم %/);
  assert.match(page, /data-invoice-quantity/);
  assert.match(page, /<kbd>F11<\/kbd>/);

  assert.match(css, /\.pos-invoice-layout/);
  assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\) 292px/);
  assert.match(css, /\.pos-invoice-bottom-bar/);
  assert.match(css, /@media \(max-width: 980px\)/);

  assert.match(main, /import "\.\/new-invoice-pos-final\.css";/);
});
