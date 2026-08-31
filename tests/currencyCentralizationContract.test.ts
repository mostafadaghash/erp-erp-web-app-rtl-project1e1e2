import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

const ROOTS = ["src", "convex", "shared"];
const ALLOWED_CENTRAL_FILES = new Set([
  "src/lib/currency.ts",
  "shared/currency.ts",
]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
const HARDCODED_CURRENCY = /(?:\bEGP\b|ج\.م)/g;

function extension(path: string) {
  const match = path.match(/(\.[^.\\/]+)$/);
  return match?.[1] ?? "";
}

function collectFiles(dir: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const normalized = path.replaceAll("\\", "/");
    if (normalized.includes("/node_modules/") || normalized.includes("/convex/_generated/")) continue;
    const stats = statSync(path);
    if (stats.isDirectory()) result.push(...collectFiles(path));
    else if (SOURCE_EXTENSIONS.has(extension(path))) result.push(path);
  }
  return result;
}

test("CURRENCY-01 currency codes and EGP labels are centralized", () => {
  const violations: string[] = [];
  for (const root of ROOTS) {
    for (const file of collectFiles(root)) {
      const repoPath = relative(".", file).replaceAll("\\", "/");
      if (ALLOWED_CENTRAL_FILES.has(repoPath)) continue;
      const lines = readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line, index) => {
        HARDCODED_CURRENCY.lastIndex = 0;
        if (HARDCODED_CURRENCY.test(line)) violations.push(`${repoPath}:${index + 1}: ${line.trim()}`);
      });
    }
  }

  assert.equal(
    violations.length,
    0,
    `Hard-coded currency references must use the central currency module:\n${violations.join("\n")}`,
  );
});
