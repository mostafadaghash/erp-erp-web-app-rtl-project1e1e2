import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const styles = readFileSync("src/dashboard-final-fixes.css", "utf8");

test("global search reserves RTL padding for the search icon", () => {
  assert.match(styles, /input\[aria-label="البحث الشامل"\][\s\S]*padding-right:\s*2\.75rem\s*!important/);
});

test("custom dashboard dates stay compact on desktop and fluid on small screens", () => {
  assert.match(styles, /\.erp-dashboard-filter-grid \.erp-dashboard-date\s*\{[\s\S]*width:\s*148px\s*!important[\s\S]*flex:\s*0 0 148px/);
  assert.match(styles, /@media \(max-width: 740px\)[\s\S]*\.erp-dashboard-filter-grid \.erp-dashboard-date\s*\{[\s\S]*width:\s*100%\s*!important/);
});

test("branch filter removes the decorative icon that collides with the select", () => {
  assert.match(styles, /\.erp-dashboard-filter--branch > svg\s*\{[\s\S]*display:\s*none/);
});

test("desktop navigation compresses before it can collide with the user panel", () => {
  assert.match(styles, /@media \(min-width: 1024px\) and \(max-width: 1700px\)/);
  assert.match(styles, /\.erp-nav-group-button > span > svg\s*\{[\s\S]*display:\s*none/);
  assert.match(styles, /\.erp-user-panel\s*\{[\s\S]*padding-right:\s*8px\s*!important/);
});
