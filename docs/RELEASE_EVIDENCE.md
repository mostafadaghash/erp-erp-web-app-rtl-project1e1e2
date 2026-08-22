# Release Evidence and GO/NO-GO

The repository contains a deliberately incomplete schema-version-2 template at `release/v1.0.0.evidence.template.json`. Copy it to a timestamped evidence file after freezing the release commit; do not edit the template into a false PASS.

Every applicable gate must have `status: "PASS"` and at least one durable evidence reference. Only the `migration` gate may use `NOT_APPLICABLE`, and only when `dataStrategy.mode` is `fresh_start` and every Fresh Start assertion is explicitly `false`. Backup/restore, UAT, printing, monitoring, security, performance, and Staging acceptance can never be skipped by selecting Fresh Start.

Required gates:

- repository CI;
- Staging E2E;
- performance;
- deployed security;
- data start strategy and, when applicable, migration and reconciliation;
- backup/restore drill;
- human UAT;
- A4 and thermal printing;
- monitoring and incident readiness.

## Fresh Start contract

Use `fresh_start` only when the business starts without any pre-existing operational data. The business owner must approve all of these embedded assertions:

- `hasLegacySystem: false`;
- `hasLegacyDataToImport: false`;
- `hasOpeningInventory: false`;
- `hasOpeningFinancialBalances: false`;
- `hasOutstandingCustomerOrSupplierBalances: false`;
- `hasOutstandingOperationalDocuments: false`;
- `hasOutstandingCod: false`.

The release evidence must also keep `migrationFingerprint` and `environments.migrationRehearsal` explicitly `null`, set only `gates.migration.status` to `NOT_APPLICABLE`, and attach at least one identical durable Fresh Start declaration reference to both `dataStrategy.evidence` and the migration gate. The named `dataStrategy.approvedBy` must exactly match the business owner approval.

If any assertion becomes true before launch, the release must switch to `legacy_migration`; changing only the migration gate status is rejected. Under `legacy_migration`, a full fingerprint, an isolated rehearsal deployment, a `PASS` migration gate, and reconciliation evidence remain mandatory.

Both the technical owner and business owner must record `GO`. The rollback commit must be the previous known-good commit and the rollback backup must be identified by its full SHA-256.

Validate a completed record with:

```bash
npm run release:evidence:verify -- test-results/release/v1.0.0-evidence.json
```

The verifier intentionally fails while any applicable gate is pending, the selected data strategy is internally inconsistent, the decision is `NO-GO`, Production eligibility is false, evidence is missing, or recovery identifiers are incomplete. Only a validated evidence file authorizes creation of the real `v1.0.0` tag.
