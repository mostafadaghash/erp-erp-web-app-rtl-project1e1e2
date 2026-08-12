import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import {
  safeStagingSummary,
  stagingOrigins,
} from "./lib/staging-safety.mjs";

const origins = stagingOrigins();
const outputRoot = resolve("test-results/staging-load");

function boundedInteger(name, fallback, minimum, maximum) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

const concurrency = boundedInteger("LOAD_CONCURRENCY", 256, 1, 256);
const totalRequests = boundedInteger("LOAD_REQUESTS", 25_000, concurrency, 50_000);
const timeoutMs = boundedInteger("LOAD_TIMEOUT_MS", 15_000, 1_000, 60_000);
const p95LimitMs = boundedInteger("LOAD_P95_LIMIT_MS", 2_000, 100, 60_000);
const confirmation = process.env.E2E_LOAD_CONFIRMED;

if (confirmation !== "isolated-staging-only") {
  throw new Error(
    "E2E_LOAD_CONFIRMED must equal isolated-staging-only before load testing",
  );
}

if (process.argv.includes("--validate-config")) {
  console.log(
    JSON.stringify({
      mode: "validate-only",
      ...safeStagingSummary(origins),
      requests: totalRequests,
      concurrency,
      timeoutMs,
      p95LimitMs,
      targets: ["frontend", "convex-uncached-query"],
    }),
  );
  process.exit(0);
}

const runId = Date.now().toString(36).toUpperCase();
const timings = [];
const targetStats = {
  frontend: { issued: 0, completed: 0, failures: 0, bytes: 0 },
  convex: { issued: 0, completed: 0, failures: 0, bytes: 0 },
};
let nextRequest = 0;

async function readResponseBytes(response) {
  const bytes = await response.arrayBuffer();
  return { bytes: bytes.byteLength, text: new TextDecoder().decode(bytes) };
}

async function hitFrontend() {
  const response = await fetch(origins.frontend, {
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "User-Agent": "erp-staging-full-load/1.0" },
  });
  const body = await response.arrayBuffer();
  assert.ok(response.ok, `Frontend returned HTTP ${response.status}`);
  targetStats.frontend.bytes += body.byteLength;
}

async function hitConvex(requestNumber) {
  const endpoint = new URL("/api/query", origins.convexCloud);
  const response = await fetch(endpoint, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "erp-staging-full-load/1.0",
    },
    body: JSON.stringify({
      path: "repairs:getByTracking",
      args: { token: `LOAD${runId}${requestNumber.toString(36).toUpperCase()}` },
      format: "json",
    }),
  });
  const body = await readResponseBytes(response);
  targetStats.convex.bytes += body.bytes;
  assert.ok(response.ok, `Convex returned HTTP ${response.status}`);
  const payload = JSON.parse(body.text);
  assert.equal(payload.status, "success", "Convex query returned an API failure");
}

async function worker() {
  while (true) {
    const requestNumber = nextRequest++;
    if (requestNumber >= totalRequests) return;
    const target = requestNumber % 2 === 0 ? "frontend" : "convex";
    targetStats[target].issued += 1;
    const started = performance.now();
    try {
      if (target === "frontend") await hitFrontend();
      else await hitConvex(requestNumber);
      targetStats[target].completed += 1;
    } catch {
      targetStats[target].failures += 1;
    } finally {
      timings.push(performance.now() - started);
    }
  }
}

const runStarted = performance.now();
await Promise.all(Array.from({ length: concurrency }, () => worker()));
const durationMs = performance.now() - runStarted;
timings.sort((left, right) => left - right);
const percentile = (value) =>
  timings[
    Math.min(timings.length - 1, Math.ceil(timings.length * value) - 1)
  ] ?? 0;
const failures = targetStats.frontend.failures + targetStats.convex.failures;
const failureRate = failures / totalRequests;
const result = {
  ...safeStagingSummary(origins),
  requests: totalRequests,
  concurrency,
  durationSeconds: Number((durationMs / 1000).toFixed(2)),
  failures,
  failureRate,
  requestsPerSecond: Number((totalRequests / (durationMs / 1000)).toFixed(2)),
  latencyMs: {
    p50: Number(percentile(0.5).toFixed(2)),
    p95: Number(percentile(0.95).toFixed(2)),
    p99: Number(percentile(0.99).toFixed(2)),
    max: Number((timings.at(-1) ?? 0).toFixed(2)),
  },
  targets: targetStats,
};
await mkdir(outputRoot, { recursive: true });
await writeFile(
  resolve(outputRoot, "acceptance.json"),
  `${JSON.stringify(result, null, 2)}\n`,
);
console.log(JSON.stringify(result, null, 2));
if (failureRate > 0.01 || result.latencyMs.p95 > p95LimitMs) process.exit(1);
