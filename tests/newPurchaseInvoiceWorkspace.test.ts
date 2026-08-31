import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { messages } from "../src/i18n/catalog.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const app = read("../src/components/ERPApp.tsx");
const sidebar = read("../src/components/Sidebar.tsx");
const page = read("../src/components/NewPurchaseInvoicePage.tsx");
const css = read("../src/new-purchase-invoice-pos.css");

test("purchase navigation exposes a dedicated multi-instance new invoice workspace page", () => {
  assert.match(sidebar, /id: "new-purchase-invoice", labelKey: "nav\.newPurchaseInvoice"/);
  assert.equal(messages.ar["nav.newPurchaseInvoice"], "فاتورة مشتريات جديدة");
  assert.equal(messages.en["nav.newPurchaseInvoice"], "New Purchase Invoice");
  assert.match(app, /"new-purchase-invoice": "create_shipments"/);
  assert.match(app, /"new-purchase-invoice": \{ group: "المشتريات", title: "فاتورة مشتريات جديدة" \}/);
  assert.match(app, /page: "new-purchase-invoice", label: "فاتورة شراء"/);
  assert.match(app, /MULTI_INSTANCE_PAGES = new Set<Page>\(\["new-invoice", "new-purchase-invoice", "new-customer"\]\)/);
  assert.match(app, /const navigateFromNewTab = \(page: Page\) => \{[\s\S]{0,120}markTabDirty\(tab\.id, false\);[\s\S]{0,80}navigate\(page\);/);
  assert.match(app, /tab\.page === "new-purchase-invoice" && <NewPurchaseInvoicePage onNavigate=\{navigateFromNewTab\}/);
});

test("new purchase invoice uses the existing protected purchase creation contract", () => {
  assert.match(page, /useQuery\(api\.shipments\.creationOptions\)/);
  assert.match(page, /useMutation\(api\.shipments\.create\)/);
  assert.match(page, /supplierId: selectedSupplier\._id/);
  assert.match(page, /productId: item\.productId/);
  assert.match(page, /shippingCost: safeShippingCost/);
  assert.match(page, /onNavigate\("shipments"\)/);
  assert.match(page, /تحديث المخزون وتكلفة الصنف ومديونية المورد يتم عند استلام فاتورة الشراء/);
});

test("new purchase invoice matches the dense sales POS interaction level", () => {
  assert.match(page, /data-testid="new-purchase-invoice-page"/);
  assert.match(page, /className="purchase-pos-layout"/);
  assert.match(page, /className="purchase-pos-summary-panel"/);
  assert.match(page, /className="purchase-pos-bottom-bar"/);
  assert.match(page, /<kbd>F2<\/kbd>/);
  assert.match(page, /<kbd>F5<\/kbd>/);
  assert.match(page, /<kbd>F6<\/kbd>/);
  assert.match(page, /<kbd>F7<\/kbd>/);
  assert.match(page, /<kbd>F8<\/kbd>/);
  assert.match(page, /<kbd>F9<\/kbd>/);
  assert.match(page, /<kbd>F10<\/kbd>/);
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\) 292px/);
  assert.match(css, /\.purchase-pos-info-row[\s\S]{0,180}grid-template-columns: 1\.2fr \.85fr \.75fr 1fr/);
  assert.match(css, /@media \(max-width: 680px\)/);
});
