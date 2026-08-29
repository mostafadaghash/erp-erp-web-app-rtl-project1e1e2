import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FRESH_START_ASSERTIONS,
  RELEASE_GATES,
  validateReleaseEvidence,
} from "../scripts/release/evidence-lib.mjs";

function validEvidence() {
  const gates = Object.fromEntries(RELEASE_GATES.map((name) => [name, { status: "PASS", evidence: [`evidence/${name}.json`] }]));
  return {
    schemaVersion: 2,
    version: "v1.0.0-rc1",
    generatedAt: "2026-08-21T20:03:00.000Z",
    releaseCommit: "a".repeat(40),
    productionEligible: true,
    decision: "GO",
    dataStrategy: {
      mode: "legacy_migration",
      approvedBy: "Business Owner",
      approvedAt: "2026-08-21T19:59:00.000Z",
      evidence: ["evidence/data-strategy.json"],
    },
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

function validFreshStartEvidence() {
  const evidence = validEvidence();
  evidence.dataStrategy = {
    mode: "fresh_start",
    assertions: Object.fromEntries(FRESH_START_ASSERTIONS.map((name) => [name, false])),
    approvedBy: evidence.approvals.businessOwner.name,
    approvedAt: "2026-08-21T19:59:00.000Z",
    evidence: ["evidence/fresh-start-declaration.json"],
  };
  evidence.environments.migrationRehearsal = null;
  evidence.migrationFingerprint = null;
  evidence.gates.migration = {
    status: "NOT_APPLICABLE",
    evidence: ["evidence/fresh-start-declaration.json"],
  };
  return evidence;
}

test("release evidence requires every live gate, both owners, and rollback identifiers", () => {
  const evidence = validEvidence();
  const result = validateReleaseEvidence(evidence);
  assert.equal(result.gateCount, RELEASE_GATES.length);
  assert.equal(result.releaseCommit, evidence.releaseCommit);
  assert.equal(result.dataStrategy, "legacy_migration");
  assert.equal(result.applicableGateCount, RELEASE_GATES.length);
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

test("fresh start permits only the migration gate to be not applicable", () => {
  const evidence = validFreshStartEvidence();
  const result = validateReleaseEvidence(evidence);
  assert.equal(result.dataStrategy, "fresh_start");
  assert.equal(result.applicableGateCount, RELEASE_GATES.length - 1);
  assert.deepEqual(result.notApplicableGates, ["migration"]);

  const skippedPrinting = validFreshStartEvidence();
  skippedPrinting.gates.printing.status = "NOT_APPLICABLE";
  assert.throws(() => validateReleaseEvidence(skippedPrinting), /must be PASS: printing/);
});

test("fresh start requires every no-legacy assertion to be explicitly false", () => {
  for (const assertion of FRESH_START_ASSERTIONS) {
    const evidence = validFreshStartEvidence();
    evidence.dataStrategy.assertions[assertion] = true;
    assert.throws(
      () => validateReleaseEvidence(evidence),
      new RegExp(`explicitly false: ${assertion}`),
    );
  }

  const missingAssertion = validFreshStartEvidence();
  delete missingAssertion.dataStrategy.assertions.hasOpeningInventory;
  assert.throws(() => validateReleaseEvidence(missingAssertion), /hasOpeningInventory/);
});

test("fresh start rejects migration artifacts, missing declaration evidence, or a mismatched owner", () => {
  const fingerprint = validFreshStartEvidence();
  fingerprint.migrationFingerprint = "b".repeat(64);
  assert.throws(() => validateReleaseEvidence(fingerprint), /migrationFingerprint must be null/);

  const rehearsal = validFreshStartEvidence();
  rehearsal.environments.migrationRehearsal = "rehearsal-123";
  assert.throws(() => validateReleaseEvidence(rehearsal), /migrationRehearsal must be null/);

  const missingEvidence = validFreshStartEvidence();
  missingEvidence.dataStrategy.evidence = [];
  assert.throws(() => validateReleaseEvidence(missingEvidence), /dataStrategy\.evidence/);

  const wrongOwner = validFreshStartEvidence();
  wrongOwner.dataStrategy.approvedBy = "Different Owner";
  assert.throws(() => validateReleaseEvidence(wrongOwner), /must match approvals\.businessOwner\.name/);

  const unrelatedGateEvidence = validFreshStartEvidence();
  unrelatedGateEvidence.gates.migration.evidence = ["evidence/unrelated.json"];
  assert.throws(() => validateReleaseEvidence(unrelatedGateEvidence), /must reference the approved dataStrategy evidence/);
});

test("legacy migration still requires a rehearsal target, fingerprint, and PASS gate", () => {
  const skipped = validEvidence();
  skipped.gates.migration.status = "NOT_APPLICABLE";
  assert.throws(() => validateReleaseEvidence(skipped), /must be PASS: migration/);

  const missingFingerprint = validEvidence();
  missingFingerprint.migrationFingerprint = null;
  assert.throws(() => validateReleaseEvidence(missingFingerprint), /full SHA-256 for legacy_migration/);

  const missingDeployment = validEvidence();
  missingDeployment.environments.migrationRehearsal = null;
  assert.throws(() => validateReleaseEvidence(missingDeployment), /environments\.migrationRehearsal/);
});
