# ADR-0010 — Phase 03.E Sales Schema Shape

## Status
Accepted for Phase 03.05 / 03.E.

## Context
Architecture Baseline v1.7 §25.10 defines the Sales schema and §28.5 defines the later constraint/index catalog. Master Implementation Plan Phase 03 requires schema shape first, then 03.06 constraints, then 03.07 indexes.

This ADR is limited to the physical Sales relation/column/type/nullability shape. It does not implement Sales commands, posting, reservations, COGS, settlement, accounting, permissions, or frontend cutover.

## Decision

### Canonical relations
Phase 03.E creates exactly:

- `sales_quotes`
- `sales_quote_lines`
- `sales_orders`
- `sales_order_lines`
- `sales_order_status_history`
- `sales_order_shipping_details`
- `sales_order_deliveries`
- `sales_order_delivery_lines`
- `sales_invoices`
- `sales_invoice_lines`
- `sales_returns`
- `sales_return_lines`
- `sales_returnable_quantities_v`

No generic `sales_documents` alias or parallel legacy relation is created.

### Types
- Internal identities/references use `uuid`.
- Visible document numbers use `bigint` and remain separate from internal IDs.
- Money, prices, discounts, tax amounts, shipping cost and COGS snapshots use `numeric(18,4)`.
- Quantities use `numeric(18,6)`.
- Event/posting instants use `timestamptz`.
- Commercial calendar dates (`document_date`, quote `valid_until`) use PostgreSQL `date`; they do not determine posting/costing order.
- Document/version counters use `integer`.
- Status/method/source labels and notes use `text`.

### Nullability interpretations required to turn the design into physical DDL
The architecture explicitly allows a fully paid walk-in Sales Invoice without an Account, and an unlinked Sales Return without an Account or source invoice. Therefore:
- `sales_invoices.counterparty_id` is nullable.
- `sales_returns.counterparty_id` is nullable.
- `sales_returns.source_invoice_id` is nullable.
- `sales_return_lines.source_invoice_line_id` is nullable.

A Sales Order is customer/account driven in the approved workflow, so `sales_orders.counterparty_id` is required. A standard Quote is also account based, so `sales_quotes.counterparty_id` is required.

Optional descriptive/source references remain nullable where the baseline describes them as optional or lifecycle-dependent, including `source_quote_id`, `source_sales_order_id`, `source_delivery_id`, shipping-detail values, seller assignment, notes and deletion metadata.

VAT is optional at the product/document flow level. Therefore line `tax_code_id` and `tax_rate_snapshot` are nullable when no tax applies. Monetary tax totals remain exact `numeric(18,4)` values on posted documents/lines.

`unit_cogs_snapshot`, `cogs_total` and `historical_unit_cost` are nullable because Service lines do not create inventory/COGS, while stocked lines later populate the required historical cost snapshot during posting.

### Sales order ownership
`customer_service_user_id` is required because the approved workflow records the owner/customer-service employee. `sales_user_id` remains nullable because the baseline says a Sales employee may also be recorded.

### Returnable view
`sales_returnable_quantities_v` exposes:
- `source_invoice_line_id`
- `sold_quantity`
- `posted_returned_quantity`
- `returnable_quantity`

The view uses posted, non-deleted Sales Returns for the operational read helper. A deleted posted return has already been reversed before operational deletion under the approved reversal model, so it must not continue to reduce the current returnable amount.

The view is not a concurrency mechanism or independent Source of Truth. Return posting must still lock the original invoice line with `FOR UPDATE` and recompute accepted posted returns in the same transaction.

### Deferred boundaries
Phase 03.E intentionally does not create:
- PK/FK/composite-context/UNIQUE/PARTIAL UNIQUE/CHECK constraints — 03.06.
- Project-owned indexes — 03.07.
- Sales services, reservation commands, posting, COGS/WA behavior, settlement, ledgers or journals — later implementation phases.
- Purchasing/Tax schema — 03.F.

`tax_code_id` columns can exist before `tax_codes` because the FK is intentionally deferred to 03.06, after all schema-shape domains have been created.

## Verification contract
PostgreSQL 17 integration coverage must prove:
- all 12 Sales tables and the one helper view exist with canonical names;
- exact column order/type/nullability for Sales tables;
- exact four-column view shape;
- view arithmetic for sold, posted-returned and returnable quantities;
- deleted/reversed operational returns do not reduce current returnable quantity;
- no 03.F relations exist;
- no 03.06 constraints or 03.07 indexes were introduced early;
- migration 0006 is registered, rerunnable idempotently, and verify-only succeeds.

## Consequences
Sales physical storage is ready for later relational integrity and indexing passes without prematurely implementing business posting behavior. Historical posting order remains based on server `posted_at`; commercial `document_date` remains descriptive/business-date data and never rewrites ledger/cost history.
