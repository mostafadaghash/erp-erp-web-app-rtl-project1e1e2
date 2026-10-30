# ADR-0009 — Phase 03.D Inventory Schema Shape

- Status: Accepted
- Phase: 03.05 / 03.D — Inventory
- Architecture authority: Business Tech ERP Architecture Baseline v1.7
- Implementation plan authority: Business Tech ERP Master Implementation Plan v1.0

## Context

Phase 03.05 builds the PostgreSQL schema in dependency order. After 03.C Product Catalog, the approved next domain is Inventory. Architecture Baseline v1.7 §§25.8–25.9 defines Serial/Batch tracking, the immutable Inventory Movement ledger, synchronous stock/cost operational projections, reservations, transfers, stocktake and formal inventory adjustments.

The Master Implementation Plan deliberately separates relation/column creation in 03.05 from the complete constraints pass in 03.06 and the closed Index Catalog implementation in 03.07. Therefore 03.D creates only the canonical Inventory relations, scalar columns, types and nullability needed by the approved model.

## Decision

Migration `0005_inventory` creates exactly these 20 canonical relations:

- `serial_numbers`
- `batches`
- `inventory_movements`
- `inventory_movement_lines`
- `inventory_line_serials`
- `inventory_line_batches`
- `inventory_stock_positions`
- `variant_warehouse_cost_projection`
- `batch_stock_positions`
- `stock_reservations`
- `stock_transfers`
- `stock_transfer_lines`
- `stocktake_sessions`
- `stocktake_lines`
- `stocktake_line_serials`
- `stocktake_line_batches`
- `inventory_adjustments`
- `inventory_adjustment_lines`
- `inventory_adjustment_line_serials`
- `inventory_adjustment_line_batches`

No alias relation using historical/rendered names is created.

## Historical truth and operational projections

`inventory_movements` plus its line/serial/batch details are the historical inventory Source of Truth.

`inventory_stock_positions`, `variant_warehouse_cost_projection` and `batch_stock_positions` are synchronous rebuildable operational projections / lock rows. They are not an alternate historical ledger.

`stock_reservations` remains a persistent reservation record. Available stock is derived from stock position `on_hand - reserved`; reservations do not directly rewrite historical movements.

## Types

- Internal identities and references use UUID.
- Inventory quantities use `numeric(18,6)`.
- Inventory costs and values use `numeric(18,4)`.
- Server/business instants use `timestamptz`.
- Batch expiry uses PostgreSQL `date`.
- Visible document numbers use `bigint`, consistent with the numeric-only document-number baseline.
- Operational concurrency `version` snapshots use `integer`.

No floating-point type is used for quantities, costs or inventory values.

## Nullability decisions

The Architecture Baseline defines the canonical fields but does not specify PostgreSQL nullability for every field. The 03.D physical-shape rule is:

- identities, ownership/references, discriminators, historical quantities/costs and required posting/count timestamps are `NOT NULL`;
- `serial_numbers.current_warehouse_id` is nullable because a serial can be historically known while not currently held in a warehouse;
- `batches.expiry_date` is nullable because batch tracking and expiry tracking are separate product capabilities;
- `inventory_movements.reason_code` and `notes` are nullable because not every movement type requires them;
- `stock_reservations.released_at` is nullable until a reservation leaves an active/consumed lifecycle state;
- transfer/stocktake/adjustment `notes` are nullable;
- `stocktake_sessions.approved_by` and `approved_at` are nullable until approval;
- `inventory_adjustments.source_stocktake_id` is explicitly optional for manual adjustments.

No default values are invented in DDL.

## Generated `available` columns are deferred to 03.06

Architecture v1.7 defines `inventory_stock_positions.available` and `batch_stock_positions.available` as generated/derived values equal to `on_hand - reserved`.

The Master Implementation Plan explicitly assigns Generated Columns to 03.06 Constraints. Therefore migration `0005` intentionally does not create writable `available` placeholders. 03.06 must add the approved generated columns atomically; until then the schema-shape tests require `available` to be absent.

This avoids a temporary writable balance field that would violate the architecture.

## Reconciliation: `inventory_adjustment_lines.id`

Architecture §25.9 lists `inventory_adjustment_lines` fields as `adjustment_id, variant_id, quantity_difference, unit_cost`, but in the same approved model the child relations `inventory_adjustment_line_serials` and `inventory_adjustment_line_batches` explicitly reference `adjustment_line_id`. The final Index Catalog also defines uniqueness for those child keys using `adjustment_line_id`.

A physical child reference cannot target a line identity that does not exist. To reconcile this internal omission without changing business behavior, 03.D gives `inventory_adjustment_lines` an internal UUID `id`. This identity exists only to support the architecture's own `adjustment_line_id` dependent references. The business uniqueness rule `UNIQUE(adjustment_id, variant_id)` remains deferred to 03.06 exactly as specified.

No surrogate IDs are added to key-only projection/link relations that do not require them.

## Deferred integrity and indexes

03.D deliberately does not create project-owned PK/FK/UNIQUE/PARTIAL UNIQUE/CHECK/generated constraints. These remain 03.06 work, including:

- serial and batch identity uniqueness;
- movement/detail referential integrity;
- stock/batch position composite lock-row keys;
- generated `available = on_hand - reserved`;
- active reservation partial uniqueness;
- branch/warehouse context integrity;
- transfer, stocktake and adjustment document-number uniqueness;
- stocktake/adjustment line and serial/batch detail uniqueness;
- positive/non-negative/domain checks where required by the approved catalog.

03.D creates no project-owned indexes. Every B-Tree/partial index in Architecture v1.7 §28.4 remains 03.07 work.

## Verification contract

PostgreSQL 17 integration tests must prove that:

- migrations `0001` through `0005` apply in order;
- all 20 Inventory relations exist with exact canonical columns, PostgreSQL types and nullability;
- inventory quantities are `numeric(18,6)` and costs/values are `numeric(18,4)`;
- Inventory Movements remain physically separate from operational projection tables;
- `available` is absent until the 03.06 generated-column pass;
- `inventory_adjustment_lines.id` exists and dependent tables use `adjustment_line_id`;
- no duplicate alias relations exist;
- no 03.E Sales relation such as `sales_quotes` exists;
- no project-owned constraint or index has been introduced on 03.D relations;
- rerun and verify-only behavior remains correct;
- migration `0005` is recorded with immutable checksum.

## Recovery

Migration `0005` is transactional. Any failure before commit rolls back all 20 relations and the migration-history insert. After successful application, corrections are forward-only migrations; direct ad-hoc edits are prohibited.

## Non-goals

This step does not:

- implement Inventory posting/reservation/transfer/stocktake/adjustment services;
- implement Weighted Average calculations or lock behavior;
- implement 03.E Sales or later schema;
- implement 03.06 constraints or 03.07 indexes;
- seed business data;
- cut over frontend/backend modules;
- dual-write with Convex;
- modify `main` or Convex Production.
