import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const roots = ["src", "convex"];

function filesUnder(directory) {
  const absolute = join(root, directory);
  return readdirSync(absolute).flatMap((name) => {
    const path = join(absolute, name);
    if (path.includes("_generated")) return [];
    return statSync(path).isDirectory() ? filesUnder(relative(root, path)) : [path];
  });
}

const checks = [
  { label: "anonymous sign-in", pattern: /signIn\s*\(\s*["']anonymous["']/ },
  { label: "Anonymous auth provider", pattern: /auth\/providers\/Anonymous|\bAnonymous\b.*provider/i },
  { label: "legacy wildcard permission", pattern: /["'](?:view|create|edit|delete|print)_all["']/ },
  { label: "Saudi locale", pattern: /ar-SA|ر\.س|\bSAR\b|\b966\d{7,}/ },
];

const failures = [];
for (const file of roots.flatMap(filesUnder)) {
  const text = readFileSync(file, "utf8");
  for (const check of checks) {
    if (check.pattern.test(text)) failures.push(`${relative(root, file)}: ${check.label}`);
  }
}

const auth = readFileSync(join(root, "convex/auth.ts"), "utf8");
if (!/providers:\s*\[passwordProvider\]/.test(auth)) failures.push("convex/auth.ts: password-only provider invariant");

const audit = readFileSync(join(root, "convex/auditLogs.ts"), "utf8");
if (/export const (?:log|clear)\s*=/.test(audit)) failures.push("convex/auditLogs.ts: audit log must be append-only");

if (failures.length) {
  console.error("Security checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Security checks passed.");
