import { createHash } from "node:crypto";

export const MIGRATION_SCHEMA_VERSION = 2;
export const ACCOUNT_TYPES = new Set([
  "cash", "instapay", "vodafone_cash", "fawry_clearing", "paymob_clearing",
  "card_clearing", "cod_clearing", "bank", "other",
]);
export const COD_STATUSES = new Set(["with_carrier", "settled", "reversed"]);

const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
const persianDigits = "۰۱۲۳۴۵۶۷۸۹";

export function normalizeText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function normalizePhone(value) {
  let text = normalizeText(value);
  text = [...text].map((char) => {
    const a = arabicDigits.indexOf(char);
    if (a >= 0) return String(a);
    const p = persianDigits.indexOf(char);
    if (p >= 0) return String(p);
    return char;
  }).join("");
  text = text.replace(/[^0-9+]/g, "");
  if (text.startsWith("+20")) text = `0${text.slice(3)}`;
  else if (text.startsWith("0020")) text = `0${text.slice(4)}`;
  else if (text.startsWith("20") && text.length >= 11) text = `0${text.slice(2)}`;
  return text.replace(/\D/g, "");
}

export function normalizeCode(value) {
  return normalizeText(value).toUpperCase();
}

export function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isFiniteMoney(value, { allowNegative = false, decimals = 2 } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  if (!allowNegative && value < 0) return false;
  const scale = 10 ** decimals;
  return Math.abs(Math.round(value * scale) - value * scale) < 1e-7;
}

