# Phase 09.05 — Customer Advances Gap Analysis

**Status:** `GAP_ANALYSIS_COMPLETE` — corrected against accepted ADR-0024 before Business implementation.  
**Authoritative source:** Business Tech ERP Architecture Baseline v1.7.  
**Analysis baseline SHA:** `79a26bac52992ff2f4da9edd9c7d50427e412dca`.  
**Implementation reconciliation:** ADR-0020, ADR-0024 and ADR-0025.  
**Scope:** analysis/documentation only. No 09.05 Business DDL or Backend command is introduced by this document.

## 1. Authoritative V1 behavior

- Receiving a Customer Advance is one critical operation: Receipt + one IN Financial Movement + Customer Advance liability/state. It is not Sales Revenue.
- One CustomerAdvance is tied to one Counterparty, one SalesOrder and one Receipt. `receipt_id` is unique.
- `remaining_amount_projection` is rebuildable operational state, not Historical Source of Truth.
- Applying an advance to a SalesInvoice locks the CustomerAdvance with `SELECT ... FOR UPDATE`, re-evaluates available remaining amount, and records application history without a new Receipt or Financial Movement.
- Concurrent applications must not consume the same remaining balance.
- Partial-delivery invoices consume the advance sequentially until exhausted.
- SalesOrder cancellation does not automatically refund an advance. A real cash refund is a separate Disbursement.
- Reversing an invoice application must formally preserve history and restore advance availability.
- Baseline isolation is `READ COMMITTED + explicit FOR UPDATE`.

## 2. Physical V1 shape and accepted reconciliation

Canonical tables already exist:

`customer_advances(id, counterparty_id, sales_order_id, receipt_id, original_amount, remaining_amount_projection, created_at)`

`advance_applications(id, advance_id, sales_invoice_id, amount, applied_at)`

Existing compliant integrity:

- `UNIQUE customer_advances(receipt_id)`
- positive original/application amounts
- projection constrained to `0..original_amount`
- FKs to Counterparty/SalesOrder/Receipt/Advance/SalesInvoice
- approved CustomerAdvance indexes
- approved AdvanceApplication indexes by Advance and SalesInvoice
- no `UNIQUE(advance_id, sales_invoice_id)`, preserving reversal/re-application history

### ADR-0024 correction is authoritative for implementation

Architecture §28.6 contains a catalog line for `advance_applications(posting_batch_id)`, but the approved physical shape in §25.12 contains no such column. ADR-0024 explicitly resolves this as a **V1 Index Catalog defect**:

- do **not** add `posting_batch_id` to `advance_applications`;
- do **not** add an index on that nonexistent column;
- preserve the frozen 03.07 catalog totals and migration `0022_index_catalog`;
- no schema rewrite is allowed merely to satisfy the invalid catalog line.

The earlier draft of this 09.05 Gap Analysis incorrectly treated that omitted line as a missing physical requirement. This corrected document supersedes that statement before implementation starts.

## 3. Current-state classification

| Requirement | Current implementation | Classification |
| --- | --- | --- |
| CustomerAdvance and AdvanceApplication tables | Exist in 0008 | Existing / compliant |
| one Advance per Receipt | unique constraint exists | Existing / compliant |
| approved indexes | implemented by frozen 0022 catalog | Existing / compliant |
| `advance_applications(posting_batch_id)` | intentionally absent by ADR-0024 | Existing / compliant omission; must stay absent |
| atomic Advance receipt command | absent | Missing / create |
| canonical Receipt composition inside larger transaction | current 09.03 service owns its transaction/idempotency boundary | Existing / refactor for safe composition |
| Counterparty equality across Advance, SalesOrder and Receipt | independent FKs only | Existing / needs semantic enforcement |
| Receipt amount = Advance original amount | not enforced | Missing / enforce |
| application Invoice belongs to the Advance SalesOrder/customer | FK only proves Invoice exists | Missing / enforce |
| `FOR UPDATE` and post-lock remaining recomputation | absent | Missing / create |
| no-cash application | no command exists | Missing / create |
| synchronous remaining projection writer | absent | Missing / create |
| projection rebuild/reconciliation | absent | Missing / create |
| application idempotency | absent | Missing / create |
| append-only application reversal | absent | Missing / create under ADR-0025 |
| direct UPDATE/DELETE protection for application history | absent | Missing / create |
| automatic refund on SalesOrder cancel | must not occur | Behavioral gate |
| GL Journal | scheduled for 09.08/09.09 | Defer |
| automatic Partial Delivery integration | scheduled for Phase 11.08 | Defer |
| frontend / Convex cutover | later phases | Defer |

## 4. Reversal/history representation

ADR-0024 forbids adding direct PostingBatch identity to AdvanceApplication, while ADR-0020 requires reversal/re-application history to remain representable and explicitly forbids a uniqueness constraint on `(advance_id, sales_invoice_id)`.

ADR-0025 therefore freezes the V1 application-history interpretation without changing the table shape:

- history is append-only;
- for one `(advance_id, sales_invoice_id)` pair, rows form an ordered state sequence by `applied_at,id`;
- first row is APPLY;
- when an application is active, the next row for the same pair is its REVERSAL and must carry the same positive amount;
- after reversal, a later row may APPLY again, so re-application remains representable;
- one active application per Advance+Invoice pair is allowed at a time;
- the current effective application for a pair is the latest row only when the pair has an odd number of history rows;
- `remaining_amount_projection = original_amount - SUM(active application amounts)`;
- no negative application amount, UPDATE or DELETE is used.

This is the minimum implementation convention that satisfies the frozen table shape, positive-amount constraint, formal reversal requirement and re-application history without schema drift.

## 5. Implementation boundary

09.05 may implement only:

1. a small forward-only integrity migration after 0030 for CustomerAdvance/AdvanceApplication semantic triggers and immutability, with **no new index and no new business column**;
2. refactor of the 09.03 Receipt writer into a reusable within-transaction primitive while keeping one canonical Receipt write path;
3. Customer Advance receipt command that atomically creates Receipt + one IN FinancialMovement + one CustomerAdvance;
4. apply command using Idempotency + effective Branch Scope/Permission + `FOR UPDATE` on CustomerAdvance;
5. append-only reversal command using ADR-0025 state semantics;
6. projection rebuild/reconciliation support;
7. Audit + Outbox in the same transaction;
8. no FinancialMovement on apply/reverse;
9. no automatic cash refund;
10. no GL Journal, cheque/installment work, Phase 11 delivery integration, frontend cutover or Convex write.

## 6. Required tests

- advance receipt creates exactly one Receipt + one IN FinancialMovement + one CustomerAdvance atomically;
- Counterparty/SalesOrder/Receipt/amount mismatch fails with no side effects;
- one Receipt cannot create two advances, including concurrency;
- idempotent replay and payload conflict;
- apply reduces available projection but creates no cash movement;
- concurrent applications cannot double-consume remaining amount;
- unrelated Invoice/customer/order rejected;
- sequential use across multiple invoices;
- reversal appends history, restores availability and creates no cash movement;
- re-apply after reversal works and no pair UNIQUE is introduced;
- application UPDATE/DELETE rejected;
- rebuild projection exactly reconciles to active application history;
- SalesOrder cancellation creates no automatic Disbursement;
- frozen Index Catalog remains exact with ADR-0024 omissions intact;
- verify-only migrations and all historical PostgreSQL regressions remain green;
- Full CI passes on one final implementation SHA before closure.

## 7. Exit

09.05 is `READY_FOR_IMPLEMENTATION`, not `CLOSED`.

**Next Action:** implement only the bounded 09.05 slice above.
