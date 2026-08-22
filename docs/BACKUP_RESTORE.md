# Backup, Restore, and Rollback Runbook

This runbook defines the repository-side recovery controls for the ERP application. Live proof still requires a dedicated Staging deployment and a real restore rehearsal.

## 1. Recovery objectives

These are provisional launch targets and must not be marked achieved until a timed Staging recovery drill succeeds.

- **RPO target: 24 hours maximum.** Production must have at least one complete recoverable snapshot per day. Take an additional backup immediately before every production migration, destructive maintenance task, or high-risk release.
- **RTO target: 4 hours maximum.** The operational goal is to restore data, restore the known-good application version and environment configuration, complete reconciliation/smoke tests, and reopen users within four hours of the recovery decision.
- If the first Staging drill cannot meet either target, the target or the recovery design must be revised before Production launch.

A database snapshot alone is not a complete application recovery point. Convex backup data does not replace source control or deployment environment configuration. Therefore the release record must retain all three identities:

1. Git commit/release identifier.
2. Convex snapshot manifest and SHA-256.
3. Environment/configuration version or controlled copy maintained outside the snapshot.

## 2. What the Convex snapshot covers

The repository tools use the Convex CLI snapshot format:

- `convex export` produces a ZIP snapshot from an explicitly selected deployment.
- File Storage is included by default by this wrapper; it can only be omitted explicitly.
- `convex import --replace` is the destructive data-restore operation used by the wrapper.
- Backup/restore data is separate from deployed code and environment variables, so code/config rollback is handled as a separate step below.

The scripts never infer Production from the local developer deployment. The target deployment reference and logical environment are both mandatory.

## 3. Safety controls implemented in the repository

### Backup

- Plan-only by default.
- Explicit deployment is required.
- Output must be a new `.zip` path; an existing evidence file is never overwritten.
- File Storage is included by default.
- Successful export produces a sidecar manifest containing deployment, environment, creation time, file-storage flag, source commit, byte size, and SHA-256.
- Production execution requires the exact confirmation token `BACKUP:<deployment>`.

### Restore

- Plan-only by default.
- Restore source must have a valid sidecar manifest.
- The ZIP size and SHA-256 must still match the manifest before any restore command is constructed for execution.
- Executing a restore additionally requires a verified **pre-restore safety backup** of the target deployment.
- That pre-restore manifest must identify the same target deployment and environment.
- Production execution requires an operation-specific token containing the target and the first 12 characters of the source snapshot SHA-256.
- The wrapper uses argument arrays rather than shell interpolation for the Convex command.

Real snapshot ZIPs and their manifests are ignored by Git and must not be committed.

## 4. Create a backup

First inspect the command without executing it:

```bash
npm run backup:plan -- \
  --deployment staging \
  --environment staging \
  --output backups/staging-before-uat.zip
```

Then execute intentionally:

```bash
npm run backup:create -- \
  --deployment staging \
  --environment staging \
  --output backups/staging-before-uat.zip
```

For Production, first run the plan, then provide the exact production confirmation token printed by policy:

```bash
npm run backup:create -- \
  --deployment prod \
  --environment production \
  --output backups/prod-before-release.zip \
  --confirm-production BACKUP:prod
```

Use a timestamped or release-specific output path in real operations. Never reuse a previous evidence path.

## 5. Verify a backup

Every exported snapshot must be verified before it is treated as a recovery point:

```bash
npm run backup:verify -- backups/staging-before-uat.zip.manifest.json
```

A successful check proves that the current ZIP is non-empty and still matches the exact size and SHA-256 recorded immediately after export. It does **not** prove that Convex can successfully restore it; that is established by the Staging restore drill.

## 6. Plan a restore

A restore plan verifies the source package and prints the exact target/command without changing data:

```bash
npm run restore:plan -- \
  --deployment restore-drill \
  --environment staging \
  --snapshot-manifest backups/known-good.zip.manifest.json
```

Do not proceed if the deployment shown in the plan is not the intended target.

## 7. Required pre-restore safety backup

Immediately before executing a destructive restore, create a new backup of the target deployment itself:

```bash
npm run backup:create -- \
  --deployment restore-drill \
  --environment staging \
  --output backups/restore-drill-pre-restore.zip
```

Verify it:

```bash
npm run backup:verify -- backups/restore-drill-pre-restore.zip.manifest.json
```

This snapshot is the escape path if the chosen recovery point was wrong or the incident analysis changes after restoration begins.

