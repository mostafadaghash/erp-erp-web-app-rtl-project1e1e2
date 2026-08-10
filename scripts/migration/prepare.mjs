#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { prepareMigration } from "./lib.mjs";

function parseArgs(argv) {
  const args = { input: "", output: "migration/output", failOnRejects: false, failOnDifferences: false };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--input") args.input = argv[++i] ?? "";
    else if (value === "--output") args.output = argv[++i] ?? "";
    else if (value === "--fail-on-rejects") args.failOnRejects = true;
    else if (value === "--fail-on-differences") args.failOnDifferences = true;
    else if (value === "--dry-run") {
      // Kept for explicit operator intent. Dry-run is always enforced by this tool.
    } else if (value === "--help" || value === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  return args;
}

function usage() {
  return [
    "Usage:",
    "  npm run migration:prepare -- --input <legacy.json> [--output migration/output] [--fail-on-rejects] [--fail-on-differences]",
    "",
    "Safety:",
    "  This command is always dry-run. It never connects to Convex and never writes application data.",
  ].join("\n");
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(usage());
  process.exit(0);
}
if (!args.input) {
  console.error(usage());
  process.exit(2);
}

const inputPath = resolve(args.input);
const outputPath = resolve(args.output);
let input;
try {
  input = JSON.parse(await readFile(inputPath, "utf8"));
} catch (error) {
  console.error(`Unable to read migration input: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}

let result;
try {
  result = prepareMigration(input);
} catch (error) {
  console.error(`Migration preflight failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

await mkdir(outputPath, { recursive: true });
const files = {
  "manifest.json": result.manifest,
  "accepted.json": result.accepted,
  "rejected.json": result.rejected,
  "mapping.json": result.mapping,
  "reconciliation.json": result.reconciliation,
  "apply-plan.json": result.applyPlan,
};
for (const [name, value] of Object.entries(files)) {
  await writeFile(resolve(outputPath, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const differences = result.reconciliation.filter((row) => row.status === "difference");
console.log(`Migration dry-run: ${result.manifest.migrationRunId}`);
console.log(`Fingerprint: ${result.manifest.fingerprint}`);
console.log(`Accepted rows: ${result.manifest.acceptedRows}`);
console.log(`Rejected rows: ${result.manifest.rejectedRows}`);
console.log(`Control differences: ${differences.length}`);
console.log(`Output: ${outputPath}`);
console.log("No application data was written.");

if (args.failOnRejects && result.rejected.length > 0) process.exitCode = 3;
if (args.failOnDifferences && differences.length > 0) process.exitCode = 4;
