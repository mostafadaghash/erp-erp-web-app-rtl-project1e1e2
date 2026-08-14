import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import dotenv from "dotenv";

dotenv.config({ path: ".env.staging.local", override: false });

const validateOnly = process.argv.includes("--validate-config");
const outputRoot = resolve("test-results/staging-all");
const reportPath = resolve(outputRoot, "acceptance.json");
const completed = [];

function commandForNpm(args) {
  if (process.env.npm_execpath) {
    return { command: process.execPath, args: [process.env.npm_execpath, ...args] };
  }
  return {
    command: process.platform === "win32" ? "npm.cmd" : "npm",
    args,
  };
}

async function runStep(name, npmArgs) {
  const startedAt = Date.now();
  console.log(`\n[staging:all] START ${name}`);
  const invocation = commandForNpm(npmArgs);
  const exitCode = await new Promise((resolveExit, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
      shell: false,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`${name} terminated by ${signal}`));
      else resolveExit(code ?? 1);
    });
  });
  const result = {
    name,
    durationMs: Date.now() - startedAt,
    status: exitCode === 0 ? "passed" : "failed",
  };
  completed.push(result);
  await writeReport(exitCode === 0 ? "running" : "failed");
  if (exitCode !== 0) throw new Error(`${name} failed with exit code ${exitCode}`);
  console.log(`[staging:all] PASS ${name}`);
}

async function writeReport(status) {
  await mkdir(outputRoot, { recursive: true });
  await writeFile(
    reportPath,
    `${JSON.stringify(
      {
        formatVersion: 1,
        generatedAt: new Date().toISOString(),
        mode: validateOnly ? "validate-only" : "full",
        status,
        steps: completed,
      },
      null,
      2,
    )}\n`,
  );
}

function requireConfirmation(name) {
  if (process.env[name] !== "isolated-staging-only") {
    throw new Error(`${name} must equal isolated-staging-only`);
  }
}

async function main() {
  if (!validateOnly) requireConfirmation("STAGING_FULL_RUN_CONFIRMED");
  requireConfirmation("E2E_MUTATIONS_CONFIRMED");
  requireConfirmation("E2E_LOAD_CONFIRMED");

  const validationSteps = [
    ["target-config", ["run", "test:staging-preflight", "--", "--validate-config"]],
    ["browser-config", ["run", "test:e2e-staging", "--", "--validate-config"]],
    ["fixtures-config", ["run", "staging:fixtures:setup", "--", "--validate-config"]],
    ["business-config", ["run", "test:e2e-business-staging", "--", "--validate-config"]],
    ["load-config", ["run", "test:load-staging", "--", "--validate-config"]],
  ];
  if (validateOnly) {
    for (const [name, args] of validationSteps) await runStep(name, args);
    await writeReport("passed");
    console.log("\nStaging full-suite configuration passed without network mutation.");
    return;
  }

  await runStep("repository-verify", ["run", "verify"]);
  for (const [name, args] of validationSteps) await runStep(name, args);
  await runStep("live-preflight", ["run", "test:staging-preflight"]);
  await runStep("all-role-browser", ["run", "test:e2e-staging"]);
  await runStep("business-fixture-setup", ["run", "staging:fixtures:setup"]);
  await runStep("mutable-business-cycles", ["run", "test:e2e-business-staging"]);
  await runStep("maximum-bounded-load", ["run", "test:load-staging"]);
  await writeReport("passed");
  console.log(`\nStaging full acceptance passed. Evidence: ${reportPath}`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    await main();
  } catch (error) {
    await writeReport("failed");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
