import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeContactEmail,
  normalizeContactName,
  normalizeContactPhone,
  normalizeOptionalContactText,
} from "../shared/contactRules.ts";

test("contact name collapses whitespace and preserves Arabic text", () => {
  assert.equal(normalizeContactName("  أحمد   علي  "), "أحمد علي");
});

test("contact name rejects blank and oversized values", () => {
  assert.throws(() => normalizeContactName(" "));
  assert.throws(() => normalizeContactName("أ".repeat(101)));
});

test("contact phone transliterates Arabic and Persian digits", () => {
  assert.equal(normalizeContactPhone("٠١٠-١٢٣٤-٥٦٧٨"), "01012345678");
  assert.equal(normalizeContactPhone("۰۱۰ ۱۲۳۴ ۵۶۷۸"), "01012345678");
});

test("contact phone canonicalizes Egyptian international prefixes", () => {
  assert.equal(normalizeContactPhone("+20 10 1234 5678"), "01012345678");
  assert.equal(normalizeContactPhone("0020 10 1234 5678"), "01012345678");
});

test("contact phone rejects unsupported characters and lengths", () => {
  assert.throws(() => normalizeContactPhone("010-ABC-123"));
  assert.throws(() => normalizeContactPhone("123"));
});

test("contact email is trimmed lowercased and validated", () => {
  assert.equal(
    normalizeContactEmail("  Customer@Example.COM "),
    "customer@example.com",
  );
  assert.throws(() => normalizeContactEmail("customer.example.com"));
});

test("optional contact text converts blank values to undefined", () => {
  assert.equal(normalizeOptionalContactText("   ", 20), undefined);
  assert.equal(normalizeOptionalContactText(undefined, 20), undefined);
});

test("optional contact text collapses whitespace and enforces its limit", () => {
  assert.equal(normalizeOptionalContactText(" شارع   التحرير ", 20), "شارع التحرير");
  assert.throws(() => normalizeOptionalContactText("ط".repeat(21), 20));
});
