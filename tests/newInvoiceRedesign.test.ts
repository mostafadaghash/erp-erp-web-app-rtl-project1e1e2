import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const main = readFileSync("src/main.tsx", "utf8");
const invoice = readFileSync("src/components/NewInvoicePage.tsx", "utf8");
const styles = readFileSync("src/new-invoice-redesign.css", "utf8");

test("new invoice redesign layer loads after the shared dashboard layers", () => {
  assert.match(main, /import "\.\/dashboard-final-fixes\.css";\s*import "\.\/new-invoice-redesign\.css";/);
});

test("invoice keeps its existing business interaction test hooks", () => {
  assert.match(invoice, /data-testid="new-invoice-page"/);
  assert.match(invoice, /data-testid="invoice-product-search"/);
  assert.match(invoice, /data-testid="invoice-customer-select"/);
  assert.match(invoice, /data-testid="invoice-payment-method"/);
  assert.match(invoice, /data-testid="invoice-payment-account"/);
  assert.match(invoice, /data-testid="invoice-submit"/);
});

test("invoice redesign provides structured search customer items and summary surfaces", () => {
  assert.match(styles, /\.erp-workspace-main \.erp-pos-search-area\s*\{/);
  assert.match(styles, /\.erp-workspace-main \.erp-pos-customer-strip::before\s*\{[\s\S]*content: "بيانات العميل"/);
  assert.match(styles, /\.erp-workspace-main \.erp-pos-cart::before\s*\{[\s\S]*content: "أصناف الفاتورة"/);
  assert.match(styles, /\.erp-workspace-main \.erp-pos-summary\s*\{/);
  assert.match(styles, /grid-template-columns: minmax\(0, 1fr\) 304px/);
});

test("invoice redesign remains responsive on tablet and mobile", () => {
  assert.match(styles, /@media \(max-width: 1100px\)[\s\S]*grid-template-columns: 1fr/);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*\.erp-workspace-main \.erp-pos-customer-strip\s*\{[\s\S]*grid-template-columns: 1fr/);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*\.erp-workspace-main \.erp-pos-search-hint\s*\{[\s\S]*display: none/);
});
