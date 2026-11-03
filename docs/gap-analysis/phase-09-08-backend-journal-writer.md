# Phase 09.08 — Backend Journal Writer / Resolver Gap Review

**Date:** 2026-11-03
**Authority:** Architecture Baseline v1.7 §§24.16, 25.14, 26.7, 27; Master Plan 09.08; accepted ADR-0027/0028; completed 0034 and 0035.

## Existing
- Canonical JournalEntry and JournalLines, exact numeric(18,4), immutable 0035 COMMIT seal and deferred 0009 balance.
- Approved scoped mapping table, locking/hierarchy guards, PostingBatchService, transaction runner, Branch Scope, stable error mapping.
- No trusted internal Journal writer or six-role mapping resolver in the backend.

## New bounded writer contract
- Accept a caller-owned PoolClient and existing PostingBatch; do not open/commit transactions.
- Derive branch, source, created_by and posted_at from the locked batch, recheck effective Branch Scope, lock active Company/GL leaves.
- Validate debit/credit as exact four-place decimal strings using BigInt; reject empty/unbalanced, accept legal individual 0/0 lines.
- Append the original entry and all lines; reversal locks historical original and appends precisely flipped lines without rewriting history.
- Resolve only ADR-0027 foundation roles in COMPANY / TREASURY scope. Missing/inactive/cross-company mappings fail closed, never guess.
- Return safe journal error reasons. Do not issue duplicate Audit/Outbox work: the owning business command determines the single atomic event.

## Explicit exclusions
No Journal HTTP route/UI, no Chart-of-Accounts administration UI, no 09.09 business-specific debit/credit recipes, no new migrations/indexes, no Production or main merge.

## Evidence gate
Dedicated PostgreSQL 17 tests: exact values, canonical snapshots, mapping scopes, no cross-company or unauthorized writes, rollback, reversal, two-writer race, migration verification, and all four Full CI jobs on the final code SHA. Phase 09.08 stays IN_PROGRESS pending independent remaining scope.
