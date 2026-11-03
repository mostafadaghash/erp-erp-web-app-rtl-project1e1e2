# Phase 09.08 — Internal Journal Writer and ADR-0027 Resolver Closure

**Date:** 2026-11-03
**Status:** CODE IMPLEMENTED / PostgreSQL 17 and Full CI PASSED; final documentation-SHA gate pending.
**Code SHA:** `ff13e79a411aba819e3cff15c1081c77901fdf6b`
**CI evidence:** [Run #1313](https://github.com/mostafadaghash/erp-erp-web-app-rtl-project1e1e2/actions/runs/41683061801) / `41683061801` with verify, backend-verify, browser-contract, release-gate all SUCCESS.
**Validation PR:** [#261](https://github.com/mostafadaghash/erp-erp-web-app-rtl-project1e1e2/pull/261), Draft, no merge.

## Bounded implementation

- New internal `JournalWriterService` accepts a caller-owned `PoolClient` and pre-existing authoritative PostingBatch. Branch, source, author and exact `posted_at` are selected from the database, not client or JavaScript Date serialization.
- Pre-DB BigInt fixed-decimal validation for numeric(18,4), no floating point. Empty/unbalanced entries and positive dual-sided lines fail closed; legal 0/0 individual lines remain permitted.
- Branch Scope rechecked in same transaction. Active leaf GL Account of the PostingBatch Branch Company required; metadata locks acquired in deterministic order.
- `reverseWithinTransaction` locks the immutable original under READ COMMITTED, checks batch/source lineage, and writes exact debit/credit-compensating multisets without updating historical rows.
- `SystemAccountResolver` supports only the six approved ADR-0027 COMPANY/TREASURY role keys, with no fallback or generated default accounts.
- A stable safe error contract is added; no extra independent Audit/Outbox, second transaction, HTTP Journal route or 09.09 rule recipes.
- No migrations, index changes, legacy Convex or Production changes, frontend cutover, or merge to `main`.

## Verification

- Backend TypeScript/unit tests pass.
- New `server/tests/journal-writer-service.integration.test.mjs` runs on PostgreSQL 17 and passes four test groups: exact timestamp+decimal+commit seal and migration verify, mapping/context/Branch Scope negatives, exact reversing multiset and no duplicate, atomic rollback and two-writer reversal race.
- Existing PostgreSQL Finance, Inventory, Accounting, index and schema regression tests and final release-gate passed on the same code SHA.
- The first diagnostic run revealed a misconstructed unbalanced unit fixture and a SELECTED-user fixture violating the older default-branch-access database constraint. Fixtures were corrected to test their intended invariants without weakening constraints. The exact PostgreSQL timestamp path was also hardened to prevent JS millisecond truncation.

## Closure safety

The code gate is met; the documentation commit requires an additional same-SHA Full CI before the validation PR can be administratively closed without Merge. Keep 09.08 IN_PROGRESS: Chart of Accounts management/service and phase-exit reconciliation remain separate pending scope. 09.09 Posting Rules is NOT STARTED. Future posting commands own Idempotency, Audit, Outbox, source, and business recipes.

**Next Action:** verify full CI on this final documentation SHA, then close PR #261 WITHOUT Merge; no further module work during this validation gate.
