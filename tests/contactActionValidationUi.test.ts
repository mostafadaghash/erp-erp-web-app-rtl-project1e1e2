import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const customers = await readFile("src/components/CustomersPage.tsx", "utf8");
const suppliers = await readFile("src/components/SuppliersPage.tsx", "utf8");
const modal = await readFile("src/components/ContactFormModal.tsx", "utf8");
const validation = await readFile("src/lib/contactForm.ts", "utf8");

test("CAV-01 both contact pages use the shared validation contract", () => {
  for (const source of [customers, suppliers]) {
    assert.match(source, /validateContactForm/);
    assert.match(source, /const formValidation = validateContactForm\(form\)/);
    assert.match(source, /const \{ payload, normalizedForm \} = formValidation/);
    assert.match(source, /setForm\(normalizedForm\)/);
  }
});

test("CAV-02 invalid forms are blocked with a visible reason", () => {
  for (const source of [customers, suppliers]) {
    assert.match(source, /if \(!formValidation\.ok\)/);
    assert.match(source, /toast\.error\(formValidation\.reason\)/);
    assert.match(source, /validation=\{formValidation\}/);
  }
  assert.match(modal, /role="alert"/);
  assert.match(modal, /disabled=\{saving \|\| !validation\.ok\}/);
  assert.match(modal, /title=\{!validation\.ok \? validation\.reason : undefined\}/);
});

test("CAV-03 field limits match the backend normalization contract", () => {
  assert.match(modal, /id="contact-name"[\s\S]{0,180}maxLength=\{100\}/);
  assert.match(modal, /id="contact-phone"[\s\S]{0,220}maxLength=\{30\}/);
  assert.match(modal, /id="contact-email"[\s\S]{0,220}maxLength=\{254\}/);
  assert.match(modal, /id="contact-address"[\s\S]{0,200}maxLength=\{300\}/);
  assert.match(modal, /id="contact-notes"[\s\S]{0,160}maxLength=\{1000\}/);
  assert.match(validation, /normalizeContactName/);
  assert.match(validation, /normalizeContactPhone/);
  assert.match(validation, /normalizeContactEmail/);
  assert.match(validation, /normalizeOptionalContactText/);
});

test("CAV-04 duplicate messages remain backend-driven", () => {
  for (const source of [customers, suppliers]) {
    assert.match(source, /getErrorMessage\(/);
    assert.doesNotMatch(source, /includes\([^)]*مسجل|match\([^)]*مسجل/);
  }
});

test("CAV-05 create, update, activate, and deactivate failures are operation-specific", () => {
  assert.ok(customers.includes("تعذر تحديث العميل"));
  assert.ok(customers.includes("تعذر إضافة العميل"));
  assert.ok(customers.includes("تعذر إعادة تفعيل العميل"));
  assert.ok(customers.includes("تعذر تعطيل العميل"));
  assert.ok(suppliers.includes("تعذر تحديث المورد"));
  assert.ok(suppliers.includes("تعذر إضافة المورد"));
  assert.ok(suppliers.includes("تعذر إعادة تفعيل المورد"));
  assert.ok(suppliers.includes("تعذر تعطيل المورد"));
});

test("CAV-06 validation slice has no unsafe TypeScript escape", () => {
  for (const source of [customers, suppliers, modal, validation]) {
    assert.doesNotMatch(source, /as any|@ts-ignore/);
  }
});
