# ADR-0018 — Phase 03.06 Sales constraint decisions

Status: Accepted
Date: 2026-09-16

## Context

Architecture Baseline v1.7 requires Sales relational integrity to enforce branch/warehouse context, document-number uniqueness, Variant/ProductUnit product ownership, dependent-document hierarchy, historical RESTRICT semantics, and positive/non-negative numeric invariants where values are not designed to be signed.

The Architecture explicitly fixes `sales_invoice_lines.price_source` to `PRICE_LIST / MANUAL`, but does not define a closed database vocabulary for Sales Order status, Delivery status/type, delivery method, or invoice payment status in this physical-schema slice.

The Index Catalog defines `sales_invoices(source_delivery_id) WHERE source_delivery_id IS NOT NULL` and active Stock Reservation uniqueness as partial unique indexes. Those remain Phase 03.07 work.

`tax_codes` belongs to the Purchasing/Tax schema and has not yet received its Phase 03.06 target PK. Sales line `tax_code_id` foreign keys therefore cannot be added safely before that slice establishes the canonical target key.

## Decision

1. Migration `0016_sales_constraints` owns ordinary Sales PK/FK/UNIQUE/CHECK constraints and deferred cross-row integrity triggers only.
2. Sales documents use composite Branch context where a Warehouse or source document must belong to the same Branch.
3. Every Sales line validates that its Variant and ProductUnit belong to the same Product.
4. Delivery lines must reference SalesOrder lines from the Delivery's SalesOrder.
5. Invoice source Delivery must match Invoice Branch and supplied source SalesOrder.
6. Return source lines must match Return Branch and supplied source Invoice when present.
7. Stock Reservation Sales references are closed in this slice; active reservation context must match the SalesOrder line/Variant and current order Warehouse.
8. `price_source` is constrained to `PRICE_LIST / MANUAL`.
9. Sales status/payment/delivery vocabularies are not invented as database CHECKs without an explicit Architecture value set.
10. The source-delivery partial unique rule, active-reservation partial unique rule, and independent query/performance indexes remain deferred to Phase 03.07.
11. Sales line `tax_code_id` foreign keys remain deferred until the Purchasing/Tax constraint slice establishes the `tax_codes` target key.
12. Historical business relationships use `ON DELETE RESTRICT` unless the Architecture explicitly classifies them otherwise.

## Consequences

- Sales integrity is enforceable at PostgreSQL transaction boundaries without changing the approved business outcome.
- No 03.07 index work is pulled forward.
- The Purchasing/Tax constraint slice must close the `tax_codes` PK and then add the deferred Sales tax-code foreign keys as part of its cross-domain target-key completion.
- Corrections after successful production application remain forward-only migrations; committed migration history is not rewritten.
