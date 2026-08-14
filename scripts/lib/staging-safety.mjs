const productionToken = /(^|[._-])(prod|production|main|live)([._-]|$)/i;

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function exactOrigin(value, label, options = {}) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  const localhost = new Set(["localhost", "127.0.0.1", "::1"]).has(
    url.hostname,
  );
  if (url.protocol !== "https:" && !(options.allowLocalhost && localhost)) {
    throw new Error(`${label} must use HTTPS`);
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new Error(`${label} must be an exact origin without credentials or path`);
  }
  if (options.stagingOnly && productionToken.test(url.hostname)) {
    throw new Error(`${label} refuses production-looking hosts`);
  }
  return new URL(url.origin);
}

function convexDeploymentId(url, suffix, label) {
  if (!url.hostname.endsWith(suffix)) {
    throw new Error(`${label} must use ${suffix.slice(1)}`);
  }
  const id = url.hostname.slice(0, -suffix.length);
  if (!/^[a-z0-9-]+$/i.test(id)) {
    throw new Error(`${label} has an invalid deployment identifier`);
  }
  return id;
}

function optionalProductionOrigin(name) {
  const value = process.env[name]?.trim();
  return value ? exactOrigin(value, name) : null;
}

export function stagingOrigins() {
  if (process.env.E2E_ENVIRONMENT !== "staging") {
    throw new Error("E2E_ENVIRONMENT must equal staging");
  }
  const frontend = exactOrigin(
    requiredEnvironment("STAGING_BASE_URL"),
    "STAGING_BASE_URL",
    { allowLocalhost: true, stagingOnly: true },
  );
  const convexCloud = exactOrigin(
    requiredEnvironment("STAGING_CONVEX_URL"),
    "STAGING_CONVEX_URL",
    { stagingOnly: true },
  );
  const convexSite = exactOrigin(
    requiredEnvironment("STAGING_CONVEX_SITE_URL"),
    "STAGING_CONVEX_SITE_URL",
    { stagingOnly: true },
  );
  const cloudId = convexDeploymentId(
    convexCloud,
    ".convex.cloud",
    "STAGING_CONVEX_URL",
  );
  const siteId = convexDeploymentId(
    convexSite,
    ".convex.site",
    "STAGING_CONVEX_SITE_URL",
  );
  if (cloudId !== siteId) {
    throw new Error("Convex cloud and site URLs must identify the same deployment");
  }

  const expectedConfirmation = `${frontend.hostname}|${cloudId}`;
  if (process.env.STAGING_TARGET_CONFIRMATION !== expectedConfirmation) {
    throw new Error(
      "STAGING_TARGET_CONFIRMATION must exactly match <frontend-host>|<convex-deployment-id>",
    );
  }

  for (const [name, staging] of [
    ["PRODUCTION_BASE_URL", frontend],
    ["PRODUCTION_CONVEX_URL", convexCloud],
    ["PRODUCTION_CONVEX_SITE_URL", convexSite],
  ]) {
    const production = optionalProductionOrigin(name);
    if (production?.origin === staging.origin) {
      throw new Error(`${name} must not equal its Staging counterpart`);
    }
  }

  const viteConvex = process.env.VITE_CONVEX_URL?.trim();
  if (viteConvex) {
    const configured = exactOrigin(viteConvex, "VITE_CONVEX_URL");
    if (configured.origin !== convexCloud.origin) {
      throw new Error("VITE_CONVEX_URL must equal STAGING_CONVEX_URL");
    }
  }
  const allowedHosts = (process.env.VITE_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  if (allowedHosts.length && !allowedHosts.includes(frontend.hostname.toLowerCase())) {
    throw new Error("VITE_ALLOWED_HOSTS must include the Staging frontend host");
  }

  return {
    frontend,
    convexCloud,
    convexSite,
    convexDeploymentId: cloudId,
    expectedConfirmation,
  };
}

export function safeStagingSummary(origins) {
  return {
    frontendHost: origins.frontend.host,
    convexCloudHost: origins.convexCloud.host,
    convexSiteHost: origins.convexSite.host,
    convexDeploymentId: origins.convexDeploymentId,
    exactTargetConfirmed: true,
  };
}
