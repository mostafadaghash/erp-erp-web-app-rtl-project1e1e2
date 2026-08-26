import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  LAN_CONVEX_BASELINE,
  LAN_DOMAINS,
  LAN_TABLES,
} from "../lan/migration-manifest.mjs";
import { parseLanServerConfig } from "../lan/contracts/runtime.mjs";
import { createLanServer } from "../lan/server/server.mjs";

test("LAN migration manifest covers every Convex table exactly once", async () => {
  const schema = await readFile("convex/schema.ts", "utf8");
  const schemaTables = [
    ...schema.matchAll(/^\s*([A-Za-z][A-Za-z0-9_]*):\s*defineTable/gm),
  ]
    .map((match) => match[1])
    .sort();
  const manifestTables = LAN_TABLES.map((entry) => entry.sourceTable).sort();

  assert.deepEqual(manifestTables, schemaTables);
  assert.equal(new Set(manifestTables).size, manifestTables.length);
  assert.equal(manifestTables.length, LAN_CONVEX_BASELINE.schemaTables);
  assert.deepEqual(
    LAN_DOMAINS.map((domain) => domain.order),
    [...LAN_DOMAINS].map((domain) => domain.order).sort((a, b) => a - b),
  );
});

test("LAN server configuration is safe by default and validates its port", () => {
  assert.deepEqual(parseLanServerConfig({}), { host: "127.0.0.1", port: 4783 });
  assert.deepEqual(
    parseLanServerConfig({
      LAN_SERVER_HOST: "0.0.0.0",
      LAN_SERVER_PORT: "4784",
    }),
    {
      host: "0.0.0.0",
      port: 4784,
    },
  );
  assert.throws(
    () => parseLanServerConfig({ LAN_SERVER_PORT: "80" }),
    /between 1024 and 65535/,
  );
  assert.throws(
    () => parseLanServerConfig({ LAN_SERVER_PORT: "not-a-number" }),
    /between 1024 and 65535/,
  );
});

test("LAN foundation exposes health but blocks readiness before PostgreSQL", async (t) => {
  const server = createLanServer({
    now: () => new Date("2026-08-26T00:00:00.000Z"),
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;

  const health = await fetch(`${origin}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), {
    product: "daghash-erp",
    runtime: "windows-lan-server",
    apiVersion: "v1",
    status: "ok",
    database: "not_configured",
    timestamp: "2026-08-26T00:00:00.000Z",
  });
  assert.equal(health.headers.get("cache-control"), "no-store");
  assert.equal(health.headers.get("access-control-allow-origin"), null);

  const ready = await fetch(`${origin}/ready`);
  assert.equal(ready.status, 503);
  assert.equal((await ready.json()).reason, "database_not_configured");

  const missing = await fetch(`${origin}/unknown`);
  assert.equal(missing.status, 404);
});

test("Cloud remains the only production runtime until LAN readiness is implemented", async () => {
  const entry = await readFile("src/main.tsx", "utf8");
  assert.match(entry, /VITE_CONVEX_URL/);
  assert.match(entry, /ConvexAuthProvider/);
  assert.doesNotMatch(entry, /windows-lan-server|LAN_SERVER_HOST/);
});
