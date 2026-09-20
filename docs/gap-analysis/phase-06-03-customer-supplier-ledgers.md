# Phase 06.03 — Customer/Supplier Ledgers Gap Analysis

**Status:** `IN_PROGRESS`  
**Branch:** `agent/postgres-v1.7-core`  
**Architecture Source:** Business Tech ERP Architecture Baseline v1.7  
**Implementation Plan:** Business Tech ERP Master Implementation Plan v1.0

## Scope

06.03 implements only the Customer/Supplier Ledger core:

- separate `customer_ledger_entries` and `supplier_ledger_entries`.
- append-only historical Source of Truth.
- no mutable customer/supplier balance truth.
- corrections/reversals append new entries; historical rows are never edited or deleted.
- every entry is traceable to an official `posting_batch`, source, branch and creator.
- Customer ledger requires CUSTOMER role; Supplier ledger requires SUPPLIER role.
- branch-scoped append and statement reads.
- official settlement paths in later Sales/Purchasing/Finance phases must use this append-only primitive rather than mutating a balance.

Phase 07 and all Sales/Purchasing/Finance posting orchestration remain explicitly excluded.

## Baseline decisions

- Customer and Supplier Ledgers are separate Historical Sources of Truth.
- no writable `customer.balance` or `supplier.balance` exists.
- `posting_batch_id` ties each ledger effect to the unified Posting/Reversal model.
- posted Customer/Supplier Ledger Entries are historically immutable.
- correction after Posting is represented by new Correction/Reversal effects, not UPDATE/DELETE.
- Receipt/Disbursement/Invoice/Installment settlement creates the appropriate Ledger effect inside the same business transaction.
- business documents/ledger operations carrying `branch_id` require Backend Branch Scope.
- ledger statements use the frozen Counterparty+Branch+occurred_at indexes.
- the official schema does not freeze a global `entry_type` vocabulary in this phase; the posting use case owns the business meaning of `entry_type`.

## Current-state classification

| Area | Classification | Decision |
|---|---|---|
| `customer_ledger_entries` schema | موجود ومتوافق | reuse |
| `supplier_ledger_entries` schema | موجود ومتوافق | reuse |
| Counterparty/Branch/PostingBatch/User FKs | موجود ومتوافق | reuse |
| non-negative amount CHECK | موجود ومتوافق | reuse |
| frozen ledger indexes | موجود ومتوافق | no index change |
| separate Customer/Supplier storage | موجود ومتوافق | reuse |
| DB-level UPDATE/DELETE immutability | غير موجود | add migration 0023 |
| append-only Backend ledger primitive | غير موجود | create |
| posting-batch/source/branch coherence validation | غير موجود في Backend | create |
| role-specific Customer/Supplier validation | غير موجود في Backend | create |
| transaction-bound Branch Scope on ledger operations | غير موجود | create/reuse BranchScopeService |
| branch-scoped statement query | غير موجود | create |
| mutable balance column/projection | غير معتمد | do not create |
| Sales/Purchasing/Finance settlement orchestration | مراحل لاحقة | do not implement here |

## Database decision

One migration is required: `0023_counterparty_ledger_immutability`.

It does **not** alter ledger shape and adds **no index**.

It adds:

- one trigger function that rejects historical `UPDATE/DELETE`.
- one BEFORE UPDATE OR DELETE trigger on `customer_ledger_entries`.
- one BEFORE UPDATE OR DELETE trigger on `supplier_ledger_entries`.

This closes the explicit Baseline immutability requirement at the database boundary. Inserts remain allowed so POST/CORRECTION/REVERSAL effects can append history.

## Implementation

- add `CounterpartyLedgerService`.
- expose `append()` and `appendWithinTransaction()`; no update/delete/setBalance API exists.
- validate Actor Branch Scope inside the same transaction.
- require CUSTOMER role for Customer Ledger writes/reads.
- require SUPPLIER role for Supplier Ledger writes/reads.
- require an existing Posting Batch.
- require ledger `branch_id/source_type/source_id` to match the Posting Batch.
- preserve caller/business-use-case `entry_type`; 06.03 does not invent a global ledger vocabulary.
- use non-negative `numeric(18,4)` amount contract already frozen by schema.
- expose branch-scoped `statement()` ordered by `occurred_at DESC, id DESC`.
- add stable `COUNTERPARTY_LEDGER_OPERATION_REJECTED` public error mapping.
- extend `BranchScopeService` with transaction-bound scope-only checks so ledger operations can reuse the already-approved SELECTED/ALL rules without inventing permission keys.
- no HTTP/Frontend/Convex cutover.

## Settlement boundary

06.03 does not create Receipt/Disbursement/Sales/Purchasing settlement workflows ahead of their official phases.

Instead, it establishes the only permitted ledger mutation model those workflows must call:

`Business Posting Transaction → Posting Batch → append Customer/Supplier Ledger Entry`

There is no API to erase settled debt, overwrite historical entries, or set a customer/supplier balance directly.

## Required tests

- same Counterparty may have independent Customer and Supplier histories.
- Customer statement does not return Supplier entries and vice versa.
- Customer ledger requires CUSTOMER role.
- Supplier ledger requires SUPPLIER role.
- entry must match Posting Batch branch/source.
- direct UPDATE of a posted Customer Ledger Entry is rejected by PostgreSQL.
- direct DELETE of a posted Supplier Ledger Entry is rejected by PostgreSQL.
- REVERSAL appends a new row and preserves the original row.
- SELECTED branch actor can append/read an allowed branch.
- cross-branch append is denied.
- cross-branch statement read is denied.
- denied cross-branch append leaves no row.
- no mutable customer/supplier balance column is introduced.
- frozen Customer/Supplier Ledger index inventory remains unchanged.
- migration verify-only succeeds with 0023 applied.
- Full CI passes on the same implementation SHA.

## Gate 06 progress

06.03 is responsible for the final open Gate 06 items:

- ledger immutability tests.
- branch scope tests.

If both pass with the previous 06.01/06.02 gates, PHASE 06 can close.

## Explicit exclusions

- no Sales posting orchestration.
- no Purchasing posting orchestration.
- no Receipt/Disbursement implementation.
- no Installment/Cheque settlement implementation.
- no balance projection/materialized balance.
- no global ledger `entry_type` enum invented.
- no Phase 07 implementation.
- no Frontend/Convex module cutover.
- no dual write.
- no `main` merge.
- no Convex Production change.
- no index addition.

## Next action

Run Full CI on the 06.03 implementation SHA through a validation-only PR. Only after PostgreSQL 17 immutability, reversal-history, branch-scope and all regression gates pass on the same SHA may 06.03 and Gate 06 be documented as CLOSED.
