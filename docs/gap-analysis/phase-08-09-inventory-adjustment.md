# Phase 08.09 — Inventory Adjustment Gap Analysis

**Status:** `CLOSED`  
**Branch:** `agent/postgres-v1.7-core`  
**Architecture Source:** Business Tech ERP Architecture Baseline v1.7 §27.15  
**Implementation Plan:** Business Tech ERP Master Implementation Plan v1.0

## Gap classification
- Physical `inventory_adjustments`, lines, Serial/Batch links, branch/warehouse FKs and document uniqueness: موجود ومتوافق.
- Inventory Ledger, Stock/Cost projections, Reservations, Serial/Batch services, Idempotency, Audit and Outbox: موجود ومتوافق ويعاد استخدامه.
- Formal manual Adjustment command with reason/cost/negative-stock/shortfall rules: غير موجود ويجب إنشاؤه، وتم تنفيذه في 08.09.
- Exceptional permission catalog for negative stock and authorized manual overage cost: غير موجود ويجب إنشاؤه، migration 0026 adds stable keys without inventing default role grants.
- Accounting Posting Rules/Journal generation: PHASE 09 dependency. 08.09 emits `accounting.inventory_adjustment.posted` in the same transaction; no fabricated Journal Entry is created before the official Finance & Accounting Foundation.

## Command contract
- formal document only; Stock is changed only through the valued Inventory Cost/Stock projection service in the same posting transaction.
- reason is mandatory and closed to STOCKTAKE_SHORTAGE / STOCKTAKE_OVERAGE / DAMAGE / INTERNAL_USE / OTHER.
- OTHER requires a nonblank note.
- Idempotency claim precedes posting and replay cannot duplicate Adjustment or Movement.
- affected Stock/Cost rows are locked in deterministic warehouse/variant order before posting.
- tracked Serial/Batch identity is handled by the existing movement services and persisted on both Movement and Adjustment lines.

## Cost and stock rules
- shortage uses Current Weighted Average.
- overage uses Current WA, then Last Purchase Cost.
- if both are absent, explicit manual unit cost requires `inventory.set_adjustment_cost`; cost is never guessed.
- resulting On Hand below zero requires `inventory.allow_negative_stock`; the reason and Audit remain attached to the formal document.

## Reservation shortfall
After the correction, active/partially-consumed Reservations are re-read under lock. If truthful On Hand is below Reserved, the reservation rows are NOT rewritten. An `inventory.reservation_shortfall.detected` event records the affected reservations for follow-up.

## Accounting boundary
Architecture requires accounting effect when the Accounting Foundation is active. PHASE 09 owns Posting Rules and Journal Entries. This slice therefore records the immutable Inventory source + PostingBatch and emits the accounting source event atomically; PHASE 09 must consume the same source semantics in its posting transaction before accounting cutover. No placeholder account or invented Journal is permitted.

## Migration / index policy
Migration tail becomes `0026 inventory_adjustment_permissions`. No index is added or changed; Frozen Index Catalog remains unchanged.

## Required validation
- OTHER without note rejected.
- formal shortage creates one Adjustment + one immutable ADJUSTMENT Movement.
- Current WA cost is used.
- reservation shortfall is detected while reservation quantity/status remains unchanged.
- duplicate Idempotency key replays without duplicate posting.
- unauthorized negative stock is rejected.
- PostgreSQL 17 integration + Full CI green on the same final SHA.

## Validation record
- Final implementation SHA: `e608c421e16ce614adef5f01f9999d87a6e7c6b4`.
- Full CI #1069 / run `36036372044`: SUCCESS after re-running failed legacy verify job; backend-verify, browser-contract, verify, and release-gate all SUCCESS on the same SHA.
- Validation-only PR #243: close WITHOUT MERGE after documentation SHA validation.
- Accounting journal creation remains an explicit Phase 09 integration dependency, not represented as already complete.

## Next action
08.10 Projection Rebuild gap analysis and implementation, only after final documentation CI succeeds and PR #243 closes without merge.
