import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  safeStagingSummary,
  stagingOrigins,
} from "./lib/staging-safety.mjs";

const outputRoot = resolve("test-results/staging-preflight");
const maximumAssetBytes = 15 * 1024 * 1024;
const maximumBundleBytes = 30 * 1024 * 1024;

function securityHeaders(response) {
  const headers = response.headers;
  const csp = headers.get("content-security-policy") ?? "";
  assert.match(csp, /default-src\s+'self'/i);
  assert.match(csp, /frame-ancestors\s+'none'/i);
  assert.match(headers.get("strict-transport-security") ?? "", /max-age=/i);
  assert.equal(headers.get("x-content-type-options")?.toLowerCase(), "nosniff");
  assert.equal(headers.get("x-frame-options")?.toUpperCase(), "DENY");
  assert.ok(headers.get("referrer-policy"));
  assert.ok(headers.get("permissions-policy"));
  assert.notEqual(headers.get("access-control-allow-origin"), "*");
  return {
    contentSecurityPolicy: true,
    strictTransportSecurity: true,
    contentTypeProtection: true,
    frameProtection: true,
    referrerPolicy: true,
    permissionsPolicy: true,
    wildcardCors: false,
  };
}

async function fetchText(url, label) {
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
    headers: { "User-Agent": "erp-staging-preflight/1.0" },
  });
  assert.ok(response.ok, `${label} returned HTTP ${response.status}`);
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  assert.ok(
    !declaredLength || declaredLength <= maximumAssetBytes,
    `${label} exceeds the safe asset limit`,
  );
  const text = await response.text();
  assert.ok(Buffer.byteLength(text) <= maximumAssetBytes, `${label} is too large`);
  return { response, text };
}

function moduleAssetUrls(html, frontend) {
  const urls = [];
  const pattern = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  for (const match of html.matchAll(pattern)) {
    const url = new URL(match[1], frontend);
    assert.equal(url.origin, frontend.origin, "Frontend modules must be same-origin");
    urls.push(url);
  }
  assert.ok(urls.length > 0, "Staging HTML must reference a JavaScript module");
  return [...new Map(urls.map((url) => [url.href, url])).values()];
}

async function verifyFrontendBinding(origins, html) {
  const modules = moduleAssetUrls(html, origins.frontend);
  let combined = "";
  let totalBytes = 0;
  for (const url of modules) {
    const { text } = await fetchText(url, `Frontend module ${url.pathname}`);
    totalBytes += Buffer.byteLength(text);
    assert.ok(totalBytes <= maximumBundleBytes, "Frontend bundle exceeds safe limit");
    combined += `\n${text}`;
  }
  assert.ok(
    combined.includes(origins.convexCloud.origin),
    "Published frontend is not bound to STAGING_CONVEX_URL",
  );
  const convexOrigins = new Set(
    combined.match(/https:\/\/[a-z0-9-]+\.convex\.cloud/gi) ?? [],
  );
  assert.deepEqual(
    [...convexOrigins],
    [origins.convexCloud.origin],
    "Published bundle contains an unexpected Convex cloud origin",
  );
  const productionConvex = process.env.PRODUCTION_CONVEX_URL?.trim();
  if (productionConvex) assert.ok(!combined.includes(productionConvex));
  return {
    moduleCount: modules.length,
    bundleBytes: totalBytes,
    expectedConvexOriginOnly: true,
  };
}

async function verifyAuthIssuer(origins) {
  const endpoint = new URL("/.well-known/openid-configuration", origins.convexSite);
  const { response, text } = await fetchText(endpoint, "Convex auth discovery");
  assert.match(response.headers.get("content-type") ?? "", /json/i);
  const discovery = JSON.parse(text);
  assert.equal(discovery.issuer, origins.convexSite.origin);
  const jwks = new URL(discovery.jwks_uri);
  assert.equal(jwks.origin, origins.convexSite.origin);
  assert.equal(jwks.pathname, "/.well-known/jwks.json");
  return { issuerMatches: true, jwksOriginMatches: true };
}

async function main() {
  const origins = stagingOrigins();
  const summary = safeStagingSummary(origins);
  if (process.argv.includes("--validate-config")) {
    console.log(JSON.stringify({ mode: "validate-only", ...summary }));
    return;
  }
  await mkdir(outputRoot, { recursive: true });
  const { response, text: html } = await fetchText(
    origins.frontend,
    "Staging frontend",
  );
  const report = {
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    ...summary,
    securityHeaders: securityHeaders(response),
    frontendBinding: await verifyFrontendBinding(origins, html),
    authDiscovery: await verifyAuthIssuer(origins),
  };
  const evidencePath = join(outputRoot, "acceptance.json");
  await writeFile(evidencePath, `${JSON.stringify(report, null, 2)}\n`);
  console.log("Staging frontend, Convex binding, auth issuer, and headers passed.");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
