const required = [
  "STAGING_BASE_URL",
  "STAGING_ENVIRONMENT",
  "E2E_PRODUCT_QUERY",
];

const roles = [
  "admin",
  "manager",
  "accountant",
  "sales",
  "customer_service",
  "technician",
  "shipping",
  "viewer",
];

const individualRolePairs = [
  ["admin", "E2E_ADMIN_EMAIL", "E2E_ADMIN_PASSWORD"],
  ["manager", "E2E_MANAGER_EMAIL", "E2E_MANAGER_PASSWORD"],
  ["accountant", "E2E_ACCOUNTANT_EMAIL", "E2E_ACCOUNTANT_PASSWORD"],
  ["sales", "E2E_SALES_EMAIL", "E2E_SALES_PASSWORD"],
  ["customer_service", "E2E_CUSTOMER_SERVICE_EMAIL", "E2E_CUSTOMER_SERVICE_PASSWORD"],
  ["technician", "E2E_TECHNICIAN_EMAIL", "E2E_TECHNICIAN_PASSWORD"],
  ["shipping", "E2E_SHIPPING_EMAIL", "E2E_SHIPPING_PASSWORD"],
  ["viewer", "E2E_VIEWER_EMAIL", "E2E_VIEWER_PASSWORD"],
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

const requireAllRoles = process.env.E2E_REQUIRE_ALL_ROLES === "true";
const roleJson = process.env.E2E_ROLE_ACCOUNTS_JSON?.trim();
if (roleJson) {
  let accounts;
  try {
    accounts = JSON.parse(roleJson);
  } catch {
    console.error("E2E_ROLE_ACCOUNTS_JSON must be valid JSON.");
    process.exit(1);
  }
  if (!Array.isArray(accounts)) {
    console.error("E2E_ROLE_ACCOUNTS_JSON must be a JSON array.");
    process.exit(1);
  }
  const seenRoles = new Set();
  const seenEmails = new Set();
  for (const account of accounts) {
    if (!roles.includes(account?.role)) {
      console.error(`E2E_ROLE_ACCOUNTS_JSON contains an unsupported role: ${String(account?.role)}`);
      process.exit(1);
    }
    if (seenRoles.has(account.role)) {
      console.error(`E2E_ROLE_ACCOUNTS_JSON contains a duplicate role: ${account.role}`);
      process.exit(1);
    }
    const email = account.email?.trim();
    const password = account.password?.trim();
    if (!email || !password) {
      console.error(`E2E_ROLE_ACCOUNTS_JSON is missing credentials for role: ${account.role}`);
      process.exit(1);
    }
    if (seenEmails.has(email.toLowerCase())) {
      console.error("E2E_ROLE_ACCOUNTS_JSON account emails must be unique.");
      process.exit(1);
    }
    seenRoles.add(account.role);
    seenEmails.add(email.toLowerCase());
  }
  if (!seenRoles.has("admin")) {
    console.error("E2E_ROLE_ACCOUNTS_JSON must include the admin role.");
    process.exit(1);
  }
  if (requireAllRoles) {
    const missingRoles = roles.filter((role) => !seenRoles.has(role));
    if (missingRoles.length > 0) {
      console.error(`Full role acceptance is missing roles: ${missingRoles.join(", ")}`);
      process.exit(1);
    }
  }
} else {
  const configuredRoles = new Set();
  for (const [role, emailName, passwordName] of individualRolePairs) {
    const hasEmail = Boolean(process.env[emailName]?.trim());
    const hasPassword = Boolean(process.env[passwordName]?.trim());
    if (hasEmail !== hasPassword) {
      console.error(`${emailName} and ${passwordName} must be configured together.`);
      process.exit(1);
    }
    if (hasEmail) configuredRoles.add(role);
  }
  if (!configuredRoles.has("admin")) {
    console.error("Configure E2E_ROLE_ACCOUNTS_JSON or E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD.");
    process.exit(1);
  }
  if (requireAllRoles) {
    const missingRoles = roles.filter((role) => !configuredRoles.has(role));
    if (missingRoles.length > 0) {
      console.error(`Full role acceptance is missing roles: ${missingRoles.join(", ")}`);
      process.exit(1);
    }
  }
}

console.log(`Staging guard passed for ${baseUrl.origin}.`);
console.log("Secrets were validated by presence only and were not printed.");
