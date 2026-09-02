# ADR-0002 — Ledger Source of Truth and Projections

**Status:** Accepted  
**Date:** 2026-09-02

## Context

The current code contains several legitimate layers of financial/inventory state: source documents, append-style ledgers/movements, mutable balance projections and older master-record balance fields. Without a formal ownership rule, later refactors could accidentally preserve the wrong field as authoritative.

## Decision

### General Ledger

`journalEntries` + `journalLines` are the accounting history source of truth. GL daily/account/period balance tables are rebuildable projections.

### Customer subledger

For ledger-covered activity, `customerLedgerEntries` own receivable/advance/purchase-history deltas. `customerBalances` is the current projection. Legacy `customers.balance` / `customers.totalPurchases` may be used only as explicit opening-review evidence where history predates the ledger.

### Supplier subledger

For ledger-covered activity, `supplierLedgerEntries` own supplier-balance deltas. `supplierBalances` is the projection. Legacy `suppliers.balance` is an opening-review exception, not the owner of new activity.

### Treasury

`financialMovements` own financial-account balance history. `financialAccounts.currentBalance` is a read projection. `financialTransactions` own transaction identity, references and idempotency metadata, but not the account balance by themselves.

### Inventory

`inventoryMovements` are canonical movement history for the period they cover. Current quantity/value/average-cost snapshots remain on `products` in the legacy model.

Because complete movement history may not exist for every legacy product, Wave 0 requires an approved opening quantity/value at the replay boundary. It is forbidden to assume a zero opening merely to force a full-history replay.

### Historical costing

- Posted sale COGS is owned by the frozen invoice-line cost snapshot and its posting/movement evidence.
- Sales-return inventory restoration uses the original invoice historical cost snapshot.
- Current `products.costPrice` is a current valuation projection and must never replace historical COGS.

### Audit

Audit records are evidence, not a financial balance or business-event source of truth.

## Required invariants

- Posted GL: debits = credits.
- Customer projection = customer ledger replay for a ledger-initialized scope.
- Supplier projection = supplier ledger replay for a ledger-initialized scope.
- Financial account projection = approved opening + signed financial movements.
- Inventory snapshot = approved opening + movement replay under the current valuation/rounding rules.
- Historical return cost traces to original sale cost.

## Consequences

Mutable balance fields may remain physically present in Wave 0, but their role is now explicit. Later migrations can replace implementations while preserving these ownership semantics and reconciliation controls.

## Rejected alternatives

- Selecting whichever mutable balance field currently matches the UI.
- Using source documents alone as substitutes for subledger/GL history.
- Recomputing historical profit from current product cost.
- Using audit records to rebuild accounting balances.
