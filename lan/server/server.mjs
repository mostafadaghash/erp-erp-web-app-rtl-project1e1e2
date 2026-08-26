import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import {
  LAN_API_VERSION,
  LAN_PRODUCT_ID,
  LAN_RUNTIME,
  parseLanServerConfig,
} from "../contracts/runtime.mjs";

function json(response, statusCode, body) {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(payload);
}

export function createLanServer({ now = () => new Date() } = {}) {
  return createServer((request, response) => {
    if (request.method === "GET" && request.url === "/health") {
      json(response, 200, {
        product: LAN_PRODUCT_ID,
        runtime: LAN_RUNTIME.server,
        apiVersion: LAN_API_VERSION,
        status: "ok",
        database: "not_configured",
        timestamp: now().toISOString(),
      });
      return;
    }

    if (request.method === "GET" && request.url === "/ready") {
      json(response, 503, {
        product: LAN_PRODUCT_ID,
        runtime: LAN_RUNTIME.server,
        apiVersion: LAN_API_VERSION,
        status: "not_ready",
        reason: "database_not_configured",
      });
      return;
    }

    json(response, 404, { status: "not_found" });
  });
}

export async function startLanServer(env = process.env) {
  const config = parseLanServerConfig(env);
  const server = createLanServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, resolve);
  });
  return { server, config };
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  const { config } = await startLanServer();
  console.log(
    `DAGHASH ERP LAN foundation listening on http://${config.host}:${config.port}`,
  );
  console.log(
    "Readiness remains blocked until the local PostgreSQL layer is installed.",
  );
}
