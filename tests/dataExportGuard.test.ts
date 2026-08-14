import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const backend = readFileSync(
  new URL("../convex/dataExport.ts", import.meta.url),
  "utf8",
);
const page = readFileSync(
  new URL("../src/components/DataExportPage.tsx", import.meta.url),
  "utf8",
);
const sidebar = readFileSync(
  new URL("../src/components/Sidebar.tsx", import.meta.url),
  "utf8",
);
const app = readFileSync(
  new URL("../src/components/ERPApp.tsx", import.meta.url),
  "utf8",
);
const schema = readFileSync(
  new URL("../convex/schema.ts", import.meta.url),
  "utf8",
);

test("EXP-07 backend export enforces export and source-view permissions", () => {
  assert.match(backend, /requirePermission\(ctx, "export_data"\)/);
  assert.match(backend, /DATASET_PERMISSIONS/);
  assert.match(backend, /hasPermission\(user, requiredPermission\)/);
  assert.match(backend, /لا تملك صلاحية عرض البيانات المطلوبة للتصدير/);
});

test("EXP-08 operational exports are branch-scoped and bounded", () => {
  assert.match(backend, /assignedBranch\(user\)/);
  assert.match(backend, /withIndex\("by_branch"/);
  assert.match(backend, /withIndex\("by_branch_date"/);
  assert.match(backend, /withIndex\("by_branch_status"/);
  assert.match(backend, /withIndex\("by_branch_received"/);
  assert.equal(
    (backend.match(/take\(MAX_EXPORT_ROWS \+ 1\)/g) ?? []).length >= 9,
    true,
  );
  assert.match(backend, /rows\.slice\(0, MAX_EXPORT_ROWS\)/);
  assert.match(
    schema,
    /shipments:[\s\S]*index\("by_branch", \["branchId"\]\)/,
  );
});

test("EXP-09 export columns exclude authentication and request internals", () => {
  assert.doesNotMatch(
    backend,
    /key: "(?:password|token|session|requestId|idempotencyKey|requestFingerprint|userId|_id)"/i,
  );
  assert.match(backend, /module: "data_export"/);
  assert.match(backend, /action: "export"/);
});

test("EXP-10 CSV cells neutralize spreadsheet formula prefixes", () => {
  assert.match(page, /\^\[\\u0000-\\u0020\]\*\[=\+\\-@\]/);
  assert.match(page, /protectedValue\\.replace\\(\\/"\\/g, '""'\\)/);
  assert.match(page, /text\/csv;charset=utf-8/);
  assert.match(page, /\\uFEFF/);
});

test("EXP-11 export navigation is permission-gated and exposes active-page state", () => {
  assert.match(
    sidebar,
    /id: "data-export"[\s\S]{0,140}permission: "export_data"/,
  );
  assert.match(sidebar, /aria-current=\{isActive \? "page" : undefined\}/);
  assert.match(app, /"data-export": "export_data"/);
  assert.match(app, /currentPage === "data-export"/);
  assert.match(page, /<h1[\s\S]{0,180}تصدير البيانات/);
});
