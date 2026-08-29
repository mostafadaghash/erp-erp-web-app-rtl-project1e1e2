#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateRestoreDrillEvidence, verifySnapshotManifest } from "./lib.mjs";

function parseArgs(argv) {
  const args = { evidence: "", sourceManifest: "", preRestoreManifest: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--evidence") args.evidence = argv[++index] ?? "";
    else if (value === "--source-manifest") args.sourceManifest = argv[++index] ?? "";
    else if (value === "--pre-restore-manifest") args.preRestoreManifest = argv[++index] ?? "";
    else if (value === "--help" || value === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  return args;
}

function usage() {
  return [
    "Usage:",
    "  npm run restore:verify -- --evidence <restore-drill.json> --source-manifest <source.zip.manifest.json> --pre-restore-manifest <target-pre-restore.zip.manifest.json>",
    "",
    "The command verifies both backup ZIPs, deployment isolation, RPO/RTO, and every mandatory post-restore check.",
  ].join("\n");
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(path), "utf8"));
}

let args;
try {
  args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    process.exit(0);
  }
  if (!args.evidence || !args.sourceManifest || !args.preRestoreManifest) throw new Error("all evidence and manifest arguments are required");
} catch (error) {
  console.error(`Restore drill verification failed: ${error instanceof Error ? error.message : String(error)}`);
  console.error(usage());
  process.exit(2);
}

try {
  const [evidence, sourceManifest, preRestoreManifest] = await Promise.all([
    readJson(args.evidence),
    readJson(args.sourceManifest),
    readJson(args.preRestoreManifest),
  ]);
  await Promise.all([
    verifySnapshotManifest({ manifestPath: resolve(args.sourceManifest), manifest: sourceManifest }),
    verifySnapshotManifest({ manifestPath: resolve(args.preRestoreManifest), manifest: preRestoreManifest }),
  ]);
  const result = validateRestoreDrillEvidence({ evidence, sourceManifest, preRestoreManifest });
  console.log("Restore drill evidence: PASS");
  console.log(`Source deployment: ${result.sourceDeployment}`);
  console.log(`Isolated target: ${result.targetDeployment}`);
  console.log(`Observed RPO: ${result.observedRpoHours.toFixed(2)} hours`);
  console.log(`Observed RTO: ${result.observedRtoMinutes.toFixed(2)} minutes`);
} catch (error) {
  console.error(`Restore drill verification failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
