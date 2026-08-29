import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dashboard = readFileSync("src/components/Dashboard.tsx", "utf8");
const styles = readFileSync("src/professional-ui.css", "utf8");

test("dashboard cards use a balanced desktop grid without forced empty height", () => {
  assert.match(styles, /\.erp-dashboard-card-grid\s*\{[\s\S]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(styles, /\.erp-dashboard-card-grid\s*\{[^}]*flex:\s*1\s*;/);
  assert.match(styles, /min-height: clamp\(186px, 20dvh, 216px\)/);
});

test("dashboard collapses predictably for tablets and phones", () => {
  assert.match(styles, /@media \(max-width: 1050px\)[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(max-width: 520px\)[\s\S]*\.erp-dashboard-card-grid \{ grid-template-columns: 1fr; \}/);
  assert.match(styles, /@media \(max-width: 740px\)[\s\S]*\.erp-dashboard-filter-grid \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
  assert.match(styles, /@media \(max-width: 520px\)[\s\S]*\.erp-dashboard-filter-grid \{ grid-template-columns: 1fr;/);
});

test("every metric card keeps useful visible content at its lower edge", () => {
  assert.match(dashboard, /erp-dashboard-card-status/);
  assert.match(dashboard, /فتح التقرير التفصيلي/);
  assert.match(dashboard, /أعلى من الفترة السابقة/);
  assert.match(dashboard, /أقل من الفترة السابقة/);
  assert.doesNotMatch(dashboard, /erp-dashboard-card-link/);
});
