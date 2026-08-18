import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import dotenv from "dotenv";
import {
  launchStagingBrowser,
  observeRuntimeFailures,
  redactEvidence,
  signIn,
} from "./staging-browser-e2e.mjs";
import { stagingOrigins } from "./lib/staging-safety.mjs";

dotenv.config({ path: ".env.staging.local", override: false });

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
    if (typeof fixtures?.branchName === "string" && fixtures.branchName.trim()) {
      return fixtures.branchName.trim();
    }
  }

  throw new Error(
    "E2E_ACCOUNT_BRANCH_NAME or E2E_BUSINESS_FIXTURES_JSON.branchName is required",
  );
}

function configuredAdmin() {
  const email = process.env.E2E_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are required for isolated Staging bootstrap",
    );
  }
  return { role: "admin", email, password };
}

async function exactOption(select, label) {
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
    { testId: await select.getAttribute("data-testid"), expected: label },
    { timeout: 30_000 },
  );

  const options = await select.locator("option").evaluateAll((rows) =>
    rows.map((row) => ({
      value: row.value,
      label: row.textContent?.trim() ?? "",
    })),
  );
  const matches = options.filter(
    (option) => option.value && option.label === label,
  );
  assert.equal(
    matches.length,
    1,
    `Expected exactly one active branch option named: ${label}`,
  );
  return matches[0];
}

async function ensureBranch(page, branchName) {
  await page.getByRole("button", { name: "الفروع", exact: true }).click();
  await page
    .getByRole("main")
    .getByRole("heading", { name: "الفروع", exact: true })
    .waitFor({ timeout: 30_000 });

  const search = page.locator('input[placeholder="بحث بالاسم أو العنوان..."]');
  await search.fill(branchName);
  await page.waitForTimeout(200);

  let matches = page.getByRole("heading", { name: branchName, exact: true });
  let count = await matches.count();
  assert.ok(count <= 1, `Staging branch name is ambiguous: ${branchName}`);

  if (count === 0) {
    await page.getByRole("button", { name: "فرع جديد", exact: true }).click();
    await page
      .locator('input[placeholder="مثال: الفرع الرئيسي"]')
      .fill(branchName);
    await page
      .locator('input[placeholder="عنوان الفرع"]')
      .fill("Staging E2E - isolated test branch");
    await page.getByRole("button", { name: "إضافة الفرع", exact: true }).click();
    await page
      .getByText("تم إضافة الفرع بنجاح", { exact: false })
      .last()
      .waitFor({ state: "visible", timeout: 30_000 });
    await search.fill(branchName);
    matches = page.getByRole("heading", { name: branchName, exact: true });
    await matches.waitFor({ state: "visible", timeout: 30_000 });
    count = await matches.count();
    assert.equal(count, 1, `Created Staging branch did not appear: ${branchName}`);
    console.log(`[staging:bootstrap] branch created: ${branchName}`);
  } else {
    console.log(`[staging:bootstrap] branch found: ${branchName}`);
  }

  const heading = matches.first();
  const card = heading.locator("xpath=ancestor::div[contains(@class,'bg-white')][1]");
  const text = await card.textContent();
  if (text?.includes("متوقف")) {
    await card.getByTitle("تعديل").click();
    const modal = page.locator("div.fixed.inset-0");
    await modal.waitFor({ state: "visible", timeout: 30_000 });
    await modal.getByRole("button", { name: "متوقف", exact: false }).click();
    await modal
      .getByRole("button", { name: "حفظ التعديلات", exact: true })
      .click();
    await page
      .getByText("تم تحديث الفرع", { exact: false })
      .last()
      .waitFor({ state: "visible", timeout: 30_000 });
    console.log(`[staging:bootstrap] branch reactivated: ${branchName}`);
  }

  const workingBranch = page.getByTestId("working-branch-select");
  const target = await exactOption(workingBranch, branchName);
  if ((await workingBranch.inputValue()) !== target.value) {
    await workingBranch.selectOption(target.value);
    await page
      .getByText("تم تغيير فرع العمل", { exact: false })
      .last()
      .waitFor({ state: "visible", timeout: 30_000 });
    console.log(`[staging:bootstrap] admin working branch assigned: ${branchName}`);
  } else {
    console.log(`[staging:bootstrap] admin working branch already assigned: ${branchName}`);
  }
}

async function runAccountSetup() {
  const script = resolve("scripts/staging-account-setup.mjs");
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [script], {
      stdio: "inherit",
      env: process.env,
    });
    child.once("error", rejectPromise);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(
        new Error(
          `Staging account setup failed (${signal ? `signal ${signal}` : `exit ${code}`})`,
        ),
      );
    });
  });
}

async function main() {
  if (process.env.STAGING_ACCOUNT_SETUP_CONFIRMED !== "isolated-staging-only") {
    throw new Error(
      "STAGING_ACCOUNT_SETUP_CONFIRMED must equal isolated-staging-only",
    );
  }

  const origins = stagingOrigins();
  assert.equal(
    origins.convexDeploymentId,
    "academic-puma-235",
    "Bootstrap is locked to the isolated Staging deployment academic-puma-235",
  );

  const admin = configuredAdmin();
  const branchName = configuredBranchName();
  const browser = await launchStagingBrowser();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "ar-EG",
    timezoneId: "Africa/Cairo",
  });
  const page = await context.newPage();
  const runtimeFailures = observeRuntimeFailures(page, origins.frontend.origin);

  try {
    await signIn(page, origins.frontend.origin, admin);
    await ensureBranch(page, branchName);
    assert.deepEqual(runtimeFailures, [], "Staging bootstrap browser failures");
  } finally {
    await context.close();
    await browser.close();
  }

  await runAccountSetup();
  console.log(
    "Staging bootstrap passed: branch ready, admin assigned, seven non-admin roles provisioned and verified.",
  );
}

try {
  await main();
} catch (error) {
  console.error(
    redactEvidence(error instanceof Error ? error.message : String(error)),
  );
  process.exitCode = 1;
}
