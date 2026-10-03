# ADR-0011 — Phase 03.F Purchasing / Tax Schema Shape

Status: Accepted for Phase 03.05 / 03.F only.

## Context

Architecture Baseline v1.7 §25.11 defines the V1 Purchasing/Tax schema as `purchase_invoices`, `purchase_invoice_lines`, `purchase_returns`, `purchase_return_lines`, `tax_codes`, and `purchase_returnable_quantities_v`. V1 explicitly has no Purchase Order aggregate. Phase 03.05 is still schema-shape work only; constraints and project-owned indexes remain reserved for 03.06 and 03.07.

## Decision

1. Create exactly the five canonical Purchasing/Tax tables plus the approved helper view; do not create aliases or a generic PurchaseDocument table.
2. Entity identity/references use UUID. Visible document numbers use `bigint`. Commercial dates use `date`; posting/effect instants use `timestamptz`.
3. Money, tax, purchase cost, landed cost, return commercial value, inventory cost snapshot, and cost variance use exact `numeric(18,4)`. Quantities use `numeric(18,6)`. No floating-point values are allowed.
4. `purchase_invoices.counterparty_id` is nullable because the baseline explicitly permits fully paid cash purchasing without a Supplier Account; any payable/due path will require a registered counterparty in the later business service.
5. `purchase_returns.source_purchase_invoice_id` and `purchase_return_lines.source_purchase_invoice_line_id` are nullable because linked and unlinked purchase returns are both approved. `purchase_returns.counterparty_id` is nullable as the physical representation for unlinked cash settlement; later business validation must require a supplier account whenever a payable/ledger settlement exists.
6. `purchase_invoice_lines.tax_code_id` is nullable because VAT is optional. `tax_amount` remains an exact monetary snapshot. `tax_codes.rate` uses exact `numeric(18,4)` as the physical rate representation, matching the precision already used by tax-rate snapshots in Sales. This is an implementation precision decision, not a change to tax semantics.
7. `landed_cost_allocation` remains non-null and can be zero. `landed_unit_cost` is nullable because it is an inventory-cost value and is not meaningful for service lines, which the baseline excludes from inventory landed-cost allocation.
8. On `purchase_return_lines`, `commercial_unit_value_snapshot`, `tax_amount`, and `line_total` are always commercial snapshots. `inventory_unit_cost_snapshot` and `cost_variance` are nullable for service/non-inventory lines where no inventory valuation effect exists. For stocked items, the later posting service must populate them from current Weighted Average at `posted_at` and record the resulting Purchase Return Cost Variance.
9. `purchase_returnable_quantities_v` is a normal SQL read/helper view only. It exposes `source_purchase_invoice_line_id`, purchased quantity, posted returned quantity, and returnable quantity. It excludes operationally deleted returns after reversal. It is not a lock or Source of Truth; linked-return posting later must lock the original purchase line with `FOR UPDATE` and recompute posted returns inside the same transaction.
10. `posted_at` remains the ordering timestamp for inventory/cost/ledger effect. `document_date` is commercial reporting date only and never rewrites historical costing.

## Deferred by plan

- PK/FK, composite branch/product context protection, UNIQUE/PARTIAL UNIQUE/CHECK and delete actions: 03.06.
- All project-owned B-Tree/partial indexes from the closed Index Catalog: 03.07.
- Purchasing services, Weighted Average posting, VAT posting, supplier ledger/treasury/accounting effects, reversal/correction and concurrency: later domain phases.
- Finance / Settlement schema: 03.G.

## Verification

PostgreSQL 17 integration coverage for 03.F must prove exact table/view names, column order/types/nullability, helper-view arithmetic and deleted-return exclusion, migration history/checksum, idempotent rerun, verify-only behavior, absence of 03.G relations, and absence of early 03.06/03.07 constraints/indexes.
