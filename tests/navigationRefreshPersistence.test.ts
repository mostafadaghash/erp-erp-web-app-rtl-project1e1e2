import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sidebar = await readFile("src/components/Sidebar.tsx", "utf8");

test("NAV-REFRESH-01 current ERP page survives a browser refresh within the same tab", () => {
  assert.match(sidebar, /const PAGE_SESSION_KEY = "business-tech-erp\.current-page"/);
  assert.match(sidebar, /window\.sessionStorage\.getItem\(PAGE_SESSION_KEY\)/);
  assert.match(sidebar, /if \(isPage\(storedPage\) && storedPage !== currentPage\)/);
  assert.match(sidebar, /onNavigate\(storedPage\)/);
  assert.match(sidebar, /window\.sessionStorage\.setItem\(PAGE_SESSION_KEY, currentPage\)/);
});

test("NAV-REFRESH-02 restored pages are allow-listed and still pass through normal navigation permissions", () => {
  assert.match(sidebar, /const PAGE_IDS = new Set<Page>/);
  assert.match(sidebar, /"new-purchase-invoice"/);
  assert.match(sidebar, /"general-ledger"/);
  assert.match(sidebar, /const isPage = \(value: string \| null\): value is Page/);
  assert.match(sidebar, /onNavigate\(storedPage\)/);
  assert.doesNotMatch(sidebar, /setCurrentPage\(storedPage/);
});
