#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { verifySnapshotManifest } from "./lib.mjs";

const manifestArg = process.argv[2];
if (!manifestArg || manifestArg === "--help" || manifestArg === "-h") {
  console.log("Usage: npm run backup:verify -- <snapshot.zip.manifest.json>");
  process.exit(manifestArg ? 0 : 2);
}

const manifestPath = resolve(manifestArg);
try {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const verified = await verifySnapshotManifest({ manifestPath, manifest });
  console.log(`Backup verified: ${verified.snapshot.snapshotFile}`);
  console.log(`Deployment: ${verified.manifest.deployment}`);
  console.log(`Environment: ${verified.manifest.environment}`);
  console.log(`SHA-256: ${verified.manifest.sha256}`);
  console.log(`Size: ${verified.manifest.sizeBytes} bytes`);
  console.log(`Includes file storage: ${verified.manifest.includeFileStorage}`);
} catch (error) {
  console.error(`Backup verification failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
