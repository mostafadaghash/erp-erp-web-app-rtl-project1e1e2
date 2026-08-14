import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const headers = readFileSync(
  new URL("../public/_headers", import.meta.url),
  "utf8",
);

test("Cloudflare Pages applies the security policy to every route", () => {
  assert.match(headers, /^\/\*$/m);
  assert.match(headers, /Content-Security-Policy:/i);
  assert.match(headers, /default-src\s+'self'/i);
  assert.match(headers, /script-src\s+'self'/i);
  assert.match(headers, /object-src\s+'none'/i);
  assert.match(headers, /base-uri\s+'self'/i);
  assert.match(headers, /form-action\s+'self'/i);
  assert.match(headers, /frame-ancestors\s+'none'/i);
});

test("Cloudflare Pages permits only secure Convex browser transports", () => {
  assert.match(headers, /connect-src[^;]*https:\/\/\*\.convex\.cloud/i);
  assert.match(headers, /connect-src[^;]*wss:\/\/\*\.convex\.cloud/i);
  assert.match(headers, /connect-src[^;]*https:\/\/\*\.convex\.site/i);
  assert.match(headers, /^\s*! Access-Control-Allow-Origin\s*$/m);
  assert.doesNotMatch(headers, /Access-Control-Allow-Origin:\s*\*/i);
});

test("Cloudflare Pages sends the required defense-in-depth headers", () => {
  assert.match(
    headers,
    /Strict-Transport-Security:\s*max-age=31536000;\s*includeSubDomains;\s*preload/i,
  );
  assert.match(headers, /X-Content-Type-Options:\s*nosniff/i);
  assert.match(headers, /X-Frame-Options:\s*DENY/i);
  assert.match(headers, /Referrer-Policy:\s*strict-origin-when-cross-origin/i);
  assert.match(headers, /Permissions-Policy:/i);
  assert.match(headers, /Cross-Origin-Opener-Policy:\s*same-origin/i);
  assert.match(headers, /Cross-Origin-Resource-Policy:\s*same-origin/i);
});
