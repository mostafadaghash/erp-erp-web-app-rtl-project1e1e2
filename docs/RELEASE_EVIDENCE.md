# Release Evidence and GO/NO-GO

The repository contains a deliberately incomplete template at `release/v1.0.0.evidence.template.json`. Copy it to a timestamped evidence file after freezing the release commit; do not edit the template into a false PASS.

Every gate must have `status: "PASS"` and at least one durable evidence reference. The references may point to CI runs, Staging acceptance artifacts, load/security reports, migration evidence, restore evidence, signed UAT/printing records, or monitoring verification.

Required gates:

- repository CI;
- Staging E2E;
- performance;
- deployed security;
- migration and reconciliation;
- backup/restore drill;
- human UAT;
- A4 and thermal printing;
- monitoring and incident readiness.

Both the technical owner and business owner must record `GO`. The rollback commit must be the previous known-good commit and the rollback backup must be identified by its full SHA-256.

Validate a completed record with:

```bash
npm run release:evidence:verify -- test-results/release/v1.0.0-evidence.json
```

The verifier intentionally fails while any gate is pending, the decision is `NO-GO`, Production eligibility is false, evidence is missing, or recovery identifiers are incomplete. Only a validated evidence file authorizes creation of the real `v1.0.0` tag.
