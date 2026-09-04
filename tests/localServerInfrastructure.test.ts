import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const compose = readFileSync("infra/local/docker-compose.yml", "utf8");
const runtimeTemplate = readFileSync("infra/local/runtime.env.example", "utf8");
const bootstrap = readFileSync("scripts/local/bootstrap.ps1", "utf8");
const gitignore = readFileSync(".gitignore", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts: Record<string, string>;
};

test("local server uses PostgreSQL 17 with persistent PostgreSQL and Convex volumes", () => {
  assert.match(compose, /POSTGRES_IMAGE:-postgres:17-alpine/);
  assert.match(compose, /postgres_data:\/var\/lib\/postgresql\/data/);
  assert.match(compose, /convex_data:\/convex\/data/);
  assert.match(
    compose,
    /POSTGRES_URL: postgresql:\/\/\$\{POSTGRES_USER\}:\$\{POSTGRES_PASSWORD\}@postgres:5432/,
  );
  assert.match(compose, /DO_NOT_REQUIRE_SSL: "1"/);
});

test("local server keeps the database private and initially binds application ports to loopback", () => {
  const postgresService =
    compose.match(/  postgres:[\s\S]*?\n  backend:/)?.[0] ?? "";
  assert.ok(postgresService);
  assert.doesNotMatch(postgresService, /\n    ports:/);
  assert.match(compose, /127\.0\.0\.1:\$\{PORT:-3210\}:3210/);
  assert.match(compose, /127\.0\.0\.1:\$\{SITE_PROXY_PORT:-3211\}:3211/);
  assert.match(compose, /127\.0\.0\.1:\$\{DASHBOARD_PORT:-6791\}:6791/);
});

test("local Convex waits for PostgreSQL and the dashboard waits for Convex health", () => {
  assert.match(compose, /postgres:\s*\n        condition: service_healthy/);
  assert.match(compose, /curl -fsS http:\/\/localhost:3210\/version/);
  assert.match(compose, /backend:\s*\n        condition: service_healthy/);
});

test("runtime secrets are generated locally and ignored by git", () => {
  assert.match(
    runtimeTemplate,
    /POSTGRES_PASSWORD=GENERATED_LOCALLY_DO_NOT_COMMIT/,
  );
  assert.match(bootstrap, /RandomNumberGenerator/);
  assert.match(bootstrap, /generate_admin_key\.sh/);
  assert.match(gitignore, /infra\/local\/runtime\.env\.local/);
  assert.match(gitignore, /infra\/local\/cli\.env\.local/);
  assert.match(gitignore, /\.env\.local-server\.local/);
  assert.doesNotMatch(bootstrap, /Write-Host\s+\$password/);
  assert.doesNotMatch(bootstrap, /Write-Host\s+\$adminKey/);
});

test("local bootstrap does not overwrite cloud deployment variables", () => {
  assert.doesNotMatch(bootstrap, /CONVEX_DEPLOYMENT/);
  assert.doesNotMatch(
    bootstrap,
    /Join-Path \$projectRoot ["']\.env\.local["']/,
  );
  assert.match(bootstrap, /\.env\.local-server\.local/);
  assert.match(bootstrap, /VITE_CONVEX_URL=http:\/\/127\.0\.0\.1:3210/);
});

test("package scripts expose controlled local lifecycle commands", () => {
  assert.match(
    packageJson.scripts["local:bootstrap"],
    /scripts\/local\/bootstrap\.ps1/,
  );
  assert.match(
    packageJson.scripts["local:status"],
    /scripts\/local\/status\.ps1/,
  );
  assert.match(packageJson.scripts["local:up"], /docker compose/);
  assert.match(packageJson.scripts["local:down"], /docker compose/);
  assert.match(packageJson.scripts["local:frontend"], /--mode local-server/);
});

test("PowerShell forwards Docker detach and log flags as literal Compose arguments", () => {
  assert.match(bootstrap, /Invoke-Compose -ComposeArgs @\("up", "-d"\)/);
  assert.match(
    bootstrap,
    /Invoke-Compose -ComposeArgs @\("logs", "--tail", "120", "backend", "postgres"\)/,
  );
  assert.doesNotMatch(bootstrap, /Invoke-Compose up -d/);
});

test("Windows PowerShell captures only the generated admin key without leaking it", () => {
  assert.match(
    bootstrap,
    /\$previousErrorActionPreference = \$ErrorActionPreference/,
  );
  assert.match(bootstrap, /\$ErrorActionPreference = "Continue"/);
  assert.match(bootstrap, /generate_admin_key\.sh 2>\$null/);
  assert.match(
    bootstrap,
    /\$ErrorActionPreference = \$previousErrorActionPreference/,
  );
  assert.match(bootstrap, /\$adminExitCode = \$LASTEXITCODE/);
  assert.doesNotMatch(bootstrap, /Write-Host\s+\$adminKey/);
});
