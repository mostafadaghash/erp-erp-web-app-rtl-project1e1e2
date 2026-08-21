import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sidebar = readFileSync("src/components/Sidebar.tsx", "utf8");

test("sidebar keeps the selected navigation group mounted across page changes", () => {
  const navigateTo = sidebar.match(/const navigateTo = \(page: Page\) => \{([\s\S]*?)\n  \};/);
  assert.ok(navigateTo, "Sidebar navigateTo handler must exist");
  assert.match(navigateTo[1], /onNavigate\(page\)/);
  assert.doesNotMatch(navigateTo[1], /setOpenGroup\(null\)/);
});

test("sidebar group expansion remains controlled by the explicit group button", () => {
  assert.match(sidebar, /aria-expanded=\{isOpen\}/);
  assert.match(sidebar, /setOpenGroup\(\(value\) => \(value === group\.key \? null : group\.key\)\)/);
});
