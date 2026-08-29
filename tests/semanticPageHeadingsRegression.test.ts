import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("treasury and delivery pages expose semantic h1 headings for browser acceptance", () => {
  const treasury = read("src/components/TreasuryPage.tsx");
  const deliveries = read("src/components/DeliveriesPage.tsx");

  assert.match(
    treasury,
    /<h1 className="erp-page-title">[\s\S]*?الخزينة والبنوك[\s\S]*?<\/h1>/,
  );
  assert.match(
    deliveries,
    /<h1 className="erp-page-title">[\s\S]*?إدارة الشحن والتوصيل[\s\S]*?<\/h1>/,
  );
});
