import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("src/components/DeliveriesPage.tsx", "utf8");

test("UAT-FINAL-01 distinguishes delivery loading, empty, and load-more states", () => {
  assert.match(source, /deliveries\.status === "LoadingFirstPage"/);
  assert.match(source, /جارٍ تحميل عمليات الشحن/);
  assert.match(source, /لا توجد عمليات شحن في هذا الفرع/);
  assert.match(source, /deliveries\.status === "LoadingMore"/);
});

test("UAT-FINAL-02 distinguishes settlement loading, empty, and load-more states", () => {
  assert.match(source, /settlements\.status === "LoadingFirstPage"/);
  assert.match(source, /جارٍ تحميل التسويات/);
  assert.match(source, /لا توجد تسويات COD في هذا الفرع/);
  assert.match(source, /تحميل المزيد من التسويات/);
});

test("UAT-FINAL-03 exposes protected delivery details through deliveries.get", () => {
  assert.match(source, /useQuery\(\s*api\.deliveries\.get/);
  assert.match(source, /modal === "details"/);
  assert.match(source, /تفاصيل الشحن/);
  assert.match(source, /deliveryDetails\.items\.map/);
});

test("UAT-FINAL-04 uses operation-specific success messages", () => {
  for (const message of [
    "تم إنشاء عملية الشحن بنجاح",
    "تم تأكيد إرسال الشحنة",
    "تم تأكيد التسليم وتسجيل تحصيل COD",
    "تم تسجيل مرتجع الشحنة",
    "تم إلغاء عملية الشحن",
    "تم عكس تأكيد التسليم",
    "تم إنشاء تسوية COD بنجاح",
    "تم عكس تسوية COD",
  ]) assert.ok(source.includes(message), `missing success message: ${message}`);
  assert.match(source, /operationSuccessMessage\(operation\)/);
});

test("UAT-FINAL-05 escapes every dynamic print value and detaches the opener", () => {
  assert.match(source, /const escapeHtml/);
  assert.match(source, /popup\.opener = null/);
  assert.match(source, /escapeHtml\(item\.productName\)/);
  assert.match(source, /escapeHtml\(dto\.customerName\)/);
  assert.match(source, /escapeHtml\(dto\.sourceAccountName\)/);
  assert.match(source, /escapeHtml\(dto\.reversalReason\)/);
});

test("UAT-FINAL-06 shows loading and empty feedback for creation and COD pickers", () => {
  for (const message of [
    "جارٍ تحميل أوامر البيع الجاهزة",
    "لا توجد أوامر بيع جاهزة مؤهلة للشحن",
    "جارٍ تحميل حسابات تأكيد COD",
    "لا توجد حسابات مؤهلة لتأكيد COD",
    "جارٍ تحميل عمليات شحن COD غير المسواة",
    "لا توجد عمليات شحن COD غير مسواة لهذا الحساب",
  ]) assert.ok(source.includes(message), `missing feedback: ${message}`);
});

test("UAT-FINAL-07 does not render a submit action in read-only details mode", () => {
  assert.match(source, /modal !== "details" && \(/);
  assert.doesNotMatch(source, /operationSuccessMessage\("details"\)/);
});
