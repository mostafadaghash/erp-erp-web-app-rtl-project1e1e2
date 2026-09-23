# Phase 08.07 — Stock Transfer Gap Analysis

**Status:** `IMPLEMENTED_PENDING_VALIDATION`  
**Branch:** `agent/postgres-v1.7-core`  
**Architecture Source:** Business Tech ERP Architecture Baseline v1.7  
**Implementation Plan:** Business Tech ERP Master Implementation Plan v1.0

## Scope
08.07 implements the PostgreSQL V1.7 Stock Transfer command as one READ COMMITTED transaction.

## Existing database classification
- `stock_transfers` and `stock_transfer_lines`: موجود ومتوافق.
- immutable Inventory Ledger movement vocabulary already includes `TRANSFER_OUT` and `TRANSFER_IN`: موجود ومتوافق.
- Stock Position, Weighted Average Cost, Batch Position and Serial operational projections: موجود ومتوافق ويعاد استخدامها.
- atomic transfer orchestration, available-stock validation, transfer identity history and source/target rollback proof: غير موجود ويجب إنشاؤه، وتم تنفيذه في 08.07.

## Transaction / lock contract
- source and target warehouses must be active and different.
- actor Branch Scope is checked for both source and target branches.
- source/target Inventory Position + Cost rows are locked in deterministic Warehouse+Variant order.
- `quantity <= available`; Reserved Stock is never consumed by a normal transfer.
- Batch Position rows are locked after Inventory Positions.
- Serial rows are locked after Batch rows.
- Sequence Row is allocated last.
- one PostingBatch owns both immutable Inventory Movement legs.
- `TRANSFER_OUT + TRANSFER_IN` commit or roll back together.

## Costing
- transfer unit cost is the source Warehouse current Weighted Average at posting time.
- source WA remains unchanged after outbound quantity.
- target receives that value and recalculates its own Weighted Average.
- no Revenue/Expense/P&L effect is created in 08.07.

## Batch / Serial identity
- tracked Batch quantities move with the same Batch identity and expiry metadata.
- tracked Serials move with the same Serial identity and remain `STOCK_IN` at the target.
- both movement legs retain Batch/Serial historical links.

## Index / migration policy
No new migration and no new index. Frozen Index Catalog remains unchanged; migration tail stays `0025_batch_expiry_permission`.

## Required validation
- reserved stock cannot be consumed.
- source/target legs share one PostingBatch.
- source/target quantity and WA projections reconcile.
- Batch/Serial identity survives transfer.
- failed transaction restores source state and leaves no one-sided transfer.
- PostgreSQL 17 integration test + Full CI succeed on the same SHA.

## Explicit exclusions
Stocktake, Inventory Adjustment, Projection Rebuild, Finance/Accounting reclassification, Purchasing, Sales, frontend cutover, Convex Production, dual write and main merge.

## Next action
Do not start 08.08 until 08.07 Full CI succeeds and the validation-only PR is closed without merge.
