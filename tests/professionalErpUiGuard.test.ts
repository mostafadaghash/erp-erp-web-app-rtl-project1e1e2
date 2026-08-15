import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const sidebar = read("src/components/Sidebar.tsx");
const app = read("src/components/ERPApp.tsx");
const invoices = read("src/components/InvoicesPage.tsx");
const settingsPage = read("src/components/SettingsPage.tsx");
const settingsApi = read("convex/settings.ts");
const schema = read("convex/schema.ts");
const styles = read("src/index.css");
const signOut = read("src/SignOutButton.tsx");

test("professional ERP navigation uses conventional Arabic information architecture", () => {
  for (const label of [
    "المبيعات",
    "مرتجعات المبيعات",
    "أوامر البيع",
    "المشتريات",
    "مرتجعات المشتريات",
    "الأصناف",
    "عمليات الشحن",
    "أوامر الصيانة",
    "الحسابات",
    "الخزائن والبنوك",
    "حسابات العملاء",
    "حسابات الموردين",
    "المستخدمون والصلاحيات",
    "سجل المراجعة",
  ]) assert.match(sidebar, new RegExp(label));

  for (const legacy of [
    "المبيعات والفواتير",
    "الأوردرات",
    "الشحنات الواردة",
    "الموظفون والصلاحيات",
    "سجل العمليات",
  ]) assert.doesNotMatch(sidebar, new RegExp(legacy));
});

test("sales returns are a first-class protected page", () => {
  assert.match(app, /\| "sales-returns"/);
  assert.match(app, /"sales-returns": "view_sales_returns"/);
  assert.match(app, /view="returns"/);
  assert.match(invoices, /view\?: "sales" \| "returns"/);
  assert.match(invoices, /data-testid="sales-returns-page"/);
});

test("shell exposes one permission-aware quick creation menu", () => {
  assert.equal((app.match(/>إجراء جديد</g) ?? []).length, 1);
  assert.match(app, /data-testid="quick-action-menu"/);
  assert.match(app, /permission: "create_invoices"/);
  assert.match(app, /permission: "create_shipments"/);
  assert.doesNotMatch(read("src/components/Dashboard.tsx"), />فاتورة جديدة</);
});

test("white-label identity can be changed without source edits", () => {
  for (const field of ["shortName", "tagline", "legalName", "logoUrl", "faviconUrl", "invoiceFooter"]) {
    assert.match(schema, new RegExp(`${field}: v\\.optional`));
    assert.match(settingsApi, new RegExp(field));
    assert.match(settingsPage, new RegExp(field));
  }
  assert.match(settingsApi, /generateBrandAssetUploadUrl/);
  assert.match(settingsApi, /setBrandAsset/);
  assert.match(settingsPage, /غيّر الاسم والشعار والألوان في أي وقت بدون تعديل الكود/);
  assert.match(styles, /--brand-primary/);
  assert.match(styles, /--brand-secondary/);
});

test("authentication and session controls use professional Arabic copy", () => {
  assert.match(signOut, /تسجيل الخروج/);
  assert.doesNotMatch(signOut, /Sign Out/);
  assert.match(read("index.html"), /DAGHASH ERP \| إدارة أعمالك بوضوح/);
  assert.doesNotMatch(read("index.html"), /نظام إدارة الإلكترونيات|تك ستور/);
});
