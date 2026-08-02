import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("src/components/RepairsPage.tsx", "utf8");

test("RPU-01 repair form loads the dedicated part picker only while open and branch-ready", () => {
  assert.match(source, /api\.repairs\.partPicker/);
  assert.match(source, /canCreate && showForm && !requiresBranchSelection \? \{\} : "skip"/);
  assert.match(source, /branchId:\s*selectedBranchId[\s\S]*as Id<"branches">/);
});

test("RPU-02 repair form sends inventory product IDs and integer quantities", () => {
  assert.match(source, /parts:\s*selectedParts/);
  assert.match(source, /productId:\s*part\.productId as Id<"products">/);
  assert.match(source, /Number\.isInteger\(Number\(part\.quantity\)\)/);
});

test("RPU-03 repair part picker displays server price stock and unit", () => {
  assert.match(source, /part\.sellPrice\.toLocaleString/);
  assert.match(source, /متاح \{part\.stock\} \{part\.unit\}/);
  assert.doesNotMatch(source, /part\.costPrice|part\.inventoryValue/);
});

test("RPU-04 repair form supports adding and removing dynamic part rows", () => {
  assert.match(source, /setParts\(\(current\) => \[/);
  assert.match(source, /current\.filter\(\(_, partIndex\)/);
  assert.match(source, /إضافة قطعة/);
  assert.match(source, /حذف/);
});

test("RPU-05 repair form rejects duplicate product selections", () => {
  assert.match(source, /new Set\(selectedParts\.map/);
  assert.match(source, /لا يمكن تكرار قطعة الغيار/);
});

test("RPU-06 repair total combines labor and server-priced parts", () => {
  assert.match(source, /Number\(form\.laborCost \|\| 0\) \+ partsTotal/);
  assert.match(source, /إجمالي أمر الصيانة/);
  assert.match(source, /إجمالي قطع الغيار/);
});

test("RPU-07 deposit is capped by labor plus parts total", () => {
  assert.match(
    source,
    /Number\(form\.deposit\) > Number\(form\.laborCost \|\| 0\) \+ partsTotal/,
  );
  assert.match(source, /العربون لا يمكن أن يتجاوز إجمالي أمر الصيانة/);
});

test("RPU-08 creation request ID stays stable through a failed save", () => {
  const submitStart = source.indexOf("const handleSubmit");
  const submitEnd = source.indexOf("const openStatusTransition");
  const submit = source.slice(submitStart, submitEnd);
  assert.match(submit, /creationRequestId:\s*requestId/);
  const successBlock = submit.slice(submit.indexOf("await createRepair"), submit.indexOf("catch"));
  assert.match(successBlock, /resetCreateState\(\)/);
  const catchBlock = submit.slice(submit.indexOf("catch"));
  assert.doesNotMatch(catchBlock, /resetCreateState|setRequestId/);
});

test("RPU-09 save busy and action validation guards prevent double part consumption", () => {
  assert.match(source, /if \(saving\) return/);
  assert.match(source, /if \(createValidationReason\)/);
  assert.match(source, /setSaving\(true\)/);
  assert.match(source, /disabled=\{saving \|\| Boolean\(createValidationReason\)\}/);
});

test("RPU-10 a new form and branch change clear stale creation state", () => {
  assert.match(
    source,
    /const resetCreateState = \(\) => \{[\s\S]*setParts\(\[\]\)[\s\S]*setAccountId\(""\)[\s\S]*setRequestId\(crypto\.randomUUID\(\)\)[\s\S]*setForm\(emptyRepairForm\(\)\)/,
  );
  assert.match(source, /const openNewRepair = \(\) => \{[\s\S]*resetCreateState\(\);[\s\S]*setShowForm\(true\)/);
  assert.match(source, /const handleBranchChange = \(value: string\) => \{[\s\S]*resetCreateState\(\);[\s\S]*setShowForm\(false\)/);
});

test("RPU-11 repair cards display stored part snapshots and line totals", () => {
  assert.match(source, /r\.parts\.length > 0/);
  assert.match(source, /part\.lineTotal \?\? part\.cost \* part\.quantity/);
  assert.match(source, /قطع الغيار/);
});

test("RPU-12 repair parts UI contains no unsafe TypeScript escape", () => {
  assert.doesNotMatch(source, /as any|@ts-ignore/);
});
