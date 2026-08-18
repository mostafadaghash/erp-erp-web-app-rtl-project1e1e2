import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const envCheck = readFileSync("scripts/staging-env-check.mjs", "utf8");

test("staging environment check loads the ignored local staging env file", () => {
  assert.match(envCheck, /import dotenv from "dotenv"/);
  assert.match(
    envCheck,
    /dotenv\.config\(\{ path: "\.env\.staging\.local", override: false \}\)/,
  );
});
