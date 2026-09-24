# ADR-0020 — Phase 03.06 Finance / Settlement Constraints

- **Status:** Accepted
- **Date:** 2026-09-17
- **Phase:** 03.06 — Constraints
- **Authority:** `Business-Tech-ERP-Architecture-Baseline-v1.7-Final.docx`

## Context

Architecture Baseline v1.7 defines `financial_movements` as the Historical Source of Truth for Treasury effects. `treasury_balance_positions` is a synchronous rebuildable operational projection + lock row, not a second ledger. Receipt, Disbursement and TreasuryTransfer are business documents; they produce financial movements through later posting services.

The same baseline requires Branch + Treasury context integrity, historical `ON DELETE RESTRICT`, positive settlement amounts, explicit financial/cheque/installment domains, customer-advance receipt uniqueness and logical Financial Allocation uniqueness. ADR-0017 already resolved the canonical V1 installment status vocabulary to `UPCOMING / DUE / PARTIAL / PAID / OVERDUE`.

## Decision

1. Migration `0018_finance_settlement_constraints` establishes canonical primary keys for all 13 Finance / Treasury / Settlement tables created by migration `0008`.
2. Receipt, Disbursement and TreasuryTransfer visible document numbers are unique inside their Branch numbering scope.
3. `treasuries(id, branch_id)` is a relational target key so Receipt, Disbursement, TreasuryTransfer and FinancialMovement can enforce Branch + Treasury context with composite foreign keys.
4. Historical/master Finance references use `ON DELETE RESTRICT`.
5. Receipt, Disbursement, TreasuryTransfer, FinancialMovement, FinancialAllocation, CustomerAdvance, AdvanceApplication, Cheque, InstallmentPlan and Installment amounts that represent positive business amounts must be greater than zero.
6. `financial_movements.direction` is restricted to `IN / OUT`.
7. `finance_categories.category_type` is restricted to `INCOME / EXPENSE`.
8. Cheque direction is restricted to `RECEIVABLE / PAYABLE`; cheque status is restricted to `PENDING / CLEARED / BOUNCED / CANCELLED`.
9. Installment status is restricted to the ADR-0017 canonical values: `UPCOMING / DUE / PARTIAL / PAID / OVERDUE`. `PENDING` and `PARTIALLY_PAID` are rejected for installments.
10. `financial_allocations` enforces logical uniqueness across `(financial_source_type, financial_source_id, target_type, target_id)` and `amount > 0`. Its source/target identifiers remain intentionally polymorphic; no fake conventional foreign keys are introduced.
11. `customer_advances(receipt_id)` is unique. `remaining_amount_projection` must remain between zero and `original_amount`; it remains a rebuildable projection, not a Historical Source of Truth.
12. `advance_applications.amount > 0`; no `UNIQUE(advance_id, sales_invoice_id)` is introduced because reversal/re-application history must remain representable.
13. A cleared cheque settlement movement, when present, must reference a FinancialMovement from the same Branch through a composite foreign key. A `PENDING` cheque may still have a null settlement movement.
14. `installments.paid_amount_projection` remains bounded between zero and the installment amount. It remains rebuildable from Financial Allocations.
15. `treasury_balance_positions.version` cannot be negative. `current_balance` remains signed because negative Treasury policy is permission/business-policy dependent rather than a universal relational invariant.
16. `finance_categories.gl_account_id -> gl_accounts(id)` is **not** added in this Finance-only slice. `gl_accounts` does not yet have its canonical Accounting primary key in 03.06; the FK is explicitly deferred to the Accounting constraint slice, where both Accounting target integrity and the Finance-to-Accounting relationship can be closed without changing Accounting under a Finance-scoped migration.

## Deliberately deferred

The following are not pulled into migration `0018`:

- `UNIQUE INDEX (branch_id, lower(name))` for Treasury names: expression/index-catalog DDL remains Phase 03.07.
- Active-Treasury partial index and all Finance query/performance indexes: Phase 03.07.
- `financial_movements` partial unique transfer-leg index `(posting_batch_id, direction) WHERE source_type = 'TREASURY_TRANSFER'`: Phase 03.07.
- Customer-advance open partial index, cheque pending partial index and installment open partial index: Phase 03.07.
- Active Treasury validation, permission/scope validation and deterministic From/To Treasury locking: future Finance posting service.
- Receipt/Disbursement/Installment over-allocation prevention: future posting service using `READ COMMITTED + SELECT ... FOR UPDATE` and same-transaction recomputation.
- Cheque double-clear prevention and lifecycle effects: future Finance posting service with row locking and idempotency.
- FinancialMovement creation, Treasury projection updates, customer/supplier ledger effects, Journal posting, Audit/Outbox and reversal/correction workflows: later authorized implementation phases.

## Consequences

- Cross-Branch Treasury references are rejected by PostgreSQL for Finance documents and movements.
- Core amount/domain/document-number errors are rejected at the relational layer.
- Historical Finance chains cannot be deleted through cascading references.
- FinancialMovement remains the Treasury historical truth; no editable Treasury balance field is introduced.
- Projection fields remain projections and do not become independent ledgers.
- The Finance slice remains free of 03.07 index work and does not silently implement Accounting constraints.

## Verification contract

PostgreSQL 17 behavioral integration tests for this slice must prove:

- canonical PK/FK/UNIQUE/CHECK constraints are installed;
- cross-Branch Treasury references fail;
- document-number duplicates fail in their Branch scope;
- positive-amount and closed-domain rules fail correctly;
- Financial Allocation duplicate tuples fail while no polymorphic fake FK exists;
- CustomerAdvance receipt uniqueness and projection bounds are enforced;
- AdvanceApplication re-application history remains structurally possible;
- Cheque status/direction and same-Branch settlement movement rules are enforced;
- all five canonical installment statuses are accepted and `PENDING / PARTIALLY_PAID` are rejected;
- independent/partial/expression Finance indexes remain absent until 03.07;
- Finance schema types/nullability from migration `0008` remain unchanged;
- migration rerun and verify-only behavior remain idempotent;
- no frontend cutover, dual write, Convex Production change or merge to `main` occurs.
