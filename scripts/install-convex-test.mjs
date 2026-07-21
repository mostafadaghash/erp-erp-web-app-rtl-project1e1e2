import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const expected = "d68ff71af511f6030b8e2aaaed2c5c848ff439841a5b06d00b820d981d5236dd562c18d480433cf9bae0a6aad9c09f956f50dd199a240957a28704f920f938f7";
const destination = resolve("node_modules/convex-test");
if (!existsSync(resolve(destination, "package.json"))) {
  const archive = Buffer.from(await readFile(resolve("vendor/convex-test-0.0.38.tgz.base64"), "utf8"), "base64");
  const digest = createHash("sha512").update(archive).digest("hex");
  if (digest !== expected) throw new Error(`convex-test checksum mismatch: ${digest}`);
  const temporaryArchive = resolve("node_modules/.convex-test-0.0.38.tgz");
  await writeFile(temporaryArchive, archive);
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  execFileSync("tar", ["-xzf", temporaryArchive, "-C", destination, "--strip-components=1"], { stdio: "inherit" });
  await rm(temporaryArchive);
}
