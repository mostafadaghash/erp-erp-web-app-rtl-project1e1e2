import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const invoices = await readFile("src/components/InvoicesPage.tsx", "utf8");

test("IDF-01 sales invoices default to the current month", () => {
  assert.match(invoices, /useState<InvoiceDateFilter>\("month"\)/);
  assert.ok(invoices.includes('<option value="month">هذا الشهر</option>'));
});

test("IDF-02 invoice date filter exposes today, seven days, month, custom, and all", () => {
  for (const label of ["اليوم", "آخر 7 أيام", "هذا الشهر", "فترة مخصصة", "كل الفترات"]) {
    assert.ok(invoices.includes(label));
  }
  assert.match(invoices, /data-testid="invoice-date-filter"/);
});

test("IDF-03 custom period uses compact from and to date fields", () => {
  assert.match(invoices, /dateFilter === "custom"/);
  assert.match(invoices, /data-testid="invoice-date-from"/);
  assert.match(invoices, /data-testid="invoice-date-to"/);
  assert.ok(invoices.includes("تاريخ البداية يجب ألا يكون بعد تاريخ النهاية"));
});

test("IDF-04 date filtering uses the same creation timestamp displayed by the invoice table", () => {
  assert.match(invoices, /invoiceMatchesDateFilter\(inv\._creationTime, dateFilter, customFrom, customTo\)/);
  assert.match(invoices, /new Date\(inv\._creationTime\)\.toLocaleDateString/);
});

test("IDF-05 search, status, date, and credit filters compose together", () => {
  assert.match(invoices, /inv\.invoiceNumber\.includes\(search\)/);
  assert.match(invoices, /!filterStatus \|\| inv\.status === filterStatus/);
  assert.match(invoices, /invoiceMatchesDateFilter/);
  assert.match(invoices, /!creditOnly \|\| \(inv\.remaining > 0 && inv\.status !== "cancelled"\)/);
});
