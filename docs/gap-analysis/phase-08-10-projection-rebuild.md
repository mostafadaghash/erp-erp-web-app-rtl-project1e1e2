# Phase 08.10 — Projection Rebuild Gap Analysis

**Status:** IN_PROGRESS — NOT CLOSED
**Authority:** Architecture Baseline v1.7; Master Implementation Plan v1.0, 08.10.
**Previous gate:** 08.09 final documentation SHA `7a58bd86d36587bedf92d5d656c4e52f714edfd8`, Full CI #1071 SUCCESS, PR #243 closed without merge.

## Classification
- Historical immutable inventory_movements/inventory_movement_lines, inventory_line_batches, inventory_line_serials: EXISTING, source of truth.
- inventory_stock_positions, batch_stock_positions, variant_warehouse_cost_projection: EXISTING, synchronous rebuildable operational projections and lock rows.
- stock_reservations: EXISTING; reservation quantities must be derived from active/partially consumed reservation records, not inventory movement quantities.
- Read-only ledger-to-projection reconciliation: MISSING.
- Maintenance-mode controlled rebuild with verified exclusive write barrier, deterministic locks, dry-run, transactional rollback, audit and before/after proof: MISSING.
- Cost replay: must respect posting_batches.posted_at and signed historical costs, preserve last_purchase_cost semantics and the official WA rounding; never backdate/rewrite history.
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

**Next action:** implement and test the read-only reconciliation core, then controlled maintenance rebuild. Do not start Phase 09.
