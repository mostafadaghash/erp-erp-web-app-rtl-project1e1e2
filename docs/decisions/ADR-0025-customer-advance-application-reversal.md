# ADR-0025 — Customer Advance Application Reversal Encoding

- **Status:** ACCEPTED
- **Date:** 2026-10-02
- **Phase:** 09.05 — Customer Advances
- **Branch:** `agent/postgres-v1.7-core`
- **Authority:** Architecture Baseline v1.7, ADR-0020, ADR-0024

## Context

The approved V1 `advance_applications` shape is:

`id, advance_id, sales_invoice_id, amount, applied_at`

It has `amount > 0`, intentionally has no `UNIQUE(advance_id, sales_invoice_id)`, and ADR-0024 explicitly forbids adding `posting_batch_id` merely because of the erroneous §28.6 index line.

At the same time the Baseline requires formal reversal of an applied advance, restoration of availability, and later re-application without deleting historical rows.

No operation-kind or reversal-reference column exists in the approved V1 physical shape.

## Decision

V1 keeps the approved table shape unchanged and interprets each `(advance_id, sales_invoice_id)` history as an ordered state sequence by `applied_at,id`:

1. row 1 = APPLY;
2. while active, the next row = REVERSAL and must equal the active application amount;
3. after reversal, the next row may APPLY again;
4. therefore odd history count means the pair currently has one active application, even count means none;
5. only one active application per Advance+Invoice pair exists at a time;
6. all stored amounts stay positive;
7. reversal never UPDATEs or DELETEs an application row;
8. effective consumed amount is the sum of the latest active row for pairs with odd history count;
9. `remaining_amount_projection` is rebuilt from that effective history.

The Backend command owns APPLY vs REVERSAL intent explicitly. Database integrity triggers enforce the same state transition, source-document context and append-only history.

## Consequences

- No new business column is added.
- No index is added or changed.
- ADR-0024 remains fully preserved.
- Reversal/re-application history is representable using the existing physical schema.
- Projection rebuild is deterministic.
- Applying/reversing an Advance creates no FinancialMovement.
- Audit/Outbox record the explicit operation so operational/event consumers do not need to infer intent from parity.

## Rejected alternatives

- Adding `posting_batch_id`: rejected by ADR-0024.
- Adding a direction/type column in 09.05: unnecessary schema drift for V1.
- Negative application amounts: rejected by the existing positive-amount invariant.
- UPDATE/DELETE of prior application rows: rejected by immutable-history policy.
- `UNIQUE(advance_id, sales_invoice_id)`: rejected by ADR-0020 because it blocks reversal/re-application history.
