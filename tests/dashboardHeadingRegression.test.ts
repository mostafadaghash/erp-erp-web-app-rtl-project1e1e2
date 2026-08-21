import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dashboard = readFileSync("src/components/Dashboard.tsx", "utf8");

test("dashboard exposes the main page title as an accessible heading", () => {
  assert.match(
    dashboard,
    /<h1 className="erp-page-title">[\s\S]*?لوحة التحكم[\s\S]*?<\/h1>/,
  );
});
