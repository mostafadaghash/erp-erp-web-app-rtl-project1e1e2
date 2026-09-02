# Wave 0 — Accounting Reconciliation Pack

**Scope:** read-only/replay controls for the current Convex authority.  
**No data repair is authorized by this pack.**

## 1. Objective

Produce repeatable evidence that the current accounting facts agree across source documents, subledgers, treasury movements and the General Ledger before any architectural refactor starts.

The success condition is **zero unexplained difference**. A documented legacy exception is not silently converted into zero; it remains visible with an owner and disposition.

## 2. Required snapshot scope

A reconciliation snapshot must be taken from one consistent logical point and contain, at minimum:

- `journalEntries` and `journalLines`,
- GL balance projections if they are being checked,
- `customerLedgerEntries` and `customerBalances`,
- `supplierLedgerEntries` and `supplierBalances`,
- `financialTransactions`, `financialMovements`, `financialAccounts`,
- invoices and sales returns for sales controls,
- purchase receipts/returns and supplier payments for purchase controls,
- any opening/cutover metadata required to explain pre-ledger balances,
- branch identifiers and business dates needed to partition controls.

Wave 0 does not change the export mechanism or authority. Convex remains authoritative.

## 3. Control hierarchy

### A-01 — Journal entry balance

For every posted journal entry:

```text
sum(debit) - sum(credit) = 0.00
```

Failure severity: **P0 / blocker**.

### A-02 — Trial balance

For every reconciled period/branch scope:

```text
Σ posted debits = Σ posted credits
```

Any GL projection must reproduce the same account balances as journal-line replay.

### A-03 — Customer receivable projection

For each ledger-initialized `(customerId, branchId)`:

```text
replayed receivableDelta = customerBalances.receivableBalance
replayed advanceDelta    = customerBalances.advanceBalance
replayed purchasesDelta  = customerBalances.totalPurchases
```

`customers.balance` and `customers.totalPurchases` are not accepted as alternate answers. If they contain pre-cutover data not represented by an approved opening entry, classify the scope as `LEGACY_OPENING_REQUIRED`.

### A-04 — Supplier payable projection

For each ledger-initialized `(supplierId, branchId)`:

```text
Σ supplierLedgerEntries.amountDelta = supplierBalances.balance
```

A non-zero `suppliers.balance` without a ledger opening is a legacy exception, not a reconciled operating balance.

### A-05 — Financial account projection

For every financial account from its approved opening point:

```text
openingBalance + Σ financialMovements.signedAmount
  = financialAccounts.currentBalance
```

Additionally, the movement chain must be continuous when before/after snapshots are available:

```text
movement[n].balanceBefore = movement[n-1].balanceAfter
movement[n].balanceAfter  = movement[n].balanceBefore + signedAmount
```

### A-06 — Financial transaction completeness

For every posted `financialTransaction`:

- at least one `financialMovement` exists,
- movement references belong to the transaction,
- its GL bridge exists when the current posting policy requires one,
- reversals point to the original and do not erase it,
- duplicate idempotency keys do not produce duplicate economic effects.

### A-07 — Sales document to subledger

For each posted invoice/return in the sampled/golden scope:

- customer charge/credit effects reconcile to customer-ledger entries by document reference,
- payment/refund effects reconcile to finance movements,
- the invoice document's paid/remaining state agrees with the referenced operating postings,
- a sales return does not use current product cost for customer accounting or COGS.

### A-08 — Sales document to GL

For the same reference/period:

- revenue/return accounts reconcile to the posted commercial net effect,
- tax amount reconciles to the legacy tax snapshot currently stored on the document (Wave 0 does not introduce a Tax Engine),
- COGS/Inventory postings reconcile to frozen historical cost.

### A-09 — Supplier document to subledger

Purchase receipt/return/payment references must reconcile to supplier-ledger deltas according to the current posting behavior. Document-local remaining amounts are controls, not the supplier account owner.

### A-10 — Reversal integrity

For each sampled reversal:

- original record remains present,
- reversal is linked to the original,
- the compensating ledger/finance/GL effect is equal and opposite where applicable,
- a second retry is idempotent or rejected according to the current contract.

## 4. Required grouping dimensions

The pack must be runnable at least by:

- full deployment,
- branch,
- business-date range / period,
- customer,
- supplier,
- financial account,
- source document/reference.

Company/Tenant is intentionally not introduced in Wave 0 because the current code does not yet have that boundary.

## 5. Difference classification

Every non-zero result must be classified as exactly one of:

- `UNEXPLAINED_DIFFERENCE` — P0 blocker.
- `LEGACY_OPENING_REQUIRED` — pre-ledger/master balance exists without an approved opening posting.
- `LEGACY_DOCUMENT_NOT_BRIDGED` — historical document predates the current GL/subledger bridge.
- `MISSING_REFERENCE` — posting exists but expected source/reference cannot be found.
- `ROUNDING_POLICY_MISMATCH` — exact values differ because two current paths use different legacy rounding rules; still a blocker until explained.
- `SCOPE_DATA_INCOMPLETE` — snapshot/export omitted records needed for the control.

No reconciliation script may modify production data to make a control pass.

## 6. Evidence record

A reconciliation run must record:

- repository SHA,
- dataset/snapshot ID and checksum,
- extraction timestamp,
- branch/date filters,
- control ID,
- expected and actual values,
- absolute difference,
- classification,
- source record IDs for failures/exceptions,
- tool/script version or commit SHA.

## 7. Wave 0 executable tool

`scripts/wave0/reconcile-snapshot.mjs` is a technology-neutral, read-only replay checker for normalized snapshots. It is deliberately not a production database adapter. Its purpose in Wave 0 is to make the controls executable against the Golden Dataset and against normalized exports prepared from Convex.

The tool must exit non-zero for unexplained control failures. It must not patch records.

## 8. Exit evidence expected from this pack

Before Wave 0 can be accepted, record:

1. Golden Dataset run: all accounting controls green.
2. Current/staging normalized export run: zero unexplained differences, or a signed list of legacy exceptions with owners.
3. GL debit/credit invariant evidence.
4. Customer/supplier/financial-account replay evidence.
5. Source-document-to-ledger sampled evidence for the protected P0 journeys.

The pack being committed is **CODE/TOOLING COMPLETE** only; a live/staging reconciliation run is a separate execution status.
