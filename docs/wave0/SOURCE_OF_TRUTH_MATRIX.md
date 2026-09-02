# Wave 0 — Source of Truth Matrix

**Observed main:** `5b77e8695a5d1d3d8de4dcec00c619110bdee214`  
**Decision scope:** current legacy architecture only. This matrix does not implement Wave 1+ models.

## 1. Terminology

- **Canonical ledger/history:** append-style or posted records that explain how a balance was produced and are the authoritative audit/replay input.
- **Projection/snapshot:** mutable current state used for fast reads. It must equal replay/control totals from the canonical history for the covered period.
- **Source document:** invoice/return/receipt/payment/etc. that authorizes or explains a posting. It is not automatically the balance owner.
- **Legacy exception:** old mutable field that may still be needed for pre-cutover/opening conversion, but must not compete with the ledger for new operating activity.

## 2. Matrix

| Balance / accounting fact | Canonical owner on current system | Projection / read model | Source documents / cross-check | Legacy or competing fields | Wave 0 reconciliation rule | Status |
|---|---|---|---|---|---|---|
| GL posted history | `journalEntries` + `journalLines` | `generalLedgerDailyBalances`, `generalLedgerAccountBalances`, `generalLedgerPeriodBalances` | Invoices, returns, finance transactions, purchases, repairs and other posting references | none accepted as alternate GL | posted journals: `Σ debit = Σ credit`; projections must equal replay | CANONICAL |
| Customer receivable | `customerLedgerEntries.receivableDelta` including opening entry | `customerBalances.receivableBalance` | invoices, payments, sales returns, COD, repairs, deposits/applications by reference | `customers.balance` | projection = ordered replay of customer ledger; legacy master is opening-review input only | CANONICAL + LEGACY EXCEPTION |
| Customer advance | `customerLedgerEntries.advanceDelta` | `customerBalances.advanceBalance` | deposits, deposit application, refunds/credits | no separate approved balance owner | projection = replay; must never go negative under current rules | CANONICAL |
| Customer lifetime purchases metric | `customerLedgerEntries.purchasesDelta` for ledger-enabled lifecycle | `customerBalances.totalPurchases` | posted sales/returns according to current posting rules | `customers.totalPurchases` | projection = replay after ledger opening; legacy value requires explicit opening review | CANONICAL + LEGACY EXCEPTION |
| Supplier payable | `supplierLedgerEntries.amountDelta` including opening entry | `supplierBalances.balance` | purchase receipts/returns, supplier payments/refunds | `suppliers.balance` | projection = ordered replay of supplier ledger; legacy master cannot own new activity | CANONICAL + LEGACY EXCEPTION |
| Financial account balance (cash/bank/clearing) | `financialMovements.signedAmount` | `financialAccounts.currentBalance` | `financialTransactions` header and referenced business document | none accepted as alternate current balance | current balance = replay of movements from approved opening; each movement before/after chain must be continuous | CANONICAL |
| Available clearing balance by date | eligible `financialMovements.signedAmount` plus `availableAt` | computed query result | settlement transaction/reference | account `currentBalance` is total, not availability | sum movements whose availability policy permits inclusion | DERIVED |
| Financial transaction identity/idempotency | `financialTransactions` | n/a | linked movements, GL journal, audit | document-local payment fields | one idempotency key/fingerprint maps to one transaction semantics | CANONICAL HEADER |
| Inventory movement history | `inventoryMovements` for ledger-covered activity | n/a | invoice/return/purchase/repair/transfer references | historical product edits before complete movement coverage | movement sequence must explain every ledger-covered quantity/value change | CANONICAL HISTORY |
| Inventory on-hand quantity | movement replay for ledger-covered activity **plus an approved opening baseline** | `products.stock` | inventory movements and source documents | pre-ledger/legacy product stock may be opening source | `products.stock = opening + Σ quantityDelta`; unexplained difference = blocker | HYBRID UNTIL OPENING PROVEN |
| Inventory carrying value | movement replay for ledger-covered activity **plus approved opening value** | `products.inventoryValue` | `inventoryMovements.valueDelta` and valuation snapshots | product value may contain legacy opening state | `products.inventoryValue = openingValue + Σ valueDelta` within exact legacy rounding policy | HYBRID UNTIL OPENING PROVEN |
| Current moving average cost | deterministic valuation derived from on-hand quantity/value after each movement | `products.costPrice`; movement `averageCostAfter` snapshots | MWA rules, purchase/landed cost, sales/returns | current product cost must not be used for historical COGS | replayed ending average = product snapshot; zero-stock policy must match current rule | DERIVED PROJECTION |
| Historical sale COGS | invoice line frozen `unitCost` / `costTotal` and corresponding inventory movement/value effect | invoice `cogs` aggregate/report read models | sale posting movement + GL COGS/inventory lines | `products.costPrice` at report time | historical COGS must equal frozen sale costs, never current product cost | CANONICAL SNAPSHOT FOR DOCUMENT |
| Historical sales-return cost | `salesReturns` line `historicalUnitCost` / `returnedCostTotal` and traced original invoice cost | return totals | original invoice line + return inventory movement + GL reversal | current product cost | return value must use original invoice historical unit cost | CANONICAL SNAPSHOT FOR RETURN |
| Purchase receipt inventory cost | receipt line unit/landed-cost allocation + generated inventory movement value | product snapshot after posting | purchase receipt and movement | supplier master balance | receipt valuation must reconcile to movement value; supplier liability reconciles separately to supplier ledger/GL | SOURCE DOCUMENT + LEDGER |
| Purchase return inventory value removed | purchase-return historical cost snapshot + generated negative movement | product snapshot after posting | original purchase source + return + GL/supplier effects | current average cost if policy says historical source | value removed must match stored historical policy and movement | SOURCE DOCUMENT + LEDGER |
| Invoice document outstanding amount | current invoice `paid` / `remaining` operational state | invoice UI/read model | customer ledger entries and finance allocations/references for that invoice | customer master balance | invoice-level state must reconcile to referenced charges/payments/returns; customer total is owned by customer ledger | DOCUMENT PROJECTION |
| Supplier document outstanding amount | purchase/receipt document paid/remaining fields where present | document UI/read model | supplier ledger and supplier-payment allocation/reference | supplier master balance | document state must reconcile to its linked supplier postings; supplier total is owned by supplier ledger | DOCUMENT PROJECTION |
| Sales revenue / returns / tax / COGS accounting balance | posted `journalLines` by mapped account | GL account/period projections and reports | posted invoices/returns and their frozen totals | UI aggregates | GL is accounting truth; document totals are control totals and must reconcile by period/reference | CANONICAL GL |
| COD clearing balance | `financialMovements` on COD clearing account | `financialAccounts.currentBalance` | shipment/delivery COD records and settlement transactions | shipment status alone | clearing reductions + fees + bank/cash receipt must reconcile to allocated settlements; status alone has no financial authority | CANONICAL FINANCE |
| Audit evidence | `auditLogs` / centralized audit records | audit search/read models | business records and references | none | audit is evidence only; it must never be used to reconstruct a financial balance | NOT A BALANCE OWNER |

