# Phase 09.08 / 0035 — Journal Commit Seal, Context and Reversal Integrity Closure

**Date:** 2026-11-03  
**Bounded result:** 0035 IMPLEMENTED; PostgreSQL 17 code Full CI PASSED; 09.08 remains IN_PROGRESS.  
**Code validation SHA:** `aa5b7e9018e8b7ee087c954e712582b88f3b6ed5`  
**Evidence:** [CI #1308 (41677670131)](https://github.com/mostafadaghash/erp-erp-web-app-rtl-project1e1e2/actions/runs/41677670131), all four jobs SUCCESS (`verify`, `backend-verify`, `browser-contract`, `release-gate`).  
**Validation PR:** [#260](https://github.com/mostafadaghash/erp-erp-web-app-rtl-project1e1e2/pull/260), DRAFT / no merge. Documentation-record SHA also requires its own final four-gate CI; verify the PR for that independent evidence before marking administrative closure.

## Authority and change boundaries

- Architecture Baseline v1.7, Master Implementation Plan v1.0, accepted ADR-0028 and the historical 0035 design/gap review.
- Added **only** `database/migrations/0035_journal_context_immutability_reversal_integrity.sql` and matching `.meta.json`, trigger/helper tests and CI registration. No 0009, 0019, 0034 or frozen 0022 Index Catalog migration was rewritten.
- Existing `journal_entries` / `journal_lines` remain the accounting historical sources of truth. `journal_entry_seals` is a protected, rebuild-checkable **integrity seal**, not an alternate ledger.
- No Journal Writer, GL business recipe, Posting Rules 09.09, Module Cutover, production database/Convex change, destructive migration, or main merge.

## PostgreSQL 17 invariants proven

1. **Deferred durable commit seal:** canonical ordered full-line JSONB snapshot by line UUID; numeric(18,4) values preserved as exact text; account, counterparty, debit, credit, and line identity protected. Zero/zero lines remain legal and sealed.
2. **COMMIT completeness:** zero-line headers and unbalanced entries cannot commit. The unchanged `ct_journal_entries__balanced_at_commit` trigger remains alongside 0035's header and seal validators. `SET CONSTRAINTS ... IMMEDIATE` cannot permit later lines.
3. **Append-only history:** block Journal header/line UPDATE and DELETE, committed-header line INSERT, dependent PostingBatch UPDATE and DELETE, and TRUNCATE including CASCADE on protected historical tables.
4. **Context integrity:** JournalEntry exact branch/source/actor/timestamp matches its PostingBatch; JournalLine targets an active leaf GL Account in the Branch's Company; active branch enforced.
5. **Reversal contract:** only REVERSAL/DELETE_REVERSAL PostingBatch may reference a prior original of matching source/Branch/batch; reversal amounts, GL Account, and counterparty form the **exact compensating multiset**, including duplicate line multiplicities and 0/0 rows; no double reversal.
6. **Concurrency:** READ COMMITTED plus deterministic PostgreSQL row locks on PostingBatch and Journal header/original; tested competing reversals and concurrent stale line appenders.
7. **Privileged seal protection:** app role cannot write seals without grant and is still blocked after an accidental direct INSERT grant. Seal-writing function is SECURITY DEFINER with locked search_path; migration owner/superuser remain trusted schema administrators. No independent speculative indexes; seal PK is the only new index.
8. **Fail-closed migration precondition:** any pre-existing JournalEntry or JournalLine rejects 0035 atomically. No historical seal backfill, mutation, or silent reconciliation; an actual populated target requires an independently approved preflight, verified backup, and reconciliation pathway.

## Test and recovery evidence

New PostgreSQL 17 integration: `server/tests/postgresql-journal-commit-seal.integration.test.mjs`. All five test groups passed in CI #1308, including positive exact snapshots, negative SQLSTATE/constraint checks, empty/unbalanced COMMIT rollback, role privileges, TRUNCATE rejection, savepoint/early-constraint behavior, negative and valid reversals, stale-append and double-reversal races, and dirty-history migration rejection with no 0035 schema/version side effect.

Other existing PostgreSQL schema, finance, inventory and service test contracts were adjusted **only** to account for the new terminal migration, new table cleanup dependency, and preservation of earlier migration-specific tests on a legacy 0034 fixture. The code SHA passed TypeScript verification, browser contract and release gate as part of Full CI.

**Rollback:** 0035 is transactional. A failing precondition/DDL/verification aborts the migration and does not record `schema_migrations` version 0035. After successful migration, corrections must be forward-only and separately approved; do not rewrite migration checksums or alter posted history.

## Close condition and next step

**Documentation commit is not automatically certified by the code CI.** Before closing PR #260, confirm the four Full CI jobs SUCCESS on the exact final documentation SHA. Then close #260 **without Merge**, and record final CI evidence in PR metadata/body. Keep Phase 09.08 **IN_PROGRESS**.

**Next independent action only:** 09.08 Backend Journal Writer / Posting Rules gap and implementation planning, not part of 0035 and not started here. 09.09 business Posting Rules likewise remain blocked.
