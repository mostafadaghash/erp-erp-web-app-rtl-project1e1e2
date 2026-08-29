import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile("src/components/RepairsPage.tsx", "utf8");
const backend = await readFile("convex/repairs.ts", "utf8");

test("RAV-01 create action has one visible blocking validation reason", () => {
  assert.match(page, /const createValidationReason = \(\(\) => \{/);
  for (const message of [
    "اختر فرع أمر الصيانة",
    "أدخل اسم العميل",
    "أدخل رقم الهاتف",
    "أدخل ماركة الجهاز",
    "أدخل موديل الجهاز",
    "أدخل وصف المشكلة",
    "أدخل تكلفة عمالة صحيحة",
    "أدخل عربونًا صحيحًا",
  ]) assert.ok(page.includes(message), `missing ${message}`);
  assert.match(page, /if \(createValidationReason\) \{[\s\S]*toast\.error\(createValidationReason\)[\s\S]*return/);
  assert.match(page, /disabled=\{saving \|\| Boolean\(createValidationReason\)\}/);
});

test("RAV-02 create validation covers parts stock duplicates and deposit account", () => {
  for (const message of [
    "اختر قطعة الغيار أو احذف السطر غير المكتمل",
    "كمية قطعة الغيار يجب أن تكون عددًا صحيحًا أكبر من صفر",
    "لا يمكن تكرار قطعة الغيار",
    "تتجاوز المخزون المتاح",
    "العربون لا يمكن أن يتجاوز إجمالي أمر الصيانة",
    "اختر حساب تحصيل العربون",
  ]) assert.ok(page.includes(message), `missing ${message}`);
});

test("RAV-03 transition validation mirrors technician diagnosis payment cancellation and warranty guards", () => {
  assert.match(page, /const transitionValidationReason = \(\(\) => \{/);
  for (const message of [
    "عيّن فنيًا قبل بدء الإصلاح",
    "أدخل التشخيص النهائي قبل اعتماد الجاهزية",
    "استرد العربون بالكامل قبل إلغاء الصيانة",
    "حصّل المبلغ المتبقي قبل تسليم الجهاز",
    "مدة الضمان يجب أن تكون عدد أيام صحيحًا من صفر إلى 365",
    "أدخل سبب الإلغاء",
    "اختر تاريخ عملية صالحًا",
  ]) assert.ok(page.includes(message), `missing ${message}`);
});

test("RAV-04 invalid transition cannot call the mutation", () => {
  assert.match(page, /if \(transitionValidationReason\) \{[\s\S]*toast\.error\(transitionValidationReason\)[\s\S]*return/);
  assert.match(page, /disabled=\{updatingId !== null \|\| Boolean\(transitionValidationReason\)\}/);
  assert.match(page, /role="alert"[\s\S]*\{transitionValidationReason\}/);
});

test("RAV-05 collection validates amount account and ISO date before submit", () => {
  assert.match(page, /const collectionValidationReason = \(\(\) => \{/);
  assert.ok(page.includes("مبلغ التحصيل يجب أن يكون أكبر من صفر ولا يتجاوز المتبقي"));
  assert.ok(page.includes("اختر حساب تحصيل تابعًا لفرع أمر الصيانة"));
  assert.ok(page.includes("اختر تاريخ تحصيل صالحًا"));
  assert.match(page, /disabled=\{financialBusy !== null \|\| Boolean\(collectionValidationReason\)\}/);
});

test("RAV-06 refund validates amount reason account and ISO date before submit", () => {
  assert.match(page, /const refundValidationReason = \(\(\) => \{/);
  assert.ok(page.includes("مبلغ الاسترداد يجب أن يكون أكبر من صفر ولا يتجاوز المحصل"));
  assert.ok(page.includes("سبب الاسترداد مطلوب"));
  assert.ok(page.includes("اختر حساب استرداد تابعًا لفرع أمر الصيانة"));
  assert.ok(page.includes("اختر تاريخ استرداد صالحًا"));
  assert.match(page, /disabled=\{financialBusy !== null \|\| Boolean\(refundValidationReason\)\}/);
});

test("RAV-07 edit validates an optional expected date before update", () => {
  assert.match(page, /const editValidationReason =/);
  assert.ok(page.includes("تاريخ التسليم المتوقع غير صالح"));
  assert.match(page, /disabled=\{updatingId !== null \|\| Boolean\(editValidationReason\)\}/);
});

test("RAV-08 backend remains authoritative for all operational guards", () => {
  for (const message of [
    "يجب تعيين فني قبل بدء الإصلاح",
    "التشخيص مطلوب قبل اعتماد الصيانة جاهزة",
    "يجب استرداد عربون الصيانة بالكامل قبل الإلغاء",
    "لا يمكن تسليم صيانة عليها مبلغ متبقٍ",
    "مدة الضمان يجب أن تكون عدد أيام صحيحًا من صفر إلى 365 عند التسليم",
  ]) assert.ok(backend.includes(message), `missing backend guard ${message}`);
});

test("RAV-09 validation preserves stable idempotency IDs during retries", () => {
  assert.match(page, /creationRequestId:\s*requestId/);
  assert.match(page, /requestId:\s*transitionRequestId/);
  assert.match(page, /requestId:\s*collectionRequestId/);
  assert.match(page, /requestId:\s*refundRequestId/);
});
