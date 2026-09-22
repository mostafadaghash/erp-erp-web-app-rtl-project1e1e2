# Phase 08.03 — Weighted Average Cost Gap Analysis

**Status:** `IN_PROGRESS`  
**Branch:** `agent/postgres-v1.7-core`  
**Architecture Source:** Business Tech ERP Architecture Baseline v1.7  
**Implementation Plan:** Business Tech ERP Master Implementation Plan v1.0

## Scope

08.03 implements the synchronous rebuildable cost projection per `Warehouse + Variant`:

- `weighted_average_cost`.
- `last_purchase_cost`.
- `inventory_value`.
- exact valued inbound and outbound primitives.
- Stock Position first, Cost State second lock ordering.
- no historical cost rewrite.

Historical truth remains the immutable Inventory Ledger. The cost projection is operational state, not a new ledger.

## Official v1.7 rules used

1. Official V1 costing is Weighted Average per Variant + Warehouse.
2. COGS/outbound uses the current source-Warehouse Weighted Average at the moment goods leave.
3. `Inventory Value = On Hand × Weighted Average Cost`.
4. `Last Purchase Cost` is a separate reporting value; it is not official COGS.
5. Purchase receipt updates Weighted Average at current server posting order. Backdated commercial document dates never rewrite earlier costing.
6. linked Sales Return enters inventory using its historical sale/COGS snapshot, then affects current WA only from the return's current posting moment.
7. Purchase Return inventory leaves at current WA; commercial settlement variance belongs to later Accounting logic.
8. Stock Transfer source leaves at source current WA; target mixes that incoming value into its own current WA.
9. Stocktake/Adjustment shortages leave at current WA. Overage uses current WA, then Last Purchase Cost, then an authorized explicit cost when no known cost exists.
10. Stock Positions are locked before Cost State under the global lock order; V1 remains `READ COMMITTED + SELECT ... FOR UPDATE`.
11. frozen cost projection index is PK/UNIQUE `(warehouse_id, variant_id)` plus `INDEX (variant_id, warehouse_id)`.

## Gap classification

### Exists and is compatible

- physical `variant_warehouse_cost_projection`.
- PK `(warehouse_id, variant_id)`.
- restrictive Warehouse and Variant FKs.
- nonnegative CHECKs for `weighted_average_cost` and `last_purchase_cost`.
- signed `inventory_value` field, compatible with visible negative stock.
- frozen reverse index `ix_variant_warehouse_cost_projection__variant_id_warehouse_id`.
- 08.02 Stock Position primitive and deterministic lock row creation.
- transaction helper with READ COMMITTED and bounded deadlock/serialization retry.
- immutable Inventory Ledger from 08.01.

### Missing and must be created

- transaction-bound Cost State lock/create primitive.
- fixed-decimal Weighted Average computation without JavaScript float.
- exact inventory-value recomputation from `On Hand × WA`.
- inbound cost mixing.
- explicit optional Last Purchase Cost update so non-purchase inbound does not rewrite it.
- outbound valuation at current WA without changing WA.
- atomic Stock Position + Cost Projection mutation in the same caller transaction.
- projection drift detection.
- deterministic zero-quantity residual guard.
- PostgreSQL 17 rollback, concurrent first-writer, purchase/return scenario and frozen-index proof.
- stable public error mapping.

## Calculation contract

All internal calculations use scaled BigInt:

- quantity scale = 6.
- money/cost scale = 4.
- no JavaScript floating point.
- multiplication/division rounds half away from zero to the destination database scale.

For valued inbound:

```text
current_value = current_on_hand × current_WA
inbound_value = inbound_quantity × inbound_unit_cost
new_quantity = current_on_hand + inbound_quantity
new_WA = (current_value + inbound_value) / new_quantity
inventory_value = new_quantity × new_WA
```

For outbound:

```text
outbound_unit_cost = current_WA
outbound_total_cost = outbound_quantity × current_WA
new_WA = current_WA
inventory_value = new_on_hand × current_WA
```

`last_purchase_cost` changes only when the caller explicitly supplies a purchase cost. Sales Return / Transfer inbound can omit it.

## Negative-stock boundary

v1.7 explicitly allows negative stock through a separate permission, but it does not define a special accounting variance rule for the exact edge where a later valued inbound makes `on_hand = 0` while the accumulated value is non-zero.

08.03 therefore does **not** invent such a variance. It:

- keeps signed `inventory_value` visible while stock is negative.
- applies the same current-value + inbound-value WA equation whenever the resulting quantity is non-zero.
- accepts an exact zero quantity only when the accumulated value is also zero.
- rejects `on_hand = 0` with non-zero residual value as `ZERO_QUANTITY_VALUE_RESIDUAL` so the later business/accounting policy must handle it explicitly rather than silently losing value.

This is a safety guard, not a new accounting rule.

## Concurrency contract

For each affected key:

1. lock/create Stock Position first using 08.02.
2. ensure the Cost State row with `INSERT ... ON CONFLICT DO NOTHING`.
3. lock Cost State with `SELECT ... FOR UPDATE`.
4. verify stored `inventory_value` equals the official rounded `on_hand × WA`.
5. calculate all next values exactly.
6. mutate Stock Position.
7. update Cost State in the same transaction.
8. caller later appends/owns the matching Inventory Movement and other module effects before COMMIT.

For multi-key prelocking, keys are sorted by `warehouse_id -> variant_id`. All Stock Positions are locked before any Cost State rows.

## Required tests

- initial purchase from zero stock sets WA, Last Purchase Cost and Inventory Value.
- second purchase recalculates WA correctly.
- outbound uses current WA and does not change WA/Last Purchase Cost.
- linked Sales Return style inbound can use historical unit cost and changes current WA without changing Last Purchase Cost.
- Purchase Return style outbound uses current WA.
- Inventory Value always equals rounded On Hand × WA.
- deterministic rounding to numeric(18,4).
- rollback removes newly-created Stock and Cost rows.
- Branch Scope propagates through Stock Position locking.
- direct projection drift is detected before valued mutation.
- 20 concurrent first-writer inbound receipts on an initially missing key produce no lost quantity/value and correct WA.
- reverse-order multi-key locks use the canonical Stock-before-Cost and Warehouse->Variant order.
- frozen cost indexes remain unchanged.
- migration tail remains `0024`.
- prior 08.01/08.02 and 07.x regressions remain green.
- Full CI succeeds on one implementation SHA.

## Explicit exclusions

- no Reservation lifecycle (08.04).
- no Serial/Batch/Expiry logic.
- no Stock Transfer document command; 08.07 will compose the source/target valued primitives.
- no Stocktake/Adjustment document orchestration.
- no Purchase Invoice landed-cost distribution; Purchasing phase supplies the final valued inbound cost.
- no Sales Invoice/COGS posting orchestration.
- no Purchase Return accounting variance journal.
- no Projection Rebuild procedure (08.10).
- no Frontend/Convex cutover.
- no dual write.
- no `main` merge.
- no Convex Production change.
- no migration.
- no Index addition.

## Next action

Implement and validate 08.03 only. Do not start 08.04 until 08.03 is CLOSED by the required same-SHA gates.
