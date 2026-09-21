# Phase 08.01 — Inventory Ledger Gap Analysis

**Status:** `CLOSED`  
**Branch:** `agent/postgres-v1.7-core`  
**Architecture Source:** Business Tech ERP Architecture Baseline v1.7  
**Implementation Plan:** Business Tech ERP Master Implementation Plan v1.0

## Scope

08.01 implements the immutable Inventory Ledger primitive only:

- append-only `inventory_movements` headers.
- append-only `inventory_movement_lines`.
- frozen v1.7 movement types:
  - `OPENING`
  - `PURCHASE`
  - `SALE`
  - `SALES_RETURN`
  - `PURCHASE_RETURN`
  - `TRANSFER_OUT`
  - `TRANSFER_IN`
  - `ADJUSTMENT`
- signed quantities: positive for IN, negative for OUT, either non-zero sign for ADJUSTMENT.
- PostingBatch traceability.
- server posting time propagation from `posting_batches.posted_at`.
- Branch Scope on the Warehouse affected by the movement.
- immutable history protected in PostgreSQL.
- movement/line retrieval by immutable movement ID.

08.02 Stock Positions, Weighted Average Cost, Reservations, Serial/Batch state, Stock Transfer orchestration, business-document posting, Accounting, and Frontend/Convex cutover remain excluded.

## Official baseline

Architecture Baseline v1.7 states:

- Inventory Movements are a Historical Source of Truth.
- movement header fields are `id, branch_id, warehouse_id, movement_type, source_type, source_id, posting_batch_id, occurred_at, created_by, reason_code, notes`.
- line fields are `id, movement_id, variant_id, quantity_signed, unit_cost, total_cost`.
- signed quantity is positive for stock IN and negative for stock OUT.
- movement types include exactly the eight types listed above.
- `posting_batch_id` ties the Inventory effect to Posting/Reversal traceability.
- posted Inventory/Financial/Customer/Supplier/Accounting ledger history is not UPDATEd or DELETEd; correction is represented by new Reversal/Correction effects.
- the real inventory/cost posting timestamp is server-generated and backdating does not rewrite prior costing history.
- Stock Transfer creates `TRANSFER_OUT + TRANSFER_IN` in one transaction and may cross branches.
- the frozen Index Catalog requires Warehouse/date, Branch/date, Source, PostingBatch, MovementLine, and Variant lookup indexes already present in migration 0022.

## Current-state classification

| Area | Classification | 08.01 decision |
|---|---|---|
| `inventory_movements` physical shape | موجود ومتوافق | reuse |
| `inventory_movement_lines` physical shape | موجود ومتوافق | reuse |
| PK/FK Warehouse+Branch/Variant/PostingBatch integrity | موجود ومتوافق | reuse |
| frozen Inventory Ledger indexes | موجود ومتوافق | no index change |
| movement-type closed vocabulary DB CHECK | غير موجود | migration required |
| non-zero signed quantity DB CHECK | غير موجود | migration required |
| IN/OUT sign semantic DB protection | غير موجود | migration trigger required |
| committed header must contain line | غير موجود | deferred integrity trigger required |
| PostingBatch source/time/actor context protection | غير موجود | migration trigger required |
| DB immutability for Inventory movement headers/lines | غير موجود | migration required |
| append-only Backend primitive | غير موجود | create |
| Stock Position mutation | 08.02 | do not implement |
| Weighted Average Cost | 08.03 | do not implement |

## Database decision

08.01 requires one versioned migration: `0024_inventory_ledger_integrity`.

It adds no column and no Index.

It adds only integrity/immutability protection:

1. CHECK on the approved movement-type vocabulary.
2. CHECK that `quantity_signed <> 0`.
3. Posting context trigger:
   - source type/id match the PostingBatch.
   - created_by matches the PostingBatch actor.
   - normal movement Branch matches PostingBatch Branch.
   - `TRANSFER_IN` is allowed to belong to the target Warehouse Branch for cross-branch transfer.
4. direction trigger:
   - `OPENING/PURCHASE/SALES_RETURN/TRANSFER_IN > 0`.
   - `SALE/PURCHASE_RETURN/TRANSFER_OUT < 0`.
   - `ADJUSTMENT` may be positive or negative, but never zero.
5. UPDATE/DELETE rejection triggers on both movement headers and lines.

No unique rule is invented for `posting_batch_id` because one Stock Transfer intentionally needs two movements under the same PostingBatch.

## Atomic posting boundary

`InventoryLedgerService.appendWithinTransaction()` accepts an already-open `PoolClient` only.

There is deliberately no convenience method that opens and commits its own posting transaction. The intended later orchestration is:

