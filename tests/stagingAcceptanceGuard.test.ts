import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { runtimeConvexCloudOrigins } from "../scripts/staging-preflight.mjs";

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const ci = read(".github/workflows/ci.yml");
const stagingWorkflow = read(".github/workflows/staging-acceptance.yml");
const script = read("scripts/staging-browser-e2e.mjs");
const stagingSafety = read("scripts/lib/staging-safety.mjs");
const preflight = read("scripts/staging-preflight.mjs");
const loadScript = read("scripts/load-staging.mjs");
const allScript = read("scripts/staging-all.mjs");
const packageJson = read("package.json");
const environmentTemplate = read(".env.staging.example");
const runbook = read("docs/STAGING_ACCEPTANCE_RUNBOOK.md");
const matrix = read("tests/STAGING_BROWSER_ACCEPTANCE_MATRIX.md");
const erpApp = read("src/components/ERPApp.tsx");
const sidebar = read("src/components/Sidebar.tsx");

test("STG-01 CI enforces audit build security tests and browser discovery", () => {
  assert.match(ci, /npm audit --audit-level=low/);
  assert.match(ci, /npm run typecheck/);
  assert.match(ci, /npm test/);
  assert.match(ci, /npm run security:check/);
  assert.match(ci, /npm run build/);
  assert.match(ci, /browser-contract/);
  assert.match(ci, /npx playwright test --list/);
  assert.match(ci, /cancel-in-progress: true/);
  assert.match(ci, /name: release-gate/);
  assert.match(ci, /npm ci --ignore-scripts/);
  assert.doesNotMatch(ci, /pull_request_target|permissions:\s*write-all/);
});

test("STG-02 external acceptance is manual isolated and secret-backed", () => {
  assert.match(stagingWorkflow, /workflow_dispatch:/);
  assert.match(stagingWorkflow, /environment: staging/);
  assert.match(stagingWorkflow, /secrets\.E2E_ROLE_ACCOUNTS_JSON/);
  assert.match(stagingWorkflow, /vars\.STAGING_BASE_URL/);
  assert.match(stagingWorkflow, /vars\.STAGING_CONVEX_URL/);
  assert.match(stagingWorkflow, /name: Staging required gate/);
  assert.doesNotMatch(stagingWorkflow, /inputs\.base_url/);
  assert.match(stagingWorkflow, /E2E_REQUIRE_ALL_ROLES: "true"/);
  assert.doesNotMatch(
    stagingWorkflow,
    /pull_request:|push:|ALLOW_PRODUCTION_LOAD_TEST/,
  );
});

test("STG-03 browser matrix requires the eight literal business roles", () => {
  for (const role of [
    "admin",
    "manager",
    "sales",
    "customer_service",
    "technician",
    "accountant",
    "shipping",
    "viewer",
  ]) {
    assert.match(script, new RegExp(`"${role}"`));
    assert.match(script, new RegExp(`${role}: \\{`));
  }
  assert.match(script, /Missing staging roles/);
  assert.match(script, /Duplicate role/);
  assert.match(script, /E2E account emails must be unique/);
});

test("STG-04 role checks open pages and assert forbidden navigation", () => {
  assert.match(script, /assertRoleNavigation/);
  assert.match(script, /rule\.visible/);
  assert.match(script, /rule\.hidden/);
  assert.match(script, /classList\.contains\("active"\)/);
  assert.match(script, /locator\("main h1"\)/);
});

