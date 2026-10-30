# Phase 09.08 — Forward-only Migration Design and Precondition Verification

**Status:** `DESIGN_DOCUMENTED / CI_PREFLIGHT_PENDING`  
**Date:** 2026-10-30  
**Scope:** first implementation-planning slice **only**, ahead of any new Journal DDL or Journal Backend code.  
**Approved basis:** Architecture Baseline v1.7, Master Implementation Plan, ACCEPTED ADR-0027, completed `phase-09-08-gl-journal-engine.md`.  
**Starting HEAD:** `099139f04884ca7f3da4f26af1980140b686ea9e`.

## 1. Why this design must precede migration execution

ADR-0027 explicitly authorizes a *new* relational System Account Mapping design but does not authorize running SQL automatically. The current physical database has only the 33 canonical forward migrations through `0033_installment_settlement_integrity`. Those migration definitions are immutable; never rewrite or reorder them.

The validated target for the **next implementation slice**, after this read-only preflight is green, is:

- `database/migrations/0034_gl_system_account_mapping_integrity.sql`
- `database/migrations/0034_gl_system_account_mapping_integrity.meta.json`

No such files are created by this design/preflight slice. Their future `transactional: true` metadata must have an actual fail-closed `preconditionSql`, a post-migration `verificationSql`, and explicit forward-correction recovery text as required by ADR-0005.

This is an additive new relation and related integrity controls, not a correction to the applied `0009`, `0019`, or `0022` migrations. The frozen Index Catalog for all pre-existing tables is unchanged.

## 2. Accepted future 0034 physical contract

The normalized mapping table to introduce is `public.system_account_mappings`:

| Column | Exact proposed type | Purpose |
| --- | --- | --- |
| `company_id` | `uuid NOT NULL` | owning Company |
| `scope_type` | `text NOT NULL` | exactly `COMPANY` or `TREASURY` |
| `scope_id` | `uuid NOT NULL` | Company UUID for COMPANY, Treasury UUID for TREASURY |
| `role_key` | `text NOT NULL` | stable internal role name, upper snake case |
| `gl_account_id` | `uuid NOT NULL` | referenced GL account |
| `updated_by` | `uuid NOT NULL` | authorized actor |
| `updated_at` | `timestamptz NOT NULL` | last mutation time |

Required constraints:

- `PRIMARY KEY (company_id, scope_type, scope_id, role_key)`.
- `UNIQUE (company_id, scope_type, role_key, gl_account_id)`. For `(TREASURY,TREASURY_ASSET)` this prevents two Treasuries within a Company from resolving to the same GL account. Note that the approved uniqueness is scoped to **every** identical Company/Scope/Role combination, not arbitrary cross-role account exclusivity.
- Direct `ON DELETE RESTRICT` FKs on `company_id`, `gl_account_id`, and `updated_by`.
- `CHECK scope_type IN ('COMPANY','TREASURY')` and a bounded uppercase snake-case `role_key` format.
- No speculative standalone performance index.

The mapping is **reference/configuration only**. `JournalEntry + JournalLines` remain authoritative for accounting history, and `financial_movements` remain authoritative for Treasury movement history.

### Integrity guard functions and parent-row protection

A narrow PostgreSQL guard must enforce **at commit / under a concurrency-safe locking discipline**:

