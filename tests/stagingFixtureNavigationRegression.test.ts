import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const script = readFileSync(
  new URL("../scripts/staging-fixtures-setup.mjs", import.meta.url),
  "utf8",
);

test("staging fixture setup uses the current grouped sidebar navigation contract", () => {
  assert.match(script, /navigateSidebar/);
  assert.match(script, /navigate\(page, "قائمة العملاء", "customers-page"\)/);
  assert.match(script, /navigate\(page, "إدارة المخزون", "inventory-workspace-page"\)/);
  assert.match(script, /navigate\(page, "الخزائن والحسابات", "treasury-page"\)/);
  assert.doesNotMatch(script, /دليل الأصناف|الخزائن والبنوك/);
  assert.doesNotMatch(
    script,
    /page\.getByRole\("button",\s*\{\s*name:\s*label,\s*exact:\s*true\s*\}\)\.click\(\)/,
  );
});
