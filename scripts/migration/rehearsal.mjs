#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const PROTECTED_DEPLOYMENTS = new Set([
  "brave-dachshund-76",
  "academic-puma-235",
  "courteous-dotterel-331",
]);

function parseArgs(argv) {
  const args = { packageDir: "", deployment: "", confirm: "", envFile: ".env.migration-rehearsal.local" };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--package") args.packageDir = argv[++index] ?? "";
    else if (value === "--deployment") args.deployment = argv[++index] ?? "";
    else if (value === "--confirm") args.confirm = argv[++index] ?? "";
    else if (value === "--env-file") args.envFile = argv[++index] ?? "";
    else if (value === "--help" || value === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  return args;
}

function usage() {
  return [
    "Usage:",
    "  npm run migration:rehearsal -- --package <migration/output/...> --deployment <temporary-deployment> --confirm <same-deployment>",
    "",
    "Safety:",
    "  The runner refuses known Development/Staging/Production permanent deployments.",
    "  It verifies the prepared package before any write and invokes only internal Convex functions.",
  ].join("\n");
}

function fail(message) {
  console.error(`Migration rehearsal blocked: ${message}`);
  process.exit(1);
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
    ...options,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`);
  return result.stdout?.trim() ?? "";
}

function parseJsonOutput(output, label) {
  const trimmed = output.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try { return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)); } catch { /* fall through */ }
    }
    throw new Error(`Unable to parse ${label} JSON result from Convex CLI`);
  }
}

function npxCommand() {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

function runConvex(functionName, payload, deployment) {
  const output = run(npxCommand(), [
    "convex",
    "run",
    functionName,
    JSON.stringify(payload),
    "--deployment",
    deployment,
  ]);
  return parseJsonOutput(output, functionName);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(usage());
  process.exit(0);
}
if (!args.packageDir || !args.deployment || !args.confirm) {
  console.error(usage());
  process.exit(2);
}

const deployment = args.deployment.trim();
if (!/^[a-z][a-z0-9-]+-\d+$/.test(deployment)) fail("deployment name format is invalid");
if (PROTECTED_DEPLOYMENTS.has(deployment)) fail(`refusing permanent deployment ${deployment}`);
if (args.confirm.trim() !== deployment) fail("--confirm must exactly match the temporary deployment name");

const envFilePath = resolve(args.envFile);
if (!existsSync(envFilePath)) fail(`missing rehearsal environment file: ${envFilePath}`);
const envText = await readFile(envFilePath, "utf8");
const envDeployment = envText.match(/^CONVEX_DEPLOYMENT=dev:([^\s#]+)/m)?.[1];
const envUrlDeployment = envText.match(/^VITE_CONVEX_URL=https:\/\/([^.]+)\.convex\.cloud\s*$/m)?.[1];
if (envDeployment !== deployment || envUrlDeployment !== deployment) {
  fail(`environment file is not bound exclusively to ${deployment}`);
}

const packageDir = resolve(args.packageDir);
for (const file of ["manifest.json", "accepted.json", "rejected.json", "reconciliation.json", "apply-plan.json"]) {
  if (!existsSync(resolve(packageDir, file))) fail(`package file missing: ${file}`);
}

console.log(`Verifying migration package: ${packageDir}`);
run(process.execPath, [resolve("scripts/migration/verify-package.mjs"), packageDir]);

const [manifest, accepted, rejected, reconciliation, applyPlan] = await Promise.all([
  readJson(resolve(packageDir, "manifest.json")),
  readJson(resolve(packageDir, "accepted.json")),
  readJson(resolve(packageDir, "rejected.json")),
  readJson(resolve(packageDir, "reconciliation.json")),
  readJson(resolve(packageDir, "apply-plan.json")),
]);

if (rejected.length !== 0 || manifest.rejectedRows !== 0) fail("package contains rejected rows");
if (!manifest.reconciliationPassed) fail("prepared package reconciliation did not pass");
if (applyPlan.writeEnabled !== false) fail("prepared apply plan must remain write-disabled");
if (applyPlan.migrationRunId !== manifest.migrationRunId || applyPlan.fingerprint !== manifest.fingerprint) fail("apply plan identity mismatch");

const controls = Object.fromEntries(
  reconciliation
    .filter((row) => row.expected !== null && row.expected !== undefined)
    .map((row) => [row.metric, Number(row.expected)]),
);
const expectedCounts = {
  branches: accepted.branches.length,
  customers: accepted.customers.length,
  suppliers: accepted.suppliers.length,
  products: accepted.products.length,
  financialAccounts: accepted.financialAccounts.length,
  codWithCarriers: accepted.cod.filter((row) => row.status === "with_carrier" && row.amount > 0).length,
};
const confirmation = `APPLY:${deployment}:${manifest.migrationRunId}:${manifest.fingerprint.slice(0, 12)}`;

console.log(`Applying ${manifest.migrationRunId} to isolated deployment ${deployment}...`);
const applyResult = runConvex("migrationRehearsal:apply", {
  targetDeployment: deployment,
  confirmation,
  migrationRunId: manifest.migrationRunId,
  fingerprint: manifest.fingerprint,
  cutoverDate: manifest.cutoverDate,
  sourceSystem: manifest.sourceSystem,
  accepted,
}, deployment);

console.log("Running post-write reconciliation...");
const reconciliationResult = runConvex("migrationRehearsal:reconcile", {
  targetDeployment: deployment,
  migrationRunId: manifest.migrationRunId,
  fingerprint: manifest.fingerprint,
  controls,
  expectedCounts,
  expectedSkus: accepted.products.map((row) => row.sku),
}, deployment);

const evidenceDir = resolve("test-results/migration-rehearsal");
await mkdir(evidenceDir, { recursive: true });
const evidencePath = resolve(evidenceDir, `${manifest.migrationRunId}.json`);
const evidence = {
  generatedAt: new Date().toISOString(),
  deployment,
  migrationRunId: manifest.migrationRunId,
  fingerprint: manifest.fingerprint,
  sourceSystem: manifest.sourceSystem,
  cutoverDate: manifest.cutoverDate,
  apply: applyResult,
  reconciliation: reconciliationResult,
};
await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

if (!reconciliationResult.passed) {
  console.error(`Migration rehearsal reconciliation FAILED. Evidence: ${evidencePath}`);
  process.exit(4);
}
console.log(`Migration rehearsal PASSED on ${deployment}.`);
console.log(`Migration run: ${manifest.migrationRunId}`);
console.log(`Fingerprint: ${manifest.fingerprint}`);
console.log(`Evidence: ${evidencePath}`);
