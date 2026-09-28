# Phase 08.10 — Projection Rebuild Gap Analysis

**Status:** CLOSED
**Authority:** Architecture Baseline v1.7; Master Implementation Plan v1.0, 08.10.
**Previous gate:** 08.09 final documentation SHA `7a58bd86d36587bedf92d5d656c4e52f714edfd8`, Full CI #1071 SUCCESS, PR #243 closed without merge.

## Classification
- Historical immutable inventory_movements/inventory_movement_lines, inventory_line_batches, inventory_line_serials: EXISTING, source of truth.
- inventory_stock_positions, batch_stock_positions, variant_warehouse_cost_projection: EXISTING, synchronous rebuildable operational projections and lock rows.
- stock_reservations: EXISTING; reservation quantities must be derived from active/partially consumed reservation records, not inventory movement quantities.
- Read-only ledger-to-projection reconciliation: IMPLEMENTED.
- Maintenance-mode controlled rebuild with shared inventory writer barrier, deterministic locks, dry-run, transactional rollback, audit and before/after verification: IMPLEMENTED.
- Cost replay: IMPLEMENTED from immutable ledger order by posting_batches.posted_at with deterministic tie-breakers; preserves Phase 08.03 weighted-average rounding and PURCHASE-only last_purchase_cost semantics.
- Serial position/status verification: must use historical inventory_line_serials and reservation state, with documented handling of legacy rows.

## Mandatory safety conditions
1. Do not rebuild from the current projection itself or from current document statuses as a replacement for immutable movement history.
2. Never execute a live repair while posting commands can write; maintenance barrier must be shared with all inventory write owners. A local advisory lock alone does not stop existing commands that do not acquire it.
3. Reconcile stock, reserved, batch and cost independently, including keys present only in history or only in projections.
4. Preserve historical ledger rows and idempotency records. Rebuild must not emit business movements or duplicate accounting entries.
5. Dry-run returns differences without mutations; repair is a separate explicit maintenance operation, one transaction with fixed lock ordering, before/after verification and rollback on any mismatch.
6. No new index without measurements and EXPLAIN ANALYZE; no migration unless the architecture requires it.

## Exit criteria
- PostgreSQL integration tests: drift detection, clean equality, missing/extra rows, reservations, batch, WA/rounding, negative stock, rollback, concurrent writer barrier, repeated rebuild idempotence and audit.
- Full CI (verify, backend-verify, browser-contract, release-gate) SUCCESS on the same final SHA.
- Only then update plan to CLOSED and close validation-only PR without merge.

## Closure evidence
- Final implementation SHA: `67da1af30461865eb358c3a983a8390219f55840`.
- Full CI #1097 / run `36462833049`: SUCCESS on the same SHA. `verify`, `backend-verify`, `browser-contract`, and `release-gate` all passed.
- Migration `0027_inventory_maintenance_barrier` adds the shared maintenance write barrier only; Frozen Index Catalog is unchanged.
- Cost projection repair replays immutable inventory history rather than copying the live projection, then verifies equality before COMMIT.
- Rebuild remains a maintenance operation and emits no business movement or accounting entry.

**Next action:** record final documentation validation. Phase 09 must not start until the remaining Gate 08 direct-sales concurrency dependency is resolved or formally sequenced to its owning Sales implementation phase.
