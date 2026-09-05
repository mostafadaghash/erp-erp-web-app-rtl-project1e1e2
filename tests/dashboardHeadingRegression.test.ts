import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync("src/components/ERPApp.tsx", "utf8");
const operational = readFileSync("src/components/OperationalDashboard.tsx", "utf8");
const executive = readFileSync("src/components/Dashboard.tsx", "utf8");

test("dashboard headings distinguish operational and executive workspaces", () => {
  assert.match(app, /dashboard: \{ group: "لوحة التحكم", title: "لوحة التشغيل" \}/);
  assert.match(app, /"executive-dashboard": \{ group: "لوحة التحكم", title: "اللوحة التنفيذية" \}/);
  assert.match(app, /const currentTab = workspace\.tabs\.find/);
  assert.match(app, /<h1 className="truncate text-base font-black text-slate-900 lg:text-lg">\{currentTab\?\.title \?\? pageMeta\.title\}<\/h1>/);
  assert.match(operational, />لوحة التشغيل<\/h1>/);
  assert.match(executive, /<h1 className="erp-page-title">اللوحة التنفيذية<\/h1>/);
  assert.match(executive, /aria-label="المؤشرات التنفيذية الرئيسية"/);
});