1. `scope_type=COMPANY` requires `scope_id=company_id`.
2. `scope_type=TREASURY` requires `scope_id` to identify an existing Treasury whose Branch belongs to the same Company; Treasury must be active when used for future posting.
3. The mapped GL Account belongs to the same Company.
4. GL Account is active and **posting-eligible leaf** (no child GL Accounts).
5. Distinct Treasuries cannot map to the same Treasury asset GL Account in a Company, enforced by the accepted UNIQUE constraint.
6. The permitted `role_key` must conform to a versioned Backend registry and legal scope. The first registry is `TREASURY_ASSET`, `CUSTOMER_RECEIVABLE_CONTROL`, `SUPPLIER_PAYABLE_CONTROL`, `CUSTOMER_ADVANCES_LIABILITY`, `CHEQUES_RECEIVABLE_CONTROL`, `CHEQUES_PAYABLE_CONTROL`.
7. Changing a Branch's Company, a Treasury's Branch, a GL Account's Company, GL hierarchy, or GL account `is_active` may not silently invalidate any existing mapping.
8. Mapping edits and account deactivation must serialize correctly with posting resolvers. A `FOR KEY SHARE` lock alone is insufficient for concurrent non-key changes such as `is_active`; validated stronger row locks, with deterministic ordering, are required.
9. Cross-company parent/child GL links, GL cycles, and reparenting that changes historical posting-account leaf eligibility must fail closed.

If a newly added BEFORE/DEFERRED trigger reads related rows, verify protection against concurrent reference mutation using PostgreSQL 17 integration tests. A naked `SELECT` and an apparently sufficient trigger are **not** concurrency proof.

No role-to-debit/credit mapping is implemented in 0034. `finance_categories.gl_account_id` remains the canonical Finance Category binding.

## 3. Journal context enforcement is a separately testable bounded slice

The accepted ADR also requires Backend and database integrity of:

- JournalEntry `branch_id/source_type/source_id/created_by/posted_at` coherent with its PostingBatch;
- JournalLine account Company matching Journal Branch Company;
- approved JournalEntry and JournalLine append-only after posting;
- reversal Journal references correct historical origin, source, Branch, and reversal PostingBatch.

Implement these as a **separate forward-only migration after mapping integrity**, if needed, so `0034` mapping migration can be reviewed/tested independently and the historical Accounting constraints remain untouched. Tentatively reserve `0035_gl_journal_context_integrity` (not created/approved for execution in this slice). The implementation may consolidate only if justified by a measured atomicity/compatibility review and remains within the accepted ADR; no migration is to be silently invented.

The existing `ct_journal_entries__balanced_at_commit` (DEFERRABLE INITIALLY DEFERRED) is preserved exactly.

## 4. Verified baseline contracts from repository (static review)

- Highest committed migration version: `0033`.
- Latest metadata and SQL pair: `0033_installment_settlement_integrity`, transactional.
- Schema framework: two files per migration, checksum-immutable, ordered, and verified under PostgreSQL advisory lock.
- Current accounting physical shape: `gl_accounts`, `journal_entries`, `journal_lines` with canonical PK/FKs, `numeric(18,4)`, Company GL code uniqueness.
- Existing Journal balance check: DEFERRABLE INITIALLY DEFERRED trigger.
- Existing Finance context: Treasury -> Branch -> Company; existing finance movement composite Treasury/Branch FKs.
- The only added independent query indexes must still be approved by §28; `0034` PK/UNIQUE are mandatory integrity constraints rather than search indexes.
- The current baseline deliberately has **no** `system_account_mappings` relation.
- No GL/Journal writer in `server/` and no 09.09 Posting Rules Catalog implementation.

## 5. Executable read-only preflight and its interpretation

A new reusable `scripts/database/phase-09-08-preflight.mjs` is the **single source of pre-0034 database readiness evidence**. It:

- verifies all currently applied checksums/definitions with `runMigrations(verifyOnly: true)`;
- runs all its own SQL under `BEGIN READ ONLY`, ending with `ROLLBACK`;
- requires PostgreSQL **17**, all 33 baseline migrations, expected canonical tables and constraints, absent new mapping relation, and the deferred Journal balance trigger;
- checks pre-existing historical rows for cross-Company GL parent links, self/cyclic parent hierarchies, Journal vs PostingBatch source/Branch/author/timestamp mismatches, JournalLine vs Branch-Company mismatches, invalid reversal lineage, Journal Entries with zero lines, and Journal Lines already posted against now-non-leaf accounts;
- reports counts of violations, without exposing credentials or modifying data;
- returns a nonzero CLI exit on failure.

