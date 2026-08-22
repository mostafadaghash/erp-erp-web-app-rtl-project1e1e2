import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const script = readFileSync(
  new URL("../scripts/staging-fixtures-setup.mjs", import.meta.url),
  "utf8",
);

test("staging fixture setup uses grouped professional sidebar navigation", () => {
  assert.match(script, /navigateSidebar/);
  assert.match(script, /"الأصناف":\s*"دليل الأصناف"/);
  assert.doesNotMatch(
    script,
    /page\.getByRole\("button",\s*\{\s*name:\s*label,\s*exact:\s*true\s*\}\)\.click\(\)/,
  );
});
