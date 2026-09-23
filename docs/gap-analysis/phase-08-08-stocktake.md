# Phase 08.08 — Stocktake Gap Analysis

**Status:** `CLOSED`  
**Branch:** `agent/postgres-v1.7-core`  
**Architecture Source:** Business Tech ERP Architecture Baseline v1.7 §27.14  
**Implementation Plan:** Business Tech ERP Master Implementation Plan v1.0

## Gap classification
- `stocktake_sessions`, `stocktake_lines`, Serial/Batch count-link tables and approved FK/unique/status constraints: موجود ومتوافق.
- Stock Position versioned operational lock rows and Weighted Average Cost state: موجود ومتوافق ويعاد استخدامه.
- Stocktake command workflow, line snapshot/version validation, immutable approval and atomic difference posting: غير موجود ويجب إنشاؤه، وتم تنفيذه في 08.08.
- Finance/Accounting journal effect: خارج 08.08 لأن PHASE 09 Finance & Accounting Foundation لم يبدأ بعد؛ لا يتم اختراع قيد محاسبي قبل مصدره الرسمي.

## Workflow
- `OPEN → COUNTED → APPROVED/CANCELLED`.
- opening allocates a branch-scoped document number.
- line snapshot captures Book Quantity + Stock Position Version.
- count fixation locks the Position and rejects stale Version or changed Book Quantity, requiring only that line to be re-counted.
- counting never changes stock and never freezes the whole Warehouse.
- tracked Serial/Batch count completeness is validated and stored explicitly.
- `COUNTED` requires at least one fixed line.

## Approval
- locks Session first, then affected Stock/Cost Positions in deterministic order, then tracked Serial/Batch rows.
- uses the frozen `difference = counted - book_at_count`; it is not recalculated from current On Hand.
- creates Inventory Adjustment + immutable `ADJUSTMENT` Inventory Movement only for non-zero differences.
- shortage uses current WA.
- overage uses current WA then Last Purchase Cost; missing cost is rejected rather than guessed.
- applies the stored difference to current Stock Position in the same transaction.
- emits Audit + Outbox and marks Session `APPROVED` in the same commit.
- approved Session cannot be counted, cancelled, or approved again; later correction must be a separate formal document.

## Migration / index policy
No new migration and no new index. Migration tail remains `0025`; Frozen Index Catalog remains unchanged.

## Required validation
- stale snapshot/version forces re-count.
- count does not mutate stock.
- later stock movement does not change the frozen difference.
- approval applies the frozen difference to current On Hand.
- adjustment and immutable movement match the stored difference.
- approved session is immutable.
- PostgreSQL 17 integration test + Full CI green on the same final SHA.

## Explicit exclusions
Manual Inventory Adjustment policy (08.09), Projection Rebuild (08.10), PHASE 09 accounting foundation, frontend cutover, Convex Production, dual write and main merge.

## Validation closure
- Final SHA: `770ca4d10ad82bc1c115abc8b9ed24364c025e19`.
- Full CI Run `35815776481` / #1058: SUCCESS.
- Validation PR #241: CLOSED WITHOUT MERGE.

## Next action
08.09 Inventory Adjustment.
