import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

test("public tracking page uses verified portal projection instead of legacy repair tracking", () => {
  const page = read("src/components/TrackingPage.tsx");
  assert.match(page, /api\.customerTrackingPortal\.verify/);
  assert.match(page, /data-testid="tracking-phone-last4"/);
  assert.match(page, /data-testid="tracking-public-result"/);
  assert.doesNotMatch(page, /repairs\.getByTracking/);
  for (const forbidden of [
    "totalCost",
    "deposit",
    "remaining",
    "diagnosis",
    "technicianName",
    "qualityCheckNotes",
    "customerName",
    "customerPhone",
  ]) {
    assert.equal(page.includes(forbidden), false, `public page must not reference ${forbidden}`);
  }
});

test("public verification returns an explicit narrow whitelist", () => {
  const portal = read("convex/customerTrackingPortal.ts");
  const publicReturn = portal.match(/\/\/ SECURITY CONTRACT:[\s\S]*?return \{([\s\S]*?)\n    \};/);
  assert.ok(publicReturn, "security whitelist return must remain explicit");
  const projection = publicReturn[1];
  for (const allowed of [
    "sourceNumber",
    "sourceType",
    "sourceTypeLabel",
    "status",
    "currentStatus",
    "lastUpdatedAt",
    "steps",
  ]) {
    assert.match(projection, new RegExp(`\\b${allowed}\\b`), allowed);
  }
  for (const forbidden of [
    "total",
    "cost",
    "profit",
    "deposit",
    "remaining",
    "employee",
    "technician",
    "diagnosis",
    "notes",
    "customerName",
    "customerPhone",
    "account",
    "financial",
  ]) {
    assert.equal(new RegExp(`\\b${forbidden}\\w*\\b`, "i").test(projection), false, forbidden);
  }
});

test("tracking links are generated with Web Crypto and remain in the URL fragment", () => {
  const actions = read("src/components/CustomerTrackingLinkActions.tsx");
  const workspace = read("src/components/CustomerFollowUpsPage.tsx");
  assert.match(actions, /new Uint8Array\(32\)/);
  assert.match(actions, /crypto\.getRandomValues/);
  assert.match(actions, /#track=\$\{token\}/);
  assert.match(actions, /data-testid="copy-customer-tracking-link"/);
  assert.match(actions, /data-testid="whatsapp-customer-tracking-link"/);
  assert.match(actions, /نسخ رابط المتابعة/);
  assert.match(actions, /إرسال رابط المتابعة عبر واتساب/);
  assert.match(workspace, /CustomerTrackingLinkActions/);
  assert.match(workspace, /followUpId=\{details\.followUp\._id\}/);
});

test("legacy repair tracking can no longer act as an unauthenticated public endpoint", () => {
  const repairs = read("convex/repairs.ts");
  const auth = read("convex/lib/auth.ts");
  const legacy = repairs.match(/export const getByTracking = query\(\{[\s\S]*?\n\}\);\n\nexport const create/);
  assert.ok(legacy, "legacy endpoint guard must remain detectable");
  assert.match(legacy[0], /requireModuleEnabled\(ctx, "repairs"\)/);
  const moduleGuard = auth.match(/export async function requireModuleEnabled\([\s\S]*?\n\}\n\nexport async function requireModulePermission/);
  assert.ok(moduleGuard, "module guard must remain detectable");
  assert.match(moduleGuard[0], /await requireAuth\(ctx\)/);
});

test("tracking tokens are isolated in a dedicated indexed table and not written to audit details", () => {
  const schema = read("convex/schema.ts");
  const portal = read("convex/customerTrackingPortal.ts");
  assert.match(schema, /customerTrackingLinks: defineTable/);
  assert.match(schema, /\.index\("by_token", \["token"\]\)/);
  assert.match(schema, /\.index\("by_source", \["sourceType", "sourceId"\]\)/);
  assert.match(schema, /auditLogs:[\s\S]*?\.index\("by_record", \["module", "recordId"\]\)/);
  assert.match(portal, /action: "tracking_link_create"/);
  assert.doesNotMatch(portal, /details:\s*`[^`]*\$\{(?:proposedToken|token)\}/);
});
