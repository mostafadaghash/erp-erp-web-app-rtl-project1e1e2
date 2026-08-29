#!/usr/bin/env node
import { access, readFile } from "node:fs/promises";
import { FRESH_START_ASSERTIONS, RELEASE_EVIDENCE_VERSION } from "./evidence-lib.mjs";

const candidatePath = process.argv[2] ?? "release/v1.0.0-rc1.json";
const requiredFiles = [
  ".github/workflows/ci.yml",
  ".github/workflows/staging-gate.yml",
  ".env.staging.example",
  "playwright.config.ts",
  "docs/STAGING_RELEASE.md",
  "docs/MIGRATION_CUTOVER.md",
  "docs/MIGRATION_RECONCILIATION.md",
  "docs/BACKUP_RESTORE.md",
  "docs/RELEASE_CHECKLIST.md",
  "docs/UAT_SCENARIOS.md",
  "docs/INCIDENT_RESPONSE.md",
  "docs/RELEASE_EVIDENCE.md",
  "docs/PRODUCTION_SMOKE_TEST.md",
  "docs/FRESH_START.md",
  "scripts/staging-env-check.mjs",
  "scripts/migration/prepare.mjs",
  "scripts/migration/verify-package.mjs",
  "scripts/backup/create.mjs",
  "scripts/backup/verify.mjs",
  "scripts/backup/restore.mjs",
  "scripts/backup/verify-drill.mjs",
  "scripts/fresh-start/lib.mjs",
  "scripts/fresh-start/audit.mjs",
  "release/restore-drill.evidence.template.json",
  "release/v1.0.0.evidence.template.json",
  "scripts/release/verify-evidence.mjs",
];

const requiredScripts = [
  "verify",
  "release:preflight",
  "release:evidence:verify",
  "staging:check",
  "migration:prepare",
  "migration:verify",
  "backup:plan",
  "backup:create",
  "backup:verify",
  "restore:plan",
  "restore:execute",
  "restore:verify",
  "fresh-start:audit",
  "test:e2e:staging",
  "test:e2e:roles",
  "test:e2e:flows",
];

function fail(message) {
  console.error(`Release preflight failed: ${message}`);
  process.exit(1);
}

try {
  for (const path of requiredFiles) {
    try {
      await access(path);
    } catch {
      fail(`missing required file: ${path}`);
    }
  }

  const candidate = JSON.parse(await readFile(candidatePath, "utf8"));
  if (candidate.version !== "v1.0.0-rc1") fail("candidate version must be v1.0.0-rc1");
  if (candidate.status !== "repository-prepared") fail("candidate status must remain repository-prepared before live acceptance");
  if (candidate.productionEligible !== false) fail("candidate must not be Production-eligible before live acceptance");
  if (!["fresh_start", "legacy_migration"].includes(candidate.dataStrategy)) fail("candidate dataStrategy is invalid");
  if (!Array.isArray(candidate.liveGates) || candidate.liveGates.length < 10) fail("candidate live gate contract is incomplete");
  if (!Array.isArray(candidate.requiredEvidence) || candidate.requiredEvidence.length < 8) fail("candidate evidence contract is incomplete");

  const evidenceTemplate = JSON.parse(await readFile("release/v1.0.0.evidence.template.json", "utf8"));
  if (evidenceTemplate.schemaVersion !== RELEASE_EVIDENCE_VERSION) {
    fail(`release evidence template schemaVersion must be ${RELEASE_EVIDENCE_VERSION}`);
  }
  if (evidenceTemplate.dataStrategy?.mode !== candidate.dataStrategy) fail("release evidence template dataStrategy does not match candidate");
  if (candidate.dataStrategy === "fresh_start") {
    for (const assertion of FRESH_START_ASSERTIONS) {
      if (evidenceTemplate.dataStrategy?.assertions?.[assertion] !== false) {
        fail(`Fresh Start template assertion must be false: ${assertion}`);
      }
    }
    if (evidenceTemplate.gates?.migration?.status !== "NOT_APPLICABLE") fail("Fresh Start migration gate must be NOT_APPLICABLE");
    if (evidenceTemplate.migrationFingerprint !== null || evidenceTemplate.environments?.migrationRehearsal !== null) {
      fail("Fresh Start template must not contain migration artifacts");
    }
  }

  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  for (const name of requiredScripts) {
    if (!packageJson.scripts?.[name]) fail(`missing npm script: ${name}`);
  }

  const ci = await readFile(".github/workflows/ci.yml", "utf8");
  if (!ci.includes("browser-contract")) fail("CI browser-contract gate is missing");
  if (!ci.includes("release-gate")) fail("CI release-gate is missing");

  const staging = await readFile(".github/workflows/staging-gate.yml", "utf8");
  if (!staging.includes("workflow_dispatch")) fail("Staging gate must remain manually invokable before live configuration");
  if (!staging.includes("release-gate")) fail("Staging release-gate is missing");

  const migration = await readFile("scripts/migration/prepare.mjs", "utf8");
  if (!migration.includes("No application data was written")) fail("migration dry-run safety marker is missing");

  const restore = await readFile("scripts/backup/restore.mjs", "utf8");
  if (!restore.includes("PLAN ONLY: no restore command was executed")) fail("restore plan-only safety marker is missing");
  if (!restore.includes("--pre-restore-manifest")) fail("restore pre-restore backup requirement is missing");

  const freshStart = await readFile("scripts/fresh-start/audit.mjs", "utf8");
  if (!freshStart.includes("--confirm must exactly match the audited deployment")) fail("Fresh Start target confirmation guard is missing");
  if (!freshStart.includes("Fresh Start customer deployment audit: PASS")) fail("Fresh Start evidence marker is missing");
  try {
    await access("convex/seed.ts");
    fail("legacy demo-data mutation must not be shipped to customers");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  console.log(`Release candidate repository preflight passed: ${candidate.version}`);
  console.log(`Status: ${candidate.status}`);
  console.log(`Production eligible: ${candidate.productionEligible}`);
  console.log(`Live gates still required: ${candidate.liveGates.length}`);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
