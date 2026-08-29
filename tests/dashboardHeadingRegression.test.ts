import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync("src/components/ERPApp.tsx", "utf8");
const home = readFileSync("src/components/Dashboard.tsx", "utf8");

test("dashboard exposes لوحة التحكم through the shared accessible page heading", () => {
  assert.match(app, /dashboard: \{ group: "لوحة التحكم", title: "لوحة التحكم" \}/);
  assert.match(app, /<h1 className="truncate text-base font-black text-slate-900 lg:text-lg">\{pageMeta\.title\}<\/h1>/);
  assert.match(home, /<h1 className="erp-page-title">لوحة التحكم<\/h1>/);
  assert.match(home, /aria-label="المؤشرات الرئيسية"/);
});
