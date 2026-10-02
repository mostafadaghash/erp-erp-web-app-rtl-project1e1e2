# Phase 09.04 — Treasury Transfer Gap Analysis

**Status:** GAP_ANALYSIS_COMPLETE — implementation may start only after this document.  
**Baseline:** Architecture Baseline v1.7.  
**Analysis baseline SHA:** `6f0c4e6d4012b02387e171e2d5397f75c63e7989`.

## Authoritative behavior

- Treasury Transfer is one independent business document with `issuing_branch_id` controlling document-number scope.
- From/To Treasuries must be different, active and allowed by the user's effective Permission + Branch Scope.
- V1 explicitly allows a Treasury Transfer between different branches when Branch Scope and Permission allow it.
- Posting is idempotent and atomic under `READ COMMITTED + SELECT ... FOR UPDATE`.
- Source and target Treasuries are locked in deterministic Treasury-ID order before effects; sequence allocation remains late.
- One PostingBatch with source type `TREASURY_TRANSFER` ties the document to exactly one OUT Financial Movement and one IN Financial Movement.
- The two Financial Movements share the same source + PostingBatch; the approved partial unique index on `(posting_batch_id, direction)` for `TREASURY_TRANSFER` prevents duplicate legs.
- Each Financial Movement belongs to the actual branch of its Treasury. Therefore a cross-branch transfer has an OUT movement in the source branch and an IN movement in the target branch while the PostingBatch remains owned by the issuing/source branch.
- Treasury balances remain synchronous rebuildable projections from Financial Movements; no direct mutable Treasury balance field is introduced.
- Transfer is not Revenue or Expense.
- GL Journal generation is part of later 09.08/09.09 accounting slices, so 09.04 must not invent a partial Journal implementation.
- No frontend/Convex cutover occurs in this phase.

## Current-state classification

| Requirement | Current state | Classification |
| --- | --- | --- |
| `treasury_transfers` table/shape | Exists | Existing/compliant |
| branch document uniqueness | Exists | Existing/compliant |
| amount > 0 / from != to checks | Exist | Existing/compliant |
| transfer query indexes | Frozen catalog already implemented | Existing/compliant |
| duplicate transfer leg guard | Approved partial unique index already exists | Existing/compliant |
| Financial Movement writer / Treasury projections | Closed in 09.02 | Reuse with targeted cross-branch correction |
| Idempotency / sequence / PostingBatch / Audit / Outbox | Implemented | Reuse |
| Transfer posting command | Missing | Must create |
| deterministic two-Treasury / two-position locking | Missing | Must create |
| posted Transfer immutability guard | Missing | Must create |
| cross-branch target Treasury | Baseline allows it, but current composite FK forces target Treasury into issuing branch | Existing/replace with forward-only integrity correction |
| Financial Movement posting-context validation | Current 09.02 rule requires movement branch = PostingBatch branch, which blocks target IN movement in a cross-branch transfer | Existing/modify narrowly for TREASURY_TRANSFER |
| Financial Movement service branch handling | Current service requires Treasury branch = PostingBatch branch | Existing/modify narrowly for TREASURY_TRANSFER |
| explicit negative-Treasury/overdraft policy | No concrete V1 setting/rule exists in the approved baseline/current settings | Do not invent; lock/reconcile the source position and preserve current financial-ledger behavior |
| GL transfer Journal | Accounting engine scheduled for 09.08/09.09 | Defer |
| frontend/Convex cutover | Legacy | Defer |

## Referential / integrity decision

A forward-only migration is required in 09.04 to:

1. keep `from_treasury_id` bound to `issuing_branch_id`;
2. replace the target Treasury composite FK with a normal FK to `treasuries(id)` so authorized cross-branch transfers are physically possible;
3. replace the 09.02 Financial Movement posting-context function so non-transfer movements still require `movement.branch_id = posting_batch.branch_id`, while `TREASURY_TRANSFER` permits the target movement to use the target Treasury branch;
4. reject UPDATE/DELETE of posted Treasury Transfer rows;
5. add no new general-purpose index because the required unique/index catalog is already implemented.

The existing composite FK on `financial_movements(treasury_id, branch_id)` remains the DB proof that every movement is attributed to the actual Treasury branch.

## 09.04 implementation boundary

Create a Central Backend Treasury Transfer posting service which:

1. executes through Idempotency;
2. resolves both Treasuries, rechecks effective `finance.accounts.manage` Permission + Branch Scope for source and target branches;
3. requires source Treasury branch = `issuing_branch_id`;
4. allows target Treasury in another branch only when that branch is in scope;
5. rejects same Treasury and inactive source/target Treasury;
6. locks both Treasury rows in deterministic ID order;
7. creates/locks both Treasury position rows in deterministic ID order;
8. allocates the issuing-branch document number late;
9. creates the Treasury Transfer document;
10. creates one PostingBatch with source `TREASURY_TRANSFER`;
11. creates one OUT movement for the source Treasury and one IN movement for the target Treasury, using the same source and PostingBatch;
12. updates both Treasury positions atomically;
13. records Audit and Outbox in the same transaction;
14. exposes no direct Treasury balance write.

No Receipt/Disbursement target allocation, customer/supplier ledger settlement, cheque, installment, customer advance, GL Journal, frontend cutover or Convex write is introduced here.

## Required tests

- same-branch transfer creates exactly one OUT + one IN with the same source/PostingBatch.
- cross-branch transfer succeeds only when actor has scope to both branches; each movement branch matches its Treasury.
- actor without target-branch scope is rejected with no side effects.
- inactive source/target Treasury and same-Treasury transfer are rejected.
- document numbering is atomic/unique under concurrency.
- repeated idempotency key replays without duplicate transfer or movements.
- same idempotency key + different payload conflicts.
- opposite-direction concurrent transfers finish without deadlock/lost update and positions reconcile to Financial Movements.
- forced second-leg failure rolls back document, PostingBatch, first movement, both positions, Audit and Outbox.
- UPDATE/DELETE of posted Treasury Transfer is rejected.
- direct duplicate OUT or IN for the same Transfer PostingBatch is rejected by the approved partial unique index.
- no Allocation, customer/supplier ledger, Receipt/Disbursement, cheque, installment, advance or Journal effect is created by 09.04.
- verify-only migrations clean; full existing regression suite green.

**Next action:** implement only this 09.04 Treasury Transfer slice and its tests.
