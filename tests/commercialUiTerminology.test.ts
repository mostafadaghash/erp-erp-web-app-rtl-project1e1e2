import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = "src";
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const prohibitedPhrases = ["خصم السطر", "إجمالي السطر"];

async function collectFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(absolute));
    else if (EXTENSIONS.has(path.extname(entry.name))) files.push(absolute);
  }
  return files;
}

test("واجهات النظام تستخدم مسميات تجارية مختصرة وواضحة", async () => {
  const files = await collectFiles(ROOT);
  const violations: string[] = [];
  for (const file of files) {
    const content = await fs.readFile(file, "utf8");
    for (const phrase of prohibitedPhrases) {
      let fromIndex = 0;
      while (true) {
        const index = content.indexOf(phrase, fromIndex);
        if (index < 0) break;
        const line = content.slice(0, index).split("\n").length;
        violations.push(`${file}:${line} يحتوي على «${phrase}»؛ استخدم «الخصم» أو «الإجمالي» حسب السياق.`);
        fromIndex = index + phrase.length;
      }
    }
  }
  assert.deepEqual(violations, [], violations.join("\n"));
});
