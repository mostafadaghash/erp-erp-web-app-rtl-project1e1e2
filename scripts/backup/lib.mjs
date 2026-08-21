import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

export const BACKUP_MANIFEST_VERSION = 1;
export const ENVIRONMENTS = new Set(["development", "staging", "production"]);
export const RESTORE_DRILL_CHECKS = [
  "importCompleted",
  "authentication",
  "dataCounts",
  "inventory",
  "financialAccounts",
  "customerLedger",
  "supplierLedger",
  "criticalWrites",
  "securityHeaders",
];

export function normalizeDeployment(value) {
  const deployment = String(value ?? "").trim();
  if (!deployment) throw new Error("deployment is required");
  if (!/^[A-Za-z0-9][A-Za-z0-9_./:-]*$/.test(deployment)) {
    throw new Error("deployment contains unsupported characters");
  }
  return deployment;
}

export function normalizeEnvironment(value) {
  const environment = String(value ?? "").trim().toLowerCase();
  if (!ENVIRONMENTS.has(environment)) {
    throw new Error("environment must be development, staging, or production");
  }
  return environment;
}

export function assertZipPath(value) {
  const path = resolve(String(value ?? "").trim());
  if (!path.toLowerCase().endsWith(".zip")) throw new Error("snapshot path must end with .zip");
  return path;
}

export function buildExportArgs({ deployment, output, includeFileStorage = true }) {
  const args = ["convex", "export", "--deployment", normalizeDeployment(deployment), "--path", assertZipPath(output)];
  if (includeFileStorage) args.push("--include-file-storage");
  return args;
}

export function buildRestoreArgs({ deployment, snapshot }) {
  return [
    "convex",
    "import",
    "--deployment",
    normalizeDeployment(deployment),
    "--replace",
    "--yes",
    assertZipPath(snapshot),
  ];
}

export function productionConfirmation({ operation, deployment, sha256 }) {
  const op = String(operation).toUpperCase();
  if (op === "BACKUP") return `BACKUP:${deployment}`;
  if (op === "RESTORE") return `RESTORE:${deployment}:${String(sha256 ?? "").slice(0, 12)}`;
  throw new Error(`unsupported production operation: ${operation}`);
}

export function assertExecutionAllowed({ operation, environment, deployment, sha256, execute, confirmation }) {
  const normalizedEnvironment = normalizeEnvironment(environment);
  const normalizedDeployment = normalizeDeployment(deployment);
  if (!execute) return;
  if (normalizedEnvironment !== "production") return;
  const expected = productionConfirmation({ operation, deployment: normalizedDeployment, sha256 });
  if (confirmation !== expected) {
    throw new Error(`production ${operation.toLowerCase()} requires exact confirmation token: ${expected}`);
  }
}

export async function sha256File(path) {
  const hash = createHash("sha256");
  await new Promise((resolvePromise, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolvePromise);
  });
  return hash.digest("hex");
}

export async function describeSnapshot(path) {
  const snapshotPath = assertZipPath(path);
  const info = await stat(snapshotPath);
  if (!info.isFile()) throw new Error("snapshot path is not a file");
  if (info.size <= 0) throw new Error("snapshot file is empty");
  return {
    snapshotPath,
    snapshotFile: basename(snapshotPath),
    sizeBytes: info.size,
    sha256: await sha256File(snapshotPath),
  };
}

export function manifestPathForSnapshot(snapshotPath) {
  return `${assertZipPath(snapshotPath)}.manifest.json`;
}

export function snapshotPathFromManifest(manifestPath, manifest) {
  const filename = String(manifest?.snapshotFile ?? "").trim();
  if (!filename || basename(filename) !== filename || !filename.toLowerCase().endsWith(".zip")) {
    throw new Error("manifest snapshotFile must be a ZIP basename");
  }
  return resolve(dirname(resolve(manifestPath)), filename);
}

export function createBackupManifest({ deployment, environment, includeFileStorage, snapshot, sourceCommit, createdAt = new Date().toISOString() }) {
  return {
    manifestVersion: BACKUP_MANIFEST_VERSION,
    format: "convex-snapshot-zip",
    createdAt,
    deployment: normalizeDeployment(deployment),
    environment: normalizeEnvironment(environment),
    includeFileStorage: Boolean(includeFileStorage),
    snapshotFile: snapshot.snapshotFile,
    sizeBytes: snapshot.sizeBytes,
    sha256: snapshot.sha256,
    sourceCommit: String(sourceCommit ?? "").trim() || null,
  };
}

