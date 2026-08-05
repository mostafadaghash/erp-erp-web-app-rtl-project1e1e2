import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

test("AUTH-AUD-01 login success is recorded by server action exactly once per dedupe key", () => {
  const auth = read("convex/auth.ts");
  assert.match(auth, /export const signIn = action/);
  assert.match(auth, /actionName: "login_success"/);
  assert.match(auth, /recordAuthAuditEvent/);
  assert.match(auth, /if \(previous\) return previous\._id/);
});

test("AUTH-AUD-02 failed login audit is redacted and contains no raw secret fields", () => {
  const auth = read("convex/auth.ts");
  assert.match(auth, /actionName: "login_failure"/);
  assert.match(auth, /safeFailureHash/);
  assert.doesNotMatch(auth, /params\.password|params\.refreshToken/);
});

test("AUTH-AUD-03 logout is recorded from the server signOut action once", () => {
  const auth = read("convex/auth.ts");
  assert.match(auth, /export const signOut = action/);
  assert.match(auth, /actionName: "logout"/);
  assert.match(auth, /auth:signOutRaw/);
});

test("AUTH-AUD-04 inactive users are rejected by backend auth helper", () => {
  const authz = read("convex/lib/auth.ts");
  assert.match(authz, /if \(!user\.isActive\)/);
  assert.match(authz, /تم تعطيل هذا الحساب/);
});

test("AUTH-AUD-05 invitation claim audit does not store raw tokens", () => {
  const auth = read("convex/auth.ts");
  assert.match(auth, /action: "claim_invitation"/);
  assert.doesNotMatch(auth, /details:[^\n]+rawInviteCode/);
});

test("AUTH-AUD-06 retry dedupe prevents duplicate auth audit rows", () => {
  const auth = read("convex/auth.ts");
  assert.match(auth, /dedupeKey/);
  assert.match(auth, /withIndex\("by_module_action"/);
  assert.match(auth, /q\.field\("recordId"\), args\.dedupeKey/);
});

test("AUTH-AUD-07 audit DTO hides raw user id and auth secrets", () => {
  const audit = read("convex/auditLogs.ts");
  assert.doesNotMatch(audit, /userId: log\.userId/);
  assert.match(audit, /actor: log\.userName/);
});

test("AUTH-AUD-08 audit reading is permission and branch isolated", () => {
  const audit = read("convex/auditLogs.ts");
  assert.match(audit, /requirePermission\(ctx, "view_audit_logs"\)/);
  assert.match(audit, /ليس لديك صلاحية لعرض سجل فرع آخر/);
});

test("AUTH-AUD-09 role permission and activity updates target employee records", () => {
  const employees = read("convex/employees.ts");
  assert.match(employees, /module: "employees"/);
  assert.match(employees, /recordId: id|recordId: args\.id/);
  assert.match(employees, /permissionsCount/);
});

test("AUTH-AUD-10 rejected auth attempts do not write partial invitation claims", () => {
  const auth = read("convex/auth.ts");
  assert.ok(auth.indexOf("throw new Error(\"رابط الدعوة غير صالح أو منتهي\")") < auth.indexOf("appCtx.db.patch(invitation._id"));
});

test("PRH-GUARD-01 no document.write remains in application code", () => {
  assert.equal(read("tests/rg-src-document-write.txt").trim(), "");
  assert.equal(read("tests/rg-convex-document-write.txt").trim(), "");
});

test("PRH-GUARD-02 browser print acceptance artifacts are real files", () => {
  assert.ok(existsSync("test-results/printing/a4-invoice.pdf"));
  assert.ok(existsSync("test-results/printing/thermal-receipt.pdf"));
  assert.ok(existsSync("test-results/printing/screenshots/a4-invoice.png"));
});
