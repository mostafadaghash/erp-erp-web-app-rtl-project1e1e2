import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const main = read("../src/main.tsx");
const css = read("../src/invoice-customer-fields-polish.css");

test("sales invoice customer controls share one desktop baseline and consistent height", () => {
  assert.match(main, /import "\.\/invoice-customer-fields-polish\.css";/);
  assert.match(css, /\.pos-invoice-customer-row\s*\{/);
  assert.match(css, /grid-template-columns:[\s\S]*minmax\(230px, 1\.18fr\)[\s\S]*minmax\(210px, 1fr\)[\s\S]*minmax\(190px, \.9fr\)/);
  assert.match(css, /align-items: end;/);
  assert.match(css, /grid-template-rows: 20px 40px;/);
  assert.match(css, /min-height: 40px !important;/);
  assert.match(css, /height: 40px !important;/);
});

test("sales invoice customer controls stay responsive", () => {
  assert.match(css, /@media \(max-width: 1280px\) and \(min-width: 981px\)/);
  assert.match(css, /grid-template-columns: minmax\(0, 1\.15fr\) minmax\(0, 1fr\) minmax\(0, \.9fr\);/);
  assert.match(css, /@media \(max-width: 980px\)/);
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(css, /@media \(max-width: 680px\)/);
  assert.match(css, /grid-template-columns: 1fr;/);
});
