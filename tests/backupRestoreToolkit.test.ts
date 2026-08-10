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
  assert.match(source, /spawnSync\(commandName\(\), restoreArgs/);
});
