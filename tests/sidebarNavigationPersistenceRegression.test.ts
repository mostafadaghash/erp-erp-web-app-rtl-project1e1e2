import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sidebar = readFileSync("src/components/Sidebar.tsx", "utf8");
const stagingBrowser = readFileSync("scripts/staging-browser-e2e.mjs", "utf8");

test("sidebar collapses the selected navigation group after page navigation", () => {
  const navigateTo = sidebar.match(/const navigateTo = \(page: Page\) => \{([\s\S]*?)\};/);
  assert.ok(navigateTo, "Sidebar navigateTo handler must exist");
  assert.match(navigateTo[1], /setOpenGroup\(null\)/);
  assert.match(navigateTo[1], /onNavigate\(page\)/);
});

test("staging navigation waits for the current sidebar target group to finish collapsing", () => {
  const navigateSidebar = stagingBrowser.match(/export async function navigateSidebar\(page, label\) \{([\s\S]*?)\n\}/);
  assert.ok(navigateSidebar, "navigateSidebar helper must exist");
  assert.match(navigateSidebar[1], /navigationTargets\[label\]/);
  assert.match(navigateSidebar[1], /target\.group/);
  assert.match(navigateSidebar[1], /waitForFunction/);
  assert.match(navigateSidebar[1], /aria-expanded/);
  assert.match(navigateSidebar[1], /=== "false"/);
});

test("sidebar group expansion remains controlled by the explicit group button", () => {
  assert.match(sidebar, /aria-expanded=\{isOpen\}/);
  assert.match(sidebar, /setOpenGroup\(\(?value\)?\s*=>\s*\(?value === group\.key \? null : group\.key\)?\)/);
});