export async function verifySnapshotManifest({ manifestPath, manifest }) {
  if (!manifest || typeof manifest !== "object") throw new Error("manifest must be an object");
  if (manifest.manifestVersion !== BACKUP_MANIFEST_VERSION) throw new Error("unsupported backup manifest version");
  if (manifest.format !== "convex-snapshot-zip") throw new Error("unsupported backup format");
  normalizeDeployment(manifest.deployment);
  normalizeEnvironment(manifest.environment);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(String(manifest.createdAt ?? ""))) throw new Error("manifest createdAt is invalid");
  if (!/^[a-f0-9]{64}$/.test(String(manifest.sha256 ?? ""))) throw new Error("manifest sha256 is invalid");
  if (!Number.isSafeInteger(manifest.sizeBytes) || manifest.sizeBytes <= 0) throw new Error("manifest sizeBytes is invalid");

  const snapshotPath = snapshotPathFromManifest(manifestPath, manifest);
  const snapshot = await describeSnapshot(snapshotPath);
  if (snapshot.sizeBytes !== manifest.sizeBytes) throw new Error("snapshot size does not match manifest");
  if (snapshot.sha256 !== manifest.sha256) throw new Error("snapshot checksum does not match manifest");
  return { manifest, snapshot };
}

export function assertPreRestoreBackup({ targetDeployment, targetEnvironment, preRestoreManifest }) {
  if (normalizeDeployment(preRestoreManifest.deployment) !== normalizeDeployment(targetDeployment)) {
    throw new Error("pre-restore backup deployment does not match restore target");
  }
  if (normalizeEnvironment(preRestoreManifest.environment) !== normalizeEnvironment(targetEnvironment)) {
    throw new Error("pre-restore backup environment does not match restore target");
  }
}

export function redactCommand(args) {
  return ["npx", ...args].map((part) => /\s/.test(part) ? JSON.stringify(part) : part).join(" ");
}

export function validateRestoreDrillEvidence({ evidence, sourceManifest, preRestoreManifest }) {
  if (!evidence || typeof evidence !== "object") throw new Error("restore drill evidence must be an object");
  if (evidence.schemaVersion !== 1) throw new Error("unsupported restore drill evidence schemaVersion");
  if (normalizeEnvironment(evidence.environment) !== "staging") throw new Error("restore drill evidence must target staging");
  const targetDeployment = normalizeDeployment(evidence.targetDeployment);
  const sourceDeployment = normalizeDeployment(evidence.sourceDeployment);
  if (targetDeployment === sourceDeployment) throw new Error("restore drill target must be isolated from the source deployment");
  if (sourceDeployment !== normalizeDeployment(sourceManifest.deployment)) throw new Error("restore drill source deployment mismatch");
  assertPreRestoreBackup({ targetDeployment, targetEnvironment: "staging", preRestoreManifest });
  if (evidence.sourceSnapshotSha256 !== sourceManifest.sha256) throw new Error("restore drill source SHA-256 mismatch");
  if (evidence.preRestoreSnapshotSha256 !== preRestoreManifest.sha256) throw new Error("restore drill pre-restore SHA-256 mismatch");
  if (!sourceManifest.includeFileStorage) throw new Error("restore drill source must include file storage");
  if (!/^[a-f0-9]{40}$/.test(String(evidence.releaseCommit ?? ""))) throw new Error("restore drill releaseCommit must be a full Git SHA");
  if (sourceManifest.sourceCommit && sourceManifest.sourceCommit !== evidence.releaseCommit) throw new Error("restore drill release commit does not match source manifest");

  const sourceCreatedAt = Date.parse(sourceManifest.createdAt);
  const startedAt = Date.parse(evidence.startedAt);
  const completedAt = Date.parse(evidence.completedAt);
  if (![sourceCreatedAt, startedAt, completedAt].every(Number.isFinite)) throw new Error("restore drill timestamps are invalid");
  if (startedAt < sourceCreatedAt) throw new Error("restore drill started before the recovery point was created");
  if (completedAt <= startedAt) throw new Error("restore drill completedAt must follow startedAt");
  const observedRpoHours = (startedAt - sourceCreatedAt) / 3_600_000;
  const observedRtoMinutes = (completedAt - startedAt) / 60_000;
  if (observedRpoHours > 24) throw new Error(`restore drill RPO ${observedRpoHours.toFixed(2)}h exceeds 24h`);
  if (observedRtoMinutes > 240) throw new Error(`restore drill RTO ${observedRtoMinutes.toFixed(2)}m exceeds 240m`);

  if (!evidence.checks || typeof evidence.checks !== "object") throw new Error("restore drill checks are required");
  for (const check of RESTORE_DRILL_CHECKS) {
    if (evidence.checks[check] !== true) throw new Error(`restore drill check is not PASS: ${check}`);
  }
  if (!String(evidence.operator ?? "").trim()) throw new Error("restore drill operator is required");
  if (!Array.isArray(evidence.evidenceRefs) || evidence.evidenceRefs.length === 0 || evidence.evidenceRefs.some((value) => !String(value).trim())) {
    throw new Error("restore drill evidenceRefs must contain at least one reference");
  }
  return { targetDeployment, sourceDeployment, observedRpoHours, observedRtoMinutes };
}
