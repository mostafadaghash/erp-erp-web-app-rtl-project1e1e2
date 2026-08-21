#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateReleaseEvidence } from "./evidence-lib.mjs";

const evidenceArg = process.argv[2];
if (!evidenceArg || evidenceArg === "--help" || evidenceArg === "-h") {
  console.log("Usage: npm run release:evidence:verify -- <completed-release-evidence.json>");
  process.exit(evidenceArg ? 0 : 2);
}

try {
  const path = resolve(evidenceArg);
  const evidence = JSON.parse(await readFile(path, "utf8"));
  const result = validateReleaseEvidence(evidence);
  console.log(`Release evidence: GO (${result.version})`);
  console.log(`Release commit: ${result.releaseCommit}`);
  console.log(`Rollback commit: ${result.rollbackCommit}`);
  console.log(`Verified live gates: ${result.gateCount}`);
} catch (error) {
  console.error(`Release evidence verification failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
