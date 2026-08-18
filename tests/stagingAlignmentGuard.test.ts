import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

const sidebar = read("src/components/Sidebar.tsx");
const branches = read("convex/branches.ts");
const accountSetup = read("scripts/staging-account-setup.mjs");
const fixtures = read("scripts/staging-fixtures-setup.mjs");
const business = read("scripts/staging-business-e2e.mjs");
const browser = read("scripts/staging-browser-e2e.mjs");
const envCheck = read("scripts/staging-env-check.mjs");
const stagingAll = read("scripts/staging-all.mjs");
const helpers = read("tests/e2e/helpers.ts");
const rolesSpec = read("tests/e2e/roles-branches.spec.ts");
const packageJson = read("package.json");
const ci = read(".github/workflows/ci.yml");
const stagingGate = read(".github/workflows/staging-gate.yml");
const stagingAcceptance = read(".github/workflows/staging-acceptance.yml");
const environmentTemplate = read(".env.staging.example");

const machineRoles = [
  "admin",
  "manager",
  "accountant",
  "sales",
  "customer_service",
  "technician",
  "shipping",
  "viewer",
];

const nonAdminRoles = machineRoles.filter((role) => role !== "admin");

test("role acceptance uses a stable machine identity while keeping Arabic display copy", () => {
  assert.match(sidebar, /data-testid="current-user-role"/);
  assert.match(sidebar, /data-user-role=\{role\}/);
  assert.match(accountSetup, /getAttribute\("data-user-role"\)/);
  assert.doesNotMatch(
    accountSetup,
    /getByTestId\("current-user-role"\)\.innerText\(\)/,
  );
  assert.match(helpers, /toHaveAttribute\("data-user-role", role\)/);
});

test("branch metadata is scoped to the authenticated branch for non-admin users", () => {
  assert.match(branches, /async function visibleBranches\(ctx: QueryCtx, user: AuthUser\)/);
  assert.match(branches, /if \(user\.role === "admin"\) return await ctx\.db\.query\("branches"\)\.collect\(\)/);
  assert.match(branches, /if \(!user\.branchId\) return \[\]/);
  assert.match(branches, /const branch = await ctx\.db\.get\(user\.branchId\)/);
  assert.match(branches, /return await visibleBranches\(ctx, user\)/);
  assert.match(branches, /assertBranchAccess\(user, \{ branchId: branch\._id \}\)/);
  assert.match(branches, /const branches = await visibleBranches\(ctx, user\)/);
});

test("existing Staging role accounts are reconciled to one unambiguous branch", () => {
  assert.match(accountSetup, /async function reconcileExistingBranch/);
  assert.match(accountSetup, /getByTitle\("تعديل"\)/);
  assert.match(accountSetup, /getByTestId\("employee-branch"\)/);
  assert.match(accountSetup, /matches\.length,\s*1/);
  assert.match(accountSetup, /تم تحديث بيانات المستخدم/);
  assert.match(accountSetup, /branch-corrected/);
});

test("fixture setup follows current ERP navigation and synchronizes the Admin working branch", () => {
  assert.match(fixtures, /navigate\(page, "الأصناف", "products-page"\)/);
  assert.match(fixtures, /navigate\(page, "الخزائن والبنوك", "treasury-page"\)/);
  assert.doesNotMatch(fixtures, /المنتجات والمخزون|الخزائن والحسابات/);
  assert.match(fixtures, /async function ensureAdminWorkingBranch/);
  const synchronize = fixtures.indexOf("await ensureAdminWorkingBranch(page, config.fixtures, finance.branchId)");
  const customer = fixtures.indexOf("ensureCustomer(page, config.fixtures, finance.branchId)");
  assert.ok(synchronize > 0 && customer > synchronize);
  assert.match(fixtures, /matches\.length, 1/);
  assert.match(fixtures, /E2E_ACCOUNT_BRANCH_NAME must match E2E_BUSINESS_FIXTURES_JSON\.branchName/);
});

