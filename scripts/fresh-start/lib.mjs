export const FRESH_START_SCHEMA_VERSION = 1;

export const APPLICATION_TABLES = Object.freeze([
  "generalLedgerSettings",
  "chartOfAccounts",
  "accountingPeriods",
  "generalLedgerOpenings",
  "journalEntries",
  "journalLines",
  "generalLedgerDailyBalances",
  "generalLedgerAccountBalances",
  "generalLedgerPeriodBalances",
  "documentCounters",
  "financeSettings",
  "financialAccounts",
  "paymentMethods",
  "paymentAccountDefaults",
  "paymentSchedules",
  "financialTransactions",
  "financialMovements",
  "settings",
  "branches",
  "suppliers",
  "supplierCategories",
  "supplierBalances",
  "supplierLedgerEntries",
  "supplierPayments",
  "customerBalances",
  "customerLedgerEntries",
  "supplierPaymentAllocations",
  "purchaseReceipts",
  "purchaseReturns",
  "categories",
  "products",
  "inventoryMovements",
  "productSerials",
  "customers",
  "customerCategories",
  "invoices",
  "quotes",
  "salesReturns",
  "orders",
  "orderStatsState",
  "orderStatsAggregates",
  "repairs",
  "repairStatusHistory",
  "shipments",
  "expenses",
  "payments",
  "userProfiles",
  "leads",
  "leadActivities",
  "deliveries",
  "codSettlements",
  "codSettlementItems",
  "deliveryConfirmations",
  "customerTrackingLinks",
  "customerFollowUps",
  "auditLogs",
]);

export const INITIALIZED_SETUP_TABLES = Object.freeze([
  "generalLedgerSettings",
  "chartOfAccounts",
  "accountingPeriods",
  "generalLedgerOpenings",
  "financeSettings",
  "financialAccounts",
  "settings",
  "branches",
  "userProfiles",
  "auditLogs",
]);

const ENVIRONMENTS = new Set(["development", "staging", "production"]);
const PHASES = new Set(["blank", "initialized"]);

export function normalizeDeployment(value) {
  const deployment = String(value ?? "").trim();
  if (!/^[a-z][a-z0-9-]+-\d+$/.test(deployment)) {
    throw new Error("deployment must be an explicit Convex deployment name");
  }
  return deployment;
}

export function normalizeEnvironment(value) {
  const environment = String(value ?? "").trim().toLowerCase();
  if (!ENVIRONMENTS.has(environment)) {
    throw new Error("environment must be development, staging, or production");
  }
  return environment;
}

export function normalizePhase(value) {
  const phase = String(value ?? "").trim().toLowerCase();
  if (!PHASES.has(phase)) throw new Error("phase must be blank or initialized");
  return phase;
}

export function requireReleaseCommit(value) {
  const commit = String(value ?? "").trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error("release commit must be a full 40-character Git SHA");
  return commit;
}

export function buildInlineAuditQuery(phaseValue) {
  const phase = normalizePhase(phaseValue);
  return [
    "const nonEmptyTables = [];",
    ...APPLICATION_TABLES.map((table) => `if ((await ctx.db.query(${JSON.stringify(table)}).take(1)).length > 0) nonEmptyTables.push(${JSON.stringify(table)});`),
    "const nonZeroFinancialAccounts = (await ctx.db.query('financialAccounts').collect()).filter((row) => row.currentBalance !== 0).length;",
    "const nonZeroGeneralLedgerOpenings = (await ctx.db.query('generalLedgerOpenings').collect()).filter((row) => row.isZeroOpening !== true).length;",
    `return JSON.stringify({ schemaVersion: ${FRESH_START_SCHEMA_VERSION}, phase: ${JSON.stringify(phase)}, nonEmptyTables, nonZeroFinancialAccounts, nonZeroGeneralLedgerOpenings });`,
  ].join("\n");
}

export function parseConvexJson(output) {
  const text = String(output ?? "").trim();
  if (!text) throw new Error("Convex CLI returned no audit result");
  try {
    const parsed = JSON.parse(text);
    return typeof parsed === "string" ? JSON.parse(parsed) : parsed;
  } catch {
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try { return JSON.parse(text.slice(firstBrace, lastBrace + 1)); } catch { /* handled below */ }
    }
  }
  throw new Error("Unable to parse the Fresh Start audit result from Convex CLI");
}

function requireNonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer`);
  return value;
}

export function validateLiveAudit({ phase: phaseValue, result }) {
  const phase = normalizePhase(phaseValue);
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("audit result must be an object");
  if (result.schemaVersion !== FRESH_START_SCHEMA_VERSION) throw new Error("unsupported Fresh Start audit schemaVersion");
  if (result.phase !== phase) throw new Error("Fresh Start audit phase mismatch");
  if (!Array.isArray(result.nonEmptyTables)) throw new Error("Fresh Start audit must include nonEmptyTables");

  const nonEmptyTables = [...new Set(result.nonEmptyTables.map((value) => String(value)))].sort();
  const unknown = nonEmptyTables.filter((table) => !APPLICATION_TABLES.includes(table));
  if (unknown.length) throw new Error(`Fresh Start audit returned unknown tables: ${unknown.join(", ")}`);

  const nonZeroFinancialAccounts = requireNonNegativeInteger(result.nonZeroFinancialAccounts, "nonZeroFinancialAccounts");
  const nonZeroGeneralLedgerOpenings = requireNonNegativeInteger(result.nonZeroGeneralLedgerOpenings, "nonZeroGeneralLedgerOpenings");
  const allowed = phase === "blank" ? new Set() : new Set(INITIALIZED_SETUP_TABLES);
  const forbiddenTables = nonEmptyTables.filter((table) => !allowed.has(table));
  const violations = [
    ...forbiddenTables.map((table) => `non-empty:${table}`),
    ...(nonZeroFinancialAccounts ? [`non-zero-financial-accounts:${nonZeroFinancialAccounts}`] : []),
    ...(nonZeroGeneralLedgerOpenings ? [`non-zero-general-ledger-openings:${nonZeroGeneralLedgerOpenings}`] : []),
  ];
  if (violations.length) throw new Error(`Fresh Start audit failed: ${violations.join(", ")}`);

  return { phase, nonEmptyTables, nonZeroFinancialAccounts, nonZeroGeneralLedgerOpenings };
}

export function createFreshStartEvidence({ deployment, environment, releaseCommit, checkedAt, audit }) {
  return {
    schemaVersion: FRESH_START_SCHEMA_VERSION,
    strategy: "fresh_start",
    deployment: normalizeDeployment(deployment),
    environment: normalizeEnvironment(environment),
    phase: normalizePhase(audit.phase),
    releaseCommit: requireReleaseCommit(releaseCommit),
    checkedAt: new Date(checkedAt).toISOString(),
    status: "PASS",
    nonEmptySetupTables: audit.nonEmptyTables,
    checks: {
      noBusinessRecords: true,
      noOpeningInventory: true,
      noOpeningFinancialBalances: true,
      noOutstandingCustomerOrSupplierBalances: true,
      noOutstandingOperationalDocuments: true,
      noOutstandingCod: true,
      demoSeedUnavailable: true,
    },
  };
}