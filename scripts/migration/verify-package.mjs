#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { MIGRATION_SCHEMA_VERSION, sha256 } from "./lib.mjs";

const dir = resolve(process.argv[2] ?? "migration/output");
const readJson = async (name) => JSON.parse(await readFile(resolve(dir, name), "utf8"));

try {
  const [manifest, accepted, rejected, reconciliation, applyPlan] = await Promise.all([
    readJson("manifest.json"),
    readJson("accepted.json"),
    readJson("rejected.json"),
    readJson("reconciliation.json"),
    readJson("apply-plan.json"),
  ]);
  if (manifest.schemaVersion !== MIGRATION_SCHEMA_VERSION) throw new Error("schemaVersion mismatch");
  const fingerprint = sha256({
    schemaVersion: manifest.schemaVersion,
    sourceSystem: manifest.sourceSystem,
    cutoverDate: manifest.cutoverDate,
    accepted,
  });
  if (fingerprint !== manifest.fingerprint) throw new Error("accepted package fingerprint mismatch");
  const expectedRunId = `MIG-${fingerprint.slice(0, 16).toUpperCase()}`;
  if (manifest.migrationRunId !== expectedRunId) throw new Error("migrationRunId mismatch");
  if (manifest.mode !== "dry-run") throw new Error("manifest mode must remain dry-run");
  if (applyPlan.writeEnabled !== false) throw new Error("apply plan unexpectedly enables writes");
  if (applyPlan.fingerprint !== fingerprint || applyPlan.migrationRunId !== expectedRunId) throw new Error("apply plan identity mismatch");
  if (manifest.rejectedRows !== rejected.length) throw new Error("rejected row count mismatch");
  const differences = reconciliation.filter((row) => row.status === "difference");
  const expectedReconciliationPassed = differences.length === 0;
  if (manifest.reconciliationPassed !== expectedReconciliationPassed) throw new Error("reconciliation status mismatch");
  console.log(`Migration package verified: ${expectedRunId}`);
  console.log(`Rejected rows: ${rejected.length}`);
  console.log(`Control differences: ${differences.length}`);
  console.log("Package integrity is valid and writes remain disabled.");
} catch (error) {
  console.error(`Migration package verification failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
