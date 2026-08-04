import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const read = (path: string) => readFileSync(path, "utf8");
const schema = read("convex/schema.ts");
const auth = read("convex/lib/auth.ts");
const auditQuery = read("convex/auditLogs.ts");
const auditUi = read("src/components/AuditLogsPage.tsx");
const finance = read("convex/lib/finance.ts");
const gl = read("convex/lib/generalLedger.ts");
const glApi = read("convex/generalLedger.ts");

test("AFG-01 audit schema adds bounded scalar document links without v.any", () => {
  const auditTable = schema.slice(schema.indexOf("auditLogs: defineTable"), schema.indexOf("};\n\nexport default defineSchema"));
  assert.doesNotMatch(auditTable, /v\.any\(/);
  for (const field of ["sourceType", "sourceId", "sourceNumber", "relatedType", "relatedId", "relatedNumber", "financialTransactionId", "journalEntryId", "reversalOfId"]) {
    assert.match(auditTable, new RegExp(`${field}: v\\.optional\\(v\\.string\\(\\)\\)`));
  }
  assert.match(auth, /MAX_AUDIT_LINK_LENGTH = 200/);
  assert.match(auth, /safeAuditLink/);
});

test("AFG-02 audit DTO allowlists link fields and preserves legacy nulls", () => {
  for (const field of ["sourceType", "sourceId", "sourceNumber", "relatedType", "relatedId", "relatedNumber", "financialTransactionId", "journalEntryId", "reversalOfId"]) {
    assert.match(auditQuery, new RegExp(`${field}: log\\.${field} \\?\\? null`));
  }
  assert.doesNotMatch(auditQuery, /\.\.\.log/);
  assert.match(auditQuery, /page: result\.page\.map\(toAuditLogDto\)/);
});

test("AFG-03 finance audit links transaction, source document, journal, and summaries after idempotency", () => {
  assert.match(finance, /if \(duplicate\)[\s\S]*return \{ transactionId: duplicate\._id, duplicate: true \};[\s\S]*await logAction/);
  assert.match(finance, /financialTransactionId: String\(transactionId\)/);
  assert.match(finance, /journalEntryId: journalEntry\?\._id \? String\(journalEntry\._id\) : undefined/);
  assert.match(finance, /sourceType: input\.referenceType \?\? "financial_transaction"/);
  assert.match(finance, /branchId: input\.branchId/);
  assert.match(finance, /after: \{[\s\S]*type: input\.type[\s\S]*amount[\s\S]*referenceNumber/);
});

test("AFG-04 reversal audit clearly points at the original transaction", () => {
  assert.match(finance, /action: input\.type === "reversal" \? "reverse" : "post"/);
  assert.match(finance, /reversalOfId: input\.originalTransactionId \? String\(input\.originalTransactionId\) : undefined/);
  assert.match(finance, /relatedType: input\.originalTransactionId \? "financial_transaction" : undefined/);
  assert.doesNotMatch(finance, /requestId: input\.requestId[\s\S]*logAction/);
});

test("AFG-05 journal audits use document branch and source links without accounting changes", () => {
  assert.match(gl, /branchId: input\.branchId/);
  assert.match(gl, /sourceType: input\.referenceType \?\? "journal_entry"/);
  assert.match(gl, /journalEntryId: String\(entryId\)/);
  assert.match(gl, /reversalOfId: input\.originalEntryId \? String\(input\.originalEntryId\) : undefined/);
  assert.match(gl, /after: \{[\s\S]*sourceType: input\.sourceType[\s\S]*amount: fromCents\(debitCents\)/);
});

test("AFG-06 GL setup and master-data operations use structured links and snapshots", () => {
  for (const token of ["general_ledger_settings", "chart_of_account", "accounting_period", "general_ledger_opening"]) {
    assert.match(glApi, new RegExp(`sourceType:\\"${token}\\"`));
  }
  assert.match(glApi, /action:\"confirm_opening\"/);
  assert.match(glApi, /before:\{status:p\.status/);
  assert.match(glApi, /after:\{code:a\.code,isActive:false\}/);
});

test("AFG-07 snapshots redact sensitive request and idempotency fields", () => {
  assert.match(auth, /requestfingerprint\|idempotencykey/);
  const logCalls = `${finance}\n${gl}\n${glApi}`;
  assert.doesNotMatch(logCalls, /after:\s*\{[^}]*requestId/i);
  assert.doesNotMatch(logCalls, /before:\s*\{[^}]*idempotency/i);
  assert.doesNotMatch(logCalls, /after:\s*\{[^}]*token/i);
});

test("AFG-08 UI displays link labels without untrusted navigation", () => {
  assert.match(auditUi, /function DocumentLinks/);
  assert.match(auditUi, /DOCUMENT_TYPE_LABELS/);
  assert.match(auditUi, /log\.sourceType/);
  assert.doesNotMatch(auditUi, /href=\{.*log\./);
  assert.doesNotMatch(auditUi, /navigate\(.*log\./);
});