## 3. Formal ownership decisions

### GL

The posted journal is the accounting source of truth. GL balance tables are projections. Source documents are controls, not alternate ledgers.

### Customer and supplier subledgers

For new ledger-covered activity, ledger entries own the balance history. `customerBalances` and `supplierBalances` are projections. Legacy master balance fields are permitted only as pre-cutover/opening evidence until converted through an explicit opening posting.

No new operating reconciliation may silently select the master balance because it happens to match the desired result.

### Treasury

`financialMovements` own account-balance history. `financialAccounts.currentBalance` is a performance projection. `financialTransactions` owns transaction metadata/idempotency, not the account balance by itself.

### Inventory

The current implementation has an important legacy constraint: stock/value/average-cost snapshots are physically stored on `products`, while movement history is stored in `inventoryMovements`. Therefore Wave 0 does **not** pretend that a full replay from zero is always possible for every historical product.

The official Wave 0 rule is:

1. establish an explicit opening quantity/value for each reconciliation scope,
2. replay ledger-covered `inventoryMovements` in deterministic order,
3. compare ending quantity/value/average cost to the product snapshot,
4. classify any non-zero unexplained difference as a blocker or documented legacy exception,
5. never repair a difference by changing business data during Wave 0.

This records the current truth without starting Inventory V2.

## 4. Reconciliation invariants

The following are mandatory controls for Wave 0 evidence:

1. **GL:** every posted journal has equal debits and credits; period trial balance difference is zero.
2. **Customer:** replayed receivable/advance/purchases equals `customerBalances` for ledger-initialized scopes.
3. **Supplier:** replayed payable equals `supplierBalances` for ledger-initialized scopes.
4. **Treasury:** replayed financial movements equals `financialAccounts.currentBalance` from the approved opening point.
5. **Inventory quantity:** opening quantity + movement deltas equals product stock.
6. **Inventory value:** opening value + movement value deltas equals product inventory value under current rounding behavior.
7. **Inventory MWA:** ending average cost equals the current valuation rule output; historical COGS is never recomputed from that ending average.
8. **Sales/returns:** source-document revenue/tax/COGS controls reconcile to posted GL mappings for the same references/period.
9. **Reversals:** reversal lineage is one-to-one/idempotent and original records remain available.
10. **Idempotency:** retrying the same request with the same fingerprint has no duplicate financial/inventory effect; reuse with different data fails.

## 5. Explicitly rejected sources of truth

- `customers.balance` for new customer activity.
- `suppliers.balance` for new supplier activity.
- shipment/order/repair status strings as financial postings by themselves.
- audit logs as a financial/event ledger.
- current `products.costPrice` for historical COGS or historical sales-return costing.
- browser/UI totals when server-posted totals exist.
- GL balance projections without their posted journal lines.

## 6. Open Wave 0 exceptions that must be measured

These are not permission to redesign the system. They are reconciliation questions:

- products whose opening stock/value predates reliable movement coverage,
- customers/suppliers with non-zero legacy master balances but no approved ledger opening,
- documents that predate newer GL/subledger bridges,
- optional/legacy branch IDs on historical records,
- document-local paid/remaining fields that lack normalized allocations.

The reconciliation packs must report these separately from unexplained mathematical differences.
