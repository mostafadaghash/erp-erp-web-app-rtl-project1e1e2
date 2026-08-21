# v1.0.0-rc1 Release Checklist

This checklist is the final go/no-go contract for the first production release. Repository preparation can be completed before a laptop/Staging environment exists; all live gates require recorded evidence from the deployed environment.

## A. Repository gate — automated

Before accepting any release candidate commit:

- [ ] `CI / verify` succeeded.
- [ ] TypeScript checks succeeded.
- [ ] Complete Node test suite succeeded.
- [ ] Security static checks succeeded.
- [ ] Production build succeeded.
- [ ] `CI / browser-contract` successfully compiled/discovered the Playwright suite.
- [ ] `CI / release-gate` succeeded.
- [ ] Migration dry-run tooling remains write-disabled by default.
- [ ] Backup and restore tooling remains plan-only by default.
- [ ] `release/v1.0.0-rc1.json` still has `productionEligible: false` until live acceptance is complete.

## B. GitHub protection

- [ ] Protect `main` from direct unreviewed changes.
- [ ] Require the final CI `release-gate` before merge.
- [ ] Once live Staging is configured, require the Staging Release Gate for release-bound changes.
- [ ] Confirm failed checks block merge/deployment.
- [ ] Record the release candidate commit SHA.

## C. Staging infrastructure

- [ ] Create a Convex deployment dedicated to Staging.
- [ ] Deploy the frontend to a Staging-only HTTPS origin.
- [ ] Configure Auth and server-only secrets outside source control.
- [ ] Configure exact `SITE_URL`, allowed hosts/origins, CORS/CSP/session settings.
- [ ] Create synthetic branches, users, products, suppliers, financial accounts, and COD fixtures.
- [ ] Configure dedicated UAT accounts for required roles.
- [ ] Configure the GitHub `staging` Environment and its variables/secrets.

## D. Automated Staging acceptance

- [ ] Run the Staging environment guard.
- [ ] Run authenticated Playwright smoke tests.
- [ ] Run role/branch permission acceptance.
- [ ] Run operational flow readiness for invoices, purchase shipments, repairs, and COD.
- [ ] Run mobile/RTL/focus acceptance.
- [ ] Run A4 print-browser acceptance.
- [ ] Store the Staging Release Gate workflow run as evidence.

## E. Performance acceptance

- [ ] Run the real Staging load test against the deployed URL.
- [ ] Record request rate and failure rate.
- [ ] Record P50, P95, and P99 latency.
- [ ] Review Convex usage and insights for resource limits/OCC conflicts.
- [ ] Review slow/heavy reporting operations under realistic historical data.
- [ ] Exercise concurrent invoice/collection/settlement workflows.
- [ ] Resolve any launch-blocking performance regression and rerun the test.

## F. Deployed security acceptance

- [ ] Verify CSP from the live response.
- [ ] Verify HSTS where applicable to the Staging/Production hosting layer.
- [ ] Verify CORS only allows intended origins.
- [ ] Verify session cookies and secure attributes.
- [ ] Verify session expiration and idle behavior.
- [ ] Verify anti-framing behavior.
- [ ] Verify unapproved hosts/origins are rejected.
- [ ] Verify login, logout, disabled-user, and expired-session behavior.
- [ ] Inspect the frontend build/assets for accidental server secrets.
- [ ] Record the deployed security acceptance result.

## G. Migration rehearsal

- [ ] Freeze a representative copy of legacy source data.
- [ ] Transform it to the migration input contract.
- [ ] Run `migration:prepare` with fail-on-rejects and fail-on-differences.
- [ ] Resolve every rejected source row or document its approved exclusion.
- [ ] Resolve every supplied control-total difference.
- [ ] Record the immutable migration fingerprint and `migrationRunId`.
- [ ] Back up the clean Staging target.
- [ ] Apply the controlled migration procedure to Staging.
- [ ] Complete `docs/MIGRATION_RECONCILIATION.md` after the write.
- [ ] Restore a clean Staging copy and repeat the rehearsal to prove rerun behavior.

## H. Backup / restore drill

- [ ] Create a complete Staging snapshot with File Storage.
- [ ] Verify the snapshot manifest and SHA-256.
- [ ] Create a separate pre-restore safety backup.
- [ ] Execute a destructive restore only on the isolated Staging target.
- [ ] Run post-restore reconciliation and smoke tests.
- [ ] Record observed RPO and RTO.
- [ ] Confirm the provisional RPO <= 24h and RTO <= 4h targets are achievable or revise the recovery plan.

## I. Human UAT

Complete `docs/UAT_SCENARIOS.md` with named testers and evidence.

- [ ] Admin.
- [ ] Manager.
- [ ] Accountant.
- [ ] Sales.
- [ ] Customer service.
- [ ] Technician.
- [ ] Shipping/COD.
- [ ] Viewer/read-only.
- [ ] Cross-branch denial scenarios.
- [ ] Physical A4 printing.
- [ ] Physical thermal printing.
- [ ] Real phone/browser RTL usage.

## J. Monitoring and incident readiness

- [ ] Production logs are accessible to the operating team.
- [ ] Error/exception monitoring is enabled or an explicit launch monitoring procedure exists.
- [ ] Operational/usage alerts are configured where available.
- [ ] `docs/INCIDENT_RESPONSE.md` has named incident ownership for launch day.
- [ ] A known-good rollback commit is recorded.
- [ ] A verified production pre-launch backup exists.
- [ ] Required environment/configuration recovery information is available outside the database snapshot.

## K. Go / no-go

All release owners must answer **GO** before Production deployment:

- Repository/CI: GO / NO-GO
- Staging E2E: GO / NO-GO
- Performance: GO / NO-GO
- Security: GO / NO-GO
- Migration/reconciliation: GO / NO-GO
- Backup/restore: GO / NO-GO
- Human UAT: GO / NO-GO
- Monitoring/incident readiness: GO / NO-GO

Any NO-GO blocks Production.

## L. Production cutover

- [ ] Freeze legacy writes at the agreed cutover point.
- [ ] Generate the final legacy source export and control totals.
- [ ] Verify the final migration fingerprint/package.
- [ ] Create and verify the Production pre-cutover backup.
- [ ] Deploy the exact approved release candidate code.
- [ ] Apply the migration/cutover procedure.
- [ ] Rebuild reporting facts/statistics required after migration.
- [ ] Complete Production reconciliation.
- [ ] Run Production smoke tests.
- [ ] Start with limited operator/admin access.
- [ ] Expand access only after stability checks pass.

## M. Post-launch

- [ ] Observe errors, auth, finance balances, inventory, invoices, repairs, COD and reporting closely during the launch window.
- [ ] Confirm scheduled/periodic backup policy is active.
- [ ] Confirm no migration/rebuild task is still running unexpectedly.
- [ ] Record final Production commit, deployment identifiers, migration fingerprint and backup SHA-256.
- [ ] Record launch decision and any accepted residual risks.

Complete and validate the final evidence record using `docs/RELEASE_EVIDENCE.md`. Run the controlled Production checks in `docs/PRODUCTION_SMOKE_TEST.md` immediately after deployment.

The candidate becomes eligible for a real `v1.0.0-rc1` release/tag only after sections B–K have live evidence. Production deployment requires section L and immediate post-launch verification.
