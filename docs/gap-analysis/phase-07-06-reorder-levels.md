# Phase 07.06 — Reorder Levels Gap Analysis

**Status:** `CLOSED`  
**Branch:** `agent/postgres-v1.7-core`  
**Architecture Source:** Business Tech ERP Architecture Baseline v1.7  
**Implementation Plan:** Business Tech ERP Master Implementation Plan v1.0

## Scope

07.06 implements Product Catalog reorder thresholds and the live low-stock alert read only:

- one Minimum Quantity per Variant + Warehouse.
- exact `numeric(18,6)` threshold handling.
- set / read / clear reorder-level configuration.
- low-stock alert when `Available < minimum_quantity`.
- `Available = On Hand - Reserved`.
- Branch Scope enforcement for configuration and alert visibility.
- Audit for reorder-level configuration changes.
- frozen Reorder/Stock Position index verification.

Phase 08 Inventory posting/position mutation, persisted Notification generation, Sales/Purchasing posting, and Frontend/Convex cutover remain excluded.

## Official baseline

Architecture Baseline v1.7 fixes these rules:

- `reorder_levels(variant_id, warehouse_id, minimum_quantity)`.
- `UNIQUE(variant_id, warehouse_id)`.
- the minimum differs per Warehouse/Branch.
- low stock is evaluated against `Available`, not raw `On Hand`.
- `Available = On Hand - Reserved`.
- when Available falls below the threshold, the alert is Branch-scoped; users from other branches do not see it unless their Branch Scope grants that branch / ALL.
- `inventory_stock_positions` is the synchronous rebuildable operational position/lock row, not historical truth.
- the frozen Index Catalog requires `INDEX (warehouse_id, variant_id)` for reorder-level shortage reporting.

## Current-state classification

| Area | Classification | 07.06 decision |
|---|---|---|
| `reorder_levels` physical shape | موجود ومتوافق | reuse |
| PK/UNIQUE Variant+Warehouse | موجود ومتوافق | reuse |
| Variant and Warehouse FKs | موجود ومتوافق | reuse |
| nonnegative minimum CHECK | موجود ومتوافق | reuse |
| frozen `ix_reorder_levels__warehouse_id_variant_id` | موجود ومتوافق | no index change |
| `inventory_stock_positions` projection | موجود ومتوافق | read only in 07.06 |
| Available definition | مثبت | `on_hand - reserved` |
| Backend reorder-level commands | غير موجود | create |
| Branch-scoped low-stock read | غير موجود | create |
| persistent notification emission on stock transition | Phase 08 / notification orchestration | do not pull forward |
| Inventory Position mutation | Phase 08 | do not implement |

## Database decision

No migration is required for 07.06.

Existing approved DDL already supplies:

- `pk_reorder_levels(variant_id, warehouse_id)`.
- `fk_reorder_levels__variant`.
- `fk_reorder_levels__warehouse`.
- `ck_reorder_levels__minimum_quantity`.
- `ix_reorder_levels__warehouse_id_variant_id`.
- `pk_inventory_stock_positions(warehouse_id, variant_id)`.
- `ix_inventory_stock_positions__variant_id_warehouse_id`.

No new Index is added.

## Quantity rule

`minimum_quantity` is stored as `numeric(18,6)`.

07.06 validates decimal strings without JavaScript floating point, permits zero, rejects negatives and values outside the database precision/scale, and normalizes to six decimal places.

The Baseline does not state that a Reorder threshold must obey a Unit's `allows_fraction` flag, because the threshold is stored directly at Variant+Warehouse level and carries no ProductUnit reference. 07.06 therefore does not invent an extra fraction restriction.

## Low-stock rule

The authoritative alert comparison is:

```text
Available = On Hand - Reserved
Low Stock when Available < minimum_quantity
```

Equality is not low stock.

The query exposes:

- Branch/Warehouse.
- Product/Variant.
- Minimum Quantity.
- On Hand.
- Reserved.
- Available.
- Shortage Quantity = Minimum - Available.

A missing operational Stock Position row is treated as zero On Hand / zero Reserved for this alert read. This is an implementation-level fallback for a not-yet-materialized rebuildable projection while 07.06 precedes Phase 08; it does not create historical inventory truth or mutate stock.

