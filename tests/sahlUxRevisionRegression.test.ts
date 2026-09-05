import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { messages } from "../src/i18n/catalog.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const sidebar = read("../src/components/Sidebar.tsx");
const app = read("../src/components/ERPApp.tsx");
const operational = read("../src/components/OperationalDashboard.tsx");
const executive = read("../src/components/Dashboard.tsx");
const invoices = read("../src/components/InvoicesPage.tsx");
const newInvoice = read("../src/components/NewInvoicePage.tsx");
const reports = read("../src/components/ReportsPage.tsx");
const currency = read("../src/lib/currency.ts");
const css = read("../src/professional-ui.css");

test("SUX-01 navigation dropdowns close on an outside pointer press", () => {
  assert.match(sidebar, /document\.addEventListener\("pointerdown", closeOnOutsidePress\)/);
  assert.match(sidebar, /!openSection\?\.contains\(event\.target\)/);
  assert.match(sidebar, /data-nav-group-section=\{group\.key\}/);
  assert.match(app, /document\.addEventListener\("pointerdown", closeOnOutsidePress\)/);
  assert.match(app, /!quickMenuRef\.current\?\.contains\(event\.target\)/);
});

test("SUX-02 dashboard navigation exposes operational and executive choices", () => {
  assert.equal(messages.ar["nav.dashboard"], "لوحة التحكم");
  assert.equal(messages.en["nav.dashboard"], "Dashboard");
  assert.match(sidebar, /key: "dashboard", labelKey: "nav\.dashboard"/);
  assert.match(sidebar, /id: "dashboard"[\s\S]*لوحة التشغيل[\s\S]*view_operational_dashboard/);
  assert.match(sidebar, /id: "executive-dashboard"[\s\S]*اللوحة التنفيذية[\s\S]*view_executive_dashboard/);
  assert.match(sidebar, /data-testid=\{`nav-group-\$\{group\.key\}`\}/);
  assert.match(app, /dashboard: \{ group: "لوحة التحكم", title: "لوحة التشغيل" \}/);
  assert.match(app, /"executive-dashboard": \{ group: "لوحة التحكم", title: "اللوحة التنفيذية" \}/);
});

test("SUX-03 executive dashboard remains a compact eight-metric workspace", () => {
  assert.match(currency, /ar-EG-u-nu-latn/);
  assert.match(executive, /erp-dashboard-card-grid/);
  assert.match(executive, /api\.executiveDashboard\.overview/);
  assert.equal((executive.match(/key: "/g) ?? []).length, 8);
  assert.match(executive, /if \(canViewReports && !card\.protected\) onOpenReport\(card\.report\)/);
  assert.doesNotMatch(executive, /أحدث فواتير المبيعات|erp-home-quick-grid/);
  assert.match(operational, /data-testid="operational-dashboard"/);
  assert.doesNotMatch(operational, /api\.executiveDashboard\.overview|صافي الربح|أرصدة الخزائن/);
});

test("SUX-04 sales list has no summary cards or accounting cancellation warning", () => {
  assert.doesNotMatch(invoices, /تحتاج معالجة استرداد مالي قبل الإلغاء/);
  assert.doesNotMatch(invoices, /إجمالي المبيعات[\s\S]{0,100}rounded-2xl/);
  assert.match(invoices, /\{formatAmount\(filtered\.length\)\}/);
});

test("SUX-05 the whole compact invoice row opens its details", () => {
  assert.match(invoices, /className="invoice-row-compact cursor-pointer"/);
  assert.match(invoices, /onClick=\{\(\) => setSelectedInvoice\(inv\)\}/);
  assert.match(invoices, /tabIndex=\{0\}/);
  assert.match(css, /\.erp-workspace-main \.invoice-row-compact td/);
});

test("SUX-06 sales entry follows the referenced dense workspace division", () => {
  assert.match(newInvoice, /className="erp-pos-summary(?:\s|\")/);
  assert.match(newInvoice, /className="erp-pos-cart pos-invoice-items-grid"/);
  assert.match(newInvoice, /className="pos-invoice-bottom-bar"/);
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
});
