# Phase 08.02 — Stock Positions Gap Analysis

**Status:** `IN_PROGRESS`  
**Branch:** `agent/postgres-v1.7-core`  
**Architecture Source:** Business Tech ERP Architecture Baseline v1.7  
**Implementation Plan:** Business Tech ERP Master Implementation Plan v1.0

## Scope

08.02 implements only the synchronous rebuildable Warehouse+Variant Stock Position primitive:

- `on_hand`.
- `reserved`.
- `available = on_hand - reserved`.
- `version`.
- `updated_at`.
- deterministic row creation and `SELECT ... FOR UPDATE` locking.

Historical truth remains `inventory_movements` / `inventory_movement_lines`.

## Official v1.7 rules used

Architecture Baseline v1.7 fixes the following contract:

1. `inventory_stock_positions` is an Operational Projection + Lock Row, not a Historical Source of Truth.
2. one row exists logically per `Warehouse + Variant`.
3. `available` is not an independently writable value; it is always derived as `on_hand - reserved` by a generated column or equivalent expression.
4. Stock Position is updated synchronously and atomically with Inventory Movements / Reservations inside the same business transaction.
5. V1 concurrency baseline is `READ COMMITTED + SELECT ... FOR UPDATE`.
6. when more than one Stock Position is locked, the global fixed order is Warehouse then Variant.
7. a missing target Position may be created safely with `INSERT ... ON CONFLICT` and then locked/updated in the same transaction.
8. `reserved` cannot become negative.
9. negative `on_hand` is not blocked by a global database CHECK because negative-stock permission is a business policy; reservation shortfall must not be hidden by silently rewriting reserved.
10. the frozen Inventory index remains Primary/Unique `(warehouse_id, variant_id)` plus `INDEX (variant_id, warehouse_id)`.

## Gap classification

### Exists and is compatible

- physical table `inventory_stock_positions(warehouse_id, variant_id, on_hand, reserved, version, updated_at)`.
- Primary Key `(warehouse_id, variant_id)`.
- Warehouse and Variant restrictive FKs.
- `reserved >= 0` CHECK.
- `version >= 0` CHECK.
- frozen reverse lookup index `ix_inventory_stock_positions__variant_id_warehouse_id`.
- transaction helper already uses `READ COMMITTED` and retries only deadlock / serialization failures.
- Branch Scope backend service already exists.

### Exists and needs no schema change

- `available` is not a physical column. This is compliant because v1.7 explicitly allows a generated column **or equivalent derived expression**. 08.02 derives it from the locked/read row.
- negative `on_hand` remains allowed at schema level by design. Permission/policy validation belongs to the higher business command that causes the stock effect.

### Missing and must be created

- a transaction-bound Stock Position service.
- safe zero-row creation with `INSERT ... ON CONFLICT DO NOTHING`.
- deterministic multi-position lock ordering by `warehouse_id -> variant_id`.
- exact fixed-decimal delta application without JavaScript floating point.
- atomic `on_hand/reserved/version/updated_at` update after all affected rows are locked.
- Branch Scope enforcement for every affected Warehouse branch.
- explicit rejection if a reserved delta would make `reserved < 0`.
- read API returning derived `available`.
- PostgreSQL 17 concurrency/rollback/index/migration-tail integration proof.
- stable public error mapping for Stock Position business failures.

## Implementation boundary

08.02 will add:

- `server/infrastructure/inventory/stock-position-service.ts`.
- unit tests.
- PostgreSQL 17 integration tests.
- CI integration gate.
- Error Mapper registration.

No new migration and no Index change are required.

## Concurrency contract

For a business transaction touching multiple positions:

1. validate keys and exact deltas.
2. resolve Warehouse/Variant references and Branch Scope.
3. sort keys by `warehouse_id`, then `variant_id`.
4. ensure missing zero rows using `INSERT ... ON CONFLICT DO NOTHING`.
5. lock each row with `SELECT ... FOR UPDATE` in that fixed order.
6. validate all final values before writing any delta.
7. apply exact deltas.
8. increment `version` once per committed position mutation.
9. update `updated_at` on the server.
10. caller continues with its Movement/Reservation/Cost/etc effects and one COMMIT.

08.02 does not start an independent transaction for mutation.

## Numeric behavior

- quantities are exact `numeric(18,6)` decimal strings.
- no JavaScript floating-point arithmetic.
- duplicate keys in one delta batch are aggregated exactly before lock/update.
- a net zero batch is rejected as a meaningless write.
- `reserved` may never finish below zero.
- `on_hand` and derived `available` may be negative at projection level; higher commands enforce negative-stock permission and reservation availability policy.

## Required tests

- first mutation safely creates a zero Position then applies the delta.
- `available = on_hand - reserved` exactly.
- `available` is derived, not independently writable.
- version starts at 0 for ensured lock rows and increments exactly once per committed mutation.
- rollback removes a newly-created Position and its mutation.
- Branch Scope rejects a foreign Warehouse.
- reserved cannot become negative.
- negative on_hand / reservation shortfall is not silently hidden.
- reverse-order callers lock multiple positions in the same canonical order.
- 20 concurrent first-writer increments on one missing Position produce no lost update and the exact final version.
- frozen Stock Position indexes remain unchanged.
- migration tail remains `0024`.
- previous 08.01 / 07.x regressions remain green.
- Full CI passes on the same implementation SHA.

## Explicit exclusions

- no Weighted Average Cost (08.03).
- no Reservation lifecycle/business orchestration (08.04).
- no Serial mutation (08.05).
- no Batch/Expiry mutation (08.06).
- no Stock Transfer document command (08.07).
- no Stocktake approval (08.08).
- no Inventory Adjustment command (08.09).
- no Projection Rebuild procedure (08.10).
- no Sales/Purchasing posting cutover.
- no Frontend/Convex cutover.
- no dual write.
- no `main` merge.
- no Convex Production change.
- no migration.
- no Index addition.

## Next action

Implement and validate 08.02 only. Do not start 08.03 until 08.02 is CLOSED by the required same-SHA gates.
