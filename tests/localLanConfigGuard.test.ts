import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("local compose stays localhost-only unless LAN mode explicitly overrides backend binding", async () => {
  const compose = await read("infra/local/docker-compose.yml");
  assert.match(compose, /\$\{BACKEND_BIND_HOST:-127\.0\.0\.1\}:\$\{PORT:-3210\}:3210/);
  assert.match(compose, /\$\{BACKEND_BIND_HOST:-127\.0\.0\.1\}:\$\{SITE_PROXY_PORT:-3211\}:3211/);
  assert.match(compose, /127\.0\.0\.1:\$\{DASHBOARD_PORT:-6791\}:6791/);
  assert.doesNotMatch(compose, /5432:5432/);
});

test("local runtime template defaults backend binding to loopback", async () => {
  const runtime = await read("infra/local/runtime.env.example");
  assert.match(runtime, /^BACKEND_BIND_HOST=127\.0\.0\.1$/m);
  assert.match(runtime, /^CONVEX_CLOUD_ORIGIN=http:\/\/127\.0\.0\.1:3210$/m);
});

test("LAN launcher creates ignored machine-specific configuration and keeps dashboard local", async () => {
  const script = await read("scripts/local/lan-up.ps1");
  assert.match(script, /runtime\.lan\.env\.local/);
  assert.match(script, /\.env\.local-server-lan\.local/);
  assert.match(script, /BACKEND_BIND_HOST[^\n]+0\.0\.0\.0/);
  assert.match(script, /Test-PrivateIPv4/);
  assert.match(script, /Dashboard remains localhost-only/);
  assert.doesNotMatch(script, /POSTGRES_PASSWORD[^\n]*Write-Host/);
});

test("package exposes explicit LAN commands without changing default local commands", async () => {
  const pkg = JSON.parse(await read("package.json"));
  assert.equal(pkg.scripts["local:up"], "docker compose --env-file infra/local/runtime.env.local -f infra/local/docker-compose.yml up -d");
  assert.equal(pkg.scripts["local:lan:up"], "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/local/lan-up.ps1");
  assert.equal(pkg.scripts["local:lan:frontend"], "vite --mode local-server-lan --host 0.0.0.0 --open");
});
