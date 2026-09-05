import { generateKeyPairSync } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const outputPath = resolve(process.argv[2] ?? "infra/local/auth.env.local");
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const privatePem = privateKey
  .export({ type: "pkcs8", format: "pem" })
  .toString()
  .trimEnd()
  .replace(/\r?\n/g, " ");
const publicJwk = publicKey.export({ format: "jwk" });
const jwks = JSON.stringify({ keys: [{ use: "sig", ...publicJwk }] });
const content = [
  `JWT_PRIVATE_KEY="${privatePem}"`,
  `JWKS=${jwks}`,
  "SITE_URL=http://127.0.0.1:5173",
  "",
].join("\n");

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, content, { flag: "wx", mode: 0o600 });
console.log("Created local Convex Auth keys without printing secret values.");
