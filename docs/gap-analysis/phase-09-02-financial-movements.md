# Phase 09.02 — Financial Movements Gap Analysis

**Status:** IMPLEMENTED_AND_VALIDATED — formal closure pending final documentation CI.
**Baseline:** Architecture Baseline v1.7.
**Analysis branch:** `agent/postgres-v1.7-core`.
**Analysis baseline SHA:** `813505124b0233b68cf9b5cc497dd84307ddc79c`.

## Approved 09.02 boundary

Phase 09.02 establishes the canonical Financial Movement writer and synchronous Treasury Balance Position maintenance only.

The approved model is:
- `financial_movements` is the immutable Historical Source of Truth for Treasury effects.
- direction is `IN` or `OUT`; amount is positive.
- source identity and PostingBatch trace every movement.
- `treasury_balance_positions` is a synchronous rebuildable Operational Projection + lock row, never the historical source.
- backdating does not rewrite history; business `occurred_at` may be historical while real posting order remains in the PostingBatch `posted_at`.
- corrections/reversals append new effects; committed Financial Movement history is not updated/deleted.

## Current-state classification

| Requirement | Current state | Classification |
| --- | --- | --- |
| `financial_movements` physical table | Exists with approved columns | Existing / compliant |
| IN/OUT domain + positive amount | CHECK constraints exist | Existing / compliant |
| Treasury+Branch relational integrity | Composite FK exists | Existing / compliant |
| PostingBatch FK | Exists | Existing / incomplete behavioral binding |
| Frozen Financial Movement indexes | Exist in 0022 | Existing / compliant |
| Treasury balance position table | Exists with balance/version/update timestamp | Existing / compliant |
| Canonical backend Financial Movement writer | Missing | Must create |
| Atomic movement + position update | Missing | Must create |
| Position row locking | No 09.02 writer exists | Must create |
| PostingBatch source/actor/branch context validation | FK alone does not prove context equality | Must enforce |
| Committed Financial Movement immutability | Not protected by ledger trigger | Must enforce |
| Branch Scope enforcement for writer/read | Infrastructure exists, Financial integration absent | Must integrate |
| 09.02 PostgreSQL behavior/concurrency tests | Missing | Must add |
| Receipts/Disbursements/Transfers | Physical tables exist, business posting not part of 09.02 | Deferred to 09.03/09.04 |
| Frontend/Convex cutover | Legacy implementation exists | Deferred |

## Schema decision

No new business column and no new index is justified.

A forward-only integrity migration is required because the existing schema does not yet enforce two Baseline invariants at the database boundary:
1. a Financial Movement must match its PostingBatch source, branch and posting actor;
2. committed Financial Movement history must reject UPDATE/DELETE.

This is an integrity migration, not a redesign of the approved physical model or frozen Index Catalog.

## Writer design

Create a Central Backend Financial Movement service that:
1. accepts an already-open business transaction for append operations;
2. validates amount as positive `numeric(18,4)`;
3. validates direction as `IN|OUT`;
4. loads and locks/validates Treasury context and Branch Scope;
5. validates PostingBatch actor, branch and source context;
6. inserts one immutable Financial Movement using source identity from the PostingBatch;
7. creates the Treasury position row if absent, then locks it with `FOR UPDATE`;
8. applies `+amount` for IN or `-amount` for OUT synchronously and increments position version;
9. returns movement and resulting position from the same transaction;
10. provides branch-scoped read access without allowing direct mutation.

## Explicitly out of scope

09.02 must not create Receipt, Disbursement, Treasury Transfer, Allocation, Advance, Cheque, Installment or Journal business workflows. It must not add speculative indexes, alter the Treasury master model, cut over the frontend, or write to Convex.

## Required validation

- IN appends and increases position.
- OUT appends and decreases position.
- multiple movements reconcile exactly to the position.
- first movement safely creates the position row.
- concurrent writers serialize on the position row and do not lose updates.
- invalid amount/direction is rejected.
- inactive Treasury is rejected for normal posting while reversal semantics remain able to correct history.
- PostingBatch actor/branch/source mismatch is rejected.
- Branch Scope is enforced.
- direct UPDATE/DELETE of committed Financial Movement is rejected.
- failed transaction rolls back both movement and position.
- migrations remain idempotent/verify-only clean.
- no Receipt/Disbursement/Transfer rows are created by 09.02.

**Next action:** implement only the Phase 09.02 Financial Movement writer, integrity migration and tests described above.


## Implementation evidence

- Integrity migration: `0028_financial_movement_integrity`.
- Central Backend writer: `server/infrastructure/finance/financial-movement-service.ts`.
- Unit gate: `server/tests/financial-movement-service.test.ts`.
- PostgreSQL 17 transaction/concurrency gate: `server/tests/financial-movement-service.integration.test.mjs`.
- Validation PR: #246 (validation-only; do not merge).
- Validated implementation SHA: `1f11d33f28e0f568099fd0d18c1bc917af53b9a8`.
- Full CI #1145 / run `36767521058`: **SUCCESS**.
- `verify`, `backend-verify`, `browser-contract`, and `release-gate`: SUCCESS on the same implementation SHA.
- Existing Finance/Settlement constraints, exact frozen Index Catalog, backend build and PostgreSQL smoke gates also passed.
- No Receipt, Disbursement or Treasury Transfer business workflow was introduced.

## Closure decision

09.02 implementation satisfies its approved boundary. Final `CLOSED` status requires the documentation commit carrying the closure evidence to pass Full CI on that same final SHA.

**Next action after closure:** Phase 09.03 — begin with Gap Analysis before any Receipt/Disbursement business-code or database change.
