import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { PERMISSIONS, ROLE_PERMISSIONS } from "../convex/lib/permissions.ts";
import {
  ALL_PERMISSION_OPTIONS,
  PERMISSION_CATALOG,
  PERMISSION_GROUP_ORDER,
} from "../src/lib/permissionCatalog.ts";

const employeesSource = readFileSync("src/components/EmployeesPage.tsx", "utf8");
const dashboardSource = readFileSync("src/components/Dashboard.tsx", "utf8");

const EXPECTED_GROUPS = [
  "المبيعات",
  "المشتريات",
  "المخزون",
  "الحسابات",
  "العملاء",
  "الصيانة",
  "الشحن",
  "الإدارة",
  "التقارير",
] as const;

test("PERM-AR01 every backend permission has one Arabic presentation", () => {
  const backendKeys = [...PERMISSIONS].sort();
  const catalogKeys = Object.keys(PERMISSION_CATALOG).sort();
  const optionKeys = ALL_PERMISSION_OPTIONS.map((permission) => permission.key).sort();

  assert.equal(PERMISSIONS.length, 105, "permission inventory changed; update the Arabic catalog contract intentionally");
  assert.deepEqual(catalogKeys, backendKeys);
  assert.deepEqual(optionKeys, backendKeys);

  for (const key of PERMISSIONS) {
    const presentation = PERMISSION_CATALOG[key];
    assert.ok(presentation.label.trim(), `${key} must have a visible Arabic label`);
    assert.notEqual(presentation.label, key, `${key} must never be exposed as its technical name`);
    assert.doesNotMatch(presentation.label, /^[a-z0-9_]+$/i, `${key} still looks like a technical permission key`);
    assert.ok(
      EXPECTED_GROUPS.includes(presentation.group),
      `${key} is assigned to an unsupported permission group`,
    );
  }
});

test("PERM-AR02 permissions use the requested business-domain group order", () => {
  assert.deepEqual(PERMISSION_GROUP_ORDER, EXPECTED_GROUPS);

  const usedGroups = new Set(ALL_PERMISSION_OPTIONS.map((permission) => permission.group));
  assert.deepEqual([...usedGroups].sort(), [...EXPECTED_GROUPS].sort());
});

test("PERM-AR03 role permission contracts keep the existing backend keys", () => {
  const allowed = new Set<string>(PERMISSIONS);

  for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS)) {
    for (const permission of permissions) {
      assert.ok(allowed.has(permission), `${role} references unknown permission ${permission}`);
    }
  }

  assert.deepEqual(ROLE_PERMISSIONS.admin, [...PERMISSIONS]);
});

test("PERM-AR04 employees UI consumes the central catalog without raw-key fallback", () => {
  assert.match(employeesSource, /ALL_PERMISSION_OPTIONS, PERMISSION_GROUP_ORDER/);
  assert.match(employeesSource, /PERMISSION_GROUP_ORDER\.map/);
  assert.match(employeesSource, /permission\.group === group/);
  assert.match(employeesSource, /\{p\.label\}/);

  assert.doesNotMatch(employeesSource, /PERMISSION_LABELS_SOURCE/);
  assert.doesNotMatch(employeesSource, /existing\?\.label \?\? key/);
  assert.doesNotMatch(employeesSource, /permissionGroup\s*=/);
});

test("PERM-AR05 executive dashboard permission is restricted to approved default roles", () => {
  for (const role of ["admin", "manager", "accountant"] as const) {
    assert.ok(
      ROLE_PERMISSIONS[role].includes("view_executive_dashboard"),
      `${role} must receive view_executive_dashboard by default`,
    );
  }

  for (const role of ["sales", "viewer", "customer_service"] as const) {
    assert.ok(
      !ROLE_PERMISSIONS[role].includes("view_executive_dashboard"),
      `${role} must not receive view_executive_dashboard by default`,
    );
  }

  assert.match(dashboardSource, /permissions\.includes\("view_executive_dashboard"\)/);
  assert.match(dashboardSource, /canViewExecutiveDashboard && canViewReports/);
  assert.match(dashboardSource, /api\.reporting\.overview, canViewExecutiveData/);
});
