export const LAN_PRODUCT_ID = "daghash-erp";
export const LAN_API_VERSION = "v1";
export const LAN_RUNTIME = Object.freeze({
  server: "windows-lan-server",
  client: "windows-lan-client",
});

export function parseLanServerConfig(env = process.env) {
  const host = String(env.LAN_SERVER_HOST || "127.0.0.1").trim();
  const port = Number(env.LAN_SERVER_PORT || 4783);

  if (!host) throw new Error("LAN_SERVER_HOST must not be empty");
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(
      "LAN_SERVER_PORT must be an integer between 1024 and 65535",
    );
  }

  return Object.freeze({ host, port });
}
