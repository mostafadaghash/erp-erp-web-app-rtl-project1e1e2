# Phase 08.04 — Reservations Gap Analysis

**Status:** `CLOSED`  
**Branch:** `agent/postgres-v1.7-core`  
**Architecture Source:** Business Tech ERP Architecture Baseline v1.7  
**Implementation Plan:** Business Tech ERP Master Implementation Plan v1.0

## Scope

08.04 implements the Stock Reservation primitive only:

- SalesOrder-line reservation against a Warehouse+Variant.
- Available validation under Stock Position row lock.
- atomic reservation delta for order edits.
- partial/full reservation consumption primitive.
- release remaining reservation on cancellation.
- atomic old-Warehouse release + target-Warehouse validation/reserve primitive for SalesOrder Warehouse changes.
- Branch Scope and fixed lock order.
- active reservation read.

It does not implement the SalesOrder status machine, Delivery/Invoice posting, Inventory SALE movement, COGS, Serial/Batch allocation, or Frontend cutover.

## Official v1.7 rules used

1. Reservations are a Source of Truth for stock commitments; derived Available is `On Hand - Reserved`.
2. a reservation is linked to SalesOrder + SalesOrderLine + Warehouse + Variant + Quantity.
3. statuses are exactly `ACTIVE / PARTIALLY_CONSUMED / RELEASED / CONSUMED`.
4. Reservation reduces Available by increasing Reserved; it does **not** reduce On Hand.
5. one active logical reservation is allowed for the same SalesOrderLine + Warehouse + Variant.
6. released/consumed rows remain historical rather than being deleted.
7. Confirm SalesOrder must lock the Stock Position and prevent over-reservation.
8. SalesOrder Confirm/Edit/Cancel/Warehouse Change uses `READ COMMITTED + FOR UPDATE` on SalesOrder, Reservations, and old/new Stock Positions.
9. global lock order is Business Document → Dependents/Reservations → Inventory Stock Positions.
10. two simultaneous confirmations on the same stock must serialize on the same Position and the second rechecks the new Available value.
11. partial delivery consumes reservation and decreases Reserved by the delivered amount while On Hand is reduced by the Inventory SALE effect in the same overall transaction.
12. cancelling the remaining part of a partially delivered order releases the remaining reservation.
13. SalesOrder warehouse change performs Availability check + Release/Replace Reservations atomically.
14. frozen reservation indexes are:
    - partial unique `(sales_order_line_id, warehouse_id, variant_id)` for ACTIVE/PARTIALLY_CONSUMED.
    - `(sales_order_id, status)`.
    - partial `(warehouse_id, variant_id)` for ACTIVE/PARTIALLY_CONSUMED.

## Existing database classification

### Exists and is compatible

- `stock_reservations` physical table.
- Primary Key.
- Warehouse/Variant FKs.
- SalesOrder/SalesOrderLine FKs.
- status CHECK with the exact four v1.7 values.
- positive quantity CHECK.
- deferred Sales context trigger:
  - line belongs to order.
  - Variant matches line.
  - active reservation Warehouse matches current SalesOrder Warehouse at COMMIT.
- deferred SalesOrder guard preventing Warehouse mutation while an old active reservation remains.
- deferred SalesOrderLine guard preserving reservation Order/Variant context.
- all three frozen Reservation indexes from §28.4.
- 08.02 Stock Position lock/update primitive.
- Branch Scope.
- `READ COMMITTED` transaction helper with bounded retry only for deadlock/serialization.

### Missing and must be created

- transaction-bound reservation lifecycle primitive.
- order → line/reservation → Stock Position locking.
- Available recheck after Stock Position lock.
- exact fixed-decimal reservation deltas.
- active-reservation create/update.
- partial/full consumption.
- idempotent remaining-release behavior.
- Warehouse replacement primitive.
- concurrency proof for simultaneous and 20+ parallel reservations.
- stable Reservation error contract.

## Quantity interpretation

Architecture v1.7 does not add a separate `consumed_quantity` column to `stock_reservations`, while the active Reservation indexes are explicitly intended to support rebuilding `Reserved`.

For 08.04, the implementation therefore treats `quantity` on `ACTIVE` and `PARTIALLY_CONSUMED` rows as **the current remaining reserved quantity**:

- create ACTIVE: quantity = currently reserved amount.
- order edit: quantity is adjusted by the exact delta.
- partial consume: quantity becomes the remaining reserved amount and status becomes PARTIALLY_CONSUMED.
- full consume: row becomes CONSUMED and is excluded from active reservation rebuilding.
- release: row becomes RELEASED, keeps its final remaining quantity for history, and receives `released_at`.

Consumed delivery quantities remain represented by Delivery history when the Sales/Delivery phase composes this primitive. This interpretation is explicit because the Baseline does not define another physical consumed-quantity field.

## Lock and mutation contract

Mutations require an already-open caller transaction.

For one line:

1. `SELECT ... FOR UPDATE` SalesOrder.
2. Branch Scope check.
3. `SELECT ... FOR UPDATE` SalesOrderLine.
4. `SELECT ... FOR UPDATE` active Reservation row, if any.
5. lock/create affected Stock Position rows using 08.02 in canonical Warehouse→Variant order.
6. recheck Available for any positive Reserved delta.
7. change Reservation row(s) and Stock Position Reserved in the same transaction.
8. caller composes SalesOrder status/version, Delivery/Inventory/COGS, Audit/Outbox, etc. before the one COMMIT.

