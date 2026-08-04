import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const schema = read("convex/schema.ts");
const auth = read("convex/lib/auth.ts");
const auditQuery = read("convex/auditLogs.ts");
const auditUi = read("src/components/AuditLogsPage.tsx");
const branches = read("convex/branches.ts");
const settings = read("convex/settings.ts");
const employees = read("convex/employees.ts");
const customers = read("convex/customers.ts");
const suppliers = read("convex/suppliers.ts");
const products = read("convex/products.ts");

test("audit schema stores versioned structured snapshots without v.any", () => {
  for (const field of ["beforeSnapshot", "afterSnapshot", "changedFields", "snapshotVersion"]) {
    assert.match(schema, new RegExp(`${field}: v\\.optional`));
  }
  const auditTable = schema.slice(schema.indexOf("auditLogs: defineTable"), schema.indexOf("};\n\nexport default defineSchema"));
  assert.doesNotMatch(auditTable, /v\.any\(/);
  assert.match(auditTable, /field: v\.string\(\), value: v\.string\(\)/);
});

test("central helper bounds fields and values and masks sensitive keys", () => {
  assert.match(auth, /MAX_AUDIT_FIELDS = 24/);
  assert.match(auth, /MAX_AUDIT_VALUE_LENGTH = 300/);
  assert.match(auth, /SENSITIVE_AUDIT_FIELD/);
  assert.match(auth, /return "\[محجوب\]"/);
  assert.match(auth, /\.slice\(0, MAX_AUDIT_FIELDS\)/);
  assert.match(auth, /\.slice\(0, MAX_AUDIT_VALUE_LENGTH\)/);
});

test("central helper records timestamp, changed fields and an explicit target branch", () => {
  assert.match(auth, /branchId\?: Id<"branches"> \| null/);
  assert.match(auth, /hasBranchOverride/);
  assert.match(auth, /changedFields: changedAuditFields/);
  assert.match(auth, /snapshotVersion: beforeSnapshot \|\| afterSnapshot \? 1/);
  assert.match(auth, /timestamp: Date\.now\(\)/);
});

test("audit DTO exposes only allowlisted structured fields", () => {
  assert.match(auditQuery, /beforeSnapshot: log\.beforeSnapshot \?\? \[\]/);
  assert.match(auditQuery, /afterSnapshot: log\.afterSnapshot \?\? \[\]/);
  assert.match(auditQuery, /changedFields: log\.changedFields \?\? \[\]/);
  assert.doesNotMatch(auditQuery, /\.\.\.log/);
});

test("audit UI renders searchable native Before and After details", () => {
  assert.match(auditUi, /function SnapshotList/);
  assert.match(auditUi, /عرض Before \/ After/);
  assert.match(auditUi, /<details/);
  assert.match(auditUi, /log\.beforeSnapshot\.flatMap/);
  assert.match(auditUi, /log\.afterSnapshot\.flatMap/);
});

test("branch administration writes target-branch snapshots", () => {
  assert.match(branches, /branchId: id,[\s\S]*after: \{ name: args\.name/);
  assert.match(branches, /before: \{ name: branch\.name/);
  assert.match(branches, /before: \{ isActive: branch\.isActive \}/);
  assert.match(branches, /after: \{ assignedRecords: assigned/);
});

test("global settings never inherit an actor working branch", () => {
  assert.equal((settings.match(/branchId: null/g) ?? []).length, 2);
  assert.match(settings, /before: existing \? \{ storeName:/);
  assert.match(settings, /before: existing\?\.modules/);
  assert.match(settings, /after: args\.modules/);
});

test("employee administration snapshots roles, branch, state and permission counts", () => {
  assert.match(employees, /createAuditSnapshot/);
  assert.match(employees, /permissionsCount: existing\.permissions\.length/);
  assert.match(employees, /before: \{ name: emp\.name, role: emp\.role/);
  assert.match(employees, /action: emp\.isActive \? "deactivate" : "activate"/);
  assert.match(employees, /before: \{ permissionsCount: emp\.permissions\.length \}/);
  assert.doesNotMatch(employees, /before: \{ permissions:/);
});

test("first-admin setup receives a structured immutable audit event", () => {
  assert.match(employees, /details: `إعداد النظام وترقية أول مدير/);
  assert.match(employees, /details: `إعداد النظام وإنشاء أول مدير/);
  assert.equal((employees.match(/snapshotVersion: 1/g) ?? []).length >= 2, true);
  assert.equal((employees.match(/timestamp: Date\.now\(\)/g) ?? []).length >= 2, true);
});

test("customer audit records the customer branch and redacted contact shape", () => {
  assert.match(customers, /branchId: customer\.branchId/);
  assert.match(customers, /phoneLast4: customer\.phone\.slice\(-4\)/);
  assert.match(customers, /hasEmail: Boolean\(normalized\.email\)/);
  assert.doesNotMatch(customers, /before: \{[^}]*phone: customer\.phone/);
});

test("supplier audit is global and redacts full contact values", () => {
  assert.equal((suppliers.match(/branchId: null/g) ?? []).length >= 3, true);
  assert.match(suppliers, /phoneLast4: supplier\.phone\.slice\(-4\)/);
  assert.match(suppliers, /hasAddress: Boolean\(normalized\.address\)/);
  assert.doesNotMatch(suppliers, /before: \{[^}]*phone: supplier\.phone/);
});

test("product audit omits prices while covering stock and lifecycle changes", () => {
  assert.match(products, /action: "adjust_stock"/);
  assert.match(products, /before: \{ stock: current\.stock \}/);
  assert.match(products, /action: isActive \? "activate" : "deactivate"/);
  const productAuditCalls = [...products.matchAll(/logAction\(ctx, user, \{([\s\S]*?)\}\);/g)].map((match) => match[1]).join("\n");
  assert.doesNotMatch(productAuditCalls, /costPrice:/);
  assert.doesNotMatch(productAuditCalls, /sellPrice:/);
});
