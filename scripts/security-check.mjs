import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const roots = ["src", "convex"];

function filesUnder(directory) {
  const absolute = join(root, directory);
  return readdirSync(absolute).flatMap((name) => {
    const path = join(absolute, name);
    if (path.includes("_generated")) return [];
    return statSync(path).isDirectory() ? filesUnder(relative(root, path)) : [path];
  });
}

const checks = [
  { label: "anonymous sign-in", pattern: /signIn\s*\(\s*["']anonymous["']/ },
  { label: "Anonymous auth provider", pattern: /auth\/providers\/Anonymous|\bAnonymous\b.*provider/i },
  { label: "legacy wildcard permission", pattern: /["'](?:view|create|edit|delete|print)_all["']/ },
  { label: "Saudi locale", pattern: /ar-SA|ر\.س|\bSAR\b|\b966\d{7,}/ },
];

const failures = [];
for (const file of roots.flatMap(filesUnder)) {
  const text = readFileSync(file, "utf8");
  for (const check of checks) {
    if (check.pattern.test(text)) failures.push(`${relative(root, file)}: ${check.label}`);
  }
}

const auth = readFileSync(join(root, "convex/auth.ts"), "utf8");
if (!/providers:\s*\[passwordProvider\]/.test(auth)) failures.push("convex/auth.ts: password-only provider invariant");

const stagingWorkflow = readFileSync(
  join(root, ".github/workflows/staging-acceptance.yml"),
  "utf8",
);
for (const [label, pattern] of [
  ["manual trigger", /workflow_dispatch:/],
  ["protected staging environment", /environment: staging/],
  ["all role enforcement", /E2E_REQUIRE_ALL_ROLES: "true"/],
  ["secret-backed accounts", /secrets\.E2E_ROLE_ACCOUNTS_JSON/],
  ["browser-before-load dependency", /needs:.*browser-e2e/],
]) {
  if (!pattern.test(stagingWorkflow))
    failures.push(`staging-acceptance.yml: missing ${label}`);
}
if (/pull_request:|push:|ALLOW_PRODUCTION_LOAD_TEST/.test(stagingWorkflow))
  failures.push("staging-acceptance.yml: unsafe automatic or production execution");

const stagingBrowser = readFileSync(
  join(root, "scripts/staging-browser-e2e.mjs"),
  "utf8",
);
const stagingSafety = readFileSync(
  join(root, "scripts/lib/staging-safety.mjs"),
  "utf8",
);
const stagingBusiness = readFileSync(
  join(root, "scripts/staging-business-e2e.mjs"),
  "utf8",
);
const stagingLoad = readFileSync(join(root, "scripts/load-staging.mjs"), "utf8");
const stagingAll = readFileSync(join(root, "scripts/staging-all.mjs"), "utf8");
for (const [label, pattern] of [
  ["explicit staging environment", /E2E_ENVIRONMENT must equal staging/],
  ["production host refusal", /refuses production-looking hosts/],
  ["HTTPS enforcement", /must use HTTPS/],
  ["wildcard CORS assertion", /access-control-allow-origin/],
]) {
  if (!pattern.test(`${stagingBrowser}\n${stagingSafety}`))
    failures.push(`staging-browser-e2e.mjs: missing ${label}`);
}
for (const [label, source, pattern] of [
  ["business mutation confirmation", stagingBusiness, /E2E_MUTATIONS_CONFIRMED[\s\S]*isolated-staging-only/],
  ["bounded load confirmation", stagingLoad, /E2E_LOAD_CONFIRMED[\s\S]*isolated-staging-only/],
  ["full-run confirmation", stagingAll, /STAGING_FULL_RUN_CONFIRMED/],
]) {
  if (!pattern.test(source)) failures.push(`staging automation: missing ${label}`);
}
if (/ALLOW_PRODUCTION/.test(`${stagingBrowser}\n${stagingSafety}\n${stagingBusiness}\n${stagingLoad}\n${stagingAll}`))
  failures.push("staging automation: production override is forbidden");

const audit = readFileSync(join(root, "convex/auditLogs.ts"), "utf8");
if (/export const (?:log|clear)\s*=/.test(audit)) failures.push("convex/auditLogs.ts: audit log must be append-only");

if (failures.length) {
  console.error("Security checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Security checks passed.");
