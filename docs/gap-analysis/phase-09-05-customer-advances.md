# Phase 09.05 — Customer Advances Gap Analysis

**Status:** `GAP_ANALYSIS_COMPLETE` — implementation may start only after this document.  
**Authoritative source:** Business Tech ERP Architecture Baseline v1.7.  
**Analysis baseline SHA:** `79a26bac52992ff2f4da9edd9c7d50427e412dca`.  
**Scope of this commit:** analysis/documentation only. No Business DDL, Business Backend command, frontend cutover or Convex production change is introduced here.

## 1. Authoritative V1 behavior

- Receiving a Customer Advance is one critical financial operation: Receipt + one IN Financial Movement + Customer Advance liability/state. It is not Sales Revenue.
- A `customer_advance` is tied to one Counterparty, one SalesOrder and one Receipt. `receipt_id` is unique so the same cash receipt cannot create two advances.
- `remaining_amount_projection` is a synchronous rebuildable projection, not Historical Source of Truth.
- Applying an advance to a SalesInvoice locks the CustomerAdvance with `SELECT ... FOR UPDATE`, recomputes available remaining amount, and records an application without creating a new Receipt or Financial Movement because the cash entered earlier.
- Concurrent applications must not consume the same remaining amount.
- Partial-delivery invoices consume the advance sequentially until it is exhausted.
- Cancelling the SalesOrder does not automatically refund the advance. A real refund is a separate Disbursement from a selected Treasury.
- Reversing an invoice that used an advance must formally reverse the application and restore the available advance balance.
- Baseline isolation for Customer Advance Apply is `READ COMMITTED + FOR UPDATE`.
- Global critical-command rules still apply: effective Permission + Branch Scope, Idempotency, fixed lock order, Audit, Outbox, atomic commit/rollback and no historical silent mutation.
- GL Journal generation remains part of 09.08/09.09. 09.05 must preserve the liability/business meaning and must not classify the advance as revenue or invent a partial Journal engine.

## 2. Baseline physical shape

`customer_advances` essential fields:

- `id`
- `counterparty_id`
- `sales_order_id`
- `receipt_id`
- `original_amount`
- `remaining_amount_projection`
- `created_at`

`advance_applications` essential fields:

- `id`
- `advance_id`
- `sales_invoice_id`
- `amount`
- `applied_at`

Mandatory baseline constraints/indexes relevant to 09.05:

- `UNIQUE customer_advances(receipt_id)`
- customer advance indexes by Counterparty and SalesOrder
- approved partial open-advance index on `customer_advances(counterparty_id, created_at DESC) WHERE remaining_amount_projection > 0`
- `advance_applications(advance_id, applied_at)`
- `advance_applications(sales_invoice_id, applied_at)`
- `advance_applications(posting_batch_id)`
- no `UNIQUE(advance_id, sales_invoice_id)`, because correct reversal followed by re-apply must remain possible.

## 3. Current-state classification

| Requirement | Current implementation | Classification |
| --- | --- | --- |
| `customer_advances` table and essential fields | Exists in migration 0008 | Existing / compliant |
| `advance_applications` essential fields | Exists in migration 0008 | Existing / partially compliant |
| one advance per Receipt | `uq_customer_advances__receipt` exists | Existing / compliant |
| positive original amount | check exists | Existing / compliant |
| projection range 0..original | check exists | Existing / compliant but not sufficient for correctness |
| positive application amount | check exists | Existing / compliant |
| FKs to Counterparty, SalesOrder, Receipt, Advance and SalesInvoice | exist | Existing / structurally compliant |
| customer advance approved indexes and open-advance partial index | implemented in 0022 | Existing / compliant |
| application indexes by Advance and SalesInvoice | implemented in 0022 | Existing / compliant |
| approved `advance_applications(posting_batch_id)` index | baseline requires it, but physical table has no `posting_batch_id` column and 0022 does not create the index | Existing design / physical implementation gap; must correct with forward-only migration |
| atomic Customer Advance receipt command | no 09.05 command exists | Missing / must create |
| reuse of canonical Receipt posting | 09.03 Receipt posting exists, but the current service owns its Idempotency/transaction and intentionally creates no Customer Advance | Existing / needs targeted composability refactor, not duplicate posting logic |
| same Counterparty across CustomerAdvance + SalesOrder + Receipt | only independent FKs exist; no current command or DB invariant proves semantic equality | Existing / needs enforcement |
| Receipt amount equals Advance original amount for advance creation | not enforced | Missing / must enforce in command/integrity tests |
| application to the correct customer/order invoice context | FK proves only that the Invoice exists; unrelated invoice linkage is currently physically possible | Existing / needs enforcement |
| `FOR UPDATE` + recompute remaining before application | no service exists | Missing / must create |
| no cash movement on application | no application service exists | Missing / must create and test |
| synchronous remaining projection update | column exists but no canonical writer/rebuild path exists | Existing / needs implementation |
| projection rebuild/reconciliation from application history | absent | Missing / must create/test |
| application idempotency | absent | Missing / must create |
| formal application reversal restoring availability | absent | Missing / must create |
| application posting traceability | absent because `posting_batch_id` is absent | Missing / must create |
| application history direct-mutation protection | no 09.05 immutable-history guard exists | Missing / must create |
| order cancel auto-refund protection | no 09.05 command exists; must explicitly avoid automatic refund | Missing behavioral gate |
| real refund | existing Disbursement foundation can represent cash-out; automatic refund is not allowed | Reuse later bounded refund orchestration; no duplicate cash writer |
| GL liability Journal | Accounting engine not yet implemented | Defer to 09.08/09.09 |
| automatic advance consumption during Partial Delivery | Sales module command not implemented yet | Defer integration to Phase 11.08 |
| frontend / Convex cutover | legacy shell/runtime still exists | Defer to official cutover phases |

