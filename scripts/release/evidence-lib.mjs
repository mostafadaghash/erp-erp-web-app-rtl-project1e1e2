export const RELEASE_EVIDENCE_VERSION = 2;
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
export const DATA_STRATEGIES = ["fresh_start", "legacy_migration"];
export const FRESH_START_ASSERTIONS = [
  "hasLegacySystem",
  "hasLegacyDataToImport",
  "hasOpeningInventory",
  "hasOpeningFinancialBalances",
  "hasOutstandingCustomerOrSupplierBalances",
  "hasOutstandingOperationalDocuments",
  "hasOutstandingCod",
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

function requireEvidenceRefs(value, label) {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => !String(item).trim())) {
    throw new Error(`${label} must contain at least one evidence reference`);
  }
  return value.map((item) => String(item).trim());
}

function validateDataStrategy(evidence) {
  const strategy = evidence.dataStrategy;
  if (!strategy || typeof strategy !== "object") throw new Error("dataStrategy is required");
  const mode = requireText(strategy.mode, "dataStrategy.mode");
  if (!DATA_STRATEGIES.includes(mode)) throw new Error(`unsupported dataStrategy.mode: ${mode}`);
  const approvedBy = requireText(strategy.approvedBy, "dataStrategy.approvedBy");
  const approvedAt = Date.parse(strategy.approvedAt);
  if (!Number.isFinite(approvedAt)) throw new Error("dataStrategy.approvedAt is invalid");
  const evidenceRefs = requireEvidenceRefs(strategy.evidence, "dataStrategy.evidence");

  if (mode === "fresh_start") {
    if (!strategy.assertions || typeof strategy.assertions !== "object") {
      throw new Error("dataStrategy.assertions are required for fresh_start");
    }
    for (const assertion of FRESH_START_ASSERTIONS) {
      if (strategy.assertions[assertion] !== false) {
        throw new Error(`fresh_start assertion must be explicitly false: ${assertion}`);
      }
    }
    if (evidence.migrationFingerprint !== null) {
      throw new Error("migrationFingerprint must be null for fresh_start");
    }
    if (evidence.environments?.migrationRehearsal !== null) {
      throw new Error("environments.migrationRehearsal must be null for fresh_start");
    }
  } else {
    if (!/^[a-f0-9]{64}$/.test(String(evidence.migrationFingerprint ?? ""))) {
      throw new Error("migrationFingerprint must be a full SHA-256 for legacy_migration");
    }
    requireText(evidence.environments?.migrationRehearsal, "environments.migrationRehearsal");
  }

  return { mode, approvedBy, approvedAt, evidenceRefs };
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
  requireHttps(evidence.environments?.stagingFrontend, "environments.stagingFrontend");
  requireHttps(evidence.environments?.productionFrontend, "environments.productionFrontend");
  requireText(evidence.environments?.stagingConvex, "environments.stagingConvex");
  requireText(evidence.environments?.productionConvex, "environments.productionConvex");
  const dataStrategy = validateDataStrategy(evidence);

  if (!evidence.gates || typeof evidence.gates !== "object") throw new Error("release gates are required");
  const notApplicableGates = [];
  for (const gateName of RELEASE_GATES) {
    const gate = evidence.gates[gateName];
    const expectedStatus = gateName === "migration" && dataStrategy.mode === "fresh_start"
      ? "NOT_APPLICABLE"
      : "PASS";
    if (!gate || gate.status !== expectedStatus) {
      throw new Error(`release gate must be ${expectedStatus}: ${gateName}`);
    }
    const gateEvidenceRefs = requireEvidenceRefs(gate.evidence, `release gate evidence: ${gateName}`);
    if (
      gateName === "migration"
      && dataStrategy.mode === "fresh_start"
      && !gateEvidenceRefs.some((reference) => dataStrategy.evidenceRefs.includes(reference))
    ) {
      throw new Error("fresh_start migration gate must reference the approved dataStrategy evidence");
    }
    if (expectedStatus === "NOT_APPLICABLE") notApplicableGates.push(gateName);
  }

  const approvals = {};
  for (const approvalName of ["technicalOwner", "businessOwner"]) {
    const approval = evidence.approvals?.[approvalName];
    if (!approval || approval.decision !== "GO") throw new Error(`release approval is not GO: ${approvalName}`);
    const name = requireText(approval.name, `approvals.${approvalName}.name`);
    const approvedAt = Date.parse(approval.approvedAt);
    if (!Number.isFinite(approvedAt)) throw new Error(`approvals.${approvalName}.approvedAt is invalid`);
    approvals[approvalName] = { name, approvedAt };
  }
  if (dataStrategy.approvedBy !== approvals.businessOwner.name) {
    throw new Error("dataStrategy.approvedBy must match approvals.businessOwner.name");
  }
  const generatedAt = Date.parse(evidence.generatedAt);
  if (!Number.isFinite(generatedAt)) throw new Error("generatedAt is invalid");
  if (dataStrategy.approvedAt > generatedAt) throw new Error("dataStrategy approval cannot be after generatedAt");
  if (dataStrategy.approvedAt > approvals.businessOwner.approvedAt) {
    throw new Error("dataStrategy approval cannot be after the business owner GO approval");
  }
  for (const [approvalName, approval] of Object.entries(approvals)) {
    if (approval.approvedAt > generatedAt) throw new Error(`approvals.${approvalName}.approvedAt cannot be after generatedAt`);
  }
  return {
    version: evidence.version,
    releaseCommit,
    rollbackCommit,
    dataStrategy: dataStrategy.mode,
    gateCount: RELEASE_GATES.length,
    applicableGateCount: RELEASE_GATES.length - notApplicableGates.length,
    notApplicableGates,
  };
}