## Confirm / edit primitive

`setLineReservationWithinTransaction()` receives a desired base-unit reservation quantity.

- first reserve creates one ACTIVE row and increases Reserved only.
- existing active reservation applies only the delta to Reserved.
- an increase must be <= current Available after the lock.
- a decrease releases the delta.
- desired quantity cannot exceed the SalesOrderLine quantity converted to Base Unit.
- On Hand is never changed by this operation.

## Consumption primitive

`consumeWithinTransaction()`:

- rejects more than current remaining reserved quantity.
- decrements Stock Position Reserved only.
- partial result becomes PARTIALLY_CONSUMED with remaining quantity.
- full result becomes CONSUMED.
- it intentionally does not decrement On Hand; Delivery/Sales posting composes the matching Inventory SALE effect in the same caller transaction.

## Cancellation primitive

`releaseRemainingWithinTransaction()`:

- releases the exact remaining reserved quantity from Stock Position.
- changes the active row to RELEASED with server `released_at`.
- repeated invocation after no active reservation returns `null` and performs no balance mutation.

## Warehouse replacement primitive

`replaceWarehouseWithinTransaction()`:

- locks the current active reservation first.
- locks old/new Stock Positions in canonical order.
- target Warehouse must belong to the SalesOrder Branch.
- target Available must cover the full remaining reservation.
- old row becomes RELEASED.
- a new active row is created in the target Warehouse with the same remaining quantity and active status.
- old Reserved decreases and new Reserved increases in the same transaction.
- the Sales module must update `sales_orders.warehouse_id` inside that same transaction before COMMIT; the existing deferred DB trigger rejects any incomplete composition.

08.04 deliberately does not take ownership of SalesOrder status/version mutation.

## Required tests

- reserve increases Reserved only; On Hand stays unchanged.
- Available falls by the reserved quantity.
- duplicate active logical reservation is not created.
- order edit increase/decrease applies only exact Reserved delta.
- desired reservation cannot exceed Base-Unit order-line quantity.
- insufficient Available rejects without partial mutation.
- partial consume reduces Reserved and leaves On Hand untouched in the reservation primitive.
- full consume removes the row from active reservation rebuilding while keeping historical row.
- cancellation releases remaining quantity and keeps RELEASED history.
- repeated release is idempotent/no-op.
- Warehouse replacement releases old and reserves target atomically; deferred SalesOrder context is satisfied only if caller updates the order in the same transaction.
- Branch Scope rejects foreign-branch reservation work.
- two simultaneous reservations against the same limited stock cannot overreserve.
- 20+ parallel reservation stress cannot make Reserved exceed On Hand/Available.
- frozen Reservation indexes remain unchanged.
- migration tail remains `0024`.
- previous 08.01–08.03 and 07.x regressions remain green.
- Full CI succeeds on the same implementation SHA.

## Explicit exclusions

- no SalesOrder status transition orchestration.
- no SalesOrder version/history mutation.
- no Delivery document creation.
- no Inventory SALE movement.
- no COGS/SalesInvoice/Accounting.
- no Serial/Batch allocation.
- no Stock Transfer.
- no Frontend/Convex cutover.
- no dual write.
- no `main` merge.
- no Convex Production change.
- no migration.
- no Index addition.

## Closure evidence

- Verified implementation SHA: `5bb4691b0c13f78120111ce54af07563c5313a94`.
- Full implementation CI: Run `#1031` / `35726979984` — SUCCESS on the same implementation SHA.
- `verify`: SUCCESS.
- `backend-verify`: SUCCESS, including the PostgreSQL 17 Stock Reservations integration gate and all downstream regressions.
- `browser-contract`: SUCCESS.
- `release-gate`: SUCCESS.
- first reservation increased `Reserved` only and left `On Hand` unchanged.
- order-edit increases/decreases applied only exact Reserved deltas.
- reservation quantity could not exceed the SalesOrderLine Base-Unit quantity.
- insufficient Available rejected without partial mutation.
- partial consume reduced Reserved while the reservation primitive itself left On Hand unchanged.
- full consume preserved a historical CONSUMED row and removed it from active rebuilding.
- cancellation released the exact remaining quantity, kept RELEASED history, and repeated release was a no-op.
- Warehouse replacement released old and reserved target atomically; omitting the SalesOrder Warehouse update caused the existing deferred DB context constraint to reject COMMIT.
- foreign-Branch reservation work was rejected by Branch Scope.
- a real two-writer race for 6+6 units against stock 10 produced exactly one successful reservation and one `INSUFFICIENT_AVAILABLE`, with final Reserved=6.
- a 25-way parallel stress scenario against stock 20 produced exactly 20 successful reservations and 5 rejections, with final On Hand=20, Reserved=20, Available=0 and no over-reservation.
- no duplicate active logical reservation existed.
- frozen Reservation indexes remained unchanged.
- migration tail remains `0024_inventory_ledger_integrity`; 08.04 adds no migration.
- Gate 08 items “2 simultaneous reservations…” and “20+ parallel reservation stress scenario” are satisfied.
- Validation PR: `#237`, validation-only; close WITHOUT MERGE after final documentation-SHA CI.

## Next action

After final documentation-SHA validation, 08.04 is CLOSED. The next official step is PHASE 08 / 08.05 Serials, READY_TO_START only.
