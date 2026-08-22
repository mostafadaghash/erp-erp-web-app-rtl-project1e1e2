#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildInlineAuditQuery,
  createFreshStartEvidence,
  normalizeDeployment,
  normalizeEnvironment,
  normalizePhase,
  parseConvexJson,
  requireReleaseCommit,
  validateLiveAudit,
} from "./lib.mjs";

function parseArgs(argv) {
  const args = { deployment: "", environment: "", phase: "", confirmation: "", releaseCommit: "", output: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--deployment") args.deployment = argv[++index] ?? "";
    else if (value === "--environment") args.environment = argv[++index] ?? "";
    else if (value === "--phase") args.phase = argv[++index] ?? "";
    else if (value === "--confirm") args.confirmation = argv[++index] ?? "";
    else if (value === "--release-commit") args.releaseCommit = argv[++index] ?? "";
    else if (value === "--output") args.output = argv[++index] ?? "";
    else if (value === "--help" || value === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  return args;
}

function usage() {
  return [
    "Usage:",
    "  npm run fresh-start:audit -- --deployment <deployment> --environment <development|staging|production> --phase <blank|initialized> --confirm <same-deployment> --release-commit <40-char-sha> [--output <evidence.json>]",
    "",
    "The audit is read-only. blank requires every application table to be empty; initialized permits setup records only and still requires zero business balances and documents.",
  ].join("\n");
}

function convexCliPath() {
  return resolve("node_modules/convex/bin/main.js");
}

function fail(message, status = 1) {
  console.error(`Fresh Start audit failed: ${message}`);
  process.exit(status);
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
  args.phase = normalizePhase(args.phase);
  args.releaseCommit = requireReleaseCommit(args.releaseCommit);
  if (args.confirmation !== args.deployment) throw new Error("--confirm must exactly match the audited deployment");
} catch (error) {
  console.error(usage());
  fail(error instanceof Error ? error.message : String(error), 2);
}

const query = buildInlineAuditQuery(args.phase);
const commandArgs = ["run", "--deployment", args.deployment, "--inline-query", query];
const run = spawnSync(process.execPath, [convexCliPath(), ...commandArgs], {
  cwd: process.cwd(),
  encoding: "utf8",
  windowsHide: true,
  maxBuffer: 4 * 1024 * 1024,
});
if (run.stderr) process.stderr.write(run.stderr);
if (run.error) fail(run.error.message);
if (run.status !== 0) fail(`Convex CLI exited with status ${run.status ?? "unknown"}`);

try {
  const result = parseConvexJson(run.stdout);
  const audit = validateLiveAudit({ phase: args.phase, result });
  const evidence = createFreshStartEvidence({
    deployment: args.deployment,
    environment: args.environment,
    releaseCommit: args.releaseCommit,
    checkedAt: new Date(),
    audit,
  });
  const outputPath = resolve(args.output || `test-results/fresh-start/${args.deployment}-${args.phase}.json`);
  await mkdir(resolve(outputPath, ".."), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log("Fresh Start customer deployment audit: PASS");
  console.log(`Deployment: ${args.deployment}`);
  console.log(`Phase: ${args.phase}`);
  console.log(`Non-empty permitted setup tables: ${audit.nonEmptyTables.length}`);
  console.log(`Evidence: ${outputPath}`);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
