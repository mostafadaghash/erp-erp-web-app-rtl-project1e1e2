import { promises as fs } from "node:fs";
import path from "node:path";

const ROOTS = ["src"];
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const replacements = new Map([
  ["خصم السطر", "الخصم"],
  ["إجمالي السطر", "الإجمالي"],
]);

async function collectFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(absolute));
    else if (EXTENSIONS.has(path.extname(entry.name))) files.push(absolute);
  }
  return files;
}

let changedFiles = 0;
for (const root of ROOTS) {
  const files = await collectFiles(root);
  for (const file of files) {
    const original = await fs.readFile(file, "utf8");
    let updated = original;
    for (const [from, to] of replacements) updated = updated.split(from).join(to);
    if (updated !== original) {
      await fs.writeFile(file, updated, "utf8");
      changedFiles += 1;
      console.log(`updated ${file}`);
    }
  }
}

console.log(`Commercial UI terminology normalized in ${changedFiles} file(s).`);
