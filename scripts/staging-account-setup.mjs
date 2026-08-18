import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import dotenv from "dotenv";
import {
  gotoStagingPage,
  launchStagingBrowser,
  observeRuntimeFailures,
  redactEvidence,
  signIn,
} from "./staging-browser-e2e.mjs";
import { stagingOrigins } from "./lib/staging-safety.mjs";

dotenv.config({ path: ".env.staging.local", override: false });

export const accountRoles = [
  "admin",
  "manager",
  "sales",
  "customer_service",
  "technician",
  "accountant",
  "shipping",
  "viewer",
];

const provisionedRoles = accountRoles.filter((role) => role !== "admin");
const credentialsPath = resolve(".staging-role-accounts.json.local");
const outputRoot = resolve("test-results/staging-account-setup");
const reportPath = resolve(outputRoot, "acceptance.json");

const roleNames = {
  manager: "اختبار Staging - مدير فرع",
  sales: "اختبار Staging - موظف مبيعات",
  customer_service: "اختبار Staging - خدمة العملاء",
  technician: "اختبار Staging - فني صيانة",
  accountant: "اختبار Staging - محاسب",
  shipping: "اختبار Staging - موظف شحن",
  viewer: "اختبار Staging - مشاهد فقط",
};

function configuredBranchName() {
  const explicit = process.env.E2E_ACCOUNT_BRANCH_NAME?.trim();
  if (explicit) return explicit;

  const fixtureJson = process.env.E2E_BUSINESS_FIXTURES_JSON?.trim();
  if (fixtureJson) {
    let fixtures;
    try {
      fixtures = JSON.parse(fixtureJson);
    } catch {
      throw new Error(
        "E2E_BUSINESS_FIXTURES_JSON must be valid JSON when used to derive the account branch",
      );
    }
    const fixtureBranch = fixtures?.branchName;
    if (typeof fixtureBranch === "string" && fixtureBranch.trim()) {
      return fixtureBranch.trim();
    }
  }

  throw new Error(
    "E2E_ACCOUNT_BRANCH_NAME or E2E_BUSINESS_FIXTURES_JSON.branchName is required",
  );
}

