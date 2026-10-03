# ADR-0019 — Phase 03.06 Purchasing / Tax Constraints

- Status: Accepted
- Date: 2026-09-16
- Scope: Phase 03.06 Purchasing / Tax constraints only

## Context

Architecture Baseline v1.7 defines PurchaseInvoice and PurchaseReturn as the V1 Purchasing aggregates, with `tax_codes` as shared tax master data. Referential Integrity §26 requires same-Branch Warehouse context, same-Product Variant/ProductUnit linkage, source-line hierarchy protection, historical `ON DELETE RESTRICT`, document-number uniqueness, and transaction-safe Returnable Quantity handling. §28.5 reserves independent query/performance indexes for the Index Catalog phase.

Migration `0016_sales_constraints` deliberately deferred Sales `tax_code_id` foreign keys until the Purchasing/Tax slice established the canonical `tax_codes` target key.

## Decision

1. Migration `0017_purchasing_tax_constraints` establishes canonical primary keys for `tax_codes`, `purchase_invoices`, `purchase_invoice_lines`, `purchase_returns`, and `purchase_return_lines`.
2. `tax_codes(code)` is unique. No speculative active-only Tax index is added.
3. Purchase Invoice and Purchase Return visible document numbers are unique by `(branch_id, document_number)`.
4. Purchase document Warehouse references use composite `(warehouse_id, branch_id)` foreign keys to guarantee Branch context.
5. Historical/master references use `ON DELETE RESTRICT`.
6. Purchase Invoice lines enforce Variant + ProductUnit same-Product integrity with a DEFERRABLE constraint trigger.
7. Linked Purchase Return lines enforce source PurchaseInvoice/line/Branch/Variant hierarchy with DEFERRABLE constraint triggers, including protection against later source/header mutation.
8. `purchase_invoices.due_total > 0` requires a non-null Counterparty. Effective Supplier-role authorization remains business validation; the schema does not invent a second contextual role relationship on the document.
9. Monetary/quantity fields not designed to be signed are constrained non-negative/positive. `purchase_return_lines.cost_variance` remains signed by design.
10. `tax_codes.rate` must be non-negative. No closed `tax_type` CHECK is introduced because Baseline v1.7 gives examples (`VAT14`, `VAT0`, `EXEMPT`) but does not define a closed technical vocabulary.
11. No closed `payment_status` CHECK is introduced because Baseline v1.7 does not define a closed database vocabulary for that field.
12. The four Sales `tax_code_id` references deferred by 0016 now become foreign keys to `tax_codes(id)`.
13. Purchase Returnable Quantity is **not** enforced by an aggregate CHECK or cross-row SUM trigger. The approved concurrency rule remains: lock the original PurchaseInvoiceLine with `SELECT ... FOR UPDATE`, recompute posted returns inside the same transaction, then validate the new return quantity.
14. No independent Purchasing/Tax query/search/performance index is introduced in 0017. Those remain Phase 03.07.

## Consequences

- Cross-Branch Warehouse references and cross-document linked Purchase Return lines are rejected by PostgreSQL.
- Cross-Product unit linkage in Purchase Invoice lines is rejected at transaction commit.
- Historical source chains cannot be silently broken by later mutations.
- Sales tax references now have a canonical target without moving Sales query indexes into this slice.
- Returnable Quantity race safety remains in the future Purchasing posting service transaction, matching Architecture v1.7 instead of duplicating transaction logic in an unsafe aggregate trigger.

## Explicitly deferred

- Purchasing/Tax independent and partial indexes: Phase 03.07.
- Purchase Return posting service, row locking, returnable recomputation, Weighted Average exit, supplier/VAT/journal effects: later Purchasing/Finance execution phases.
- Supplier-role authorization and permissions: backend business validation during Purchasing implementation.
- No frontend cutover or write-owner change in this ADR.
