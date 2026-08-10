# Incident Response and Launch Rollback

Use this runbook for launch-day and production incidents. The objective is to protect financial/inventory integrity first, preserve evidence, make a clear rollback/fix-forward decision, and restore service through the tested recovery path.

## 1. Severity

### SEV-1 — stop normal writes / immediate response

Examples:

- financial balances, inventory, invoices, returns or COD are being corrupted;
- unauthorized cross-branch or privileged access is confirmed;
- widespread inability to authenticate or perform core sales operations;
- destructive migration/rebuild/restore behavior is occurring;
- material data loss is suspected.

### SEV-2 — degraded but controlled

Examples:

- one important module is unavailable but core sales remain safe;
- major performance degradation without confirmed corruption;
- printing/reporting failure with safe transactional data;
- isolated role/permission regression with a reliable workaround and no confirmed exposure.

### SEV-3 — limited impact

Examples:

- cosmetic/RTL issue;
- non-critical report display defect;
- isolated workflow inconvenience with no data-integrity or security impact.

If severity is uncertain and financial/security integrity may be affected, treat it as SEV-1 until disproved.

## 2. Incident record

Immediately record:

- detection time;
- reporter/operator;
- current Production Git commit;
- frontend deployment identifier;
- Convex deployment identifier;
- latest known-good backup manifest/SHA-256;
- migration fingerprint if launch/cutover related;
- symptoms and affected roles/branches/modules;
- whether writes are still occurring;
- links/identifiers for logs, workflow runs and screenshots.

## 3. Containment

For SEV-1:

1. Stop expanding user access during launch.
2. Restrict normal writes using the safest available operational control.
3. Do not run ad-hoc database fixes before preserving evidence.
4. Create a fresh backup of the affected deployment before destructive recovery, when technically possible.
5. Preserve the failed code commit and environment/configuration identities.
6. Assign one incident owner to coordinate decisions and one technical operator to execute changes.

## 4. Diagnose the failure domain

Classify the incident before choosing recovery:

- **Code only:** bad frontend/backend release, data still consistent.
- **Configuration:** Auth URL, secrets, CORS/CSP/host/session settings, deployment configuration.
- **Data:** incorrect writes, migration, rebuild, financial/inventory corruption.
- **Infrastructure/performance:** resource pressure, external service/hosting failure, concurrency/contention.
- **Mixed:** more than one of the above.

Check whether the latest release introduced the symptom and whether data changed after the known-good recovery point.

## 5. Rollback vs fix forward

Prefer rollback when:

- the bad release is clearly identified and previous code is compatible with current data;
- data corruption requires a known-good restore;
- root cause is unknown and continued writes increase loss/exposure;
- a fix cannot be validated quickly in Staging.

Prefer fix forward only when:

- rollback would create a larger incompatibility/data-loss risk;
- the defect is isolated and the corrective patch is small, understood and testable;
- Staging/CI can validate the patch before Production application.

Record the chosen strategy and decision owner.

## 6. Code-only rollback

1. Record current bad commit and last known-good commit.
2. Verify the known-good commit passed its CI/release evidence.
3. Deploy that exact revision through the protected deployment path.
4. Do not restore database data unless reconciliation proves data changed incorrectly.
5. Run Production smoke, auth, finance/inventory spot checks before reopening broadly.

## 7. Data rollback / restore

Follow `docs/BACKUP_RESTORE.md`.

Required sequence:

1. Verify the chosen source snapshot manifest and SHA-256.
2. Create and verify a fresh pre-restore safety backup of the current target.
3. Run `restore:plan` and verify target/source identities.
4. Execute `restore:execute` only with the required safety evidence and Production confirmation token.
5. Restore/deploy compatible known-good code separately if needed.
6. Restore/verify deployment environment configuration separately.
7. Run reconciliation and smoke tests before reopening writes.

Never assume a database snapshot restores code or environment variables.

## 8. Migration/cutover incident

If failure occurs during initial migration:

1. Stop the cutover before users begin normal writes if possible.
2. Preserve the failed migration package, fingerprint and reports.
3. Compare current target with the pre-cutover backup/control totals.
4. If target integrity is uncertain, restore the verified pre-cutover snapshot.
5. Fix the migration rule against a copy of the source package, producing a new fingerprint when accepted data changes.
6. Rehearse again on clean Staging before retrying Production.
7. Never edit reconciliation controls merely to make a failing migration pass.

## 9. Security incident

For confirmed/suspected unauthorized access or secret exposure:

1. Restrict affected access immediately.
2. Preserve audit/application logs and relevant request evidence.
3. Rotate exposed credentials/secrets through the proper platform controls.
4. Disable compromised users/sessions where supported.
5. Verify role/branch permissions and sensitive-data exposure.
6. Do not place secrets in GitHub issues, chat transcripts or repository files.
7. Perform legal/regulatory/customer notification assessment with the appropriate responsible person if actual sensitive-data exposure is confirmed.

## 10. Financial/inventory integrity checks after recovery

Before reopening normal operations verify at minimum:

- treasury/bank/wallet/clearing balances;
- customer receivables/advances;
- supplier payables;
- inventory quantities and value;
- recent invoices and returns;
- repair collections/refunds;
- COD unsettled/settled totals;
- General Ledger control accounts where enabled;
- no duplicated transactions from retries.

Any unexplained difference keeps the incident open.

## 11. Reopening users

1. Admin/technical operators first.
2. A limited business operator group second.
3. Observe logs/errors and critical totals.
4. Expand to remaining users only after stable smoke operations.
5. Record the time normal service was restored.

## 12. Closeout

An incident is not closed until:

- service and data integrity are verified;
- actual data loss window/RPO is recorded;
- actual recovery duration/RTO is recorded;
- root cause is identified or a follow-up owner exists;
- corrective/preventive actions are tracked;
- tests/runbooks are updated where the incident exposed a missing control;
- temporary emergency access/configuration is removed.

For SEV-1/SEV-2, write a short post-incident review covering timeline, impact, cause, recovery, detection gaps and preventive actions.
