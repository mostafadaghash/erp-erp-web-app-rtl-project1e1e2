import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const backend = await readFile("convex/auditLogs.ts", "utf8");
const schema = await readFile("convex/schema.ts", "utf8");
const page = await readFile("src/components/AuditLogsPage.tsx", "utf8");

test("AUD-01 audit reads never collect or slice the full log table", () => {
  assert.doesNotMatch(backend, /query\("auditLogs"\)[\s\S]{0,180}\.collect\(/);
  assert.doesNotMatch(backend, /logs\.slice\(/);
  assert.doesNotMatch(backend, /\.take\(/);
});

test("AUD-02 audit reads use a real Convex cursor", () => {
  assert.match(backend, /paginationOptsValidator/);
  assert.match(backend, /export const listPaginated = query/);
  assert.match(backend, /logsQuery\.paginate\(args\.paginationOpts\)/);
});

test("AUD-03 stored auth user IDs are filtered as strings", () => {
  assert.match(backend, /userId: v\.optional\(v\.string\(\)\)/);
  assert.doesNotMatch(backend, /userId: v\.optional\(v\.id\("userProfiles"\)\)/);
});

test("AUD-04 non-admin audit access remains self-scoped and fail-closed", () => {
  assert.match(
    backend,
    /if \(user\.role !== "admin"\)[\s\S]*requestedUserId !== user\.userId[\s\S]*ليس لديك صلاحية لعرض سجل مستخدم آخر/,
  );
  assert.match(
    backend,
    /const effectiveUserId = user\.role === "admin" \? requestedUserId : user\.userId/,
  );
});

test("AUD-05 branch, module, action, user, and date filters are accepted", () => {
  for (const token of [
    "module: v.optional(v.string())",
    "action: v.optional(v.string())",
    "userId: v.optional(v.string())",
    'branchId: v.optional(v.id("branches"))',
    "fromTimestamp: v.optional(v.number())",
    "toTimestamp: v.optional(v.number())",
  ]) {
    assert.ok(backend.includes(token), `missing ${token}`);
  }
  assert.ok(backend.includes("نطاق تاريخ سجل العمليات غير صالح"));
});

test("AUD-06 audit indexes cover primary and common combined filters", () => {
  assert.match(schema, /auditLogs: defineTable\([\s\S]*\.index\("by_branch", \["branchId"\]\)/);
  assert.match(
    schema,
    /\.index\("by_branch_module_action", \["branchId", "module", "action"\]\)/,
  );
  assert.match(
    schema,
    /\.index\("by_user_module_action", \["userId", "module", "action"\]\)/,
  );
  assert.match(schema, /\.index\("by_module_action", \["module", "action"\]\)/);
});

test("AUD-07 backend returns an explicit allowlisted DTO", () => {
  assert.match(backend, /function toAuditLogDto\(/);
  assert.match(backend, /page: result\.page\.map\(toAuditLogDto\)/);
  assert.doesNotMatch(backend, /return result\.page/);
});

test("AUD-08 UI paginates and never restores the fixed 200-row query", () => {
  assert.match(page, /usePaginatedQuery\(/);
  assert.match(page, /api\.auditLogs\.listPaginated/);
  assert.match(page, /initialNumItems: 50/);
  assert.match(page, /loadMore\(50\)/);
  assert.doesNotMatch(page, /limit:\s*200/);
  assert.doesNotMatch(page, /useQuery\(api\.auditLogs\.list/);
});

test("AUD-09 UI distinguishes loading, filtered empty, local-search empty, and exhaustion", () => {
  assert.ok(page.includes("جارٍ تحميل سجل العمليات"));
  assert.ok(page.includes("لا توجد سجلات تطابق الفلاتر المحددة"));
  assert.ok(page.includes("لا توجد نتائج بحث داخل السجلات المحملة"));
  assert.ok(page.includes("تم تحميل كل السجلات المطابقة"));
  assert.ok(page.includes("البحث النصي يطابق السجلات المحملة فقط"));
});

test("AUD-10 audit foundation introduces no unsafe TypeScript escape", () => {
  for (const source of [backend, page]) {
    assert.doesNotMatch(source, /as any|@ts-ignore/);
  }
});
