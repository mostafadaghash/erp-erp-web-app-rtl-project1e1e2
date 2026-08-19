import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("src/components/DeliveriesPage.tsx", "utf8");

test("UAT-FINAL-01 distinguishes delivery loading, empty, and load-more states", () => {
  assert.match(source, /deliveries\.status === "LoadingFirstPage"/);
  assert.match(source, /جارٍ تحميل الشحنات/);
  assert.match(source, /لا توجد شحنات مسجلة في هذا الفرع/);
  assert.match(source, /deliveries\.status === "LoadingMore"/);
});

test("UAT-FINAL-02 distinguishes settlement loading, empty, and load-more states", () => {
  assert.match(source, /settlements\.status === "LoadingFirstPage"/);
  assert.match(source, /جارٍ تحميل التسويات/);
  assert.match(source, /لا توجد تسويات مسجلة في هذا الفرع/);
  assert.match(source, /settlements\.loadMore\(10\)/);
  assert.match(source, /عرض المزيد من التسويات/);
});

test("UAT-FINAL-03 exposes protected delivery details through deliveries.get", () => {
  assert.match(source, /useQuery\(api\.deliveries\.get/);
  assert.match(source, /modal === "details"/);
  assert.match(source, /تفاصيل الشحنة/);
  assert.match(source, /deliveryDetails\.items\.map/);
});

test("UAT-FINAL-04 uses operation-specific success messages", () => {
  for (const message of [
    "تم إنشاء الشحنة بنجاح",
    "تم تسجيل إرسال الشحنة",
    "تم تسجيل التسليم والتحصيل بنجاح",
    "تم تسجيل مرتجع الشحنة",
    "تم إلغاء الشحنة",
    "تم إلغاء تسجيل التسليم وإعادة الشحنة للحالة السابقة",
    "تمت تسوية مبالغ التحصيل بنجاح",
    "تم إلغاء تسوية التحصيل",
  ]) assert.ok(source.includes(message), `missing success message: ${message}`);
  assert.match(source, /successMessage\(operation\)/);
});

test("UAT-FINAL-05 escapes every dynamic print value and detaches the opener", () => {
  assert.match(source, /const escapeHtml/);
  assert.match(source, /popup\.opener = null/);
  assert.match(source, /escapeHtml\(item\.productName\)/);
  assert.match(source, /escapeHtml\(dto\.customerName\)/);
  assert.match(source, /escapeHtml\(dto\.sourceAccountName\)/);
  assert.match(source, /escapeHtml\(dto\.reversalReason\)/);
  assert.match(source, /توقيع شركة الشحن/);
  assert.match(source, /توقيع المحاسب/);
});

test("UAT-FINAL-06 shows loading and empty feedback for creation and COD pickers", () => {
  for (const message of [
    "جارٍ تحميل أوامر البيع الجاهزة",
    "لا توجد أوامر بيع جاهزة مؤهلة للشحن",
    "جارٍ تحميل حسابات وسيط التحصيل",
    "لا توجد حسابات مؤهلة لتحصيل قيمة الشحنة في هذا الفرع",
    "جارٍ تحميل حسابات مبالغ التحصيل",
    "لا توجد حسابات مبالغ تحصيل مؤهلة للتسوية",
    "جارٍ تحميل الشحنات غير المسواة",
    "لا توجد شحنات غير مسواة لهذا الحساب",
    "جارٍ تحميل الخزائن والبنوك",
    "لا توجد خزينة أو حساب بنكي مؤهل للاستلام",
  ]) assert.ok(source.includes(message), `missing feedback: ${message}`);
});

test("UAT-FINAL-07 does not render a submit action in read-only details mode", () => {
  assert.match(source, /modal !== "details" &&/);
  assert.doesNotMatch(source, /successMessage\("details"\)/);
});
