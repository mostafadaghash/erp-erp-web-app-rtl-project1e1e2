# Phase 03.08 — DDL Verification Coverage

**Status:** VERIFYING  
**Branch:** `agent/postgres-v1.7-core`  
**Starting SHA:** `62b3e0b7052ac5b5f2f1eb58209c75eb9095b91f`

## Scope rule

Phase 03.08 is a verification phase. It does not create another business-schema migration and does not recreate checks already closed in 03.06/03.07. Existing PostgreSQL 17 integration tests remain the executable evidence for the DDL they already cover. Only uncovered Gate 03 behavior is added here.

## Coverage matrix

| Phase 03.08 requirement | Executable evidence |
| --- | --- |
| clean DB builds from zero | `postgresql-migrations.integration.test.mjs` fresh apply |
| migrations apply in deterministic order | `postgresql-migrations.integration.test.mjs` + `MIGRATIONS` 0001..0022 |
| schema verification passes | migration `verificationSql` + existing per-domain schema integration suites |
| duplicate username case-insensitive rejection | **new:** `postgresql-ddl-verification.integration.test.mjs` |
| duplicate email case-insensitive rejection | **new:** `postgresql-ddl-verification.integration.test.mjs` |
| duplicate branch code rejection | `postgresql-core-organization-security-constraints.integration.test.mjs` |
| cross-branch warehouse references rejection | core/inventory/sales constraint suites |
| cross-product unit references rejection | `postgresql-product-catalog-constraints.integration.test.mjs` |
| duplicate barcode/SKU/serial rules | product/inventory constraint suites + exact 03.07 index catalog |
| active reservation uniqueness | inventory/sales constraint suites + exact 03.07 index catalog |
| document number uniqueness | core + sales + purchasing + finance + repairs constraint suites |
| tombstone uniqueness | core organization/security constraint suite |
| invalid negative values rejection | existing domain constraint suites; permission-gated negative stock remains intentionally not globally blocked |
| journal line validation | `postgresql-accounting-constraints.integration.test.mjs` |
| deferred journal balance failure at COMMIT | `postgresql-accounting-constraints.integration.test.mjs` |
| valid journal commit | `postgresql-accounting-constraints.integration.test.mjs` |
| delete restriction on historical entities | inventory/accounting/repairs and other domain constraint suites |
| exact frozen index catalog | `postgresql-index-catalog.integration.test.mjs` |
| no extra unexplained independent index | `postgresql-index-catalog.integration.test.mjs` |
| no direct PostgreSQL exposure to client network | **new:** compose contract in `postgresql-ddl-verification.integration.test.mjs` |

## New 03.08 checks only

1. PostgreSQL major version is exactly 17 during the integrated DDL gate.
2. `lower(username)` uniqueness rejects case-only duplicates using `ux_users__lower_username`.
3. `lower(email)` partial uniqueness rejects case-only duplicates while allowing multiple NULL emails.
4. `infra/local/docker-compose.yml` does not publish a PostgreSQL host port; backend connectivity remains internal via `postgres:5432`.
5. Final migration history reaches `0022_index_catalog` and verify-only mode passes.

## Non-goals

- No migration `0023`.
- No new index.
- No Business Backend command implementation.
- No Module Cutover.
- No dual write.
- No Convex Production change.
- No merge to `main`.

## Exit procedure

1. Run the full PR CI with the new 03.08 gate on the implementation SHA.
2. If all jobs pass, update the canonical Master Implementation Plan in-place to `03.08 CLOSED`.
3. Run Full CI again on that final documentation SHA.
4. Close the validation-only PR without merge.