## 4. Critical integrity gaps

### 4.1 Receipt composition

The current 09.03 Receipt command correctly creates a Receipt and exactly one IN Financial Movement, but it intentionally leaves Customer Advances empty. 09.05 needs a larger canonical transaction that reuses the same Receipt/Financial Movement rules and adds the Customer Advance row in that same atomic unit.

Duplicating Receipt posting SQL in a second service would create two write implementations for the same business effect and is not acceptable. The implementation should expose/reuse a bounded within-transaction Receipt posting primitive or equivalent canonical composition while keeping one write owner.

### 4.2 Counterparty / source-document consistency

Current FKs validate existence only. They do not prove that:

- `customer_advances.counterparty_id` equals the SalesOrder customer;
- the Receipt used for the advance has the same non-null Counterparty;
- an application SalesInvoice belongs to the Advance SalesOrder/customer context.

09.05 implementation must enforce these semantics transactionally. Where a stable DB invariant can be expressed without duplicating mutable business state, a forward-only constraint/constraint-trigger is preferred in addition to backend validation.

### 4.3 Posting traceability and reversal representation

The locked v1.7 Index Catalog explicitly requires `advance_applications(posting_batch_id)`, while the current physical table omits that column. This is an implementation defect relative to the authoritative baseline, not a request for a new ad-hoc index.

The baseline also requires:

- `advance_applications.amount > 0`;
- formal reversal that restores availability;
- no unique `(advance_id, sales_invoice_id)` because reversal and later re-apply must be possible;
- global PostingBatch-based reversal traceability.

Therefore 09.05 implementation must add the missing PostingBatch traceability using a forward-only migration. The exact reversal writer must remain append-only and must use the existing PostingBatch reversal model rather than negative application amounts or deleting historical application rows.

**Implementation interpretation note:** the baseline's shorthand formula `original_amount - SUM(advance_applications)` and its formal reversal requirement need to be read together with PostingBatch reversal semantics. The physical implementation must compute the net effective application history so a reversal restores availability while all stored application amounts remain positive. This is an implementation interpretation needed to satisfy the baseline rules simultaneously; the source does not define a separate application-direction column.

### 4.4 Projection correctness

`remaining_amount_projection` is not Source of Truth. The current range check prevents impossible stored values outside `[0, original]`, but it cannot prove that the stored value equals effective application history.

09.05 needs:

- one canonical projection writer;
- a rebuild/reconciliation query/service;
- tests proving projection = original amount minus net effective applications;
- no per-request full-history sum as the normal read path.

## 5. Implementation boundary for the next step

The next implementation step may create only the 09.05 Customer Advances slice:

1. a forward-only integrity migration after current migration 0030 to add the missing application PostingBatch traceability and only the baseline-approved index/integrity required by 09.05;
2. a canonical Customer Advance receipt command that atomically creates/reuses Receipt posting, one IN Financial Movement and one CustomerAdvance;
3. Customer Advance apply command with Idempotency + Branch Scope/Permission + `FOR UPDATE` on the Advance + post-lock remaining recomputation;
4. formal application reversal command using PostingBatch reversal traceability and restoring the projection;
5. projection rebuild/reconciliation support;
6. Audit + Outbox for create/apply/reverse in the same transaction;
7. no new cash movement when applying/reversing an application;
8. no automatic refund on SalesOrder cancellation;
9. no Journal implementation, Sales partial-delivery cutover, cheque/installment work, frontend cutover or Convex write.

The implementation must not add any index outside the locked v1.7 catalog.

## 6. Required 09.05 tests

- advance receipt creates exactly one Receipt, one IN Financial Movement and one CustomerAdvance atomically.
- CustomerAdvance original amount equals the associated Receipt amount.
- Receipt/Advance/SalesOrder Counterparty context mismatch is rejected with no side effects.
- one Receipt cannot create two advances, including concurrent attempts.
- idempotent replay returns the same advance without duplicate Receipt/Financial Movement.
- same idempotency key with different payload conflicts.
- apply locks the Advance, creates application history and decreases the projection without creating any Financial Movement or changing Treasury cash.
- concurrent applications cannot consume the same remaining amount.
- application to an unrelated SalesInvoice/customer/order is rejected.
- sequential applications to multiple partial-delivery invoices consume the advance until exhausted.
- reversal is append-only, restores available balance and creates no cash movement.
- correct reversal allows later re-apply to the same invoice; no `UNIQUE(advance_id, sales_invoice_id)` is introduced.
- direct mutation/deletion of posted application history is rejected.
- projection rebuild exactly reconciles to net effective application history.
- SalesOrder cancellation creates no automatic Disbursement/refund.
- no customer/supplier ledger or Journal side effect is invented before the scheduled accounting/sales integration phases unless already explicitly required by an authoritative later posting rule.
- verify-only migrations are clean.
- frozen Index Catalog matches the authoritative v1.7 entries after correcting the missing approved application PostingBatch index.
- all historical PostgreSQL schema/constraint/index/DDL regressions remain green.
- Full CI passes on one final implementation SHA before 09.05 can be closed.

## 7. Exit from Gap Analysis

09.05 is now `READY_FOR_IMPLEMENTATION`, not `CLOSED`.

No Business DDL, Business Backend command, module cutover or later 09.06+ work has been started by this analysis step.

**Next Action:** implement only the bounded 09.05 Customer Advances slice above, then run its dedicated PostgreSQL 17 integrity/concurrency tests and the full regression gate.
