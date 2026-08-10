# Staging and Release Gate

This document defines the non-production staging workflow for the ERP application. Staging must use a separate Convex deployment, separate browser-test accounts, synthetic data, and a separate frontend URL. Production data and production credentials must never be used for browser E2E.

## 1. GitHub environment

Create a GitHub Environment named `staging`.

Configure these non-secret environment variables:

- `STAGING_BASE_URL`: HTTPS URL of the staging frontend.
- `E2E_PRODUCT_QUERY`: name or SKU fragment for a synthetic active product seeded in staging.

Configure these Environment secrets:

- `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD`
- `E2E_MANAGER_EMAIL` / `E2E_MANAGER_PASSWORD`
- `E2E_ACCOUNTANT_EMAIL` / `E2E_ACCOUNTANT_PASSWORD`
- `E2E_SALES_EMAIL` / `E2E_SALES_PASSWORD`
- `E2E_VIEWER_EMAIL` / `E2E_VIEWER_PASSWORD`

Admin credentials and the seeded product selector are required. Other role pairs can be omitted while infrastructure is being prepared, but their role-specific tests will be skipped. Configure every role pair before final UAT.

Never commit secret values. `.env.staging.example` contains names/placeholders only.

## 2. Convex staging deployment

Create a Convex deployment dedicated to staging. Do not reuse the production deployment.

Set the staging deployment environment variables required by Auth and the application. Verify the frontend origin, Auth site URL, allowed host/origin policy, and all server-only secrets.

Deploy the backend only after verifying the selected Convex deployment. Create synthetic staging data: at least one active branch, supplier, product matching `E2E_PRODUCT_QUERY`, required finance accounts, and dedicated staging employees for the acceptance roles. Assign branch access intentionally so role/branch tests exercise real restrictions.

## 3. Frontend staging deployment

Deploy the Vite build to a staging-only domain. The build must point `VITE_CONVEX_URL` at the staging Convex deployment.

The staging domain must use HTTPS. Configure `SITE_URL` and allowed-host/origin settings to the exact staging origin. Do not use wildcard production origins.

## 4. Local staging guard

Create ignored `.env.staging.local` from `.env.staging.example` and fill only staging values.

```bash
npm run staging:check
```

The guard rejects missing admin credentials or product fixture selector, non-`staging` environment names, malformed URLs, remote HTTP targets, production-looking hostnames, and half-configured role credential pairs. Credential values are never printed.

## 5. Browser E2E

Install the pinned runner without modifying `package-lock.json`, then install Chromium:

```bash
npm run e2e:install
npx playwright install chromium
```

Available suites:

```bash
npm run test:e2e:staging
npm run test:e2e:smoke
npm run test:e2e:roles
npm run test:e2e:flows
```

Coverage includes authenticated navigation for invoices, products, repairs, deliveries/COD, treasury and reports; RTL/mobile overflow; keyboard-focus smoke; A4 print CSS; role navigation boundaries; admin working-branch selection; and pre-submit operational readiness for sales invoices, purchase shipments, repair intake, and COD delivery creation.

The operational readiness tests deliberately stop before committing new business transactions. Full write-path UAT is performed later with controlled staging fixtures so repeated CI runs cannot silently accumulate business records.

## 6. GitHub Actions gates

`CI / release-gate` runs automatically on pull requests and must remain the required merge check. It represents the existing typecheck, Node tests, security check, and production build as one explicit final result.

`Staging Release Gate / release-gate` is intentionally `workflow_dispatch` while the external staging deployment, GitHub Environment variables, and secrets do not yet exist. Run it manually after staging is provisioned.

Once staging is stable, enable the `pull_request` trigger in `staging-gate.yml` and then add its `release-gate` check to branch protection. Do not make a non-provisioned external environment a required PR check.

Any future deployment job must depend on a final release gate rather than an individual test step.

## 7. Post-deploy smoke checklist

Immediately after each staging deployment:

1. Confirm login/logout with the dedicated admin account.
2. Open invoices, products, repairs, deliveries, treasury, and reports.
3. Confirm the active branch selector contains only expected staging branches.
4. Run smoke, roles, and operational-flow suites.
5. Verify A4 printing in browser preview and perform one physical A4 print when available.
6. Test the responsive layout on a real phone in addition to Playwright emulation.
7. Inspect CSP, HSTS, CORS, cookies/session lifetime, anti-frame policy, and all security headers from the deployed origin.
8. Confirm the frontend bundle contains no server secrets.
9. Record workflow and deployment identifiers in the release checklist.

## 8. Live-only acceptance

Repository preparation does not prove infrastructure behavior. Load testing, deployed security-header inspection, real session expiry, physical thermal printing, real write-path UAT, backup/restore, migration reconciliation, monitoring/alerts, and Production smoke remain environment acceptance tasks.