## 8. Execute a Staging restore drill

```bash
npm run restore:execute -- \
  --deployment restore-drill \
  --environment staging \
  --snapshot-manifest backups/known-good.zip.manifest.json \
  --pre-restore-manifest backups/restore-drill-pre-restore.zip.manifest.json
```

After the CLI finishes, the environment must remain closed to normal users until the post-restore checks below pass.

## 9. Production restore approval token

Production restore requires the exact token generated from the intended target and source snapshot hash:

`RESTORE:<deployment>:<first-12-of-source-sha256>`

Example shape only:

`RESTORE:prod:0123456789ab`

The token is deliberately tied to the selected backup. Choosing another snapshot changes the required token.

## 10. Post-restore verification

A successful CLI exit is not sufficient. Complete all of the following before reopening writes:

1. Record the restore source manifest SHA-256 and Git release/commit in the incident or drill record.
2. Run the repository CI-equivalent verification against the known-good code.
3. Run authenticated Staging smoke tests and role/branch tests.
4. Compare branch and consolidated control totals for inventory quantity/value, customer receivables/advances, supplier payables, financial accounts, and COD.
5. Confirm finance/customer/supplier/general-ledger opening and operational balances remain internally consistent.
6. Verify critical document reads and one controlled write flow in each enabled module.
7. Verify the required Auth environment variables `SITE_URL`, `JWT_PRIVATE_KEY`, and `JWKS` are present on the restored deployment. Record presence and the controlled configuration version only; never copy secret values into drill evidence.
8. Verify login/logout and required security headers on the restored deployment.

Copy `release/restore-drill.evidence.template.json`, fill it only from observed results, and validate the completed drill together with both verified manifests:

```bash
npm run restore:verify -- \
  --evidence test-results/restore/restore-drill.json \
  --source-manifest backups/staging-source.zip.manifest.json \
  --pre-restore-manifest backups/restore-drill-pre-restore.zip.manifest.json
```

The verifier refuses a same-deployment drill, a backup without File Storage, a missing environment-configuration check, a failed mandatory check, RPO above 24 hours, or RTO above 4 hours.

9. Record actual recovery duration and the newest transaction timestamp represented by the recovery point.

Only then mark the recovery drill successful.

## 11. Full rollback procedure

Rollback is a coordinated recovery of **data + code + configuration**, not only a database restore.

### A. Contain

- Stop or restrict business writes.
- Record the incident start time, current Git commit, deployment identity, and current environment/configuration version.
- Preserve logs/evidence needed for root-cause analysis.

### B. Preserve the bad state

- Create and verify a new pre-restore backup of the affected deployment before replacing data.
- Do not delete the failed-state evidence merely because a known-good snapshot exists.

### C. Restore data when required

- Select a verified known-good snapshot whose timestamp satisfies the accepted data-loss decision.
- Run `restore:plan` and confirm target/source identifiers.
- Execute through `restore:execute` with the pre-restore manifest.

### D. Restore application code

- Identify the last known-good Git commit/release.
- Deploy that exact code revision through the normal protected deployment path.
- Do not fix forward during an emergency restore unless the incident commander explicitly chooses that strategy.

### E. Restore configuration separately

- Compare Auth settings, site URL, allowed hosts/origins, security policy, and all required deployment environment variables with the known-good configuration record.
- For the password-authentication configuration, explicitly verify `SITE_URL`, `JWT_PRIVATE_KEY`, and `JWKS` as one matched recovery set.
- Restore missing/changed values through the controlled Convex/dashboard process.
- Never assume a database snapshot restored environment variables or application code.

### F. Validate and reopen gradually

- Complete reconciliation and smoke/UAT checks.
- Re-enable a limited operator/admin group first.
- Observe errors, finance totals, inventory totals, authentication, and COD flows.
- Reopen the remaining users only after the system remains stable.

## 12. Staging drill acceptance record

For every rehearsal record:

- drill date/time;
- source snapshot SHA-256;
- source snapshot timestamp;
- target deployment;
- pre-restore backup SHA-256;
- Git commit before and after rollback;
- time restore command started/ended;
- time reconciliation completed;
- actual RPO observed;
- actual RTO observed;
- failed checks and remediation;
- final pass/fail decision.

A Production release cannot claim the 24-hour RPO / 4-hour RTO targets until at least one representative Staging backup-and-restore drill has passed with recorded evidence.
