# Phase 09.06 — Cheques Gap Analysis

**Status:** `GAP_ANALYSIS_COMPLETE` — implementation may start only after this document.  
**Authoritative source:** Business Tech ERP Architecture Baseline v1.7.  
**Analysis baseline SHA:** `617f1717b4f55e9cd65eb32e8211deb25f588da3`.  
**Scope:** Cheque lifecycle + Treasury settlement integrity only. No 09.07+ work, GL engine, frontend cutover or Convex production change.

## 1. Authoritative V1 behavior

- Cheque is a receivable/payable instrument, not a Treasury.
- Shape: `id, branch_id, counterparty_id, direction, cheque_number, bank_name, amount, due_date, status, source_type, source_id, settlement_financial_movement_id, notes, created_at`.
- `direction` = `RECEIVABLE | PAYABLE`.
- `status` = `PENDING | CLEARED | BOUNCED | CANCELLED`.
- Registering a `PENDING` cheque must not change Treasury.
- Actual collection/payment is idempotent and locks the Cheque with `SELECT ... FOR UPDATE`, then locks/validates the selected Treasury under the global lock order.
- `CLEARED` alone creates a FinancialMovement:
  - RECEIVABLE => IN;
  - PAYABLE => OUT.
- Two concurrent settlement attempts cannot both succeed; the second must observe the terminal state after the Cheque lock.
- `BOUNCED` or `CANCELLED` from `PENDING` creates no Treasury movement.
- Advanced bank reconciliation is outside V1.
- Detailed receivable/payable-to-cheque-account ledger/journal mapping is an architectural obligation, but Phase 09.09 explicitly owns the Cheque lifecycle posting-rule catalog. 09.06 must not invent premature global entry-type/GL mappings.

## 2. Current physical state

The approved `cheques` table already exists in migration 0008 with all baseline fields.

Existing compliant integrity from migration 0018:

- primary key;
- branch and counterparty FKs;
- optional `settlement_financial_movement_id` composite FK to the same Branch;
- direction closed domain;
- status closed domain;
- positive amount.

The frozen Index Catalog migration 0022 already contains all approved Cheque indexes:

- `(branch_id,status,due_date,id)`;
- `(counterparty_id,status,due_date)`;
- `(source_type,source_id)`;
- `(cheque_number)`;
- partial `(branch_id,due_date,id) WHERE status='PENDING'`.

No new index is required or allowed by this phase.

## 3. Current-state classification

| Requirement | Current implementation | Classification |
| --- | --- | --- |
| Cheque table/shape | exists | Existing / compliant |
| status/direction/positive amount constraints | exist | Existing / compliant |
| approved Cheque indexes | exist | Existing / compliant |
| PENDING command | no Central Backend service | Missing / create |
| PENDING must not move Treasury | no command exists | Missing behavioral gate |
| effective Finance permission + Branch Scope | no Cheque command exists | Missing / create |
| counterparty role compatibility | only Counterparty FK exists | Existing / needs command enforcement: RECEIVABLE customer, PAYABLE supplier |
| settlement `FOR UPDATE` Cheque | absent | Missing / create |
| active Treasury validation/lock | reusable 09.02 infrastructure exists | Reuse |
| CLEARED creates one matching FinancialMovement | no Cheque settlement writer | Missing / create |
| settlement movement exact context | current FK proves only movement id + Branch, not cheque source/direction/amount/counterparty | Existing / needs integrity correction |
| double clearing | not implemented | Missing / enforce via root Cheque lock + DB guard |
| legal status transition | DB accepts any allowed status update | Existing / needs integrity guard |
| terminal Cheque immutability | absent | Missing / create |
| BOUNCED/CANCELLED from PENDING only | absent | Missing / create |
| Audit + Outbox | reusable infrastructure exists | Reuse |
| Ledger/Journal effect for cheque-under-collection/payable | posting-rule/GL mapping not yet frozen in executable engine | Defer implementation to 09.09; do not pretend 09.06 completes accounting |
| advanced bank reconciliation | outside V1 | Excluded |

