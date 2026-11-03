# Phase 09.08-C — GL Account Lifecycle Runtime-Role / Integrity / Concurrency Preflight

**Status:** PRE-IMPLEMENTATION DIAGNOSTIC EXECUTED / 3 HIGH-RISK LIFECYCLE BLOCKERS CONFIRMED / ACTUAL DEPLOYED DB ROLE UNVERIFIED / ACCOUNT MUTATION IMPLEMENTATION BLOCKED  
**Date:** 2026-11-03  
**Branch:** `agent/postgres-v1.7-core`  
**Authority:** Architecture Baseline v1.7; accepted ADR-0027, ADR-0028 and ADR-0029; Master Implementation Plan §09.08; `docs/gap-analysis/phase-09-08-post-b-chart-lifecycle-mapping-admin-delta.md`.  
**Test implementation:** `server/tests/postgresql-09-08-c-gl-lifecycle-preflight.integration.test.mjs`; CI step added in `.github/workflows/ci.yml`.  
**Validated test/CI code SHA:** `3020020867c7a3c9e75bbf172c8302ad9075bce8`.  
**Full CI:** [#1332](https://github.com/mostafadaghash/erp-erp-web-app-rtl-project1e1e2/actions/runs/41722195730), run `41722195730`, COMPLETED/SUCCESS, `verify`, `backend-verify` (PostgreSQL 17 with 09.08-C probe), `browser-contract`, and `release-gate` all SUCCESS.

## 1. Scope, interpretation and control boundary

This slice added **only diagnostic PostgreSQL 17 integration tests and their CI invocation**. No `GLAccountService.update`, `activate`, `deactivate`, mapping-administration service, SQL migration, index, production data, privileged database configuration or HTTP/UI endpoint has been implemented. The test runs against the isolated CI PostgreSQL 17 instance; fixture data and a simulated non-owner `NOLOGIN` role are temporary and rolled back/cleaned up.

**Important:** SUCCESS means that the exploratory tests executed and the observed unsafe SQL behavior was classified. It **does not mean the ADR-0029 lifecycle integrity gate has passed**. The tests assert the observed current baseline behavior and mark unsafe outcomes with diagnostic BLOCKER messages, instead of declaring them safe. Before shipping a lifecycle feature, independent fail-closed **negative tests** must replace these baseline classifications and prove the forbidden operations fail.

The GitHub CI `ERP_TEST_DATABASE_URL` authenticates as PostgreSQL `postgres` (SUPERUSER/migration owner), not a proven deployment-equivalent application principal. The test explicitly creates and switches to a non-superuser `erp_0908_c_probe` role inside one rollback-only transaction, grants scoped `gl_accounts` SELECT/INSERT/UPDATE and read access to `system_account_mappings` and `journal_lines`, and verifies that role cannot UPDATE journal history. This is **a modeled potential DML role**, not evidence of actual installed production grants.

## 2. Executed cases and evidence

| Case | Executed PG17 evidence | Classification |
| --- | --- | --- |
| Sealed, balanced historical Journal fixture | One POST PostingBatch, JournalEntry, debit/credit lines and COMMIT-time `journal_entry_seals` persisted in isolated test DB | PASS, trustworthy history precondition |
| Simulated non-owner role metadata | `rolsuper=false`, `gl_accounts UPDATE=true`, `journal_lines UPDATE=false`, temporary role/grants rolled back | PASS for model only; **production role UNKNOWN** |
| Mapped GL deactivation | UPDATE rejected with PostgreSQL `23514 / ct_gl_accounts__mapped_active` | **Protected by existing 0034** |
| Posted, unmapped GL deactivation | Non-superuser with modeled GL UPDATE permission successfully sets `is_active=false` | **HIGH: unsafe direct SQL path confirmed** |
| Active Finance Category GL deactivation | Account referenced by active `finance_categories` can be deactivated | **HIGH: dependent account becomes unusable** |
| Active child under inactive GL parent | Direct SQL inserted active child beneath inactive parent | **HIGH: hierarchy lifecycle gap** |
| Writer metadata lock versus conflicting GL update | Writer `FOR SHARE` makes competing UPDATE time out with `55P03`; after lock release UPDATE succeeds despite historical Journal | **Lock works; history eligibility not guaranteed** |
| Test cleanup | Rolled-back unsafe mutations and temporary non-owner role absent; PostgreSQL test fixture cleaned | PASS |
| Historical source records | Original Journal seal remains intact throughout diagnostic | PASS; does not ensure future reversal remains executable after unsafe deactivation |

**Consequences:** ADR-0029 prohibits deactivation of every historically posted account because `JournalWriterService.reverseWithinTransaction` uses active GL accounts to create compensating entries. The runtime user must not be able to bypass policy through direct unrestricted DML. Similarly, active Finance Category references and an inactive parent with active children conflict with ADR-0029 lifecycle requirements.

## 3. Security and concurrency qualifications

1. `READ COMMITTED + SELECT ... FOR UPDATE` and `FOR SHARE` are compatible with v1.7, but locks alone do not protect a historical invariant once the lock is released. New lifecycle commands must re-evaluate historical `journal_lines`, mapped target, Finance Category, and children under compatible fixed row locks within a single transaction.
2. The Company / Treasury / GL lock order must remain compatible with 0034 and the Journal Writer; no blanket SERIALIZABLE, arbitrary new index or destructive rewrite.
3. PostgreSQL 0034/0035 migration history and immutable Journal entries remain untouched; any necessary SQL-level hardening must be a **separately approved forward-only migration** backed by evidence on PostgreSQL 17, after runtime role/grant requirements are reviewed.
4. Current CI uses `postgres` for schema migration and testing. The connection configured by an actual Backend via `ERP_DATABASE_URL` is **not proven** to have safe least-privilege grants. Nothing in this preflight touches a populated server or Production database.
5. Failure of a future expected-rejection negative test is a **release blocker**, even if all nonnegative diagnostic tests and four CI jobs are green.

## 4. Gates and boundaries

- [x] Keep original 0009, 0019, 0034, 0035 and 0036 migrations unchanged.
- [x] Add isolated PostgreSQL 17 probes for historically posted account, active Finance Category, inactive GL parent, existing mapped-account protection and held/released GL locks.
- [x] Simulate a non-owner role under temporary GRANT and rollback; explicitly separate it from deployed DB role assertions.
- [x] Run all four CI jobs on `3020020867c7a3c9e75bbf172c8302ad9075bce8` (Full CI #1332 SUCCESS).
- [ ] Verify an approved production-equivalent runtime DB principal and effective table/function/role grants; no Production secret or populated data access is authorized by this review.
- [ ] Approve and implement necessary SQL/privilege remediation on an independent gated future step if SQL-level bypass is possible under the approved runtime principal.
- [ ] Future fail-closed tests must **reject** historically posted/unmapped GL deactivation, active-category deactivation and inactive-parent child creation, and demonstrate concurrent posting/reversal safety.
- [ ] Complete 09.08-C account mutation/lifecycle service and Audit/idempotency/role boundary only after the above constraints are satisfied.
- [ ] Final documentation SHA must separately pass four-job Full CI before closing validation-only PR #268 WITHOUT MERGE.

**Phase status:** 09.08-C pre-implementation discovery preflight is recorded, but GL Account Mutation/Lifecycle **is BLOCKED / NOT IMPLEMENTED**. Parent 09.08 remains IN_PROGRESS; 09.08-D Mapping Administration and 09.09 Posting Rules are NOT STARTED. No main/Production/Convex changes.

**Single next action AFTER this PR closes without merge:** Documentation-only **09.08-C runtime PostgreSQL principal/GRANT contract and integrity-hardening decision review**, defining the exact production-equivalent role, necessary DML boundaries, transaction-safe historical/Finance Category/parent protections, and the evidence needed before separately authorizing any forward-only SQL correction. Do not write mutation services, change Production, or start mapping admin in the same step.
