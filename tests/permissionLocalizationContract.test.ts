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
const executiveDashboardSource = readFileSync("src/components/Dashboard.tsx", "utf8");
const operationalDashboardSource = readFileSync("src/components/OperationalDashboard.tsx", "utf8");
const executiveBackendSource = readFileSync("convex/executiveDashboard.ts", "utf8");
const appSource = readFileSync("src/components/ERPApp.tsx", "utf8");
const sidebarSource = readFileSync("src/components/Sidebar.tsx", "utf8");

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

  assert.equal(PERMISSIONS.length, 106, "permission inventory changed; update the Arabic catalog contract intentionally");
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

test("PERM-AR05 executive dashboard permission keeps approved role defaults", () => {
  for (const role of ["admin", "manager", "accountant"] as const) {
    assert.ok(
      ROLE_PERMISSIONS[role].includes("view_executive_dashboard"),
      `${role} must receive view_executive_dashboard by default`,
    );
  }

  for (const role of ["sales", "viewer", "customer_service", "technician", "shipping"] as const) {
    assert.ok(
      !ROLE_PERMISSIONS[role].includes("view_executive_dashboard"),
      `${role} must not receive view_executive_dashboard by default`,
    );
  }

  assert.match(executiveDashboardSource, /permissions\.includes\("view_executive_dashboard"\)/);
  assert.match(executiveDashboardSource, /api\.executiveDashboard\.overview, canViewExecutiveDashboard/);
  assert.match(executiveDashboardSource, /disabled=\{!canViewReports \|\| card\.protected\}/);
  assert.match(executiveBackendSource, /requirePermission\(ctx, "view_executive_dashboard"\)/);
});

test("PERM-AR06 operational dashboard is an independent default for every role", () => {
  for (const role of ["admin", "manager", "accountant", "sales", "viewer", "customer_service", "technician", "shipping"] as const) {
    assert.ok(
      ROLE_PERMISSIONS[role].includes("view_operational_dashboard"),
      `${role} must receive view_operational_dashboard by default`,
    );
  }

  assert.match(operationalDashboardSource, /permissions\.includes\("view_operational_dashboard"\)/);
  assert.doesNotMatch(operationalDashboardSource, /api\.executiveDashboard\.overview|view_profits|currentBalances|netProfit/);
});

test("PERM-AR07 workspace and navigation expose the two dashboards through separate permissions", () => {
  assert.match(appSource, /dashboard: "view_operational_dashboard"/);
  assert.match(appSource, /"executive-dashboard": "view_executive_dashboard"/);
  assert.match(appSource, /tab\.page === "dashboard" && <OperationalDashboard/);
  assert.match(appSource, /tab\.page === "executive-dashboard" && <Dashboard/);
  assert.match(sidebarSource, /id: "dashboard"[\s\S]*permission: "view_operational_dashboard"/);
  assert.match(sidebarSource, /id: "executive-dashboard"[\s\S]*permission: "view_executive_dashboard"/);
  assert.match(sidebarSource, /لوحة التشغيل/);
  assert.match(sidebarSource, /اللوحة التنفيذية/);
});
