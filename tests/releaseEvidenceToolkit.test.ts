import assert from "node:assert/strict";
import { test } from "node:test";
import { RELEASE_GATES, validateReleaseEvidence } from "../scripts/release/evidence-lib.mjs";

function validEvidence() {
  const gates = Object.fromEntries(RELEASE_GATES.map((name) => [name, { status: "PASS", evidence: [`evidence/${name}.json`] }]));
  return {
    schemaVersion: 1,
    version: "v1.0.0-rc1",
    generatedAt: "2026-08-21T20:00:00.000Z",
    releaseCommit: "a".repeat(40),
    productionEligible: true,
    decision: "GO",
    environments: {
      stagingFrontend: "https://staging.example.com",
      stagingConvex: "staging-123",
      migrationRehearsal: "rehearsal-123",
      productionFrontend: "https://erp.example.com",
      productionConvex: "production-123",
    },
    migrationFingerprint: "b".repeat(64),
    gates,
    rollback: { commit: "c".repeat(40), backupSha256: "d".repeat(64) },
    approvals: {
      technicalOwner: { name: "Technical Owner", decision: "GO", approvedAt: "2026-08-21T20:01:00.000Z" },
      businessOwner: { name: "Business Owner", decision: "GO", approvedAt: "2026-08-21T20:02:00.000Z" },
    },
  };
}

test("release evidence requires every live gate, both owners, and rollback identifiers", () => {
  const evidence = validEvidence();
  const result = validateReleaseEvidence(evidence);
  assert.equal(result.gateCount, RELEASE_GATES.length);
  assert.equal(result.releaseCommit, evidence.releaseCommit);
});

test("release evidence refuses false GO or an evidence-free gate", () => {
  const noGo = validEvidence();
  noGo.productionEligible = false;
  noGo.decision = "NO-GO";
  assert.throws(() => validateReleaseEvidence(noGo), /decision is not GO/);

  const missing = validEvidence();
  missing.gates.printing.evidence = [];
  assert.throws(() => validateReleaseEvidence(missing), /printing/);
});
