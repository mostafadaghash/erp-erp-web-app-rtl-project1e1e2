# Phase 09.03 — Receipts / Disbursements Gap Analysis

**Status:** GAP_ANALYSIS_COMPLETE — implementation may start only after this document.
**Baseline:** Architecture Baseline v1.7.
**Analysis baseline SHA:** `670e3e903fc699028ab2effd3cb79edbdd31a27b`.

## Authoritative behavior

- Receipt and Disbursement are independent business documents; Financial Movement is the internal ledger effect and is not created directly by the UI.
- Receipt creates exactly one IN Financial Movement; Disbursement creates exactly one OUT Financial Movement for the cash effect.
- Treasury balance is derived from Financial Movements through the synchronous position projection, never by directly writing a Treasury balance field.
- posting is idempotent and atomic; Treasury is locked/validated in the transaction.
- allocations and Customer/Supplier Ledger effects apply only when a settlement target/account exists and remain separate from the single cash movement.
- edit/delete after posting is reversal/correction with reason/audit, not mutation of immutable Financial Movements.
- Treasury Transfer is not part of 09.03.

## Current-state classification

| Requirement | Current state | Classification |
| --- | --- | --- |
| receipts/disbursements tables | Exist | Existing/compliant physical shape |
| branch document uniqueness | Existing constraints | Existing/compliant |
| positive amount + branch-safe Treasury FK | Existing constraints | Existing/compliant |
| frozen indexes | Existing catalog | Existing/compliant |
| Financial Movement writer | Implemented/closed in 09.02 | Reuse |
| PostingBatch / Idempotency / Audit / Outbox infrastructure | Implemented | Reuse |
| atomic document numbering infrastructure | Implemented | Reuse |
| Receipt command | Missing | Must create |
| Disbursement command | Missing | Must create |
| direct business-document immutability guard | Missing | Must create |
| duplicate cash-effect guard per Receipt/Disbursement | Not enforced at DB boundary | Must create |
| allocations/target settlement | Physical model exists but target-specific rules belong to later settlement slices | Defer |
| edit/delete/reversal command | Generic architecture defined, but 09.03 first slice will post immutable documents; correction command deferred until target settlement/accounting dependencies are available | Defer without allowing mutation |
| frontend/Convex cutover | Legacy | Defer |

## 09.03 implementation boundary

Create a Central Backend Receipt/Disbursement posting service which:
1. executes through Idempotency;
2. enforces Branch Scope and active Treasury through the 09.02 Financial Movement writer;
3. allocates branch document numbers atomically;
4. creates the business document;
5. creates a PostingBatch with source type RECEIPT or DISBURSEMENT;
6. creates exactly one matching IN/OUT Financial Movement and updates Treasury position in the same transaction;
7. records Audit and Outbox in the same transaction;
8. keeps posted document rows immutable;
9. exposes no direct Treasury balance write.

No target allocation, customer/supplier ledger settlement, cheque, installment, advance, GL journal, Treasury Transfer, frontend cutover or Convex write is introduced here.

## Integrity decision

A forward-only integrity migration is justified to:
- reject UPDATE/DELETE of posted Receipt/Disbursement rows;
- enforce at most one Financial Movement for each RECEIPT source and at most one for each DISBURSEMENT source using approved business integrity, without adding an unapproved general-purpose index.

## Required tests

- Receipt => one IN movement and position increase.
- Disbursement => one OUT movement and position decrease.
- document numbering is atomic/unique under concurrency.
- repeated idempotency key cannot double-post cash.
- same key + different payload conflicts.
- failed effect rolls back document, posting batch, movement, position, audit/outbox.
- inactive Treasury / branch-scope rejection.
- posted Receipt/Disbursement UPDATE/DELETE rejected.
- direct duplicate cash movement for same source rejected.
- no Allocation, customer/supplier ledger, cheque, installment, advance, transfer or journal effect in 09.03.
- verify-only migrations clean; full existing regression suite green.

**Next action:** implement only this 09.03 Receipt/Disbursement posting slice and its tests.
