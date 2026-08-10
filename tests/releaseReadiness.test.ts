import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

test("v1.0.0-rc1 remains repository-prepared and blocked from Production", async () => {
  const candidate = JSON.parse(await readFile("release/v1.0.0-rc1.json", "utf8"));
  assert.equal(candidate.version, "v1.0.0-rc1");
  assert.equal(candidate.status, "repository-prepared");
  assert.equal(candidate.productionEligible, false);
  assert.ok(candidate.liveGates.length >= 10);
  assert.ok(candidate.requiredEvidence.length >= 8);
});

test("release repository preflight passes with all guarded toolkits present", () => {
  const result = spawnSync(process.execPath, ["scripts/release/preflight.mjs"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Release candidate repository preflight passed: v1\.0\.0-rc1/);
  assert.match(result.stdout, /Production eligible: false/);
});

test("release checklist keeps live acceptance as a hard gate", async () => {
  const checklist = await readFile("docs/RELEASE_CHECKLIST.md", "utf8");
  for (const section of [
    "Staging infrastructure",
    "Performance acceptance",
    "Deployed security acceptance",
    "Migration rehearsal",
    "Backup / restore drill",
    "Human UAT",
    "Go / no-go",
    "Production cutover",
  ]) {
    assert.ok(checklist.includes(section), `missing release section: ${section}`);
  }
  assert.match(checklist, /Any NO-GO blocks Production/);
});

test("UAT covers every configured operational role and branch isolation", async () => {
  const uat = await readFile("docs/UAT_SCENARIOS.md", "utf8");
  for (const role of ["Admin", "Manager", "Accountant", "Sales", "Customer service", "Technician", "Shipping / COD", "Viewer / read-only"]) {
    assert.ok(uat.includes(role), `missing UAT role: ${role}`);
  }
  assert.match(uat, /Branch isolation/);
  assert.match(uat, /Physical thermal acceptance is mandatory/);
});

test("incident runbook separates code data and configuration recovery", async () => {
  const incident = await readFile("docs/INCIDENT_RESPONSE.md", "utf8");
  assert.match(incident, /Code only/);
  assert.match(incident, /Configuration/);
  assert.match(incident, /Data/);
  assert.match(incident, /Code-only rollback/);
  assert.match(incident, /Data rollback \/ restore/);
});
