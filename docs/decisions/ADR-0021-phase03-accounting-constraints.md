# ADR-0021 — Phase 03.06 Accounting Constraints

- **Status:** Accepted
- **Date:** 2026-09-17
- **Phase:** 03.06 — Constraints
- **Authority:** `Business-Tech-ERP-Architecture-Baseline-v1.7-Final.docx`

## Context

Migration `0009_accounting` created the canonical Accounting physical shape: `gl_accounts`, `journal_entries`, `journal_lines`, plus the approved `DEFERRABLE INITIALLY DEFERRED` constraint trigger that checks full JournalEntry balance at COMMIT.

Architecture Baseline v1.7 requires the remaining Accounting constraint layer to be additive: canonical PK/FK relationships, `UNIQUE(company_id, code)` for GL accounts, non-negative debit/credit row rules, and protection against both debit and credit being positive on the same line. Historical Accounting references use `ON DELETE RESTRICT`.

Migration `0018_finance_settlement_constraints` deliberately deferred `finance_categories.gl_account_id -> gl_accounts(id)` until the Accounting slice established the canonical GL target key.

## Decision

1. Migration `0019_accounting_constraints` establishes canonical primary keys for `gl_accounts`, `journal_entries`, and `journal_lines`.
2. `gl_accounts(company_id, code)` is unique exactly as required by Baseline v1.7.
3. `gl_accounts.company_id` references `companies(id)` with `ON DELETE RESTRICT`.
4. `gl_accounts.parent_id` references `gl_accounts(id)` with `ON DELETE RESTRICT`.
5. `journal_entries.branch_id`, `posting_batch_id`, `reversal_of_entry_id`, and `created_by` receive direct historical foreign keys with `ON DELETE RESTRICT`.
6. `journal_entries.source_type/source_id` remains intentionally polymorphic; no fake conventional FK is introduced.
7. `journal_lines.journal_entry_id`, `gl_account_id`, and optional `counterparty_id` receive direct historical foreign keys with `ON DELETE RESTRICT`.
8. `finance_categories.gl_account_id -> gl_accounts(id)` is closed in this slice with `ON DELETE RESTRICT`, completing the relationship explicitly deferred by migration `0018`.
9. `journal_lines.debit >= 0` and `journal_lines.credit >= 0` are enforced at row level.
10. A JournalLine may not have both `debit > 0` and `credit > 0` simultaneously.
11. No stronger row rule is invented: Baseline v1.7 does not state that exactly one side must be positive, so a `0 / 0` row is not prohibited by this constraint slice.
12. The existing `ct_journal_entries__balanced_at_commit` trigger remains unchanged and continues to enforce `SUM(debit) = SUM(credit)` at COMMIT with `DEFERRABLE INITIALLY DEFERRED` semantics.
13. `journal_entries.posting_batch_id` remains non-unique, as explicitly stated by the Index Catalog.
14. No CHECK is introduced for `gl_accounts.account_type` because Baseline v1.7 does not define a closed technical vocabulary for it.
15. No same-company parent-account or Branch-to-GL-account composite rule is invented because the approved Accounting constraint catalogue does not define either invariant for this slice.

## Deliberately deferred

The following are not pulled into migration `0019`:

- `gl_accounts` query indexes on `parent_id` or `(account_type, is_active)`: Phase 03.07.
- `journal_entries` indexes on Branch/posted time, source, posting batch, or reversal linkage: Phase 03.07.
- `journal_lines` indexes on journal entry, GL account, or optional counterparty: Phase 03.07.
- Business posting-rule evaluation, account mapping selection, source-document validation and Journal creation: later Finance/Accounting backend implementation.
- Reversal/correction command behavior and immutable-posting workflow enforcement: later backend transaction implementation.
- Any direct operational UI write path to Journal entries: not authorized in V1 architecture.

## Consequences

- Journal rows can no longer reference missing Company/Branch/User/PostingBatch/GLAccount/Counterparty parents where a direct canonical relationship exists.
- GL account codes cannot duplicate inside one Company.
- Posted Accounting chains are protected from destructive cascades by restrictive foreign keys.
- Finance Categories now require a real GL Account mapping.
- Invalid negative debit/credit values and double-sided positive JournalLines are rejected immediately.
- Full JournalEntry balance still evaluates at COMMIT, not row-by-row, preserving atomic multi-line posting.
- Accounting remains free of Phase 03.07 performance-index work.

## Verification contract

PostgreSQL 17 behavioral integration tests for this slice must prove:

- canonical Accounting PK/FK/UNIQUE/CHECK constraints are installed;
- duplicate GL account codes fail inside the same Company;
- direct Accounting foreign-key violations fail;
- Finance Category to GL Account integrity is enforced;
- debit and credit reject negative values;
- a line with both debit and credit positive is rejected;
- a balanced multi-line Journal commits successfully;
- an unbalanced Journal fails at COMMIT via the existing deferred constraint trigger;
- the same PostingBatch may be referenced by more than one JournalEntry;
- no fake FK exists on `journal_entries.source_type/source_id`;
- no closed `account_type` vocabulary is invented;
- independent Accounting indexes remain absent until 03.07;
- migration checksum, idempotent rerun and verify-only behavior remain valid;
- no frontend cutover, dual write, Convex Production change or merge to `main` occurs.
