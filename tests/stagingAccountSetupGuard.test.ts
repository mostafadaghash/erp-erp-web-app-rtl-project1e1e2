import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  accountRoles,
  buildRoleAccounts,
  generatedRoleEmail,
} from "../scripts/staging-account-setup.mjs";

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const setupScript = read("scripts/staging-account-setup.mjs");
const browserScript = read("scripts/staging-browser-e2e.mjs");
const employeesPage = read("src/components/EmployeesPage.tsx");
const sidebar = read("src/components/Sidebar.tsx");
const packageJson = read("package.json");
const environmentTemplate = read(".env.staging.example");
const gitignore = read(".gitignore");

test("bulk Staging account setup preserves admin and creates seven unique roles", () => {
  const accounts = buildRoleAccounts({
    admin: {
      role: "admin",
      email: "existing-admin@example.invalid",
      password: "admin-password-for-test",
    },
    deploymentId: "erp-stage",
    passwordFactory: (role: string) => `generated-${role}-password`,
  });

  assert.deepEqual(
    accounts.map((account) => account.role),
    accountRoles,
  );
  assert.equal(accounts[0].email, "existing-admin@example.invalid");
  assert.equal(
    accounts.filter((account) => account.role !== "admin").length,
    7,
  );
  assert.equal(new Set(accounts.map((account) => account.email)).size, 8);
  assert.equal(
    generatedRoleEmail("customer_service", "erp-stage"),
    "e2e-customer-service-erp-stage@staging.invalid",
  );
});

test("bulk Staging account setup resumes configured non-admin accounts", () => {
  const manager = {
    role: "manager",
    email: "existing-manager@example.invalid",
    password: "existing-manager-password",
  };
  const accounts = buildRoleAccounts({
    admin: {
      role: "admin",
      email: "existing-admin@example.invalid",
      password: "admin-password-for-test",
    },
    existing: [manager],
    deploymentId: "erp-stage",
    passwordFactory: (role: string) => `generated-${role}-password`,
  });
  assert.deepEqual(
    accounts.find((account) => account.role === "manager"),
    manager,
  );
});

test("bulk setup uses the real invitation UI and never writes Auth tables directly", () => {
  assert.match(
    packageJson,
    /"staging:accounts:setup": "node scripts\/staging-account-setup\.mjs"/,
  );
  assert.match(setupScript, /employee-create-submit/);
  assert.match(setupScript, /employee-invite-link/);
  assert.match(setupScript, /name: "إنشاء حساب"/);
  assert.match(setupScript, /current-user-role/);
  assert.match(setupScript, /STAGING_ACCOUNT_SETUP_CONFIRMED/);
  assert.match(setupScript, /stagingOrigins\(\)/);
  assert.doesNotMatch(
    setupScript,
    /convex\s+run|ctx\.db|db\.insert|createFirstAdmin/,
  );
});

test("bulk setup selectors are stable and expose no new credential field", () => {
  for (const id of [
    "employee-create-open",
    "employee-row",
    "employee-name",
    "employee-email",
    "employee-role",
    "employee-branch",
    "employee-create-submit",
    "employee-invite-link",
    "employee-invite-close",
  ]) {
    assert.match(employeesPage, new RegExp(`data-testid="${id}"`));
  }
  assert.match(sidebar, /data-testid="current-user-role"/);
  assert.doesNotMatch(employeesPage, /data-(?:password|invite-code)=/);
});

test("local generated credentials remain ignored and feed the full role matrix", () => {
  assert.match(gitignore, /^\*\.local$/m);
  assert.match(setupScript, /\.staging-role-accounts\.json\.local/);
  assert.match(browserScript, /\.staging-role-accounts\.json\.local/);
  assert.match(environmentTemplate, /STAGING_ACCOUNT_SETUP_CONFIRMED=/);
  assert.match(environmentTemplate, /E2E_ACCOUNT_BRANCH_NAME=/);
  assert.doesNotMatch(
    environmentTemplate,
    /@gmail\.com|@hotmail\.com|@outlook\.com/,
  );
});

test("bulk setup validation is offline and does not print credentials", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/staging-account-setup.mjs", "--validate-config"],
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
        E2E_ADMIN_EMAIL: "admin@example.invalid",
        E2E_ADMIN_PASSWORD: "local-admin-password",
        E2E_ACCOUNT_BRANCH_NAME: "E2E Branch",
        E2E_ROLE_ACCOUNTS_JSON: "",
      },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.mode, "validate-only");
  assert.equal(output.existingAdminPreserved, true);
  assert.equal(output.accountsToProvision, 7);
  assert.doesNotMatch(result.stdout, /admin@example|local-admin-password/);
});
