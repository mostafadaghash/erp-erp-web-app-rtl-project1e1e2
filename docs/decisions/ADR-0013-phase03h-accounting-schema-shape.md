# ADR-0013 — Phase 03.H Accounting Schema Shape

- **Status:** Accepted
- **Phase:** 03.05 / 03.H
- **Authority:** `Business-Tech-ERP-Architecture-Baseline-v1.7-Final.docx`

## Decision

Phase 03.H creates only the canonical Accounting relations defined by Architecture Baseline v1.7:

- `gl_accounts`
- `journal_entries`
- `journal_lines`

It also creates the specifically authorized deferred journal-balance constraint trigger required by the Phase 03.05 build order. No Repairs/Follow-Up/Notifications tables, generic accounting document, posting service, direct-entry UI, general 03.06 constraint catalog, 03.07 indexes, module cutover, or dual write are part of 03.H.

## Physical shape

- Internal identities and references use `uuid`.
- Journal debit/credit use exact `numeric(18,4)`; no floating-point accounting persistence is allowed.
- `journal_entries.posted_at` uses `timestamptz` and represents the real posting/effect order.
- `gl_accounts.parent_id` is nullable for root Chart-of-Accounts nodes.
- `journal_entries.reversal_of_entry_id` is nullable for original entries and links a later reversal to its historical original without mutating the original.
- `journal_entries.description` is nullable descriptive metadata; accounting integrity does not depend on it.
- `journal_lines.counterparty_id` is nullable because not every GL line belongs to a customer/supplier counterparty.
- `journal_entries.posting_batch_id` is required but is explicitly not unique; a posting batch may contain the coordinated accounting effects required by the business posting transaction.

## Deferred balance invariant

Architecture v1.7 explicitly rejects a row-level check as sufficient for whole-entry balance. Phase 03.H therefore creates:

- function `fn_journal_entries_balanced_at_commit()`;
- deterministic constraint trigger `ct_journal_entries__balanced_at_commit` on `journal_lines`;
- `DEFERRABLE INITIALLY DEFERRED` execution;
- final-state verification that `SUM(debit) = SUM(credit)` for every affected Journal Entry at transaction commit.

The trigger covers INSERT, UPDATE, and DELETE effects. An UPDATE that moves a line between Journal Entries validates both the new entry and the previous entry. Any imbalance raises SQLSTATE `23514`, causing the surrounding transaction to fail and roll back.

This database invariant complements, and does not replace, the later Backend validation required by v1.7.

## Explicitly deferred to 03.06

Except for the journal-balance constraint trigger explicitly assigned to 03.H, all remaining relational constraints stay deferred to 03.06, including:

- PKs and FKs;
- `UNIQUE(company_id, code)` on `gl_accounts`;
- debit/credit row-level non-negative and not-both-positive checks;
- reversal/source/context integrity;
- delete policies and other composite-context protections.

## Explicitly deferred to 03.07

No project-owned accounting index is created in 03.H. The closed v1.7 Index Catalog will later add only its approved indexes for Chart of Accounts and Journal query paths.

## Service behavior remains later

03.H does not implement business posting rules, journal generation services, VAT/Inventory/COGS/Receivable/Payable/Treasury accounting behavior, reversal commands, authorization, idempotency, audit/outbox orchestration, or frontend APIs. Those remain in their authorized later phases.

## Verification required

PostgreSQL 17 integration coverage must prove on the final 03.H SHA that:

- exactly the canonical three Accounting tables exist for this subphase;
- their column order/types/nullability match the approved physical contract;
- debit/credit persist as exact `numeric(18,4)`;
- the constraint trigger exists and is both deferrable and initially deferred;
- a balanced multi-line Journal Entry commits successfully;
- an unbalanced Journal Entry is accepted during the transaction but fails at `COMMIT`;
- an update that would unbalance a previously committed entry fails at `COMMIT` and rolls back;
- migration history/checksum, idempotent rerun, and verify-only remain correct;
- 03.I relations remain absent;
- no general 03.06 constraints or 03.07 indexes are introduced early.
