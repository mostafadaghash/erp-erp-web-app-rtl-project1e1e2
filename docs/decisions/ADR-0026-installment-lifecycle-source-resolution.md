# ADR-0026 — Installment Lifecycle and Trusted Source Resolution

**Status:** ACCEPTED  
**Date:** 2026-10-03  
**Phase:** 09.07 — Installments  
**Branch:** `agent/postgres-v1.7-core`  
**Authority:** Architecture Baseline v1.7 + ADR-0017 + Phase 09.07 Gap Analysis

## Context

The Baseline fixes the Installment physical shape and settlement model, but intentionally leaves two implementation choices unresolved:

1. ADR-0017 records that the canonical states are `UPCOMING / DUE / PARTIAL / PAID / OVERDUE` but explicitly does not decide which state wins when an installment is both partially paid and past due.
2. `installment_plans` stores `counterparty_id + source_type + source_id`, with no duplicated `branch_id` or payment direction. The Baseline says Branch/Counterparty filtering comes from Source Truth, but does not enumerate a closed V1 source-type adapter set.

09.07 cannot safely implement settlement until both decisions are versioned.

## Decision 1 — Canonical status projection precedence

Installment status is a rebuildable projection. Given:

- scheduled amount `amount`;
- effective paid amount from approved FinancialAllocations;
- `due_date`;
- server business date for the source Branch Company timezone;

the canonical projection is:

1. `PAID` when effective paid amount >= scheduled amount.
2. `OVERDUE` when remaining amount > 0 and business date > due_date.
3. `PARTIAL` when effective paid amount > 0 and business date < due_date.
4. `DUE` when remaining amount > 0 and business date = due_date.
5. `UPCOMING` when effective paid amount = 0 and business date < due_date.

Therefore a partially paid installment that is past due is intentionally represented as `OVERDUE`; the exact paid amount remains visible in `paid_amount_projection`, so no financial information is lost.

This precedence makes overdue actionability dominant while preserving ADR-0017's five-value vocabulary. No sixth combined status is introduced.

## Decision 2 — Business date

The authoritative business date is derived inside the Central Backend/database transaction from the source Branch's Company timezone using the server clock.

Client-supplied dates are never authoritative for status projection.

A rebuild may accept an explicit as-of date only in internal verification/reconciliation tooling; normal business commands use the server-derived Company-local date.

## Decision 3 — Supported V1 source adapters

09.07 supports exactly these InstallmentPlan source types:

- `SALES_INVOICE`
- `PURCHASE_INVOICE`

Rationale:

- these are the posted receivable/payable source documents already present in the approved PostgreSQL physical schema;
- they expose Branch, Counterparty and due amount as Source Truth;
- Sales/Purchasing posting services arrive later, but the physical source records are already authoritative inputs for Finance integrity;
- allowing arbitrary source strings would make Branch/direction/counterparty client-controlled, violating the Baseline.

A later module may add another Installment source only through an explicitly versioned adapter/ADR.

## Decision 4 — Source-derived settlement direction

For `SALES_INVOICE`:

- source must be posted/not deleted;
- source must have non-null Counterparty;
- plan Counterparty must equal the invoice Counterparty;
- plan total must equal the invoice `due_total` at schedule creation;
- settlement cash document type is `RECEIPT`;
- Counterparty role must include `CUSTOMER`.

For `PURCHASE_INVOICE`:

- source must be posted/not deleted;
- source must have non-null Counterparty;
- plan Counterparty must equal the invoice Counterparty;
- plan total must equal the invoice `due_total` at schedule creation;
- settlement cash document type is `DISBURSEMENT`;
- Counterparty role must include `SUPPLIER`.

Branch is always derived from the source invoice. The caller cannot override Branch or settlement direction.

## Decision 5 — One schedule per source

V1 permits one InstallmentPlan per source invoice.

No new unique index is added because the Index Catalog is frozen. Concurrency is enforced by:

1. locking the source invoice root row `FOR UPDATE`;
2. checking for an existing plan using `counterparty_id + source_type + source_id`;
3. inserting the plan only while holding the source lock.

This gives deterministic single-plan ownership without Index Catalog drift.

## Decision 6 — Complete schedule invariant

A plan is created atomically with all installment rows in one transaction.

- each installment amount must be positive;
- `paid_amount_projection` starts at zero;
- the sum of installment amounts must equal `installment_plans.total_amount`;
- schedule identity fields are immutable after creation;
- no Treasury movement, FinancialMovement, Ledger entry or Journal is created merely by creating the schedule.

## Decision 7 — Settlement composition

A settlement command may distribute one real cash document across one or more installments only when all targets resolve to:

- the same Branch;
- the same Counterparty;
- the same cash-document direction, Receipt or Disbursement.

The command:

1. claims Idempotency;
2. locks all target Installment rows in ascending UUID order;
3. resolves each source plan/invoice and re-evaluates effective allocation totals;
4. rejects any target over-allocation;
5. validates the aggregate cash amount equals the sum of requested allocations;
6. calls the existing 09.03 `postReceiptWithinTransaction` or `postDisbursementWithinTransaction` exactly once;
7. appends FinancialAllocations with `target_type='INSTALLMENT'`;
8. updates/rebuilds `paid_amount_projection/status`;
9. writes Audit/Outbox in the same transaction.

The existing CashDocument posting primitive remains the single cash writer.

## Decision 8 — Allocation/history invariants

For Installment allocations:

- `financial_source_type` must be `RECEIPT` or `DISBURSEMENT`;
- the source cash document Counterparty must match the InstallmentPlan Counterparty;
- allocation amount must be positive;
- total allocations from one cash source cannot exceed that source cash amount;
- total allocations to one Installment cannot exceed the Installment amount;
- UPDATE/DELETE of an Installment allocation is forbidden in V1; corrections use later reversal/correction orchestration, never silent history mutation.

The existing logical UNIQUE source-target allocation remains authoritative, so one cash document has at most one allocation row per Installment target.

## Decision 9 — Accounting boundary

09.07 implements schedule/allocation/cash integrity and projections only.

It does not invent:

- Journal rules;
- Customer/Supplier Ledger entry-type mappings;
- sales/purchasing posting rules.

Those remain in 09.08/09.09 and the owning Sales/Purchasing phases.

## Consequences

- 09.07 is unblocked for implementation.
- ADR-0017 remains authoritative for vocabulary.
- No new status value, business column or Index Catalog entry is introduced.
- Status rebuild is deterministic.
- Branch/direction cannot be spoofed by API input.
- Over-allocation is prevented under root locks and database integrity.
- Multi-installment settlement uses one real cash movement rather than duplicating cash.
