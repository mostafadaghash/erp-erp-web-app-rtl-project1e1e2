import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("migration rehearsal executor is CLI-internal and deployment-gated", () => {
  const backend = read("convex/migrationRehearsal.ts");
  assert.match(backend, /internalMutation/);
  assert.match(backend, /internalQuery/);
  assert.doesNotMatch(backend, /export const apply = mutation\(/);
  assert.match(backend, /MIGRATION_REHEARSAL_ENABLED/);
  assert.match(backend, /MIGRATION_REHEARSAL_DEPLOYMENT/);
  assert.match(backend, /isolated-migration-rehearsal-only/);
  for (const deployment of ["brave-dachshund-76", "academic-puma-235", "courteous-dotterel-331"]) {
    assert.match(backend, new RegExp(deployment));
  }
  assert.match(backend, /Migration rehearsal target is not empty/);
  assert.match(backend, /Migration run and fingerprint do not match/);
  assert.match(backend, /expectedProductBindings/);
  assert.match(backend, /productBranchMapping/);
  assert.doesNotMatch(backend, /Parameters<typeof apply\.handler>/);
});

test("migration rehearsal runner verifies package and refuses permanent deployments", () => {
  const runner = read("scripts/migration/rehearsal.mjs");
  assert.match(runner, /verify-package\.mjs/);
  assert.match(runner, /--deployment/);
  assert.match(runner, /\.env\.migration-rehearsal\.local/);
  assert.match(runner, /migrationRehearsal:apply/);
  assert.match(runner, /migrationRehearsal:reconcile/);
  assert.match(runner, /reconciliationResult\.passed/);
  assert.match(runner, /expectedProductBindings/);
  for (const deployment of ["brave-dachshund-76", "academic-puma-235", "courteous-dotterel-331"]) {
    assert.match(runner, new RegExp(deployment));
  }
});

test("supplier ledger has an explicit cutover-only opening balance path", () => {
  const supplierLedger = read("convex/lib/supplierLedger.ts");
  assert.match(supplierLedger, /type PostingType = "opening_balance"/);
  assert.match(supplierLedger, /initializeSupplierBalance/);
  assert.match(supplierLedger, /input\.date !== financeSettings\.cutoverDate/);
  assert.match(supplierLedger, /سبق تسجيل رصيد أو حركة تشغيلية لهذا المورد في الفرع/);
});

test("package exposes a single guarded rehearsal command", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.scripts["migration:rehearsal"], "node scripts/migration/rehearsal.mjs");
});

test("cutover documentation routes writes only to the isolated rehearsal deployment", () => {
  const cutover = read("docs/MIGRATION_CUTOVER.md");
  const checklist = read("docs/RELEASE_CHECKLIST.md");
  assert.match(cutover, /--deployment bright-shepherd-116/);
  assert.match(cutover, /MIGRATION_REHEARSAL_ENABLED=isolated-migration-rehearsal-only/);
  assert.match(cutover, /temporary rehearsal deployment only/);
  assert.doesNotMatch(cutover, /executor is intentionally not part/);
  assert.match(checklist, /isolated from Development, Staging, and Production/);
  assert.doesNotMatch(checklist, /Apply the controlled migration procedure to Staging/);
});
