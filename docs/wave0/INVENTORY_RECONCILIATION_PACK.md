# Wave 0 — Inventory Reconciliation Pack

**Scope:** current inventory behavior only.  
**Protected rules:** Moving Weighted Average, historical COGS, historical return cost, inventory value, no negative stock.

## 1. Objective

Prove that the current product stock/value/cost snapshots are explainable by approved openings plus `inventoryMovements`, and that sale/return/purchase valuation agrees with frozen historical document costs.

Wave 0 does not introduce warehouses, Inventory V2, decimal quantity, UOM, Tenant/Company or PostgreSQL.

## 2. Current legacy model to reconcile

The current implementation stores:

- `products.stock` — current quantity snapshot,
- `products.inventoryValue` — current carrying-value snapshot,
- `products.costPrice` — current average-cost snapshot,
- `inventoryMovements` — quantity/value deltas with stock, inventory-value and average-cost before/after snapshots,
- invoice lines — frozen sale unit cost / cost total,
- sales-return lines — historical original unit cost / returned cost total,
- purchase receipt/return records — inbound/returned valuation evidence.

Because legacy products may predate complete movement history, a Wave 0 replay requires an explicit opening point. Missing opening provenance is reported, never guessed.

## 3. Core valuation rules frozen from current code

### I-01 — Quantity

For a scope with approved opening quantity:

```text
endingStock = openingStock + Σ quantityDelta
endingStock >= 0 at every movement
```

### I-02 — Inventory value

Using the current two-decimal money policy:

```text
endingValue = openingValue + Σ valueDelta
```

A movement whose `valueDelta` is not explicitly supplied follows the current valuation rule. The reconciliation export should prefer stored movement `valueDelta` rather than recalculating historical postings from today's cost.

### I-03 — Moving Weighted Average

Current code rounds inventory value to 2 decimals and average cost to 4 decimals. For a non-zero ending quantity:

```text
averageCost = round4(endingValue / endingStock)
```

For a receipt the equivalent business formula is:

```text
newAvg = (oldValue + receiptValue) / newQty
```

with the exact current rounding behavior preserved.

When stock reaches zero, the current implementation zeroes inventory value while retaining the previous average-cost snapshot. The replay checker therefore validates the stored movement snapshots rather than inventing a new zero-stock cost policy.

### I-04 — Movement chain

Where stored snapshots are available:

```text
movement.stockBefore          = prior stockAfter
movement.inventoryValueBefore = prior inventoryValueAfter
movement.averageCostBefore    = prior averageCostAfter
```

and each movement's after values must match its delta and current rounding policy.

### I-05 — Historical COGS

For a posted sale:

```text
lineCOGS = soldQty × frozenUnitCostAtPosting
```

The invoice's historical cost is the document control. Current `products.costPrice` must never replace it during reconciliation.

### I-06 — Historical sales-return cost

For a return tied to an original invoice line:

```text
returnedValue = returnedQty × originalInvoiceLine.unitCost
```

subject to the exact stored historical allocation/rounding used by the current implementation. The return's `historicalUnitCost` and `returnedCostTotal` must agree with the original sale and its positive inventory movement.

### I-07 — Purchase receipt / landed cost

Inbound quantity and value must agree between the purchase/receipt source and generated inventory movement. Landed-cost allocation changes value/average cost, not quantity, according to current code paths.

### I-08 — Purchase return

Returned quantity/value must agree with the purchase-return historical-cost policy and generated negative inventory movement. Do not substitute the current average cost if the return stores a historical source cost.

### I-09 — Transfer conservation

For a completed current transfer represented by transfer-out/transfer-in movements:

```text
Σ quantityDelta across the transfer = 0
Σ valueDelta across the transfer    = 0
```

except for a separately documented current rounding adjustment. No artificial revenue/expense is inferred from transfer status.

### I-10 — Repair part consumption

Repair part issue/reversal movements must reference the repair source and reconcile quantity/value to the protected historical costing behavior.

## 4. Opening baseline policy

A product scope is `RECONCILABLE` only when one of these is true:

1. the first covered movement is an explicit opening movement whose before state is known, or
2. a separately captured Wave 0 opening record/checksum provides `openingStock`, `openingValue`, and opening average cost as-of the replay boundary.

Otherwise classify it `LEGACY_OPENING_REQUIRED`.

Wave 0 must not create synthetic production movements solely to make old history replayable.

## 5. Required comparisons

For every reconciled product/branch scope:

- replayed stock vs `products.stock`,
- replayed value vs `products.inventoryValue`,
- replayed ending average vs `products.costPrice` under the zero-stock rule,
- movement before/after chain continuity,
- no intermediate negative stock,
- no negative inventory value,
- sales movement value vs frozen invoice COGS,
- sales-return movement value vs historical returned COGS,
- purchase/return movement value vs source document valuation,
- transfer conservation for paired references.

## 6. Difference classification

Use the same accounting-pack classifications plus inventory-specific codes:

- `INVENTORY_QTY_DIFFERENCE`
- `INVENTORY_VALUE_DIFFERENCE`
- `INVENTORY_AVG_COST_DIFFERENCE`
- `MOVEMENT_CHAIN_BREAK`
- `NEGATIVE_STOCK_REPLAY`
- `NEGATIVE_VALUE_REPLAY`
- `HISTORICAL_COGS_MISMATCH`
- `RETURN_HISTORICAL_COST_MISMATCH`
- `TRANSFER_CONSERVATION_MISMATCH`
- `LEGACY_OPENING_REQUIRED`
- `SCOPE_DATA_INCOMPLETE`

Any unexplained difference affecting money/quantity is a Wave 0 exit blocker.

## 7. Evidence

Each failure must expose:

- product/branch key,
- replay boundary/opening values,
- movement IDs and order,
- expected vs actual quantity/value/average cost,
- source document/reference IDs,
- repository SHA and dataset checksum.

## 8. Golden assertions

The Golden Dataset must include at least:

1. opening `10 @ 100` → stock 10, value 1000, average 100,
2. receipt `10 @ 120` → stock 20, value 2200, average 110,
3. sale `2` at frozen cost 110 → stock 18, value 1980, COGS 220,
4. later cost change followed by a return that still restores the original frozen sale cost,
5. retry/idempotency vector that does not duplicate a movement,
6. a deliberate broken fixture used to prove the checker fails closed.

Additional protected current journeys may be mapped to existing integration tests rather than reimplemented inside the reconciliation tool.

## 9. Exit evidence expected from this pack

Before Wave 0 acceptance:

- Golden Dataset replay is green.
- Current/staging normalized inventory export has zero unexplained quantity/value differences.
- All non-replayable legacy openings are enumerated explicitly.
- Historical COGS and sales-return historical-cost samples reconcile.
- Transfer and repair-part samples reconcile where those features are in the selected dataset.

The pack itself does not authorize any inventory repair or model migration.