The CI proof `server/tests/postgresql-gl-migration-preflight.integration.test.mjs` uses a **disposable PostgreSQL 17 test database**, seeds the existing approved `0001–0033` migrations, and verifies both an empty/clean **pass** and deliberate cross-company/cross-branch historical **fail**.

**Important verification distinction:** success in CI proves the preflight is executable and correctly detects the modeled fixtures; it **does not** certify a user's existing populated local database. A separately authorized read-only preflight must be run against each actual target database before applying `0034`. Do not report that a populated environment was inspected unless its direct read-only output was captured.

Suggested operator command (never run against Production without explicit change-control approval):

```bash
ERP_DATABASE_URL='postgresql://<redacted-target>' node scripts/database/phase-09-08-preflight.mjs
```

This script must be run while the target still has `0033` as its latest migration. It is intentionally a **pre-0034** check and will report not-ready after `0034` is applied, rather than masquerade as a post-migration verifier.

## 6. Compatibility and regression blockers to update alongside the later 0034 migration

The current PostgreSQL test harness is intentionally frozen to the **33-migration schema** and uses teardown helpers that list existing tables. The later implementation of `0034` must update all these places on the **same future implementation commit**, never in the preflight-only step:

- `server/tests/postgresql-schema-test-support.mjs` migration version list and explicit test-schema cleanup order (drop `system_account_mappings` before referenced master tables);
- `server/tests/postgresql-migrations.integration.test.mjs` version/name list and its table cleanup;
- `server/tests/postgresql-index-catalog.integration.test.mjs` latest migration assertion and absence of arbitrary independent indexes;
- `server/tests/postgresql-ddl-verification.integration.test.mjs` migration-tail expectation;
- any unit or PG fixture historically posting directly against a **parent GL account** or constructing a Journal with mismatched PostingBatch timestamps/Branch/source (the future guard will properly reject these);
- migration baseline shape assertions should remain **exact** for the original three Accounting tables if no explicit ADR-authorized additive change was made to those tables;
- any test asserting a hard-coded total number of migrations, exact table inventory, or exact trigger count.

The forward migration's metadata `preconditionSql` must fail on real historical inconsistencies rather than assume CI fixtures prove every deployment is clean. Its `verificationSql` must verify the new relation, keys, FKs, checks and appropriate guards from `pg_catalog` and prove no unintended independent indexes.

## 7. Recovery and production safety

- No Production SQL and no schema changes in this preflight step.
- `0034` will be `transactional: true`; a failure before COMMIT rolls back DDL, guards and migration history together.
- Post-COMMIT corrections require a new forward migration, not editing applied `0034` files.
- Before any actual target migration, require current backup/snapshot and documented restore point, verify the specific database target, and preserve normal Branch/Production guardrails.
- Keep `main`, Convex Cloud Production, and all legacy business functionality unchanged.
- Never configure direct PostgreSQL client access for branch devices.

## 8. Exit criteria for this *preflight design* slice

- [x] Canonical migration/framework contracts and schema dependencies reviewed.
- [x] Accepted 09.08 mapping table and constraints documented, without new SQL files.
- [x] Historical/context invalid-data preconditions defined.
- [x] Read-only reusable preflight executable authored.
- [x] PostgreSQL 17 positive/negative integration tests authored and CI-wired.
- [ ] Full CI passed on the final slice SHA and PR closed without Merge.
- [ ] Read-only result captured on each future populated target (must occur separately before actual migration).

**Next Action after Full CI gate:** implement **only** the forward-only `0034_gl_system_account_mapping_integrity` migration, with its actual `.sql`, `.meta.json`, PostgreSQL integrity/concurrency integration coverage and aligned migration harness. No Journal writer or 09.09 business rules in that next slice.
