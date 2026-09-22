# Phase 08.05 — Serials Gap Analysis

**Status:** `IMPLEMENTED_PENDING_VALIDATION`  
**Branch:** `agent/postgres-v1.7-core`  
**Architecture Source:** Business Tech ERP Architecture Baseline v1.7  
**Implementation Plan:** Business Tech ERP Master Implementation Plan v1.0

## Scope

08.05 implements the transaction-bound Serial primitive only: unique Serial identity within Variant; current Warehouse/status as a rebuildable operational projection; historical truth through `inventory_line_serials` + immutable Inventory Movements; receive/re-entry; issue; deterministic locks; Branch Scope; and concurrent double-use protection.

## Existing database classification

### Exists and is compatible

- `serial_numbers` with PK/FKs and `UNIQUE(variant_id, serial_number)`.
- `inventory_line_serials` historical link table.
- immutable Inventory Ledger.
- Branch Scope and READ COMMITTED transaction helper.
- no new migration/index is required.

### Missing and implemented

- transaction-bound receive/issue lifecycle.
- deterministic `FOR UPDATE` locking by Serial.
- movement/Variant/tracking validation.
- whole-unit count validation.
- current location/status projection update.
- historical movement-line links.
- double-use race proof.
- stable safe error contract.

## Projection contract

`serial_numbers.current_warehouse_id/status` is operational state only. History comes from `inventory_line_serials -> inventory_movement_lines -> inventory_movements`.

Operational states used by this primitive are `STOCK_IN`, `RESERVED`, and `SOLD`. No DB enum/check is added because v1.7 freezes the identity/location invariant but does not freeze a closed physical status vocabulary.

## Migration / Index policy

- migration tail remains `0024_inventory_ledger_integrity`.
- Frozen Index Catalog unchanged.
- no speculative index added.

## Required validation

- duplicate serial input rejected.
- serial count equals whole movement quantity.
- tracking must be enabled.
- current Serial cannot be received twice.
- issue requires current `STOCK_IN` in the same Warehouse.
- historical movement links remain authoritative.
- concurrent issue of the same Serial gives one success and one rejection.
- Full CI succeeds on the same SHA.

## Explicit exclusions

Batch/Expiry, Stock Transfer orchestration, Sales/Purchasing orchestration, Frontend/Convex cutover, dual write, main merge, and Convex Production changes.

## Next action

Do not start 08.06 until final 08.05 validation succeeds and the validation-only PR is closed without merge.
