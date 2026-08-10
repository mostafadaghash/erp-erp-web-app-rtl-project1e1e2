# Staging and Release Gate

This document defines the non-production staging workflow for the ERP application. Staging must use a separate Convex deployment, separate browser-test accounts, and a separate frontend URL. Production data and production credentials must never be used for browser E2E.

## 1. GitHub environment

Create a GitHub Environment named `staging`.

Configure the non-secret environment variable:

- `STAGING_BASE_URL`: the HTTPS URL of the deployed staging frontend.

Configure these Environment secrets:

- `E2E_ADMIN_EMAIL`
- `E2E_ADMIN_PASSWORD`
- `E2E_MANAGER_EMAIL` / `E2E_MANAGER_PASSWORD`
- `E2E_ACCOUNTANT_EMAIL` / `E2E_ACCOUNTANT_PASSWORD`
- `E2E_SALES_EMAIL` / `E2E_SALES_PASSWORD`
- `E2E_VIEWER_EMAIL` / `E2E_VIEWER_PASSWORD`

Admin credentials are required. Other role pairs can be omitted temporarily, but their role-specific tests will be skipped until configured. For final UAT all role pairs must be configured.

Never commit secret values. `.env.staging.example` is a names-only template.

## 2. Convex staging deployment

Create a Convex deployment dedicated to staging. Do not reuse the production deployment.

Set the staging deployment environment variables required by Auth and by the application. In particular verify the deployed frontend origin, Auth site URL, allowed host/origin policy, and any server-only secrets.

Deploy the backend to the selected staging deployment using the project Convex CLI workflow. Verify the deployment target before accepting any prompt or running a mutation.

After deployment, create only synthetic test data and dedicated staging employees. Required final UAT roles are admin, manager, accountant, sales, and viewer. Assign branch access intentionally so role/branch tests exercise real restrictions.

## 3. Frontend staging deployment

Deploy the Vite build to a staging-only domain. The build must point `VITE_CONVEX_URL` at the staging Convex deployment.

The staging domain must use HTTPS. Configure `SITE_URL` and the application allowed-host/origin settings to the exact staging origin. Do not allow wildcard production origins for convenience.

## 4. Local staging guard

Create an ignored `.env.staging.local` from `.env.staging.example` and fill only staging values.

Run:

```bash
npm run staging:check
```

The guard rejects missing admin credentials, non-`staging` environment names, malformed URLs, remote HTTP targets, production-looking hostnames, and half-configured role credential pairs. It never prints credential values.

## 5. Browser E2E

Install the pinned browser test runner without changing `package-lock.json`:

```bash
npm run e2e:install
npx playwright install chromium
```

Run the full authenticated suite:

```bash
npm run test:e2e:staging
```

Run only critical smoke tests:

```bash
npm run test:e2e:smoke
```

Run role/branch acceptance tests:

```bash
npm run test:e2e:roles
```

The suite covers authenticated navigation across invoices, products, repairs, deliveries/COD surface, treasury, and reports; RTL/mobile layout; keyboard focus smoke; A4 print stylesheet behavior; role navigation boundaries; and admin working-branch availability.

## 6. GitHub Actions gates

Two workflows are expected:

- `CI / release-gate`: repository typecheck, Node test suite, security check, and build must complete successfully.
- `Staging Release Gate / release-gate`: the repository quality job and authenticated Playwright job must both complete successfully.

Configure branch protection on `main` so both release-gate checks are required before merge when staging is fully configured. Do not require the Staging gate before its GitHub Environment variable and secrets exist, otherwise every PR will be blocked by configuration rather than code.

No deploy job should depend directly on an individual test step. A future deployment workflow must depend on the final `release-gate` result.

## 7. Post-deploy smoke checklist

Immediately after each staging deployment:

1. Confirm login and logout with the dedicated admin account.
2. Open invoices, products, repairs, deliveries, treasury, and reports.
3. Confirm the active branch selector contains only expected staging branches.
4. Run `npm run test:e2e:smoke` against the deployed URL.
5. Run role tests for every configured staging role.
6. Verify A4 printing in browser preview and perform one physical A4 print when available.
7. Verify the mobile layout on a real phone in addition to the emulated Playwright mobile project.
8. Inspect CSP, HSTS, CORS, cookies/session lifetime, anti-frame policy, and security headers from the deployed origin.
9. Confirm the frontend bundle contains no server secrets.
10. Record the workflow run and staging deployment identifiers in the release checklist.

## 8. What remains live-only

Repository preparation does not prove live infrastructure behavior. Load testing, deployed security-header inspection, real session expiry, physical thermal printing, real backup/restore, data migration reconciliation, monitoring/alerts, and Production smoke testing remain deployment-environment acceptance tasks.
