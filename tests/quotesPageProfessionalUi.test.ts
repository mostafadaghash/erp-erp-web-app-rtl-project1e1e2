import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/components/QuotesPage.tsx", "utf8");

test("quotes page avoids duplicating the shell page title", () => {
  assert.doesNotMatch(page, /erp-page-title/);
  assert.match(page, /إنشاء ومتابعة عروض الأسعار وموافقة العملاء/);
});

test("quotes page exposes compact search, date and status filters", () => {
  assert.match(page, /data-testid="quote-search"/);
  assert.match(page, /data-testid="quote-date-filter"/);
  assert.match(page, /data-testid="quote-status-filter"/);
  assert.match(page, /آخر 7 أيام/);
  assert.match(page, /فترة مخصصة/);
});

test("quote rows open the saved quote and keep row actions", () => {
  assert.match(page, /data-testid="quote-row"/);
  assert.match(page, /onClick=\{\(\) => setSelectedQuote\(quote\)\}/);
  assert.match(page, /data-testid="quote-details-modal"/);
  assert.match(page, /<Eye className="h-4 w-4" \/> فتح/);
});

test("quotes page uses the global Latin-digit currency formatting", () => {
  assert.match(page, /formatAppCurrency\(quote\.total\)/);
  assert.match(page, /formatAppNumber\(filteredQuotes\.length\)/);
  assert.doesNotMatch(page, /toLocaleString\("ar-EG"\)/);
});

test("empty quote state stays inside the compact table", () => {
  assert.match(page, /colSpan=\{7\}/);
  assert.match(page, /h-44 text-center text-slate-400/);
  assert.doesNotMatch(page, /erp-empty-state/);
});
