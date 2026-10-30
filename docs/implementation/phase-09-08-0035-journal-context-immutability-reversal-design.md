# Phase 09.08 / Proposed 0035 — Journal Context, Immutability and Reversal Integrity Design

**Status:** REVIEW / DESIGN COMPLETE; ADR-0028 PROPOSED, NOT ACCEPTED; NO 0035 MIGRATION AUTHORIZED
**Reviewed:** 2026-10-30
**Review baseline:** `b0c40405e1b1e4f373462c7fcc7557a3723ba233
**Authority:** Architecture Baseline v1.7 ``6.5, 24.16–24.17, 25.14, 25.20, 26.4–26.7, 27.16, 27.19, 28.6; accepted `docs/decisions/ADR-0027-system-account-mapping-gl-context.md`; `docs/gap-analysis/phase-09-08-gl-journal-engine.md`; `docs/decisions/ADR-0021-phase03-accounting-constraints.md`.
**Implementation boundary:** documentation/review only. Do not create `0035` SQL/meta, Journal Writer, Posting Rules or frontend/API changes in this slice.

## 1. Verified existing implementation, versus missing guards

| Invariant | Actual persisted state through `0034` | Assessment |
| --- | --- | --- |
| `gl_accounts` company ownership, stable hierarchy | `0019` FKs; `0034` company identity / parent / active mapped-leaf triggers | Existing and compliant for mapping scope |
| `journal_entries` branch, batch, author and source | Individual FKs, but no equality to the batch's Branch/source/author/time | Missing SQL-context guard |
| `journal_lines` Company/GL context | Individual FK to GL, no Branch→Company alignment or active leaf check on Journal posting | Missing SQL-context guard |
| Journal debit/credit | `0019` >=0 and not both >0 per row | Existing / compliant; keep 0/0 row legal under ADR-0021 |
| Journal entry totals | `0009` deferred COMMIT constraint trigger on mutations to `journal_lines` | Existing but **not complete posting immutability** |
| Empty JournalEntry | `0009` balance trigger does not fire on a header-only insert | Missing completeness guard |
| JournalEntry/Line update, delete, late line insertion | No posted-history write barriers; balanced edits can commit | Missing immutability enforcement |
| PostingBatch update/delete | `posting-batch-service.ts` only writes INSERT; no explicit dedicated journal-dependent immutable guard | Missing protection against post-Journal mutation |
| Reversal linkage | `reversal_of_entry_id` FK and posting batch reference FK; current service validates batch Branch/source | Missing correlation and content guard |
| Matching compensating lines | No DB compare of original line multiset to reversal line multiset | Missing deferred reversal-value guard |
| Accounting `09.09` business recipes | Not implemented | Correctly outside this design |

**Important:** The existing `0009` deferred trigger does **not** mean all Journal history is immutable. It permits an empty balanced total, it is only fired by JournalLine mutations, and does not prevent an update that leaves the entry balanced. Keep this trigger and its constraint name unchanged; add **complementary** guards later, not a rewrite of `0009`.

## 2. Recommended bounded forward-only 0035 boundary

**Proposed name:** `database/migrations/0035_journal_context_immutability_reversal_integrity.sql` and matching `.meta.json`. This name is a *design target only*, not a created migration.

0035 should eventually add **only** integrity triggers/functions and a durable commit-time journal seal (see ADR-0028). It should not change `journal_entries` or `journal_lines` business columns, invent Posting Rules, create standalone query indexes, or make `journal_entries.posting_batch_id` unique.

No old migrations (`0009`, `0019`, `0022`, `0034`) are to be edited. `READ COMMITTED + explicit row locks + deterministic order` remains in force. No global SERIALIZABLE mode.

### 2.1 JournalEntry-to-PostingBatch coherence

For each inserted JournalEntry, lock and verify the referenced PostingBatch, not merely its FK:

- `journal_entries.branch_id = posting_batches.branch_id`;
- `journal_entries.source_type = posting_batches.source_type`;
- `journal_entries.source_id = posting_batches.source_id`;
- `journal_entries.created_by = posting_batches.created_by`;
- `journal_entries.posted_at = posting_batches.posted_at` **exactly**, reusing PostgreSQL's single actual posting timestamp, not a second `now()` call;
- referenced Branch exists, belongs to expected Company, and is active at **new posting time**; Effective Permission and Branch Scope remain Backend duties;
- prevent later UPDATE/DELETE of any PostingBatch with historical Journal dependencies (prefer protecting all committed batches from mutation if regression review proves compatible). A later change to Batch Branch/source/author/time must never invalidate its Journal.

**No fictitious FK** to the polymorphic `source_type + source_id`. Its actual business document is resolved by the owning Backend source adapter when Journal Writer is implemented.

### 2.2 JournalLine-to-Company and account checks

On new JournalLine, lock JournalEntry and referenced GL Account with row locks that prevent concurrent Company/hierarchy/active mutations; resolve Company from `journal_entries.branch_id -> branches.company_id`. Reject when:

- GL Account Company differs from Journal Branch Company;
- GL Account is inactive or is a parent/summary at posting time;
- JournalEntry is absent/invalid, or is already durably sealed as a committed posting.

The `0034` hierarchy guard already rejects adding children underneath a historically posted account; it does **not** replace the Line insert validation. `finance_categories.gl_account_id` remains its own separate mapping. Do not invent GL account type enums or a cross-Company rule for optional `counterparty_id` without a separately established baseline contract.

### 2.3 Historical immutability: header, lines and **late inserts**

Business-generated JournalEntry and its lines are **append-only once committed**. There is no draft/edit workflow for these tables in V1. In addition to blocking `UPDATE` and `DELETE` on committed header/lines, **late INSERT of extra lines against a previously committed JournalEntry must also be rejected**.

A trigger that merely blocks UPDATE/DELETE is insufficient, because a later transaction could append two offsetting lines and leave `SUM(debit)=SUM(credit)` intact. Likewise, a client-supplied `posted` flag or an unprotected session `GUC` is not a durable database barrier.

**Preferred proposal (requires ADR-0028 acceptance):** append one immutable `journal_entry_seals` record per JournalEntry at COMMIT, based on the exact final ordered contents of all its lines. Future mutations/inserts must fail even when totals remain balanced.

Possible *proposed* seal schema (not yet accepted as physical Baseline):
- `entry_id uuid PRIMARY KEY REFERENCES journal_entries(id) ON DELETE RESTRICT`;
- `line_count integer NOT NULL`;
- `line_snapshot jsonb NOT NULL`, a canonical ordered array containing each line's immutable ID, account ID, debit and credit exact numeric(18,4) textual representations and optional counterparty;
- `sealed_at timestamptz NOT NULL`.
- Only trusted deferred constraint trigger/function may insert the seal; application DB role must not directly INSERT/UPDATE/DELETE the seal. Retain Journal Lines themselves as the sole historical Accounting Source of Truth. The snapshot is a read-only integrity proof, not a replacement ledger or balance projection.

A **DEFERRABLE INITIALLY DEFERRED** commit-time trigger on the Journal header creates and verifies its seal after all same-transaction line inserts. Additional deferred checks on late line insertion must compare the complete canonical final set against the existing seal at COMMIT, so a racing writer cannot exploit a stale row-level snapshot. Lock the Journal header before checking for an existing seal; verify same-header concurrent writers and isolation behavior on PostgreSQL 17.

Seal creation must reject a header with **zero lines**. ADR-0021 explicitly left 0/0 *individual lines* legal; do not silently ban them or introduce a new exactly-one-positive-row rule. The generic Journal Writer may separately require meaningful total > 0 if later justified by the approved 09.08 command contract, but this review does not alter its ledger schema semantics.

**Design risk requiring proof before DDL:** Make sure the deferred seal trigger cannot be bypassed by inserting a line after an earlier transaction's seal becomes visible, even under concurrent transactions and READ COMMITTED. Verify independent transactions, lock waits, savepoints, duplicate work, direct SQL, failed COMMIT and rollback. Do not rely solely on PostgreSQL `xmin`/transaction-ID comparison (wraparound/freeze), a writable GUC, a mutable application flag, or a two-number total snapshot. A canonical full-line snapshot plus robust deferred validation is the preferred integrity mechanism because balanced late edits can change accounting meaning.

### 2.4 Reversal linkage and exact compensation

An ordinary `POST` or standalone `CORRECTION` JournalEntry has `reversal_of_entry_id IS NULL`. A JournalEntry recorded under `REVERSAL` or `DELETE_REVERSAL` PostingBatch must name the original historical entry.

Require:

1. The reversal's new PostingBatch links to the original's PostingBatch via `reverses_posting_batch_id`.
2. Both entries have the same Branch, source_type and source_id as one another and as their matching PostingBatches.
3. The reversing entry has its **own real new** `posted_at` inherited from its reversing Batch, never the original timestamp. It may not point at itself or a different source/history chain.
4. The reversal's lines are the **exact debit/credit swap** of the original lines, preserving GL Account and optional Counterparty. Compare canonical **multisets** (not just totals) and duplicate occurrences at COMMIT; independent line IDs are new.
5. The original header and lines remain unchanged. No UPDATE/DELETE original, no backdated rewrite. `reversal_of_entry_id` traces the historical original.
6. Multiple JournalEntries may share the same PostingBatch; a reversal batch may contain multiple reversing JournalEntries. Do **not** introduce `UNIQUE(posting_batch_id)` or pretend there is a one-to-one batch-to-entry relationship.
7. One original entry must not receive duplicate successful reversals. Lock the original JournalEntry and check already-committed reversal references under the same outer transaction; test two-writer race. This must be done without adding an unapproved standalone index to the frozen `28` catalogue.
8. `POSTING_OPERATION_TYPES` in current Backend includes `POST`, `CORRECTION`, `REVERSAL` and `DELETE_REVERSAL`. Preserve these semantics; do not invent business-specific correction recipes.
9. If a business source has several posted JournalEntries or dependent financial/inventory effects, the business command must reverse the relevant complete set atomically. Generic 0035 SQL can verify each referenced pair, **not** infer whether the whole external business chain was reversed; that belongs to future Journal Writer and posting owner.

**Compensation must not be checked only by `SUM(debit) = SUM(credit)`:** two individually balanced, but unrelated Journals are not a valid reversal of one another.

### 2.5 Lock order, retry and error safety

- Caller already owns one `PoolClient` and a `READ COMMITTED` business transaction. No separate Journal transaction.
- Follow the immutable Baseline business lock order (Business Document → Dependents → Inventory Positions → Batch/Serials → Financial Positions → Sequence).
- For Journal reversal metadata, use deterministic source/original PostingBatch → original Journal header → new PostingBatch/entry → GL Account IDs in sorted order. Review this order against the existing `PostingBatchService.lockAndValidateReference` (which locks original batch `FOR UPDATE`) so SQL triggers do not create an inverse edge.
- Reference-row reads must use locking strong enough to prevent non-key edits (e.g. `FOR SHARE`), not `FOR KEY SHARE` alone for mutable fields. Avoid blanket exclusive Company locks and global SERIALIZABLE isolation.
- Avoid unnecessary cross-entry locks in the sealing mechanism. Test high-concurrency distinct entries, two reversers of one original, direct SQL cross-Company attempts, batch edit versus Journal insertion, GL deactivation versus Line insertion, and seal-race late Line inserts.
- A validation error is fail-closed with a stable safe code; retry automatically only for proven deadlock/serialization conflicts (bounded retries with same Idempotency Key), not for business validation failures.

## 3. Future 0035 migration precondition/verification contract

Future additive `0035` is `transactional: true` and must be preceded by a read-only preflight on every actual populated target, a checked backup and known restore point.

**Precondition fails** on:
- anything other than verified applied-migrations-through-`0034` checksum/history;
- Journal headers whose Branch/source/author/posted_at differ from their PostingBatches;
- JournalLines whose GL Account Company differs from their Journal Branch Company;
- any invalid reversal posting batch/source/branch chain;
- any empty Journal header, unbalanced existing entry, duplicate already-reversed original, or inconsistent reversal line content;
- absence of required canonical FK/row checks and the original `0009` deferred balance trigger;
- any incompatible existing seal relation or trigger definitions that would be overwritten;
- existing historical Journal rows that cannot be safely sealed without a separately approved reconciliation/backfill approach. The V1 PostgreSQL Journal Writer does not yet exist, so **never** assume or silently invent this historical-data backfill.

**Verification SQL** must check:
- all added functions/triggers and required `DEFERRABLE INITIALLY DEFERRED` attributes;
- the original `ct_journal_entries__balanced_at_commit` remains unchanged;
- absence of extra independent indexes on frozen GL/Journal tables, and only seal PK backing index if accepted;
- safe permissions and immutable contents of seal storage;
- a positive balanced new Journal and exact positive Reversal; negative cross-Branch, cross-Company, mismatched Batch timestamps, late-line insert and concurrent double-Reversal fixtures;
- migration rerun/verify-only checksums on the *same* SHA.

A failed COMMIT or failed DDL transaction must leave no partial Journal/Batch/seal or migration history. Post-COMMIT schema corrections require another forward-only migration, never rewriting applied `0035`.

## 4. Regression and design review boundaries

The current `postgresql-accounting-constraints.integration.test.mjs` intentionally tests the **older 0009/0019 contract**, including header inserts with non-matching source fields, direct SQL with separate sessions/transactions and permitted 0/0 lines. Once `0035` is implemented, those fixtures need a **documented, specific adaptation**: test legacy `0009` behavior using a deliberately limited versioned fixture, and separately test the stronger 0035 guards on the latest schema. Do not simply delete old negative tests or loosen the constraints to make tests green.

The `0034` migration preflight and test expectations must be revisioned **without changing applied migrations**; future latest-version tests/cleanup must account for seal relation dependencies. Keep exact Index Catalog, TypeScript, Backend, PG 17 integration/concurrency, security and production-build gates on one final SHA.

## 5. Risk/decision register

| Choice | Decision for this review | Why |
| --- | --- | --- |
| DB + Backend context checks | Fixed by accepted ADR-0027 | SQL must reject direct cross-context commits |
| Legacy `0009` balance trigger | Preserve exactly | Already canonical and necessary |
| Header/Line UPDATE+DELETE guards | Design accepted within ADR-0027 scope | Do not rewrite historical facts |
| Late balanced Line INSERT guard | **Mandatory**, storage mechanism proposed via ADR-0028 | Otherwise history is mutable while totals stay equal |
| Durable commit-time `journal_entry_seals` | **Proposed; needs ADR-0028 acceptance** | Reliable exact snapshot without unsafe transaction-ID assumptions |
| Reversal exact multiset and one successful reverse per entry | Proposed within 0035 integrity contract, subject to 0035 tests | Prevent valid-looking, but incorrect compensations |
| `0035` implementation | **NOT STARTED / NOT AUTHORIZED** | Requires seal architecture acceptance and concurrency proofs |
| `09.09` Posting Rules | OUT OF SCOPE | No sales/purchase/Finance debit-credit recipe here |

## 6. Design exit and single next action

- [x] Reviewed Architecture Baseline, ADR-0027/0021, `0009`/`0019`/`0034` and existing PostingBatch/Accounting tests.
- [x] Distinguished existing COMMIT balance from missing immutability and context enforcement.
- [x] Proposed exact 0035 SQL guard, precondition, concurrency and negative-test contracts.
- [x] Identified durable seal relation as a *new* physical schema proposal requiring a focused architecture decision.
- [ ] ADR-0028 explicitly accepted or revised.
- [ ] No 0035 DDL, Journal Writer, Posting Rules, data or production changes performed.

**Next Action (one only):** review/accept or revise `docs/decisions/ADR-0028-journal-commit-seal-and-reversal-integrity.md`. Once accepted, a separately gated step may implement **0035 integrity DDL only**. 09.08 itself remains IN_PROGRESS; Journal Writer and 09.09 remain blocked until their own steps.
