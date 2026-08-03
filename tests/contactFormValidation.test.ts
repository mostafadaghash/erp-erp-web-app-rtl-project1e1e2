import test from "node:test";
import assert from "node:assert/strict";
import { validateContactForm } from "../src/lib/contactForm.ts";

const baseForm = {
  name: "عميل تجريبي",
  phone: "01012345678",
  email: "",
  address: "",
  notes: "",
};

test("contact form normalization matches the backend contact rules", () => {
  const result = validateContactForm({
    name: "  شركة   النور  ",
    phone: "٠١٠ ١٢٣٤-٥٦٧٨",
    email: "  Sales@Example.COM  ",
    address: "  القاهرة   الجديدة  ",
    notes: "  عميل   مميز  ",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.payload, {
    name: "شركة النور",
    phone: "01012345678",
    email: "sales@example.com",
    address: "القاهرة الجديدة",
    notes: "عميل مميز",
  });
  assert.deepEqual(result.normalizedForm, {
    name: "شركة النور",
    phone: "01012345678",
    email: "sales@example.com",
    address: "القاهرة الجديدة",
    notes: "عميل مميز",
  });
});

test("empty optional contact fields stay explicit so updates can clear stored values", () => {
  const result = validateContactForm({
    ...baseForm,
    email: "   ",
    address: "   ",
    notes: "   ",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.payload, {
    name: "عميل تجريبي",
    phone: "01012345678",
    email: "",
    address: "",
    notes: "",
  });
  assert.deepEqual(result.normalizedForm, result.payload);
});

test("contact validation reports specific required and format failures", () => {
  const missing = validateContactForm({
    ...baseForm,
    name: " ",
    phone: " ",
  });
  assert.equal(missing.ok, false);
  if (missing.ok) return;
  assert.equal(missing.errors.name, "الاسم مطلوب");
  assert.equal(missing.errors.phone, "رقم الهاتف مطلوب");
  assert.equal(missing.reason, "الاسم مطلوب");

  const invalid = validateContactForm({
    ...baseForm,
    name: "أ",
    phone: "12x",
    email: "invalid@",
  });
  assert.equal(invalid.ok, false);
  if (invalid.ok) return;
  assert.match(invalid.errors.name ?? "", /حرفين و100/);
  assert.match(invalid.errors.phone ?? "", /7 إلى 15/);
  assert.match(invalid.errors.email ?? "", /بريدًا إلكترونيًا صحيحًا/);
});

test("contact validation enforces address and notes limits", () => {
  const result = validateContactForm({
    ...baseForm,
    address: "ع".repeat(301),
    notes: "م".repeat(1001),
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.errors.address ?? "", /300/);
  assert.match(result.errors.notes ?? "", /1000/);
});
