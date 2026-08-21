import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { test } from "node:test";
import {
  assertExecutionAllowed,
  assertPreRestoreBackup,
  buildExportArgs,
  buildRestoreArgs,
  createBackupManifest,
  describeSnapshot,
  manifestPathForSnapshot,
  productionConfirmation,
  validateRestoreDrillEvidence,
  verifySnapshotManifest,
} from "../scripts/backup/lib.mjs";

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "erp-backup-"));
  const snapshotPath = join(dir, "snapshot_test.zip");
  await writeFile(snapshotPath, Buffer.from("synthetic-convex-snapshot-for-integrity-tests"));
  const snapshot = await describeSnapshot(snapshotPath);
  const manifest = createBackupManifest({
    deployment: "staging",
    environment: "staging",
    includeFileStorage: true,
    snapshot,
    sourceCommit: "abc123",
    createdAt: "2026-08-10T00:00:00.000Z",
  });
  const manifestPath = manifestPathForSnapshot(snapshotPath);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { dir, snapshotPath, snapshot, manifest, manifestPath };
}

test("backup command targets an explicit deployment and includes file storage by default", () => {
  const args = buildExportArgs({ deployment: "staging", output: "backups/staging.zip", includeFileStorage: true });
  assert.deepEqual(args.slice(0, 4), ["convex", "export", "--deployment", "staging"]);
  assert.ok(args.includes("--path"));
  assert.ok(args.includes("--include-file-storage"));
});

test("restore command uses explicit deployment and destructive replace only after wrapper preflight", () => {
  const args = buildRestoreArgs({ deployment: "staging", snapshot: "backups/good.zip" });
  assert.deepEqual(args.slice(0, 4), ["convex", "import", "--deployment", "staging"]);
  assert.ok(args.includes("--replace"));
  assert.ok(args.includes("--yes"));
  assert.equal(args.includes("--prod"), false);
});

test("production execution requires exact operation-specific confirmation", () => {
  assert.throws(() => assertExecutionAllowed({
    operation: "BACKUP",
    environment: "production",
    deployment: "prod",
    execute: true,
    confirmation: "wrong",
  }), /exact confirmation token/);

  assert.doesNotThrow(() => assertExecutionAllowed({
    operation: "BACKUP",
    environment: "production",
    deployment: "prod",
    execute: true,
    confirmation: "BACKUP:prod",
  }));

  const sha = "a".repeat(64);
  assert.equal(productionConfirmation({ operation: "RESTORE", deployment: "prod", sha256: sha }), `RESTORE:prod:${"a".repeat(12)}`);
});

test("staging plan/execution guard does not require a production token", () => {
  assert.doesNotThrow(() => assertExecutionAllowed({
    operation: "RESTORE",
    environment: "staging",
    deployment: "staging",
    sha256: "a".repeat(64),
    execute: true,
    confirmation: "",
  }));
});

test("snapshot manifest detects any tampering", async () => {
  const item = await fixture();
  try {
    const verified = await verifySnapshotManifest({ manifestPath: item.manifestPath, manifest: item.manifest });
    assert.equal(verified.snapshot.sha256, item.manifest.sha256);
    assert.equal(basename(verified.snapshot.snapshotPath), item.manifest.snapshotFile);

    await writeFile(item.snapshotPath, Buffer.from("tampered"));
    await assert.rejects(
      verifySnapshotManifest({ manifestPath: item.manifestPath, manifest: item.manifest }),
      /snapshot (size|checksum) does not match manifest/,
    );
  } finally {
    await rm(item.dir, { recursive: true, force: true });
  }
});

test("pre-restore safety backup must belong to the target deployment and environment", () => {
  assert.doesNotThrow(() => assertPreRestoreBackup({
    targetDeployment: "staging",
    targetEnvironment: "staging",
    preRestoreManifest: { deployment: "staging", environment: "staging" },
  }));
  assert.throws(() => assertPreRestoreBackup({
    targetDeployment: "staging",
    targetEnvironment: "staging",
    preRestoreManifest: { deployment: "prod", environment: "production" },
  }), /does not match restore target/);
});

test("restore script is plan-only by default and execution requires pre-restore evidence", async () => {
  const source = await readFile("scripts/backup/restore.mjs", "utf8");
  assert.match(source, /PLAN ONLY: no restore command was executed/);
  assert.match(source, /--pre-restore-manifest is required before executing a destructive restore/);
  assert.match(source, /runConvexCli\(restoreArgs\)/);
});

test("restore drill evidence proves isolated recovery, mandatory checks, RPO and RTO", () => {
  const sourceManifest = {
    deployment: "academic-puma-235",
    environment: "staging",
    includeFileStorage: true,
    createdAt: "2026-08-21T10:00:00.000Z",
    sha256: "a".repeat(64),
    sourceCommit: "b".repeat(40),
  };
  const preRestoreManifest = {
    deployment: "restore-sandbox-123",
    environment: "staging",
    sha256: "c".repeat(64),
  };
  const evidence = {
    schemaVersion: 1,
    environment: "staging",
    sourceDeployment: sourceManifest.deployment,
    targetDeployment: preRestoreManifest.deployment,
    sourceSnapshotSha256: sourceManifest.sha256,
    preRestoreSnapshotSha256: preRestoreManifest.sha256,
    releaseCommit: sourceManifest.sourceCommit,
    startedAt: "2026-08-21T11:00:00.000Z",
    completedAt: "2026-08-21T12:30:00.000Z",
    operator: "release-owner",
    checks: {
      importCompleted: true,
      authentication: true,
      dataCounts: true,
      inventory: true,
      financialAccounts: true,
      customerLedger: true,
      supplierLedger: true,
      criticalWrites: true,
      securityHeaders: true,
    },
    evidenceRefs: ["test-results/restore/drill.json"],
  };
  const result = validateRestoreDrillEvidence({ evidence, sourceManifest, preRestoreManifest });
  assert.equal(result.observedRpoHours, 1);
  assert.equal(result.observedRtoMinutes, 90);
  assert.throws(
    () => validateRestoreDrillEvidence({ evidence: { ...evidence, checks: { ...evidence.checks, inventory: false } }, sourceManifest, preRestoreManifest }),
    /inventory/,
  );
  assert.throws(
    () => validateRestoreDrillEvidence({ evidence: { ...evidence, targetDeployment: sourceManifest.deployment }, sourceManifest, preRestoreManifest }),
    /isolated/,
  );
});
