const required = [
  "STAGING_BASE_URL",
  "STAGING_ENVIRONMENT",
  "E2E_PRODUCT_QUERY",
  "E2E_ADMIN_EMAIL",
  "E2E_ADMIN_PASSWORD",
];

const optionalRolePairs = [
  ["E2E_MANAGER_EMAIL", "E2E_MANAGER_PASSWORD"],
  ["E2E_ACCOUNTANT_EMAIL", "E2E_ACCOUNTANT_PASSWORD"],
  ["E2E_SALES_EMAIL", "E2E_SALES_PASSWORD"],
  ["E2E_CUSTOMER_SERVICE_EMAIL", "E2E_CUSTOMER_SERVICE_PASSWORD"],
  ["E2E_TECHNICIAN_EMAIL", "E2E_TECHNICIAN_PASSWORD"],
  ["E2E_SHIPPING_EMAIL", "E2E_SHIPPING_PASSWORD"],
  ["E2E_VIEWER_EMAIL", "E2E_VIEWER_PASSWORD"],
];

const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length) {
  console.error(`Staging environment is incomplete. Missing: ${missing.join(", ")}`);
  process.exit(1);
}

if (process.env.STAGING_ENVIRONMENT !== "staging") {
  console.error("STAGING_ENVIRONMENT must be exactly 'staging'. Refusing to run browser E2E elsewhere.");
  process.exit(1);
}

let baseUrl;
try {
  baseUrl = new URL(process.env.STAGING_BASE_URL);
} catch {
  console.error("STAGING_BASE_URL must be a valid absolute URL.");
  process.exit(1);
}

const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
if (baseUrl.protocol !== "https:" && !localHosts.has(baseUrl.hostname)) {
  console.error("Remote staging must use HTTPS.");
  process.exit(1);
}

const suspiciousProductionTokens = ["prod", "production", "live"];
const normalizedHost = baseUrl.hostname.toLowerCase();
if (suspiciousProductionTokens.some((token) => normalizedHost.includes(token))) {
  console.error("STAGING_BASE_URL looks like a production host. Refusing to continue.");
  process.exit(1);
}

for (const [emailName, passwordName] of optionalRolePairs) {
  const hasEmail = Boolean(process.env[emailName]?.trim());
  const hasPassword = Boolean(process.env[passwordName]?.trim());
  if (hasEmail !== hasPassword) {
    console.error(`${emailName} and ${passwordName} must be configured together.`);
    process.exit(1);
  }
}

console.log(`Staging guard passed for ${baseUrl.origin}.`);
console.log("Secrets were validated by presence only and were not printed.");
