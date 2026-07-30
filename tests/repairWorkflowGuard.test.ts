import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const implementation = fs.readFileSync(
  new URL("../convex/repairs.ts", import.meta.url),
  "utf8",
);
const schema = fs.readFileSync(
  new URL("../convex/schema.ts", import.meta.url),
  "utf8",
);
const integration = fs.readFileSync(
  new URL("./repairWorkflowIntegration.test.ts", import.meta.url),
  "utf8",
);
const matrix = fs.readFileSync(
  new URL("./REPAIR_WORKFLOW_COVERAGE_MATRIX.md", import.meta.url),
  "utf8",
);

test("repair workflow guard requires 24 literal executable scenarios and matrix rows", () => {
  assert.equal((integration.match(/^test\("RWF-\d{2}/gm) ?? []).length, 24);
  assert.equal((matrix.match(/^\| RWF-\d{2} /gm) ?? []).length, 24);
  assert.equal((matrix.match(/\| EXECUTABLE \|$/gm) ?? []).length, 24);
  assert.doesNotMatch(integration, /exercise\(|Placeholder|forEach\(.*test|map\(.*test/);
});

test("repair workflow guard requires immutable indexed status history", () => {
  assert.match(schema, /repairStatusHistory: defineTable/);
  assert.match(schema, /\.index\("by_repair_date", \["repairId", "date"\]\)/);
  assert.match(schema, /\.index\("by_idempotency_key", \["idempotencyKey"\]\)/);
  assert.match(implementation, /query\("repairStatusHistory"\)[\s\S]*\.paginate\(/);
  assert.doesNotMatch(implementation, /ctx\.db\.delete/);
});

test("repair workflow guard requires fingerprint retry before mutable status checks", () => {
  const functionBody = implementation.slice(
    implementation.indexOf("async function transitionRepair"),
    implementation.indexOf("export const transitionStatus"),
  );
  assert.ok(functionBody.indexOf("previousAttempt") < functionBody.indexOf("const repair = await ctx.db.get"));
  assert.match(functionBody, /requestFingerprint/);
  assert.match(functionBody, /استُخدم معرف طلب تغيير الحالة ببيانات مختلفة/);
});

test("repair workflow guard requires technician branch and activity validation", () => {
  assert.match(implementation, /profile\.role !== "technician"/);
  assert.match(implementation, /profile\.branchId !== branchId/);
  assert.match(implementation, /!profile\.isActive/);
  assert.match(implementation, /withIndex\("by_branch"/);
});

test("repair workflow guard requires delivery balance diagnosis and warranty invariants", () => {
  assert.match(implementation, /التشخيص مطلوب قبل اعتماد الصيانة جاهزة/);
  assert.match(implementation, /لا يمكن تسليم صيانة عليها مبلغ متبق/);
  assert.match(implementation, /args\.warrantyDays > 365/);
  assert.match(implementation, /warrantyUntil: warrantyDays \? addDays/);
});

test("repair workflow guard requires protected redacted print and indexed employee lookup", () => {
  assert.match(implementation, /repairForPrint = query/);
  assert.match(implementation, /"print_repairs"/);
  assert.match(implementation, /withIndex\("by_user"/);
  assert.match(implementation, /withIndex\("by_token"/);
  assert.doesNotMatch(implementation, /query\("userProfiles"\)\.collect\(\)/);
  assert.doesNotMatch(
    implementation.slice(
      implementation.indexOf("export const repairForPrint"),
      implementation.indexOf("export const getByTracking"),
    ),
    /creationRequestId|creationFingerprint|partsCogsTotal/,
  );
});

test("repair workflow guard preserves accounting and inventory boundaries", () => {
  assert.doesNotMatch(implementation, /insert\("payments"|patch\([^)]*payments/);
  assert.doesNotMatch(implementation, /operationalPostingEnabled\s*:\s*true/);
  assert.match(implementation, /changeProductStock/);
  assert.match(implementation, /postRepairRevenueJournal/);
});
