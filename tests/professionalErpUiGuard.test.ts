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
const purchases = read("src/components/ShipmentsPage.tsx");
const orders = read("src/components/OrdersPage.tsx");
const deliveries = read("src/components/DeliveriesPage.tsx");
const repairs = read("src/components/RepairsPage.tsx");
const purchaseReturns = read("src/components/PurchaseReturnsPage.tsx");

test("professional ERP navigation uses conventional Arabic information architecture", () => {
  for (const label of [
    "المبيعات",
    "فواتير المبيعات",
    "مرتجعات المبيعات",
    "أوامر البيع",
    "المشتريات",
    "فواتير المشتريات",
    "مرتجعات المشتريات",
    "دليل الأصناف",
    "الشحن",
    "إدارة الشحن",
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
    "المبيعات والعملاء",
    "الأوردرات",
    "الشحنات الواردة",
    "المشتريات والموردون",
    "الشحن والتوصيل",
    "الموظفون والصلاحيات",
    "سجل العمليات",
    "سجل التدقيق",
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
  assert.equal((app.match(/data-testid="quick-action-menu"/g) ?? []).length, 1);
  assert.match(app, />إنشاء جديد</);
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

test("purchase workflows use grammatically correct professional terminology", () => {
  for (const label of [
    "رقم عملية الشراء",
    "حفظ عملية الشراء",
    "استلام عملية الشراء",
    "تم تحديث حالة عملية الشراء",
  ]) assert.match(purchases, new RegExp(label));

  assert.doesNotMatch(purchases, /العملية شراء|عملية شراء شراء/);
});

test("sales orders use one professional document name and item terminology", () => {
  for (const label of [
    "رقم أمر البيع",
    "لا توجد أوامر بيع",
    "<th>الأصناف</th>",
    "تعديل أمر البيع",
    "إلغاء أمر البيع",
    "تفاصيل أمر البيع",
    "التسليم من عملية الشحن",
  ]) assert.match(orders, new RegExp(label));

  assert.doesNotMatch(orders, /لا توجد أمر بيعات|<th>المنتجات<\/th>|التسليم من التوصيل|تفاصيل الطلب/);
});

test("shipping creation refers to sales orders consistently", () => {
  for (const label of [
    "شحنة جديدة",
    "اختر أمر البيع",
    "جارٍ تحميل أوامر البيع الجاهزة",
    "لا توجد أوامر بيع جاهزة مؤهلة للشحن",
  ]) assert.match(deliveries, new RegExp(label));

  assert.doesNotMatch(deliveries, /إنشاء من طلب وفاتورة|اختر طلب[ًااً]+ جاهز[ًااً]+|الطلبات الجاهزة/);
});

test("repair and purchase-return success messages match their module names", () => {
  assert.match(repairs, /تم إنشاء أمر الصيانة بنجاح/);
  assert.match(repairs, /رقم أمر الصيانة/);
  assert.match(repairs, /بيانات أمر الصيانة/);
  assert.match(purchaseReturns, /تم ترحيل مرتجع المشتريات/);
  assert.doesNotMatch(repairs, /تم إضافة طلب الصيانة بنجاح|رقم الطلب|رابط متابعة طلب الصيانة/);
  assert.doesNotMatch(purchaseReturns, /تم ترحيل مرتجع الشراء/);
});
