# Phase 08.06 — Batches / Expiry Gap Analysis

**Status:** `IMPLEMENTED_PENDING_VALIDATION`  
**Branch:** `agent/postgres-v1.7-core`  
**Architecture Source:** Business Tech ERP Architecture Baseline v1.7  
**Implementation Plan:** Business Tech ERP Master Implementation Plan v1.0

## Scope
08.06 implements Batch identity, per-Warehouse Batch operational lock rows, Inventory Movement Batch history, FEFO outbound allocation, and the explicit expired-Batch sale exception contract.

## Existing database classification
- `batches`, `batch_stock_positions`, and `inventory_line_batches` exist and are compatible.
- frozen FEFO/query indexes already exist and remain unchanged.
- immutable Inventory Ledger, Branch Scope, Effective Permission, Audit, and READ COMMITTED helpers are reused.
- missing transactional receive/issue, FEFO allocation, expiry override enforcement, and last-unit race protection are implemented here.

## Permission catalog
Migration `0025_batch_expiry_permission` adds only `inventory.sell_expired_batch`. It creates no default Role grant, so authorization fails closed until an explicit effective grant exists.

## Source-of-Truth / lock contract
- Historical truth remains Inventory Movements + `inventory_line_batches`.
- `batch_stock_positions` is a synchronous rebuildable operational projection + lock row.
- composed commands must respect the global lock order ending Inventory Stock Positions → Batch Positions → Serials.
- 08.06 does not directly mutate overall Stock Positions; later posting commands compose the primitives atomically.

## Index policy
Frozen Index Catalog unchanged. No new index.

## Required validation
- Batch identity unique within Variant.
- receipt allocation equals movement quantity.
- expiry policy follows product tracking.
- FEFO selects earliest valid expiry.
- expired sale blocked by default.
- override requires dedicated Effective Permission + reason + Audit.
- Batch positions cannot silently go negative.
- two concurrent consumers of the final Batch unit produce one success and one rejection.
- migration 0025 and Full CI verify on the same SHA.

## Explicit exclusions
Stock Transfer, Stocktake, Adjustment, Projection Rebuild, Sales/Purchasing orchestration, frontend/Convex cutover, dual write, main merge, and Convex Production.

## Next action
Do not start 08.07 until 08.06 Full CI succeeds and the validation-only PR is closed without merge.