## 4. Integrity correction required

A forward-only migration after 0031 is required, without adding indexes or business columns, to enforce:

1. newly inserted Cheques begin as `PENDING` with no settlement movement;
2. identity/commercial fields are immutable after registration;
3. the only lifecycle transitions are `PENDING -> CLEARED|BOUNCED|CANCELLED`;
4. `CLEARED` requires exactly one linked settlement FinancialMovement;
5. `BOUNCED/CANCELLED` require no settlement movement;
6. FinancialMovement with `source_type='CHEQUE'` must:
   - reference an existing locked Cheque;
   - use the same Branch and Counterparty;
   - use exactly the Cheque amount;
   - be IN for RECEIVABLE and OUT for PAYABLE;
   - reject a second Cheque FinancialMovement for the same Cheque while the root row lock serializes competing inserts;
7. UPDATE/DELETE of terminal Cheque state is rejected.

The existing `financial_movements` PostingBatch-context function must be extended narrowly for `CHEQUE` while preserving Treasury Transfer special handling and ordinary branch rules.

## 5. Backend implementation boundary

Create a Cheque service with exactly these commands:

### registerPending

- validate input + Idempotency;
- effective `finance.accounts.manage` Permission + Branch Scope;
- active Branch;
- active Counterparty with required role:
  - RECEIVABLE => CUSTOMER;
  - PAYABLE => SUPPLIER;
- insert `PENDING` Cheque only;
- no Treasury lock;
- no FinancialMovement;
- Audit + Outbox in the same transaction.

### clear

- Idempotency;
- lock Cheque `FOR UPDATE`;
- require `PENDING`;
- permission/scope + active Branch;
- validate/lock active Treasury in the same Branch;
- create one PostingBatch `source_type='CHEQUE'`;
- append exactly one FinancialMovement:
  - RECEIVABLE => IN;
  - PAYABLE => OUT;
- update Cheque to `CLEARED` with `settlement_financial_movement_id`;
- Audit + Outbox;
- atomic rollback on any failure.

### bounce / cancel

- Idempotency;
- lock Cheque `FOR UPDATE`;
- require `PENDING`;
- no Treasury lock/movement;
- transition to `BOUNCED` or `CANCELLED`;
- Audit + Outbox.

No 09.06 command creates Receipt/Disbursement, Installment, CustomerAdvance, Journal, or ad-hoc Ledger entry.

## 6. Required PostgreSQL 17 tests

- register RECEIVABLE/PAYABLE Cheque as PENDING with zero Treasury/FinancialMovement effect;
- invalid Counterparty role rejected atomically;
- clear RECEIVABLE => exactly one IN movement, exact amount/source/counterparty/branch;
- clear PAYABLE => exactly one OUT movement;
- inactive/wrong-branch Treasury rejected with no state/movement change;
- repeated idempotency key replays without duplicates;
- same key/different payload conflicts;
- concurrent clear with different keys: exactly one succeeds; second rejects terminal status; one movement only;
- forced FinancialMovement/second-stage failure rolls back status, movement, projection, Audit and Outbox;
- bounce/cancel from PENDING creates no movement;
- clear after bounce/cancel rejected;
- bounce/cancel after clear rejected;
- direct invalid transition rejected by DB;
- direct mismatched Cheque FinancialMovement rejected;
- direct second Cheque FinancialMovement rejected;
- terminal UPDATE/DELETE rejected;
- cheque_number remains non-global-unique;
- frozen Index Catalog unchanged;
- verify-only migrations clean;
- all historical PostgreSQL schema/constraint/index/DDL regressions green;
- Full CI green on one final SHA.

## 7. Exit

09.06 is now `READY_FOR_IMPLEMENTATION`, not `CLOSED`.

**Next Action:** implement only this bounded Cheque lifecycle/settlement slice.
