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
const professionalStyles = read("src/professional-ui.css");
const navigationStyles = read("src/professional-navigation.css");
const branding = read("src/lib/branding.ts");
const newInvoice = read("src/components/NewInvoicePage.tsx");
const signOut = read("src/SignOutButton.tsx");
const purchases = read("src/components/ShipmentsPage.tsx");
const orders = read("src/components/OrdersPage.tsx");
const deliveries = read("src/components/DeliveriesPage.tsx");
const repairs = read("src/components/RepairsPage.tsx");
const purchaseReturns = read("src/components/PurchaseReturnsPage.tsx");
const reports = read("src/components/ReportsPage.tsx");

test("professional ERP navigation uses conventional Arabic information architecture", () => {
  for (const label of [
    "لوحة التحكم",
    "المبيعات",
    "فواتير المبيعات",
    "مرتجعات المبيعات",
    "عروض الأسعار",
    "طلبات البيع",
    "العملاء",
    "المشتريات",
    "فواتير المشتريات",
    "مرتجعات المشتريات",
    "إدارة المخزون",
    "الشحن",
    "طلبات الشحن والتسويات",
    "أوامر الصيانة",
    "الحسابات",
    "الخزائن والحسابات",
    "سندات القبض والصرف",
    "حسابات العملاء",
    "حسابات الموردين",
    "الشيكات والأقساط",
    "المستخدمون والصلاحيات",
    "سجل العمليات",
  ]) assert.match(sidebar, new RegExp(label));

  for (const legacy of [
    "المبيعات والفواتير",
    "المبيعات والعملاء",
    "الأوردرات",
    "الشحنات الواردة",
    "المشتريات والموردون",
    "الموظفون والصلاحيات",
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
  assert.match(settingsPage, /AssetCard title="شعار النظام"/);
  assert.match(settingsPage, /AssetCard title="أيقونة المتصفح"/);
  assert.match(styles, /--brand-primary/);
  assert.match(styles, /--brand-secondary/);
});

test("default visual system uses the approved emerald and navy ERP identity", () => {
  for (const source of [styles, branding, settingsPage, settingsApi]) {
    assert.match(source, /#16a66a/i);
    assert.match(source, /#12263a/i);
  }
  for (const token of [
    "--erp-accent",
    "--erp-navy",
    "--erp-warning",
    "--erp-danger",
    "--erp-border",
  ]) assert.match(professionalStyles, new RegExp(token));
  assert.match(navigationStyles, /erp-navigation::before/);
});

test("every operational page inherits the Sahl clarity design system", () => {
  assert.match(app, /className="erp-workspace-main/);
  for (const marker of [
    "Sahl-inspired clarity layer",
    ".erp-workspace-main :where(.data-table, table) th",
    "border: 1px solid var(--erp-border-strong)",
    ".erp-workspace-main .btn-primary",
    ".erp-workspace-main :where(input, select, textarea)",
  ]) assert.match(professionalStyles, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(navigationStyles, /border-radius: 5px/);
  assert.match(purchaseReturns, /className="erp-section" data-testid="purchase-return-form"/);
  assert.match(purchaseReturns, /سجل مرتجعات المشتريات/);
});

test("sales invoice is a fast keyboard and barcode-ready document workspace", () => {
  for (const marker of [
    "erp-pos-page",
    "erp-pos-grid",
    "erp-pos-cart",
    "invoice-product-search",
    "invoice-submit",
    "ملخص الفاتورة",
  ]) assert.match(newInvoice, new RegExp(marker));
  assert.match(newInvoice, /product\.barcode\?\.toLowerCase\(\)/);
  assert.match(newInvoice, /event\.key === "F2"/);
  assert.match(newInvoice, /event\.key === "F9"/);
  assert.match(newInvoice, /event\.key === "Enter"/);
  assert.match(professionalStyles, /\.erp-pos-page[\s\S]*height: 100%[\s\S]*overflow: hidden/);
});

test("historical sales and purchase documents can always be reopened", () => {
  assert.match(invoices, /data-testid="invoice-open"/);
  assert.match(invoices, /data-testid="invoice-details-modal"/);
  assert.match(purchases, /data-testid="purchase-open"/);
  assert.match(purchases, /data-testid="purchase-details-modal"/);
  assert.match(read("convex/shipments.ts"), /export const purchaseDocument = query/);
});

test("reports expose a clickable catalog, explicit filters and printable output", () => {
  for (const marker of [
    'id: "sales"',
    'id: "purchases"',
    'id: "profit"',
    "report-apply-filters",
    "طباعة التقرير",
  ]) assert.match(reports, new RegExp(marker));
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
    "الحالة التالية من مسار الشحن",
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
