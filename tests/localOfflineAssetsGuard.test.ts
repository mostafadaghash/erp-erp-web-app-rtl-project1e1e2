import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const indexHtml = readFileSync("index.html", "utf8");
const indexCss = readFileSync("src/index.css", "utf8");

test("local runtime entrypoint does not load external page assets", () => {
  assert.doesNotMatch(indexHtml, /(?:src|href)=["']https?:\/\//i);
  assert.doesNotMatch(indexHtml, /fonts\.googleapis\.com|fonts\.gstatic\.com/i);
});

test("application font stack keeps a local fallback when web fonts are unavailable", () => {
  assert.match(indexCss, /font-family:\s*['"]Tajawal['"],\s*sans-serif/);
});
