# ADR-0012 — Phase 03.G Finance / Settlement Schema Shape

- **Status:** Accepted
- **Phase:** 03.05 / 03.G
- **Authority:** `Business-Tech-ERP-Architecture-Baseline-v1.7-Final.docx`

## Decision

Phase 03.G creates only the canonical Finance / Treasury / Settlement relations defined by Architecture Baseline v1.7:

`treasuries`, `receipts`, `disbursements`, `finance_categories`, `treasury_transfers`, `financial_movements`, `treasury_balance_positions`, `financial_allocations`, `customer_advances`, `advance_applications`, `cheques`, `installment_plans`, `installments`.

No Accounting tables, Finance services, posting rules, constraints, indexes, module cutover, or dual write are part of 03.G.

## Physical type and nullability decisions

- Internal identities and references use `uuid`.
- Visible receipt/disbursement/treasury-transfer document numbers use `bigint`.
- All money, balances, allocations, advance amounts, cheque amounts, installment amounts, and projections use exact `numeric(18,4)`.
- `occurred_at`, `posted_at`, `created_at`, and `applied_at` use `timestamptz`.
- Cheque/installment `due_date` is a commercial calendar date and uses PostgreSQL `date`.
- `receipts.counterparty_id` and `disbursements.counterparty_id` are nullable because non-counterparty income/expense and other treasury reasons are allowed.
- `receipts.category_id` and `disbursements.category_id` are nullable. A receipt/disbursement may settle an invoice/installment/other obligation through Financial Allocations without being an INCOME/EXPENSE category; forcing an income/expense category would misclassify settlement cash flow.
- `finance_categories.gl_account_id` is physically required. The referenced Accounting relation is created in 03.H; its FK is intentionally deferred to 03.06 after all schema-shape subphases exist.
- `financial_movements.counterparty_id` is nullable because transfers and non-counterparty treasury movements exist.
- `cheques.settlement_financial_movement_id` is nullable while a cheque is not cleared.
- `treasuries` intentionally has no balance or mandatory treasury-type column. Treasury balance truth is `financial_movements`; `treasury_balance_positions.current_balance` is only a synchronous rebuildable projection/lock row.
- `customer_advances.remaining_amount_projection` and `installments.paid_amount_projection` are persisted operational projections, not historical sources of truth.

## Historical truth and projections

- `financial_movements` is the Historical Source of Truth for treasury effects.
- `treasury_balance_positions` is a Synchronous Rebuildable Operational Projection + Lock Row.
- Applying `advance_applications` must not create a new cash movement later because the cash entered through the original Receipt.
- A PENDING cheque has no treasury effect; only CLEARING/CLEARED service behavior later creates the settlement `financial_movement`.
- Installment schedules are due-date structures, not parallel financial ledgers. Paid/status projections are rebuildable from Financial Allocations.

## Deferred work

03.06 remains responsible for all PK/FK/composite-context/UNIQUE/CHECK constraints, including receipt-number uniqueness, transfer-leg protection, advance receipt uniqueness, allocation duplicate protection, direction/status domain checks, amount positivity, and context integrity.

03.07 remains responsible for every project-owned index in the closed v1.7 Index Catalog.

Finance posting, idempotency, `READ COMMITTED + SELECT ... FOR UPDATE`, deterministic treasury locking, over-allocation protection, cheque double-clear protection, installment settlement, ledger effects, journals, audit, outbox, reversal/correction, and API behavior are implemented only in their later authorized phases.