function validAccount(account, expectedRole) {
  assert.ok(account && typeof account === "object" && !Array.isArray(account));
  assert.equal(
    account.role,
    expectedRole,
    `Invalid configured role: ${expectedRole}`,
  );
  assert.match(account.email ?? "", /^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  assert.ok(
    typeof account.password === "string" && account.password.length >= 8,
    `Password for ${expectedRole} must contain at least 8 characters`,
  );
  return {
    role: expectedRole,
    email: account.email.trim().toLowerCase(),
    password: account.password,
  };
}

export function generatedRoleEmail(role, deploymentId) {
  assert.ok(
    provisionedRoles.includes(role),
    `Cannot generate account for ${role}`,
  );
  assert.match(deploymentId, /^[a-z0-9-]+$/i);
  return `e2e-${role.replaceAll("_", "-")}-${deploymentId}@staging.invalid`;
}

export function buildRoleAccounts({
  admin,
  existing = [],
  deploymentId,
  passwordFactory = () => `Stg1!${randomBytes(24).toString("base64url")}`,
}) {
  const byRole = new Map();
  for (const account of existing) {
    if (!accountRoles.includes(account?.role)) {
      throw new Error(`Unsupported configured role: ${String(account?.role)}`);
    }
    if (byRole.has(account.role))
      throw new Error(`Duplicate configured role: ${account.role}`);
    byRole.set(account.role, validAccount(account, account.role));
  }
  byRole.set("admin", validAccount(admin, "admin"));

  for (const role of provisionedRoles) {
    if (!byRole.has(role)) {
      byRole.set(
        role,
        validAccount(
          {
            role,
            email: generatedRoleEmail(role, deploymentId),
            password: passwordFactory(role),
          },
          role,
        ),
      );
    }
  }

  const accounts = accountRoles.map((role) => byRole.get(role));
  assert.equal(
    new Set(accounts.map((account) => account.email)).size,
    accountRoles.length,
  );
  return accounts;
}

async function readExistingAccounts() {
  const environmentJson = process.env.E2E_ROLE_ACCOUNTS_JSON?.trim();
  if (environmentJson) {
    try {
      return JSON.parse(environmentJson);
    } catch {
      throw new Error("E2E_ROLE_ACCOUNTS_JSON must be valid JSON");
    }
  }
  try {
    return JSON.parse(await readFile(credentialsPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw new Error("The local Staging account file is invalid");
  }
}

async function setupConfig() {
  const origins = stagingOrigins();
  const existing = await readExistingAccounts();
  if (!Array.isArray(existing)) {
    throw new Error("Staging role accounts must be a JSON array");
  }
  const configuredAdmin = existing.find((account) => account?.role === "admin");
  const environmentAdminEmail = process.env.E2E_ADMIN_EMAIL?.trim();
  const environmentAdminPassword = process.env.E2E_ADMIN_PASSWORD;
  if (Boolean(environmentAdminEmail) !== Boolean(environmentAdminPassword)) {
    throw new Error(
      "E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD must be configured together",
    );
  }
  const admin = environmentAdminEmail
    ? {
        role: "admin",
        email: environmentAdminEmail,
        password: environmentAdminPassword,
      }
    : configuredAdmin;
  if (!admin) {
    throw new Error(
      "E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are required before the first setup run",
    );
  }
  const accounts = buildRoleAccounts({
    admin,
    existing,
    deploymentId: origins.convexDeploymentId,
  });
  return {
    baseUrl: origins.frontend.origin,
    frontendHost: origins.frontend.host,
    branchName: configuredBranchName(),
    accounts,
  };
}

async function saveAccounts(accounts) {
  await writeFile(credentialsPath, `${JSON.stringify(accounts, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

async function writeReport(status, results, errorMessage) {
  await mkdir(outputRoot, { recursive: true });
  await writeFile(
    reportPath,
    `${JSON.stringify(
      {
        formatVersion: 1,
        generatedAt: new Date().toISOString(),
        status,
        requestedRoles: provisionedRoles,
        results,
        ...(errorMessage ? { error: redactEvidence(errorMessage) } : {}),
        credentialsStoredLocally: true,
      },
      null,
      2,
    )}\n`,
  );
}

async function resolveBranchOption(select, branchName) {
  await select.waitFor({ state: "visible", timeout: 30_000 });
  await select.page().waitForFunction(
    ({ testId, expected }) => {
      const element = document.querySelector(`[data-testid="${testId}"]`);
      return (
        element instanceof HTMLSelectElement &&
        [...element.options].some(
          (option) => option.value && option.text.trim() === expected,
        )
      );
    },
    { testId: "employee-branch", expected: branchName },
    { timeout: 30_000 },
  );
  const options = await select.locator("option").evaluateAll((rows) =>
    rows.map((row) => ({
      value: row.value,
      label: row.textContent?.trim() ?? "",
    })),
  );
  const matches = options.filter(
    (option) => option.value && option.label === branchName,
  );
  assert.equal(
    matches.length,
    1,
    `E2E account branch must match exactly one active branch: ${branchName}`,
  );
  return matches[0];
}

async function selectBranch(page, branchName) {
  const select = page.getByTestId("employee-branch");
  const exact = await resolveBranchOption(select, branchName);
  await select.selectOption(exact.value);
  return exact;
}

async function captureInvitation(page) {
  const invitation = page.getByTestId("employee-invite-link");
  try {
    await invitation.waitFor({ state: "visible", timeout: 30_000 });
  } catch (error) {
    const toasts = await page.locator("[data-sonner-toast]").allTextContents();
    throw new Error(
      `Invitation link did not appear. UI messages: ${toasts.join(" | ") || "none"}`,
      { cause: error },
    );
  }
  const value = await invitation.inputValue();
  const url = new URL(value);
  assert.ok(
    url.searchParams.get("invite"),
    "Invitation URL is missing its code",
  );
  assert.ok(
    url.searchParams.get("email"),
    "Invitation URL is missing its email",
  );
  return url;
}

async function verifyRoleLogin(browser, baseUrl, account, invitationUrl) {
  const context = await browser.newContext({
    viewport: { width: 1365, height: 900 },
    locale: "ar-EG",
    timezoneId: "Africa/Cairo",
  });
  const page = await context.newPage();
  try {
    if (invitationUrl) {
      assert.equal(invitationUrl.origin, baseUrl);
      assert.equal(invitationUrl.searchParams.get("email"), account.email);
      await gotoStagingPage(page, invitationUrl.toString());
      await page
        .getByRole("heading", { name: "إنشاء حساب", exact: true })
        .waitFor({ timeout: 45_000 });
      await page.locator('input[name="email"]').fill(account.email);
      await page.locator('input[name="password"]').fill(account.password);
      await page
        .getByRole("button", { name: "إنشاء حساب", exact: true })
        .click();
      await page
        .getByRole("main")
        .getByRole("heading", { name: "لوحة التحكم", exact: true })
        .waitFor({ timeout: 45_000 });
    } else {
      await signIn(page, baseUrl, account);
    }
    const currentRole = page.getByTestId("current-user-role");
    await currentRole.waitFor({ timeout: 30_000 });
    assert.equal(
      await currentRole.getAttribute("data-user-role"),
      account.role,
      `Authenticated role does not match configured account: ${account.role}`,
    );
    if (invitationUrl) {
      await gotoStagingPage(page, baseUrl);
      await page
        .getByRole("main")
        .getByRole("heading", { name: "لوحة التحكم", exact: true })
        .waitFor({ timeout: 45_000 });
    }
    await page.getByRole("button", { name: "تسجيل الخروج", exact: true }).click();
    await page
      .getByRole("heading", { name: "تسجيل الدخول", exact: true })
      .waitFor({ timeout: 30_000 });
  } finally {
    await context.close();
  }
}

function employeeRow(page, email) {
  return page
    .getByTestId("employee-row")
    .filter({ hasText: email })
    .first();
}

async function reconcileExistingBranch(page, row, branchName) {
  await row.getByTitle("تعديل").click();
  const branch = page.getByTestId("employee-branch");
  const target = await resolveBranchOption(branch, branchName);
  const current = await branch.inputValue();
  if (current === target.value) {
    await page.getByRole("button", { name: "إلغاء", exact: true }).click();
    await branch.waitFor({ state: "detached", timeout: 30_000 });
    return false;
  }

  await branch.selectOption(target.value);
  await page.getByTestId("employee-create-submit").click();
  await page
    .getByText("تم تحديث بيانات المستخدم", { exact: false })
    .last()
    .waitFor({ state: "visible", timeout: 30_000 });
  await branch.waitFor({ state: "detached", timeout: 30_000 });
  return true;
}

async function ensureRoleAccount(browser, adminPage, config, account) {
  const search = adminPage.locator(
    'input[placeholder="بحث بالاسم أو الهاتف..."]',
  );
  await search.fill(account.email);
  await adminPage.waitForTimeout(150);
  let row = employeeRow(adminPage, account.email);

  let invitationUrl = null;
  let result;
  if (await row.count()) {
    assert.equal(
      await row.getAttribute("data-employee-role"),
      account.role,
    );
    const branchCorrected = await reconcileExistingBranch(
      adminPage,
      row,
      config.branchName,
    );
    row = employeeRow(adminPage, account.email);
    if (
      (await row.getAttribute("data-invitation-pending")) === "true"
    ) {
      await row.getByTitle("تجديد رابط الدعوة").click();
      invitationUrl = await captureInvitation(adminPage);
      result = branchCorrected
        ? "branch-corrected-pending-invitation-claimed-and-verified"
        : "pending-invitation-claimed-and-verified";
    } else {
      let reactivated = false;
      if ((await row.getAttribute("data-employee-active")) !== "true") {
        await row.getByTitle("تفعيل").click();
        await adminPage.waitForFunction(
          (role) =>
            [...document.querySelectorAll('[data-testid="employee-row"]')].some(
              (element) =>
                element.getAttribute("data-employee-role") === role &&
                element.getAttribute("data-employee-active") === "true",
            ),
          account.role,
        );
        reactivated = true;
      }
      await verifyRoleLogin(browser, config.baseUrl, account, null);
      return {
        role: account.role,
        status: branchCorrected
          ? reactivated
            ? "branch-corrected-reactivated-and-verified"
            : "branch-corrected-and-verified"
          : reactivated
            ? "reactivated-and-verified"
            : "already-active-verified",
      };
    }
  } else {
    await adminPage.getByTestId("employee-create-open").click();
    await adminPage.getByTestId("employee-name").fill(roleNames[account.role]);
    await adminPage.getByTestId("employee-email").fill(account.email);
    await adminPage.getByTestId("employee-role").selectOption(account.role);
    await selectBranch(adminPage, config.branchName);
    await adminPage.getByTestId("employee-create-submit").click();
    invitationUrl = await captureInvitation(adminPage);
    result = "created-and-verified";
  }

  await verifyRoleLogin(browser, config.baseUrl, account, invitationUrl);
  await adminPage.getByTestId("employee-invite-close").click();
  await search.fill("");
  return { role: account.role, status: result };
}

async function main() {
  const config = await setupConfig();
  const validateOnly = process.argv.includes("--validate-config");
  if (validateOnly) {
    console.log(
      JSON.stringify({
        mode: "validate-only",
        frontendHost: config.frontendHost,
        branchConfigured: true,
        existingAdminPreserved: true,
        accountsToProvision: provisionedRoles.length,
      }),
    );
    return;
  }
  if (process.env.STAGING_ACCOUNT_SETUP_CONFIRMED !== "isolated-staging-only") {
    throw new Error(
      "STAGING_ACCOUNT_SETUP_CONFIRMED must equal isolated-staging-only",
    );
  }

  await saveAccounts(config.accounts);
  const browser = await launchStagingBrowser();
  const adminContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "ar-EG",
    timezoneId: "Africa/Cairo",
  });
  const adminPage = await adminContext.newPage();
  const runtimeFailures = observeRuntimeFailures(adminPage, config.baseUrl);
  const results = [];
  try {
    const admin = config.accounts.find((account) => account.role === "admin");
    assert.ok(admin);
    await signIn(adminPage, config.baseUrl, admin);
    await adminPage
      .getByRole("button", { name: "المستخدمون والصلاحيات", exact: true })
      .click();
    await adminPage
      .getByRole("main")
      .getByRole("heading", { name: "المستخدمون والصلاحيات", exact: true })
      .waitFor({ timeout: 30_000 });

    for (const role of provisionedRoles) {
      const account = config.accounts.find(
        (candidate) => candidate.role === role,
      );
      assert.ok(account);
      const result = await ensureRoleAccount(
        browser,
        adminPage,
        config,
        account,
      );
      results.push(result);
      console.log(`[staging:accounts] ${role}: ${result.status}`);
    }
    assert.deepEqual(
      runtimeFailures,
      [],
      "Staging account setup browser failures",
    );
    await writeReport("passed", results);
    console.log(
      "Staging account setup passed for seven non-admin roles. Credentials remain in the ignored local account file.",
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown account setup failure";
    await writeReport("failed", results, message);
    throw error;
  } finally {
    await adminContext.close();
    await browser.close();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    await main();
  } catch (error) {
    console.error(
      redactEvidence(error instanceof Error ? error.message : error),
    );
    process.exitCode = 1;
  }
}