```text
Idempotency / Business Document locks
→ PostingBatch
→ Inventory Ledger
→ Stock/Cost/Serial/Batch/etc.
→ Accounting/Audit/Outbox
→ one COMMIT
```

08.01 stops after the immutable Ledger rows. 08.02 and later slices own the downstream effects.

## Posting time

The caller cannot provide `occurred_at`.

The canonical service copies `posting_batches.posted_at` inside PostgreSQL when inserting the Inventory Movement. This preserves the server posting order and avoids JavaScript timestamp precision becoming part of historical ordering. The DB integrity trigger does not require arbitrary legacy/test SQL fixtures to reproduce the timestamp byte-for-byte; the supported Backend write path owns that semantic.

## Warehouse / Branch rules

- the service resolves Branch from Warehouse; callers do not supply a separate Branch ID.
- Branch Scope is rechecked against that Warehouse Branch inside the same transaction.
- ordinary movement types require the PostingBatch Branch to equal the Warehouse Branch.
- `TRANSFER_IN` may differ because the PostingBatch belongs to the issuing/source branch while the inbound movement belongs to the target branch.
- normal POST/CORRECTION into an inactive Warehouse is rejected.
- REVERSAL/DELETE_REVERSAL may target an inactive historical Warehouse so history can be corrected without reactivating it.

## Numeric rules

- quantity: exact decimal string → `numeric(18,6)`, no JavaScript float.
- unit cost / total cost: exact decimal string → `numeric(18,4)`, non-negative.
- 08.01 does not invent a formula asserting `total_cost = abs(quantity) * unit_cost`; later costing slices own cost calculation and rounding semantics.

## Read boundary

`getMovement()` returns the immutable header and lines and enforces Branch Scope from the stored movement Branch.

No mutable balance is calculated or stored by 08.01.

## Required tests

- exact eight-type movement vocabulary.
- inbound/outbound sign validation.
- ADJUSTMENT accepts either non-zero sign.
- quantity/money precision validation without float.
- movement requires at least one line.
- PostgreSQL rejects unsupported movement type.
- PostgreSQL rejects wrong signed direction.
- movement source/actor trace matches PostingBatch and canonical service time equals PostingBatch posted_at.
- normal movement cannot use a PostingBatch from another Branch.
- cross-branch `TRANSFER_OUT + TRANSFER_IN` may share one source-branch PostingBatch.
- Branch Scope denies reading/appending a foreign-branch movement.
- movement/line UPDATE and DELETE are blocked by PostgreSQL.
- reversal appends a new movement and preserves the original.
- 08.01 creates no `inventory_stock_positions` row.
- frozen Inventory Ledger index inventory is unchanged.
- migration verify-only succeeds through `0024`.
- 07.01–07.06 and all previous regressions remain green.
- Full CI passes on the same implementation SHA.

## Explicit exclusions

- no Stock Position mutation.
- no on_hand/reserved/version changes.
- no Weighted Average Cost.
- no Reservations.
- no Serial/Batch operational state mutation.
- no Stock Transfer business command.
- no Purchase/Sales posting orchestration.
- no Accounting/COGS.
- no Frontend/Convex cutover.
- no dual write.
- no `main` merge.
- no Convex Production change.
- no Index addition.

## Closure evidence

- Verified implementation SHA: `5cd6437727ee00c6731e01666c0ac97ecdf87c2f`.
- Full implementation CI: Run `#1025` / `35669544876` — SUCCESS on the same implementation SHA.
- `verify`: SUCCESS.
- `backend-verify`: SUCCESS, including the PostgreSQL 17 Inventory Ledger integration gate and all downstream schema/integrity regressions.
- `browser-contract`: SUCCESS.
- `release-gate`: SUCCESS.
- migration `0024_inventory_ledger_integrity` is the migration tail and verify-only passes.
- the approved eight movement types are enforced in PostgreSQL.
- inbound/outbound signed direction and non-zero quantity are enforced.
- canonical Backend inserts inherit source identity and server posting time from PostingBatch.
- normal movement Branch/PostingBatch scope and cross-branch `TRANSFER_IN` semantics were verified.
- Branch Scope prevents foreign-branch movement reads/appends.
- movement headers and lines reject direct UPDATE/DELETE after posting.
- reversal/correction remains append-only and preserves original historical rows.
- 08.01 does not create or mutate `inventory_stock_positions`.
- the frozen Inventory Ledger index inventory remains unchanged; migration 0024 adds no Index.
- prior 07.x and PostgreSQL regressions are green on the same implementation SHA.
- Validation PR: `#234`, validation-only; close WITHOUT MERGE after final documentation-SHA CI.

## Next action

After final documentation-SHA validation, 08.01 is CLOSED. The next official step is PHASE 08 / 08.02 Stock Positions, READY_TO_START only.
