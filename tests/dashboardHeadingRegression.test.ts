import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync("src/components/ERPApp.tsx", "utf8");
const home = readFileSync("src/components/Dashboard.tsx", "utf8");

test("home page exposes الرئيسية through the shared accessible page heading", () => {
  assert.match(app, /dashboard: \{ group: "الرئيسية", title: "الرئيسية" \}/);
  assert.match(app, /<h1 className="truncate text-base font-black text-slate-900 lg:text-lg">\{pageMeta\.title\}<\/h1>/);
  assert.match(home, /ابدأ من الرئيسية/);
  assert.doesNotMatch(home, /لوحة التحكم/);
});