test("mutable business acceptance waits for exact branch selectors instead of racing render", () => {
  for (const testId of ["delivery-branch-select", "repair-branch-select"]) {
    assert.match(
      business,
      new RegExp(`getByTestId\\(\"${testId}\"\\)[\\s\\S]{0,180}waitFor\\(\\{ state: \"visible\", timeout: 30_000 \\}\\)[\\s\\S]{0,120}selectExact`),
    );
  }
  assert.doesNotMatch(
    business,
    /if \(await branch\.count\(\)\) await selectContaining\(branch, fixtures\.branchName\)/,
  );
  assert.match(business, /Expected exactly one option named/);
});

test("browser navigation gates on document commit then application readiness", () => {
  assert.match(browser, /waitUntil: "commit"/);
  assert.match(browser, /timeout: 45_000/);
  assert.match(browser, /gotoStagingPage\(page, baseUrl\)/);
  assert.match(browser, /name: "تسجيل الدخول", exact: true/);
  assert.doesNotMatch(browser, /signIn[\s\S]{0,200}waitUntil: "domcontentloaded"/);
});

test("the full staging runner provisions accounts before role browser and business fixtures", () => {
  assert.match(stagingAll, /\["account-config", \["run", "staging:accounts:setup"/);
  assert.match(stagingAll, /STAGING_ACCOUNT_SETUP_CONFIRMED/);
  const accountSetupStep = stagingAll.indexOf('runStep("role-account-setup"');
  const browserStep = stagingAll.indexOf('runStep("all-role-browser"');
  const fixtureStep = stagingAll.indexOf('runStep("business-fixture-setup"');
  const businessStep = stagingAll.indexOf('runStep("mutable-business-cycles"');
  assert.ok(
    accountSetupStep > 0 &&
      browserStep > accountSetupStep &&
      fixtureStep > browserStep &&
      businessStep > fixtureStep,
  );
});

test("Playwright role suite uses the shared account JSON and covers every ERP role", () => {
  for (const role of machineRoles) assert.match(helpers, new RegExp(`\"${role}\"`));
  for (const role of nonAdminRoles) assert.match(rolesSpec, new RegExp(`role: \"${role}\"`));
  assert.match(helpers, /E2E_ROLE_ACCOUNTS_JSON/);
  assert.match(envCheck, /E2E_ROLE_ACCOUNTS_JSON/);
  assert.match(stagingGate, /E2E_ROLE_ACCOUNTS_JSON: \$\{\{ secrets\.E2E_ROLE_ACCOUNTS_JSON \}\}/);
  assert.match(stagingGate, /E2E_REQUIRE_ALL_ROLES: "true"/);
  for (const variable of [
    "E2E_CUSTOMER_SERVICE_EMAIL",
    "E2E_TECHNICIAN_EMAIL",
    "E2E_SHIPPING_EMAIL",
  ]) {
    assert.match(environmentTemplate, new RegExp(variable));
    assert.match(envCheck, new RegExp(variable));
  }
});

test("all Playwright entry points use the same runner version", () => {
  for (const source of [packageJson, ci, stagingGate]) {
    assert.match(source, /@playwright\/test@1\.62\.1/);
    assert.doesNotMatch(source, /@playwright\/test@1\.55\.0/);
  }
});

test("manual mutable GitHub acceptance prepares accounts and fixtures before business cycles", () => {
  const mutableStart = stagingAcceptance.indexOf("mutable-business-cycles:");
  const mutable = stagingAcceptance.slice(mutableStart);
  assert.match(mutable, /STAGING_ACCOUNT_SETUP_CONFIRMED: isolated-staging-only/);
  assert.match(mutable, /staging:accounts:setup -- --validate-config/);
  assert.match(mutable, /staging:fixtures:setup -- --validate-config/);
  const reconcile = mutable.indexOf("npm run staging:accounts:setup");
  const fixture = mutable.indexOf("npm run staging:fixtures:setup");
  const businessRun = mutable.indexOf("npm run test:e2e-business-staging");
  assert.ok(reconcile > 0 && fixture > reconcile && businessRun > fixture);
});
