export const RELEASE_EVIDENCE_VERSION = 1;
export const RELEASE_GATES = [
  "repositoryCi",
  "stagingE2e",
  "performance",
  "security",
  "migration",
  "backupRestore",
  "humanUat",
  "printing",
  "monitoring",
];

function requireText(value, label) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function requireGitSha(value, label) {
  const sha = requireText(value, label);
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error(`${label} must be a full 40-character Git SHA`);
  return sha;
}

function requireHttps(value, label) {
  const text = requireText(value, label);
  let url;
  try { url = new URL(text); } catch { throw new Error(`${label} must be a valid URL`); }
  if (url.protocol !== "https:") throw new Error(`${label} must use HTTPS`);
  return text;
}

export function validateReleaseEvidence(evidence) {
  if (!evidence || typeof evidence !== "object") throw new Error("release evidence must be an object");
  if (evidence.schemaVersion !== RELEASE_EVIDENCE_VERSION) throw new Error("unsupported release evidence schemaVersion");
  if (evidence.version !== "v1.0.0-rc1") throw new Error("release evidence version must be v1.0.0-rc1");
  if (evidence.decision !== "GO") throw new Error("release decision is not GO");
  if (evidence.productionEligible !== true) throw new Error("release evidence is not Production-eligible");
  const releaseCommit = requireGitSha(evidence.releaseCommit, "releaseCommit");
  const rollbackCommit = requireGitSha(evidence.rollback?.commit, "rollback.commit");
  if (rollbackCommit === releaseCommit) throw new Error("rollback.commit must identify the previous known-good commit");
  if (!/^[a-f0-9]{64}$/.test(String(evidence.rollback?.backupSha256 ?? ""))) throw new Error("rollback.backupSha256 must be a full SHA-256");
  if (!/^[a-f0-9]{64}$/.test(String(evidence.migrationFingerprint ?? ""))) throw new Error("migrationFingerprint must be a full SHA-256");
  requireHttps(evidence.environments?.stagingFrontend, "environments.stagingFrontend");
  requireHttps(evidence.environments?.productionFrontend, "environments.productionFrontend");
  requireText(evidence.environments?.stagingConvex, "environments.stagingConvex");
  requireText(evidence.environments?.productionConvex, "environments.productionConvex");
  requireText(evidence.environments?.migrationRehearsal, "environments.migrationRehearsal");

  if (!evidence.gates || typeof evidence.gates !== "object") throw new Error("release gates are required");
  for (const gateName of RELEASE_GATES) {
    const gate = evidence.gates[gateName];
    if (!gate || gate.status !== "PASS") throw new Error(`release gate is not PASS: ${gateName}`);
    if (!Array.isArray(gate.evidence) || gate.evidence.length === 0 || gate.evidence.some((value) => !String(value).trim())) {
      throw new Error(`release gate has no evidence references: ${gateName}`);
    }
  }

  for (const approvalName of ["technicalOwner", "businessOwner"]) {
    const approval = evidence.approvals?.[approvalName];
    if (!approval || approval.decision !== "GO") throw new Error(`release approval is not GO: ${approvalName}`);
    requireText(approval.name, `approvals.${approvalName}.name`);
    if (!Number.isFinite(Date.parse(approval.approvedAt))) throw new Error(`approvals.${approvalName}.approvedAt is invalid`);
  }
  if (!Number.isFinite(Date.parse(evidence.generatedAt))) throw new Error("generatedAt is invalid");
  return { version: evidence.version, releaseCommit, rollbackCommit, gateCount: RELEASE_GATES.length };
}
