import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  APPLICATION_TABLES,
  INITIALIZED_SETUP_TABLES,
  buildInlineAuditQuery,
  createFreshStartEvidence,
  parseConvexJson,
  validateLiveAudit,
} from "../scripts/fresh-start/lib.mjs";

const emptyResult = {
  schemaVersion: 1,
  phase: "blank",
  nonEmptyTables: [],
  nonZeroFinancialAccounts: 0,
  nonZeroGeneralLedgerOpenings: 0,
  customerWhatsAppMessageEvents: 0,
};

test("Fresh Start table contract covers every application schema table", async () => {
  const schema = await readFile("convex/schema.ts", "utf8");
  const schemaTables = [...schema.matchAll(/^\s{2}([A-Za-z0-9_]+):\s*defineTable\(/gm)].map((match) => match[1]).sort();
  assert.deepEqual([...APPLICATION_TABLES].sort(), schemaTables);
});

test("blank audit rejects any application record", () => {
  assert.deepEqual(validateLiveAudit({ phase: "blank", result: emptyResult }).nonEmptyTables, []);
  assert.throws(
    () => validateLiveAudit({ phase: "blank", result: { ...emptyResult, nonEmptyTables: ["settings"] } }),
    /non-empty:settings/,
  );
});

test("initialized audit permits setup only and rejects business history", () => {
  const initialized = {
    ...emptyResult,
    phase: "initialized",
    nonEmptyTables: [...INITIALIZED_SETUP_TABLES],
  };
  assert.doesNotThrow(() => validateLiveAudit({ phase: "initialized", result: initialized }));
  assert.throws(
    () => validateLiveAudit({ phase: "initialized", result: { ...initialized, nonEmptyTables: [...INITIALIZED_SETUP_TABLES, "invoices"] } }),
    /non-empty:invoices/,
  );
  assert.throws(
    () => validateLiveAudit({ phase: "initialized", result: { ...initialized, nonZeroFinancialAccounts: 1 } }),
    /non-zero-financial-accounts/,
  );
});

test("customer tracking links are rejected as business history during Fresh Start", () => {
  const initialized = {
    ...emptyResult,
    phase: "initialized",
    nonEmptyTables: [...INITIALIZED_SETUP_TABLES, "customerTrackingLinks"],
  };
  assert.throws(
    () => validateLiveAudit({ phase: "initialized", result: initialized }),
    /non-empty:customerTrackingLinks/,
  );
});

test("WhatsApp message events are rejected even though setup audit logs are otherwise allowed", () => {
  const initialized = {
    ...emptyResult,
    phase: "initialized",
    nonEmptyTables: [...INITIALIZED_SETUP_TABLES],
    customerWhatsAppMessageEvents: 1,
  };
  assert.throws(
    () => validateLiveAudit({ phase: "initialized", result: initialized }),
    /customer-whatsapp-message-events:1/,
  );
});

test("inline audit is read-only and bounded for table-presence checks", () => {
  const query = buildInlineAuditQuery("blank");
  assert.match(query, /\.take\(1\)/);
  assert.match(query, /customer_whatsapp_messages/);
  assert.match(query, /\.withIndex\('by_module'/);
  assert.match(query, /JSON\.stringify/);
  assert.doesNotMatch(query, /ctx\.db\.(insert|patch|replace|delete)/);
});

test("Convex CLI JSON-string output is parsed without trusting console decoration", () => {
  const payload = JSON.stringify(emptyResult);
  assert.deepEqual(parseConvexJson(JSON.stringify(payload)), emptyResult);
  assert.deepEqual(parseConvexJson(`notice\n'${payload}'\n`), emptyResult);
});

test("Fresh Start evidence is release-bound and records mandatory zero-data checks", () => {
  const evidence = createFreshStartEvidence({
    deployment: "clean-customer-123",
    environment: "staging",
    releaseCommit: "a".repeat(40),
    checkedAt: "2026-08-23T00:00:00.000Z",
    audit: validateLiveAudit({ phase: "blank", result: emptyResult }),
  });
  assert.equal(evidence.status, "PASS");
  assert.equal(evidence.checks.demoSeedUnavailable, true);
  assert.equal(evidence.checks.noBusinessRecords, true);
  assert.equal(evidence.checks.noWhatsAppMessageHistory, true);
});

test("Fresh Start CLI bypasses the Windows npx.cmd spawn failure", async () => {
  const script = await readFile("scripts/fresh-start/audit.mjs", "utf8");
  assert.match(script, /spawnSync\(process\.execPath/);
  assert.match(script, /node_modules\/convex\/bin\/main\.js/);
  assert.doesNotMatch(script, /npx\.cmd/);
});

test("legacy demo-data mutation is not shipped to customers", () => {
  assert.equal(existsSync("convex/seed.ts"), false);
});