export function stableStringify(value) {
  if (value === undefined) return "null";
  if (Array.isArray(value)) {
    return `[${value.map((item) => item === undefined ? "null" : stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return createHash("sha256").update(typeof value === "string" ? value : stableStringify(value)).digest("hex");
}

function pushRejected(rejected, entity, index, legacyId, errors, row) {
  rejected.push({ entity, index, legacyId: normalizeText(legacyId) || null, errors, row });
}

function uniqueCheck(rows, keyFn, label, rejected, entity) {
  const seen = new Map();
  rows.forEach((row, index) => {
    const key = keyFn(row);
    if (!key) return;
    if (seen.has(key)) {
      pushRejected(rejected, entity, index, row.legacyId, [`duplicate ${label}: ${key}`], row);
      pushRejected(rejected, entity, seen.get(key), rows[seen.get(key)].legacyId, [`duplicate ${label}: ${key}`], rows[seen.get(key)]);
    } else seen.set(key, index);
  });
  return new Set(rejected.filter((item) => item.entity === entity).map((item) => item.index));
}

function canonicalBranch(row) {
  return {
    legacyId: normalizeText(row.legacyId),
    code: normalizeCode(row.code),
    name: normalizeText(row.name),
    address: normalizeText(row.address),
    phone: normalizePhone(row.phone) || undefined,
    isActive: row.isActive !== false,
  };
}

function canonicalCustomer(row) {
  return {
    legacyId: normalizeText(row.legacyId),
    branchCode: normalizeCode(row.branchCode),
    name: normalizeText(row.name),
    phone: normalizePhone(row.phone),
    email: normalizeText(row.email).toLowerCase() || undefined,
    address: normalizeText(row.address) || undefined,
    receivableBalance: Number(row.receivableBalance ?? 0),
    advanceBalance: Number(row.advanceBalance ?? 0),
    isActive: row.isActive !== false,
  };
}

function canonicalSupplier(row) {
  return {
    legacyId: normalizeText(row.legacyId),
    name: normalizeText(row.name),
    phone: normalizePhone(row.phone),
    email: normalizeText(row.email).toLowerCase() || undefined,
    address: normalizeText(row.address) || undefined,
    isActive: row.isActive !== false,
    balances: (row.balances ?? []).map((balance) => ({
      branchCode: normalizeCode(balance.branchCode),
      balance: Number(balance.balance ?? 0),
    })).sort((a, b) => a.branchCode.localeCompare(b.branchCode)),
  };
}

function canonicalProduct(row) {
  const stock = Number(row.stock ?? 0);
  const costPrice = Number(row.costPrice ?? 0);
  const inventoryValue = row.inventoryValue === undefined
    ? Math.round(stock * costPrice * 100) / 100
    : Number(row.inventoryValue);
  return {
    legacyId: normalizeText(row.legacyId),
    branchCode: normalizeCode(row.branchCode),
    sku: normalizeCode(row.sku),
    barcode: normalizeText(row.barcode) || undefined,
    name: normalizeText(row.name),
    supplierLegacyId: normalizeText(row.supplierLegacyId) || undefined,
    category: normalizeText(row.category) || undefined,
    stock,
    minStock: Number(row.minStock ?? 0),
    costPrice,
    sellPrice: Number(row.sellPrice ?? 0),
    inventoryValue,
    unit: normalizeText(row.unit) || "قطعة",
    isActive: row.isActive !== false,
  };
}

function canonicalAccount(row) {
  return {
    legacyId: normalizeText(row.legacyId),
    branchCode: normalizeCode(row.branchCode),
    code: normalizeCode(row.code),
    name: normalizeText(row.name),
    type: normalizeText(row.type).toLowerCase(),
    balance: Number(row.balance ?? 0),
    allowNegative: Boolean(row.allowNegative),
    settlementDelayDays: Number(row.settlementDelayDays ?? 0),
    isActive: row.isActive !== false,
  };
}

function canonicalCod(row) {
  return {
    legacyId: normalizeText(row.legacyId),
    branchCode: normalizeCode(row.branchCode),
    carrier: normalizeText(row.carrier),
    referenceNumber: normalizeText(row.referenceNumber) || undefined,
    amount: Number(row.amount ?? 0),
    status: normalizeText(row.status).toLowerCase(),
  };
}

function validateBase(row, required) {
  const errors = [];
  for (const field of required) if (!row[field]) errors.push(`${field} is required`);
  return errors;
}

export function prepareMigration(input) {
  const rejected = [];
  if (!input || typeof input !== "object") throw new Error("Migration input must be a JSON object.");
  if (input.schemaVersion !== MIGRATION_SCHEMA_VERSION) throw new Error(`schemaVersion must be ${MIGRATION_SCHEMA_VERSION}.`);
  if (!isIsoDate(input.cutoverDate)) throw new Error("cutoverDate must be a valid YYYY-MM-DD date.");
  const sourceSystem = normalizeText(input.sourceSystem);
  if (!sourceSystem) throw new Error("sourceSystem is required.");

  const branchesRaw = Array.isArray(input.branches) ? input.branches : [];
  const customersRaw = Array.isArray(input.customers) ? input.customers : [];
  const suppliersRaw = Array.isArray(input.suppliers) ? input.suppliers : [];
  const productsRaw = Array.isArray(input.products) ? input.products : [];
  const accountsRaw = Array.isArray(input.financialAccounts) ? input.financialAccounts : [];
  const codRaw = Array.isArray(input.cod) ? input.cod : [];

  const duplicateBranchIndexes = uniqueCheck(branchesRaw, (r) => normalizeCode(r.code), "branch code", rejected, "branches");
  uniqueCheck(branchesRaw, (r) => normalizeText(r.legacyId), "legacyId", rejected, "branches");
  uniqueCheck(branchesRaw, (r) => normalizeText(r.name).toLocaleLowerCase(), "branch name", rejected, "branches");
  const branches = [];
  branchesRaw.forEach((raw, index) => {
    if (duplicateBranchIndexes.has(index) || rejected.some((r) => r.entity === "branches" && r.index === index)) return;
    const row = canonicalBranch(raw);
    const errors = validateBase(row, ["legacyId", "code", "name"]);
    if (errors.length) pushRejected(rejected, "branches", index, row.legacyId, errors, raw); else branches.push(row);
  });
  const branchCodes = new Set(branches.map((row) => row.code));

  const supplierDupes = uniqueCheck(suppliersRaw, (r) => normalizeText(r.legacyId), "legacyId", rejected, "suppliers");
  uniqueCheck(suppliersRaw, (r) => normalizePhone(r.phone), "phone", rejected, "suppliers");
  const suppliers = [];
  suppliersRaw.forEach((raw, index) => {
    if (supplierDupes.has(index) || rejected.some((r) => r.entity === "suppliers" && r.index === index)) return;
    const row = canonicalSupplier(raw);
    const errors = validateBase(row, ["legacyId", "name", "phone"]);
    if (row.phone && (row.phone.length < 7 || row.phone.length > 15)) errors.push("phone must contain 7-15 digits after normalization");
    const balanceCodes = new Set();
    row.balances.forEach((balance) => {
      if (!branchCodes.has(balance.branchCode)) errors.push(`unknown branchCode in balances: ${balance.branchCode}`);
      if (!isFiniteMoney(balance.balance)) errors.push(`supplier balance must be non-negative money for ${balance.branchCode}`);
      if (balanceCodes.has(balance.branchCode)) errors.push(`duplicate supplier balance branchCode: ${balance.branchCode}`);
      balanceCodes.add(balance.branchCode);
    });
    if (errors.length) pushRejected(rejected, "suppliers", index, row.legacyId, errors, raw); else suppliers.push(row);
  });
  const supplierIds = new Set(suppliers.map((row) => row.legacyId));

  uniqueCheck(customersRaw, (r) => normalizeText(r.legacyId), "legacyId", rejected, "customers");
  uniqueCheck(customersRaw, (r) => `${normalizeCode(r.branchCode)}|${normalizePhone(r.phone)}`, "branch phone", rejected, "customers");
  const customers = [];
  customersRaw.forEach((raw, index) => {
    if (rejected.some((r) => r.entity === "customers" && r.index === index)) return;
    const row = canonicalCustomer(raw);
    const errors = validateBase(row, ["legacyId", "branchCode", "name", "phone"]);
    if (!branchCodes.has(row.branchCode)) errors.push(`unknown branchCode: ${row.branchCode}`);
    if (row.phone && (row.phone.length < 7 || row.phone.length > 15)) errors.push("phone must contain 7-15 digits after normalization");
    if (!isFiniteMoney(row.receivableBalance)) errors.push("receivableBalance must be non-negative money");
    if (!isFiniteMoney(row.advanceBalance)) errors.push("advanceBalance must be non-negative money");
    if (row.receivableBalance > 0 && row.advanceBalance > 0) errors.push("customer cannot have receivable and advance opening balances simultaneously");
    if (errors.length) pushRejected(rejected, "customers", index, row.legacyId, errors, raw); else customers.push(row);
  });

  uniqueCheck(productsRaw, (r) => normalizeText(r.legacyId), "legacyId", rejected, "products");
  uniqueCheck(productsRaw, (r) => normalizeCode(r.sku), "SKU", rejected, "products");
  const products = [];
  productsRaw.forEach((raw, index) => {
    if (rejected.some((r) => r.entity === "products" && r.index === index)) return;
    const row = canonicalProduct(raw);
    const errors = validateBase(row, ["legacyId", "branchCode", "sku", "name"]);
    if (!branchCodes.has(row.branchCode)) errors.push(`unknown branchCode: ${row.branchCode}`);
    if (!Number.isInteger(row.stock) || row.stock < 0) errors.push("stock must be a non-negative integer");
    if (!Number.isInteger(row.minStock) || row.minStock < 0) errors.push("minStock must be a non-negative integer");
    if (!isFiniteMoney(row.costPrice, { decimals: 4 })) errors.push("costPrice must be non-negative with at most 4 decimals");
    if (!isFiniteMoney(row.sellPrice)) errors.push("sellPrice must be non-negative money");
    if (!isFiniteMoney(row.inventoryValue)) errors.push("inventoryValue must be non-negative money");
    if (row.stock === 0 && row.inventoryValue !== 0) errors.push("zero-stock product cannot carry inventoryValue");
    if (row.supplierLegacyId && !supplierIds.has(row.supplierLegacyId)) errors.push(`unknown supplierLegacyId: ${row.supplierLegacyId}`);
    if (errors.length) pushRejected(rejected, "products", index, row.legacyId, errors, raw); else products.push(row);
  });

  uniqueCheck(accountsRaw, (r) => normalizeText(r.legacyId), "legacyId", rejected, "financialAccounts");
  uniqueCheck(accountsRaw, (r) => `${normalizeCode(r.branchCode)}|${normalizeCode(r.code)}`, "branch account code", rejected, "financialAccounts");
  const financialAccounts = [];
  accountsRaw.forEach((raw, index) => {
    if (rejected.some((r) => r.entity === "financialAccounts" && r.index === index)) return;
    const row = canonicalAccount(raw);
    const errors = validateBase(row, ["legacyId", "branchCode", "code", "name", "type"]);
    if (!branchCodes.has(row.branchCode)) errors.push(`unknown branchCode: ${row.branchCode}`);
    if (!ACCOUNT_TYPES.has(row.type)) errors.push(`unsupported account type: ${row.type}`);
    if (!isFiniteMoney(row.balance)) errors.push("balance must be non-negative money");
    if (!Number.isInteger(row.settlementDelayDays) || row.settlementDelayDays < 0 || row.settlementDelayDays > 365) errors.push("settlementDelayDays must be 0-365");
    if (!row.isActive && row.balance !== 0) errors.push("inactive financial account cannot carry an opening balance");
    if (errors.length) pushRejected(rejected, "financialAccounts", index, row.legacyId, errors, raw); else financialAccounts.push(row);
  });

  uniqueCheck(codRaw, (r) => normalizeText(r.legacyId), "legacyId", rejected, "cod");
  const cod = [];
  codRaw.forEach((raw, index) => {
    if (rejected.some((r) => r.entity === "cod" && r.index === index)) return;
    const row = canonicalCod(raw);
    const errors = validateBase(row, ["legacyId", "branchCode", "carrier", "status"]);
    if (!branchCodes.has(row.branchCode)) errors.push(`unknown branchCode: ${row.branchCode}`);
    if (!COD_STATUSES.has(row.status)) errors.push(`unsupported COD status: ${row.status}`);
    if (!isFiniteMoney(row.amount)) errors.push("amount must be non-negative money");
    if (errors.length) pushRejected(rejected, "cod", index, row.legacyId, errors, raw); else cod.push(row);
  });

  const accepted = { branches, customers, suppliers, products, financialAccounts, cod };
  const totals = {
    branches: branches.length,
    customers: customers.length,
    suppliers: suppliers.length,
    products: products.length,
    stockQuantity: products.reduce((sum, row) => sum + row.stock, 0),
    inventoryValue: round2(products.reduce((sum, row) => sum + row.inventoryValue, 0)),
    customerReceivable: round2(customers.reduce((sum, row) => sum + row.receivableBalance, 0)),
    customerAdvance: round2(customers.reduce((sum, row) => sum + row.advanceBalance, 0)),
    supplierPayable: round2(suppliers.flatMap((row) => row.balances).reduce((sum, row) => sum + row.balance, 0)),
    financialAccountBalance: round2(financialAccounts.reduce((sum, row) => sum + row.balance, 0)),
    codWithCarriers: round2(cod.filter((row) => row.status === "with_carrier").reduce((sum, row) => sum + row.amount, 0)),
  };
  const expected = input.controlTotals ?? {};
  const reconciliation = buildReconciliation(totals, expected);
  const fingerprint = sha256({ schemaVersion: MIGRATION_SCHEMA_VERSION, sourceSystem, cutoverDate: input.cutoverDate, accepted });
  const migrationRunId = `MIG-${fingerprint.slice(0, 16).toUpperCase()}`;
  const mapping = {
    branches: Object.fromEntries(branches.map((row) => [row.legacyId, row.code])),
    customers: Object.fromEntries(customers.map((row) => [row.legacyId, `${row.branchCode}|${row.phone}`])),
    suppliers: Object.fromEntries(suppliers.map((row) => [row.legacyId, row.phone])),
    products: Object.fromEntries(products.map((row) => [row.legacyId, `${row.branchCode}|${row.sku}`])),
    financialAccounts: Object.fromEntries(financialAccounts.map((row) => [row.legacyId, `${row.branchCode}|${row.code}`])),
    cod: Object.fromEntries(cod.map((row) => [row.legacyId, `${row.branchCode}|${row.referenceNumber ?? row.legacyId}`])),
  };
  const applyPlan = buildApplyPlan(accepted, input.cutoverDate, migrationRunId, fingerprint);

  return {
    manifest: {
      schemaVersion: MIGRATION_SCHEMA_VERSION,
      sourceSystem,
      cutoverDate: input.cutoverDate,
      migrationRunId,
      fingerprint,
      mode: "dry-run",
      acceptedRows: Object.values(accepted).reduce((sum, rows) => sum + rows.length, 0),
      rejectedRows: rejected.length,
      reconciliationPassed: reconciliation.every((row) => row.status === "match" || row.status === "not_provided"),
    },
    accepted,
    rejected,
    mapping,
    reconciliation,
    applyPlan,
  };
}

export function buildReconciliation(actual, expected) {
  const metrics = ["stockQuantity", "inventoryValue", "customerReceivable", "customerAdvance", "supplierPayable", "financialAccountBalance", "codWithCarriers"];
  return metrics.map((metric) => {
    const hasExpected = Object.prototype.hasOwnProperty.call(expected, metric);
    const expectedValue = hasExpected ? Number(expected[metric]) : null;
    const actualValue = Number(actual[metric] ?? 0);
    const difference = hasExpected ? round2(actualValue - expectedValue) : null;
    return {
      metric,
      expected: hasExpected ? expectedValue : null,
      actual: actualValue,
      difference,
      status: !hasExpected ? "not_provided" : Math.abs(difference) < 0.005 ? "match" : "difference",
    };
  });
}

export function buildApplyPlan(accepted, cutoverDate, migrationRunId, fingerprint) {
  const steps = [
    ["branches", accepted.branches.length, "Create/resolve branch mapping"],
    ["suppliers", accepted.suppliers.length, "Create/resolve supplier masters"],
    ["customers", accepted.customers.length, "Create/resolve branch customer masters"],
    ["products", accepted.products.length, "Create/resolve products and opening stock/value"],
    ["financialAccounts", accepted.financialAccounts.length, "Create accounts and finance opening balances"],
    ["customerOpenings", accepted.customers.filter((row) => row.receivableBalance > 0 || row.advanceBalance > 0).length, "Post customer ledger openings"],
    ["supplierOpenings", accepted.suppliers.flatMap((row) => row.balances).filter((row) => row.balance !== 0).length, "Post supplier ledger openings"],
    ["codOpenings", accepted.cod.filter((row) => row.status === "with_carrier").length, "Reconcile COD carrier receivables before activation"],
  ];
  return {
    migrationRunId,
    fingerprint,
    cutoverDate,
    writeEnabled: false,
    rule: "Apply only to a dedicated staging deployment after zero rejected rows and zero reconciliation differences for supplied controls.",
    steps: steps.map(([key, rows, description], index) => ({ order: index + 1, key, rows, description, status: "pending" })),
  };
}

export function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
