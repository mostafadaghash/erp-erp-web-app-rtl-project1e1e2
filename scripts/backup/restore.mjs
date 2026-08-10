#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  assertExecutionAllowed,
  assertPreRestoreBackup,
  buildRestoreArgs,
  normalizeDeployment,
  normalizeEnvironment,
  productionConfirmation,
  redactCommand,
  verifySnapshotManifest,
} from "./lib.mjs";

function parseArgs(argv) {
  const args = {
    deployment: "",
    environment: "",
    snapshotManifest: "",
    preRestoreManifest: "",
    execute: false,
    confirmation: "",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--deployment") args.deployment = argv[++i] ?? "";
    else if (value === "--environment") args.environment = argv[++i] ?? "";
    else if (value === "--snapshot-manifest") args.snapshotManifest = argv[++i] ?? "";
    else if (value === "--pre-restore-manifest") args.preRestoreManifest = argv[++i] ?? "";
    else if (value === "--execute") args.execute = true;
    else if (value === "--confirm-production") args.confirmation = argv[++i] ?? "";
    else if (value === "--help" || value === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  return args;
}

function usage() {
  return [
    "Usage:",
    "  npm run restore:plan -- --deployment <ref> --environment <development|staging|production> --snapshot-manifest <backup.manifest.json>",
    "  npm run restore:execute -- --deployment <ref> --environment <...> --snapshot-manifest <backup.manifest.json> --pre-restore-manifest <fresh-target-backup.manifest.json> [--confirm-production <token>]",
    "",
    "Restore is plan-only unless --execute is present. Execution always requires a verified pre-restore backup of the target deployment.",
  ].join("\n");
}

function commandName() {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

async function readVerified(manifestArg) {
  const manifestPath = resolve(manifestArg);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  return verifySnapshotManifest({ manifestPath, manifest });
}

let args;
try {
  args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    process.exit(0);
  }
  args.deployment = normalizeDeployment(args.deployment);
  args.environment = normalizeEnvironment(args.environment);
  if (!args.snapshotManifest) throw new Error("--snapshot-manifest is required");
} catch (error) {
  console.error(`Restore preflight failed: ${error instanceof Error ? error.message : String(error)}`);
  console.error(usage());
  process.exit(2);
}

let source;
try {
  source = await readVerified(args.snapshotManifest);
} catch (error) {
  console.error(`Restore source verification failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(3);
}

const restoreArgs = buildRestoreArgs({ deployment: args.deployment, snapshot: source.snapshot.snapshotPath });
const productionToken = productionConfirmation({
  operation: "RESTORE",
  deployment: args.deployment,
  sha256: source.manifest.sha256,
});

console.log(`Target deployment: ${args.deployment}`);
console.log(`Target environment: ${args.environment}`);
console.log(`Source deployment: ${source.manifest.deployment}`);
console.log(`Source SHA-256: ${source.manifest.sha256}`);
console.log(`Includes file storage: ${source.manifest.includeFileStorage}`);
console.log(`Command: ${redactCommand(restoreArgs)}`);
if (args.environment === "production") console.log(`Required production token: ${productionToken}`);

if (!args.execute) {
  console.log("PLAN ONLY: no restore command was executed.");
  process.exit(0);
}

try {
  if (!args.preRestoreManifest) throw new Error("--pre-restore-manifest is required before executing a destructive restore");
  const preRestore = await readVerified(args.preRestoreManifest);
  assertPreRestoreBackup({
    targetDeployment: args.deployment,
    targetEnvironment: args.environment,
    preRestoreManifest: preRestore.manifest,
  });
  assertExecutionAllowed({
    operation: "RESTORE",
    environment: args.environment,
    deployment: args.deployment,
    sha256: source.manifest.sha256,
    execute: true,
    confirmation: args.confirmation,
  });
  console.log(`Verified pre-restore safety backup: ${preRestore.snapshot.snapshotFile}`);
} catch (error) {
  console.error(`Restore execution refused: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(4);
}

const result = spawnSync(commandName(), restoreArgs, { stdio: "inherit" });
if (result.status !== 0) {
  console.error(`Convex restore failed with status ${result.status ?? "unknown"}.`);
  process.exit(result.status || 1);
}
console.log("Restore command completed. Run post-restore reconciliation and smoke tests before reopening writes.");
