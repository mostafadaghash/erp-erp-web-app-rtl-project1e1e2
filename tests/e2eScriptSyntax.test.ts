import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

const scripts = [
  "scripts/local/fixture-bootstrap.mjs",
  "scripts/local/full-suite.mjs",
  "scripts/staging-account-setup.mjs",
  "scripts/staging-browser-e2e.mjs",
  "scripts/staging-business-e2e.mjs",
  "scripts/lib/staging-safety.mjs",
];

for (const script of scripts) {
  test(`${script} parses as valid JavaScript`, () => {
    const result = spawnSync(process.execPath, ["--check", resolve(script)], {
      cwd: resolve("."),
      encoding: "utf8",
    });

    assert.equal(
      result.status,
      0,
      `${script} failed node --check:\n${result.stderr || result.stdout}`,
    );
  });
}