test("STG-05 authentication is runtime and evidence never serializes credentials", () => {
  assert.match(script, /input\[name="email"\]/);
  assert.match(script, /input\[name="password"\]/);
  assert.match(script, /name: "تسجيل الخروج"/);
  assert.doesNotMatch(
    script,
    /JSON\.stringify\([^\n]*(?:account\.email|account\.password)/,
  );
  assert.doesNotMatch(script, /console\.log\([^\n]*(?:email|password)/);
});

test("STG-06 acceptance checks published headers wildcard CORS and backend binding", () => {
  for (const marker of [
    "content-security-policy",
    "strict-transport-security",
    "x-content-type-options",
    "x-frame-options",
    "referrer-policy",
    "permissions-policy",
    "access-control-allow-origin",
  ]) {
    assert.match(`${script}\n${preflight}`, new RegExp(marker));
  }
  assert.match(preflight, /not bound to STAGING_CONVEX_URL/);
  assert.match(preflight, /unexpected Convex cloud origin/);
  assert.match(preflight, /openid-configuration/);
});

test("Staging binding ignores only the Convex SDK validation example", () => {
  const sdkDiagnostic =
    "ConvexReactClient requires a URL like 'https://happy-otter-123.convex.cloud', received something of type string instead.";
  const stagingOrigin = "https://erp-stage.convex.cloud";
  const unexpectedOrigin = "https://unexpected-deployment.convex.cloud";

  assert.deepEqual(
    runtimeConvexCloudOrigins(`${sdkDiagnostic}\nconst url = "${stagingOrigin}";`),
    [stagingOrigin],
  );
  assert.deepEqual(
    runtimeConvexCloudOrigins(
      `${sdkDiagnostic}\nconst first = "${stagingOrigin}"; const second = "${unexpectedOrigin}";`,
    ),
    [stagingOrigin, unexpectedOrigin],
  );
});

test("STG-07 target validation refuses production and unsafe origins", () => {
  assert.match(stagingSafety, /E2E_ENVIRONMENT must equal staging/);
  assert.match(stagingSafety, /must use HTTPS/);
  assert.match(stagingSafety, /refuses production-looking hosts/);
  assert.match(stagingSafety, /without credentials or path/);
  assert.match(stagingSafety, /STAGING_TARGET_CONFIRMATION/);
  assert.match(stagingSafety, /same deployment/);
  assert.doesNotMatch(`${stagingSafety}\n${loadScript}`, /ALLOW_PRODUCTION/);
});

test("STG-08 mobile acceptance uses accessible navigation controls", () => {
  assert.match(erpApp, /aria-label="فتح القائمة الرئيسية"/);
  assert.match(sidebar, /aria-label="إغلاق القائمة الرئيسية"/);
  assert.match(script, /width: 390, height: 844/);
  assert.match(script, /admin-mobile-navigation\.png/);
});

test("STG-09 environment and runbook contain placeholders not real secrets", () => {
  assert.match(environmentTemplate, /E2E_ROLE_ACCOUNTS_JSON/);
  assert.match(environmentTemplate, /STAGING_TARGET_CONFIRMATION/);
  assert.match(environmentTemplate, /STAGING_CONVEX_SITE_URL/);
  assert.match(environmentTemplate, /Never commit real emails or passwords/);
  assert.doesNotMatch(
    environmentTemplate,
    /@gmail\.com|@hotmail\.com|@outlook\.com/,
  );
  assert.match(runbook, /GitHub Environment Secret/);
  assert.match(runbook, /لا تضع الملف أو السر في Git/);
});

test("STG-10 load execution is bounded opt-in and follows browser acceptance", () => {
  assert.match(stagingWorkflow, /inputs\.run_load_test/);
  assert.match(stagingWorkflow, /needs:.*browser-e2e/);
  assert.match(stagingWorkflow, /needs:.*mutable-business-cycles/);
  assert.match(stagingWorkflow, /E2E_LOAD_CONFIRMED: isolated-staging-only/);
  assert.match(stagingWorkflow, /test:load-staging -- --validate-config/);
  assert.match(loadScript, /boundedInteger/);
  assert.match(loadScript, /failureRate > 0\.01/);
  assert.match(loadScript, /LOAD_P95_LIMIT_MS/);
  assert.match(loadScript, /test-results\/staging-load/);
});

test("STG-11 one command runs every gate in a fail-fast safe order", () => {
  assert.match(packageJson, /"test:staging:all": "node scripts\/staging-all\.mjs"/);
  for (const confirmation of [
    "STAGING_FULL_RUN_CONFIRMED",
    "E2E_MUTATIONS_CONFIRMED",
    "E2E_LOAD_CONFIRMED",
  ]) assert.match(allScript, new RegExp(confirmation));
  const orderedSteps = [
    "repository-verify",
    "live-preflight",
    "all-role-browser",
    "mutable-business-cycles",
    "maximum-bounded-load",
  ];
  let previous = -1;
  for (const step of orderedSteps) {
    const index = allScript.indexOf(step);
    assert.ok(index > previous, `${step} must follow the preceding full-suite gate`);
    previous = index;
  }
  assert.match(allScript, /test-results\/staging-all/);
  assert.doesNotMatch(allScript, /Promise\.all\([\s\S]{0,200}(?:business|load)/i);
});

test("Windows staging runs use an installed Chrome or Edge executable", () => {
  assert.match(script, /windowsBrowserCandidates/);
  assert.match(script, /process\.platform === "win32"/);
  assert.match(script, /E2E_BROWSER_EXECUTABLE/);
  assert.match(script, /"chrome\.exe"/);
  assert.match(script, /"msedge\.exe"/);
  assert.match(
    script,
    /return chromium\.launch\(\{ executablePath, headless: true \}\)/,
  );
  const windowsBranch = script.slice(
    script.indexOf('process.platform === "win32"'),
    script.indexOf("chromiumPackage.setGraphicsMode"),
  );
  assert.doesNotMatch(windowsBranch, /chromiumPackage\.args|FONTCONFIG_PATH/);
});

test("staging config validation runs without contacting an external host", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/staging-browser-e2e.mjs", "--validate-config"],
    {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
      env: {
        ...process.env,
        STAGING_BASE_URL: "https://staging.example.com",
        STAGING_CONVEX_URL: "https://erp-stage.convex.cloud",
        STAGING_CONVEX_SITE_URL: "https://erp-stage.convex.site",
        STAGING_TARGET_CONFIRMATION: "staging.example.com|erp-stage",
        E2E_ENVIRONMENT: "staging",
        E2E_REQUIRE_ALL_ROLES: "false",
        E2E_ROLE_ACCOUNTS_JSON: JSON.stringify([
          {
            role: "admin",
            email: "admin@example.invalid",
            password: "local-placeholder-password",
          },
        ]),
      },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"roles":\["admin"\]/);
  assert.doesNotMatch(
    result.stdout,
    /admin@example|local-placeholder-password/,
  );
});

test("coverage matrix has sixteen unique executable staging scenarios", () => {
  const rows = [...matrix.matchAll(/^\| STG-(\d{2}) .*\| EXECUTABLE \|$/gm)];
  assert.deepEqual(
    rows.map((row) => Number(row[1])),
    Array.from({ length: 16 }, (_, index) => index + 1),
  );
  assert.doesNotMatch(matrix, /PENDING|PLACEHOLDER|TODO/i);
});

test("new staging implementation contains no unsafe TypeScript escape", () => {
  for (const source of [script, stagingSafety, preflight, loadScript, erpApp, sidebar]) {
    assert.doesNotMatch(source, /as any|@ts-ignore/);
  }
});

test("Staging preflight validates an exact frontend and Convex deployment pair offline", () => {
  const valid = spawnSync(
    process.execPath,
    ["scripts/staging-preflight.mjs", "--validate-config"],
    {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
      env: {
        ...process.env,
        STAGING_BASE_URL: "https://staging.example.com",
        STAGING_CONVEX_URL: "https://erp-stage.convex.cloud",
        STAGING_CONVEX_SITE_URL: "https://erp-stage.convex.site",
        STAGING_TARGET_CONFIRMATION: "staging.example.com|erp-stage",
        E2E_ENVIRONMENT: "staging",
      },
    },
  );
  assert.equal(valid.status, 0, valid.stderr);
  const output = JSON.parse(valid.stdout);
  assert.equal(output.exactTargetConfirmed, true);
  assert.equal(output.convexDeploymentId, "erp-stage");
});

test("Staging preflight rejects mismatched Convex URLs and target confirmations", () => {
  const run = (overrides: Record<string, string>) =>
    spawnSync(process.execPath, ["scripts/staging-preflight.mjs", "--validate-config"], {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
      env: {
        ...process.env,
        STAGING_BASE_URL: "https://staging.example.com",
        STAGING_CONVEX_URL: "https://erp-stage.convex.cloud",
        STAGING_CONVEX_SITE_URL: "https://erp-stage.convex.site",
        STAGING_TARGET_CONFIRMATION: "staging.example.com|erp-stage",
        E2E_ENVIRONMENT: "staging",
        ...overrides,
      },
    });
  const wrongSite = run({ STAGING_CONVEX_SITE_URL: "https://other-stage.convex.site" });
  assert.notEqual(wrongSite.status, 0);
  assert.match(wrongSite.stderr, /same deployment/);
  const wrongConfirmation = run({ STAGING_TARGET_CONFIRMATION: "wrong.example.com|erp-stage" });
  assert.notEqual(wrongConfirmation.status, 0);
  assert.match(wrongConfirmation.stderr, /exactly match/);
});

test("bounded load validates exact Staging target and numeric limits without requests", () => {
  const run = (overrides: Record<string, string>) =>
    spawnSync(process.execPath, ["scripts/load-staging.mjs", "--validate-config"], {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
      env: {
        ...process.env,
        STAGING_BASE_URL: "https://staging.example.com",
        STAGING_CONVEX_URL: "https://erp-stage.convex.cloud",
        STAGING_CONVEX_SITE_URL: "https://erp-stage.convex.site",
        STAGING_TARGET_CONFIRMATION: "staging.example.com|erp-stage",
        E2E_ENVIRONMENT: "staging",
        E2E_LOAD_CONFIRMED: "isolated-staging-only",
        LOAD_REQUESTS: "100",
        LOAD_CONCURRENCY: "10",
        ...overrides,
      },
    });
  const valid = run({});
  assert.equal(valid.status, 0, valid.stderr);
  assert.equal(JSON.parse(valid.stdout).requests, 100);
  const invalidNumber = run({ LOAD_CONCURRENCY: "NaN" });
  assert.notEqual(invalidNumber.status, 0);
  assert.match(invalidNumber.stderr, /must be an integer/);
  const production = run({
    STAGING_BASE_URL: "https://production.example.com",
    STAGING_TARGET_CONFIRMATION: "production.example.com|erp-stage",
  });
  assert.notEqual(production.status, 0);
  assert.match(production.stderr, /refuses production-looking hosts/);
});
