import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const sidebar = read("../src/components/Sidebar.tsx");
const app = read("../src/components/ERPApp.tsx");
const dashboard = read("../src/components/Dashboard.tsx");
const invoices = read("../src/components/InvoicesPage.tsx");
const newInvoice = read("../src/components/NewInvoicePage.tsx");
const reports = read("../src/components/ReportsPage.tsx");
const utils = read("../src/lib/utils.ts");
const css = read("../src/professional-ui.css");

test("SUX-01 navigation dropdowns close on an outside pointer press", () => {
  assert.match(sidebar, /document\.addEventListener\("pointerdown", closeOnOutsidePress\)/);
  assert.match(sidebar, /!openSection\?\.contains\(event\.target\)/);
  assert.match(sidebar, /data-nav-group-section=\{group\.key\}/);
  assert.match(app, /document\.addEventListener\("pointerdown", closeOnOutsidePress\)/);
  assert.match(app, /!quickMenuRef\.current\?\.contains\(event\.target\)/);
});

test("SUX-02 home navigation is consistently named dashboard", () => {
  assert.doesNotMatch(sidebar, /label: "الرئيسية"/);
  assert.match(sidebar, /label: "لوحة التحكم"/);
  assert.match(app, /dashboard: \{ group: "لوحة التحكم", title: "لوحة التحكم" \}/);
});

test("SUX-03 monetary and dashboard values use Latin digits", () => {
  assert.match(utils, /ar-EG-u-nu-latn/);
  assert.match(dashboard, /formatAmount/);
  assert.doesNotMatch(dashboard, /toLocaleString\("ar-EG"\)/);
});

test("SUX-04 sales list has no summary cards or accounting cancellation warning", () => {
  assert.doesNotMatch(invoices, /تحتاج معالجة استرداد مالي قبل الإلغاء/);
  assert.doesNotMatch(invoices, /إجمالي المبيعات[\s\S]{0,100}rounded-2xl/);
  assert.match(invoices, /\{formatAmount\(invoices\.length\)\} فاتورة مسجلة/);
});

test("SUX-05 the whole compact invoice row opens its details", () => {
  assert.match(invoices, /className="invoice-row-compact cursor-pointer"/);
  assert.match(invoices, /onClick=\{\(\) => setSelectedInvoice\(inv\)\}/);
  assert.match(invoices, /tabIndex=\{0\}/);
  assert.match(css, /\.erp-workspace-main \.invoice-row-compact td/);
});

test("SUX-06 sales entry follows the referenced dense workspace division", () => {
  assert.match(newInvoice, /className="erp-pos-summary"/);
  assert.match(newInvoice, /className="erp-pos-rail-mode"/);
  assert.match(newInvoice, /رقم الفاتورة: تلقائي/);
  assert.match(newInvoice, /className="erp-pos-save-action/);
  assert.match(css, /\.erp-pos-save-action/);
});

test("SUX-07 sales reports are filterable detailed documents", () => {
  assert.match(reports, /api\.reporting\.salesDetails/);
  assert.match(reports, /usePaginatedQuery/);
  assert.match(reports, /data-testid="sales-detail-invoices"/);
  assert.match(reports, /setExpandedInvoiceId/);
  assert.match(reports, /invoice\.status !== "cancelled"/);
  assert.match(reports, /عرض التقرير بالفلاتر المحددة/);
});
