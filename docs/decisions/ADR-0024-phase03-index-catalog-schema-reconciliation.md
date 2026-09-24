# ADR-0024 — Phase 03.07 Index Catalog / Physical-Schema Reconciliation

- **Status:** ACCEPTED
- **Date:** 2026-09-18
- **Phase:** 03.07 — Index Catalog
- **Branch:** `agent/postgres-v1.7-core`
- **Architecture authority:** `Business-Tech-ERP-Architecture-Baseline-v1.7-Final.docx`
- **Execution authority:** `Business-Tech-ERP-Master-Implementation-Plan-v1.0.md`

## Context

Phase 03.07 reached two pre-DDL blockers recorded during the Phase 03.06 Gap Analysis.

Architecture Baseline v1.7 §25.12 defines the canonical Finance / Settlement physical shapes:

- `receipts` contains `id, branch_id, document_number, treasury_id, counterparty_id, amount, category_id, reference, notes, occurred_at, posted_at, created_by`.
- `customer_advances` contains `id, counterparty_id, sales_order_id, receipt_id, original_amount, remaining_amount_projection, created_at`.
- `advance_applications` contains `id, advance_id, sales_invoice_id, amount, applied_at`.

The committed physical migration `0008_finance_settlement.sql` follows those shapes exactly.

However, §28.6 Index Catalog contains two index references to columns that do not exist in the approved physical schema:

1. `receipts INDEX (sales_order_id) WHERE sales_order_id IS NOT NULL`.
2. `advance_applications INDEX (posting_batch_id)`.

An Index Catalog line cannot create a new business column implicitly. Adding either column would change the already-approved physical/domain model and would require a separate versioned architecture/schema decision, not an index-only migration.

## Decision

### 1. `receipts.sales_order_id` is an Index Catalog defect

The §28.6 reference to `receipts.sales_order_id` is **not implemented** in V1.

No `sales_order_id` column is added to `receipts`.

The canonical order/advance/receipt relationship remains:

`SalesOrder <- customer_advances.sales_order_id`
`Receipt <- customer_advances.receipt_id`

This is already explicit in §25.12 and migration `0008`.

For order-oriented advance access, 03.07 uses the approved `customer_advances(sales_order_id, created_at DESC)` index from the same §28.6 catalog. Receipt lookup remains available through the unique `customer_advances(receipt_id)` relationship.

Therefore the invalid §28.6 `receipts(sales_order_id)` partial index is classified as **NOT APPLICABLE / catalog defect** and is omitted from the V1 index migration.

### 2. `advance_applications.posting_batch_id` is an Index Catalog defect

The §28.6 reference to `advance_applications.posting_batch_id` is **not implemented** in V1.

No `posting_batch_id` column is added to `advance_applications`.

§25.12 explicitly models an advance application using `advance_id`, `sales_invoice_id`, `amount`, and `applied_at`, and states that applying an advance does **not** create a new `FinancialMovement` because the cash entered previously through the Receipt.

The current V1 trace path remains the approved relational chain through the CustomerAdvance/Receipt and SalesInvoice/application history. If a future architecture revision requires direct PostingBatch identity on AdvanceApplication, that must be introduced by a separate versioned schema decision and forward migration with corresponding posting/reversal semantics. It is not inferred from an index line.

Therefore the invalid §28.6 `advance_applications(posting_batch_id)` index is classified as **NOT APPLICABLE / catalog defect** and is omitted from the V1 index migration.

### 3. No schema rewrite and no index migration in this ADR

This ADR:

- does not rewrite migration `0008`;
- does not add either missing column;
- does not create or remove any PostgreSQL index;
- does not start 03.08;
- does not alter Finance posting behavior;
- does not change historical Sources of Truth;
- does not merge to `main`;
- does not touch Convex Production.

### 4. Related approved decisions remain authoritative

- ADR-0017 remains authoritative for the canonical installment vocabulary and the corrected future partial-index predicate.
- ADR-0020 remains authoritative for Finance / Settlement constraints, including the decision that AdvanceApplication re-application history must remain representable and must not be collapsed by an invented uniqueness rule.
- The Index Catalog remains closed except for explicit versioned corrections such as this ADR; no speculative index may be added.

## Rationale

The physical-schema section and the committed schema agree with each other, while the two §28.6 lines alone reference nonexistent columns.

For `receipts.sales_order_id`, the architecture already places the SalesOrder relationship on `customer_advances`, so adding the same relationship directly to Receipt would introduce duplicate authority and possible inconsistency.

For `advance_applications.posting_batch_id`, the architecture explicitly says advance application does not create a new FinancialMovement, and the approved AdvanceApplication shape does not include PostingBatch identity. Adding it solely to make an index possible would expand the posting/audit model without an approved transaction contract.

The safe V1 interpretation is therefore to correct the two catalog defects rather than mutate the schema to fit them.

## Consequences for Phase 03.07

The exact 03.07 Index Catalog freeze must:

1. exclude `receipts(sales_order_id) WHERE sales_order_id IS NOT NULL`;
2. exclude `advance_applications(posting_batch_id)`;
3. retain the approved `customer_advances(sales_order_id, created_at DESC)` index;
4. preserve all other §28 entries unless another explicit architecture inconsistency is documented;
5. account for existing PK/UNIQUE backing indexes so duplicate/redundant indexes are not created;
6. apply ADR-0017 to the Installment open-items predicate;
7. create no index outside the approved/versioned catalog without measurement and a separate decision.

## Verification contract for the next 03.07 step

Before any Index Migration is authored, the next step must produce/freeze an exact index inventory that classifies every §28 entry as one of:

- already satisfied by PK/UNIQUE/integrity index;
- to be created in 03.07;
- intentionally omitted by an accepted ADR;
- blocked pending an explicit architecture decision.

Only after that inventory is frozen may a forward-only Index Migration be created.

## References

- Architecture Baseline v1.7 — §25.12 Finance / Settlement schema.
- Architecture Baseline v1.7 — §26.4 Posting Traceability.
- Architecture Baseline v1.7 — §28.6 Finance / Treasury / Ledgers / Advances / Cheques / Installments / Accounting.
- `database/migrations/0008_finance_settlement.sql`.
- `docs/gap-analysis/phase-03-06-constraints-gap-analysis.md`.
- ADR-0017.
- ADR-0020.
