import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const script = "scripts/staging-env-check.mjs";

function run(env: Record<string, string>) {
  return spawnSync(process.execPath, [script], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

const base = {
  STAGING_ENVIRONMENT: "staging",
  STAGING_BASE_URL: "https://staging.example.com",
  E2E_REQUIRE_ALL_ROLES: "false",
  E2E_PRODUCT_QUERY: "E2E-PRODUCT",
  E2E_ADMIN_EMAIL: "admin@example.test",
  E2E_ADMIN_PASSWORD: "not-a-real-secret",
};

test("staging guard accepts isolated HTTPS staging", () => {
  const result = run(base);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Staging guard passed/);
  assert.doesNotMatch(result.stdout, /not-a-real-secret/);
});

test("staging guard rejects missing required secrets", () => {
  const result = run({ ...base, E2E_ADMIN_PASSWORD: "" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /E2E_ADMIN_PASSWORD/);
});

test("staging guard rejects missing product fixture selector", () => {
  const result = run({ ...base, E2E_PRODUCT_QUERY: "" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /E2E_PRODUCT_QUERY/);
});

test("staging guard rejects production-looking hosts", () => {
  const result = run({ ...base, STAGING_BASE_URL: "https://production.example.com" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /production host/);
});

test("staging guard requires optional role credentials in pairs", () => {
  const result = run({ ...base, E2E_SALES_EMAIL: "sales@example.test", E2E_SALES_PASSWORD: "" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /configured together/);
});
