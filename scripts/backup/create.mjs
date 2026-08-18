#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  assertExecutionAllowed,
  assertZipPath,
  buildExportArgs,
  createBackupManifest,
  describeSnapshot,
  manifestPathForSnapshot,
  normalizeDeployment,
  normalizeEnvironment,
  redactCommand,
} from "./lib.mjs";

function parseArgs(argv) {
  const args = {
    deployment: "",
    environment: "",
    output: "",
    includeFileStorage: true,
    execute: false,
    confirmation: "",
    sourceCommit: process.env.GITHUB_SHA ?? process.env.BACKUP_SOURCE_COMMIT ?? "",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--deployment") args.deployment = argv[++i] ?? "";
    else if (value === "--environment") args.environment = argv[++i] ?? "";
    else if (value === "--output") args.output = argv[++i] ?? "";
    else if (value === "--without-file-storage") args.includeFileStorage = false;
    else if (value === "--execute") args.execute = true;
    else if (value === "--confirm-production") args.confirmation = argv[++i] ?? "";
    else if (value === "--source-commit") args.sourceCommit = argv[++i] ?? "";
    else if (value === "--help" || value === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  return args;
}

function usage() {
  return [
    "Usage:",
    "  npm run backup:create -- --deployment <ref> --environment <development|staging|production> --output <snapshot.zip> [--execute]",
    "",
    "Defaults to plan-only. File storage is included unless --without-file-storage is supplied.",
    "Production execution additionally requires --confirm-production BACKUP:<deployment>.",
  ].join("\n");
}

function runConvexCli(args) {
  if (process.platform === "win32") {
    return spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "npx.cmd", ...args], { stdio: "inherit" });
  }
  return spawnSync("npx", args, { stdio: "inherit" });
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
  args.output = assertZipPath(args.output);
  assertExecutionAllowed({
    operation: "BACKUP",
    environment: args.environment,
    deployment: args.deployment,
    execute: args.execute,
    confirmation: args.confirmation,
  });
} catch (error) {
  console.error(`Backup preflight failed: ${error instanceof Error ? error.message : String(error)}`);
  console.error(usage());
  process.exit(2);
}

const exportArgs = buildExportArgs({
  deployment: args.deployment,
  output: args.output,
  includeFileStorage: args.includeFileStorage,
});

console.log(`Deployment: ${args.deployment}`);
console.log(`Environment: ${args.environment}`);
console.log(`Include file storage: ${args.includeFileStorage}`);
console.log(`Command: ${redactCommand(exportArgs)}`);

if (!args.execute) {
  console.log("PLAN ONLY: no backup command was executed.");
  process.exit(0);
}

try {
  await access(args.output);
  console.error("Backup refused: output ZIP already exists. Use a new path to avoid overwriting evidence.");
  process.exit(3);
} catch {
  // Expected when the output is free.
}

await mkdir(dirname(args.output), { recursive: true });
const result = runConvexCli(exportArgs);
if (result.status !== 0) {
  console.error(`Convex export failed with status ${result.status ?? "unknown"}.`);
  process.exit(result.status || 1);
}

try {
  const snapshot = await describeSnapshot(args.output);
  const manifest = createBackupManifest({
    deployment: args.deployment,
    environment: args.environment,
    includeFileStorage: args.includeFileStorage,
    snapshot,
    sourceCommit: args.sourceCommit,
  });
  const manifestPath = manifestPathForSnapshot(args.output);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  JSON.parse(await readFile(manifestPath, "utf8"));
  console.log(`Backup created: ${args.output}`);
  console.log(`Manifest: ${manifestPath}`);
  console.log(`SHA-256: ${manifest.sha256}`);
  console.log(`Size: ${manifest.sizeBytes} bytes`);
} catch (error) {
  console.error(`Backup integrity metadata failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(4);
}