## Branch Scope

- setting, reading, or clearing a Reorder Level first resolves the Warehouse's Branch and rechecks Branch Scope inside the same transaction.
- an explicit branch filter on the alert query is rejected when the actor lacks that Branch.
- an unfiltered alert query returns only branches allowed by the actor's `ALL / SELECTED` Branch Scope.
- no new module-specific permission is invented because the approved 07.06 contract specifies Branch Scope but does not define an additional reorder-management permission.

## Backend implementation

Add `ReorderLevelService` with:

- `setReorderLevel()`.
- `getReorderLevel()`.
- `clearReorderLevel()`.
- `listLowStockAlerts()`.

Configuration changes are Audit-recorded in the same transaction.

The alert read does not lock Stock Position rows. It is an operational read model; Phase 08 owns atomic mutation/locking of `inventory_stock_positions`.

## Persisted notification boundary

The Architecture says a low-stock alert is generated when Available falls below the threshold. The actual transition happens when Phase 08 changes Stock Positions.

07.06 therefore implements the canonical current-state low-stock alert query and Branch Scope now, but does not fabricate persisted Notification rows or Outbox events during a read. Persistent event/notification emission must be attached later to the Inventory command that atomically changes the Stock Position.

## Required tests

- one threshold per Variant+Warehouse.
- update preserves one row for the same pair.
- threshold persists as canonical `numeric(18,6)`.
- zero accepted; negative / excessive precision rejected.
- low-stock comparison uses Available = On Hand - Reserved.
- equality with the threshold does not alert.
- missing Stock Position is surfaced as zero Available when a positive threshold exists.
- ALL scope sees alerts across branches.
- SELECTED scope sees only granted branches.
- cross-branch set/read and explicit alert filter are denied.
- clear removes the threshold and alert; repeated clear is idempotent.
- configuration changes are Audit-recorded.
- frozen Reorder Level and Stock Position index inventories remain unchanged.
- migration history remains through `0023`; no 07.06 migration.
- 07.01–07.05 regressions remain green.
- Full CI passes on the same implementation SHA.

## Explicit exclusions

- no Inventory Ledger posting.
- no Stock Position mutation.
- no Reservation mutation.
- no persistent Notification/Outbox emission on stock change yet.
- no Phase 08 implementation.
- no Frontend/Convex cutover.
- no dual write.
- no `main` merge.
- no Convex Production change.
- no migration.
- no index addition.

## Closure evidence

- Verified implementation SHA: `05b158a6b18d4b14c5ef51b2418da5ff41b00dec`.
- Full implementation CI: Run `#1017` / `35605263173` — SUCCESS on the same implementation SHA.
- `verify`: SUCCESS.
- `backend-verify`: SUCCESS, including the PostgreSQL 17 Reorder Levels integration gate.
- `browser-contract`: SUCCESS.
- `release-gate`: SUCCESS.
- one threshold per Variant+Warehouse was preserved by the approved composite PK.
- thresholds persisted as canonical `numeric(18,6)`.
- low-stock detection was verified against `Available = On Hand - Reserved`, not On Hand alone.
- equality with the minimum produced no alert; falling below the minimum produced the expected shortage.
- missing not-yet-materialized Stock Position rows surfaced as zero Available for the live alert read.
- `ALL` scope saw cross-branch alerts while `SELECTED` scope saw only granted branches.
- cross-branch set/read and inaccessible explicit Branch filters were rejected.
- clear was idempotent and removed the threshold/alert.
- reorder configuration changes were Audit-recorded.
- frozen Reorder Level and Inventory Stock Position index inventories remained unchanged.
- migration history remained through `0023`; no 07.06 migration was added.
- 07.01–07.05 plus all later schema/integrity regressions remained green.
- no Stock Position mutation, persistent Notification/Outbox emission, Phase 08 implementation, or Frontend/Convex cutover was introduced.
- Validation PR: `#233`, validation-only; close WITHOUT MERGE after final documentation-SHA CI.

## Next action

After final documentation-SHA validation, 07.06 and PHASE 07 are CLOSED. The next official step is PHASE 08 / 08.01 Inventory Ledger, READY_TO_START only.
