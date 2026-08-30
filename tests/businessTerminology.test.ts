import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOTS = ["src", "convex", "shared"];
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const prohibited = [
  "معكوسة",
  "معكوس",
  "العكسية",
  "عكسية",
  "العكس",
  "عكسه",
  "عكسها",
  "عكسهم",
  "عكس",
  "الإبطال",
  "إبطال",
  "مبطلة",
  "مبطل",
];
const arabicWord = (word: string) => new RegExp(`(?<![\\p{L}\\p{N}_])${word}(?![\\p{L}\\p{N}_])`, "gu");

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

test("واجهات النظام تستخدم مسميات تجارية بسيطة للإلغاء", async () => {
  const files = (await Promise.all(ROOTS.map(collectFiles))).flat();
  const violations: string[] = [];
  for (const file of files) {
    const content = await fs.readFile(file, "utf8");
    for (const word of prohibited) {
      const regex = arabicWord(word);
      let match: RegExpExecArray | null;
      while ((match = regex.exec(content)) !== null) {
        const line = content.slice(0, match.index).split("\n").length;
        violations.push(`${file}:${line} يحتوي على «${word}»`);
      }
    }
  }
  assert.deepEqual(violations, [], violations.join("\n"));
});
