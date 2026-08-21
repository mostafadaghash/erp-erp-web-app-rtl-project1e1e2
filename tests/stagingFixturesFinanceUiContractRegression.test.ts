import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const script = readFileSync("scripts/staging-fixtures-setup.mjs", "utf8");

test("staging fixture finance setup accepts an already-initialized hidden marker", () => {
  assert.match(script, /return !marker \|\| marker\.getAttribute\("data-state"\) !== "loading"/);
  assert.match(script, /:\s*"initialized"/);
});

test("staging fixture finance setup follows the current custom modal workflow", () => {
  assert.doesNotMatch(script, /page\.once\("dialog"/);
  assert.match(script, /تسجيل الرصيد الافتتاحي/);
  assert.match(script, /finance-confirmation-dialog/);
  assert.match(script, /finance-confirm-final/);
  assert.match(script, /تم إنشاء الحساب بنجاح/);
});

test("staging fixture finance setup waits for the configured branch option before reading branch options", () => {
  assert.match(
    script,
    /const targetBranch = await selectExact\(branchSelect, fixtures\.branchName\);[\s\S]{0,350}const options =/,
  );
  assert.doesNotMatch(
    script,
    /const matches = options\.filter\(\(option\) => option\.label === fixtures\.branchName\)/,
  );
});
