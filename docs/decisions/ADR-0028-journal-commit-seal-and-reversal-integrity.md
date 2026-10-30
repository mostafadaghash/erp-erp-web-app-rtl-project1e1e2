# ADR-0028 — Durable Journal Commit Seal and Reversal Integrity

**Status:** ACCEPTED — ARCHITECTURAL DESIGN ONLY; 0035 DDL/EXECUTION NOT YET VALIDATED
**Date:** 2026-10-30
**Phase:** 09.08 — GL / Journal Engine, prospective forward-only 0035
**Authority:** Architecture Baseline v1.7, accepted ADR-0027, ADR-0021 (0009 balance and 0019 constraints), `docs/implementation/phase-09-08-0035-journal-context-immutability-reversal-design.md`.
**Scope:** narrow technical integrity addendum only. No SQL, Backend Writer or Posting Rules in this ADR step.

## 1. Problem and proof of gap

The canonical Journal has no draft/post status and its historical rows must be immutable after COMMIT. `0009` only validates entry debit/credit equality after mutations to JournalLines; it does not seal the original line set, fire for a header with no lines, or prevent later equal debit/credit additions. Individual `UPDATE` / `DELETE` guards would still permit late `INSERT` to a committed entry. A direct SQL actor with ordinary app-role permissions must not be able to alter established Accounting history by adding balanced lines.

Existing ADR-0027 authorizes SQL/Backend cross-context checks and immutability, but does **not** explicitly authorize an additional persisted seal relation. That physical-schema addition requires this narrow decision.

## 2. Accepted architectural decision (implementation remains gated)

Adopt a separate `journal_entry_seals` relation **only as integrity infrastructure**, written exactly once at COMMIT by a trusted deferred trigger; `journal_entries` and `journal_lines` remain the historical Accounting Sources of Truth. A durable canonical **full-line snapshot**, not debit/credit totals alone, is needed for exact change detection.

Accepted minimum physical design contract (subject to 0035 PostgreSQL 17 validation):

| Column | Shape | Meaning |
| --- | --- | --- |
| `entry_id` | `uuid PRIMARY KEY` / FK `journal_entries(id) ON DELETE RESTRICT` | one immutable seal per committed JournalEntry |
| `line_count` | positive integer | prevents zero-line/empty committed Journals |
| `line_snapshot` | `jsonb NOT NULL` | canonical sorted immutable line contents, exact `numeric(18,4)` decimal representation and optional Counterparty |
| `sealed_at` | `timestamptz NOT NULL` | real seal creation timestamp, not historical posted_at |

The snapshot includes every line ID and GL Account ID; canonicalize order by immutable line ID and use exact text representation for amounts. A row `0 / 0` stays permitted in accordance with ADR-0021; the proposal rejects *zero lines*, not zero-sided rows.

At deferred constraint evaluation (normally COMMIT; an early `SET CONSTRAINTS ... IMMEDIATE` must not bypass protection):
1. A deferred trigger on JournalEntry INSERT checks source/PostingBatch/GL context, complete nonempty balanced lines and inserts the immutable seal.
2. An independent deferred validator for JournalLine inserts compares against an existing seal (and rejects any late or modified content); normal same-transaction multi-line inserts remain possible before initial sealing.
3. Guard direct seal INSERT/UPDATE/DELETE using dedicated trigger/function privileges and a least-privilege application DB role. Do not treat session GUC or Backend booleans as an integrity substitute.
4. Prevent header/line UPDATE and DELETE after successful posting, protect related PostingBatch context, and verify 0035 preconditions on pre-existing history.
5. Test two-writer READ COMMITTED races, savepoints/rollbacks, late balanced appends, and direct SQL malicious variations before accepting 0035 implementation.

**No index changes to frozen GL/Journal tables.** The new seal table needs only its integrity PK backing index. No performance index on amounts, dates or other independent columns is authorized.

## 3. Reversal coherency and content

The 0035 design also uses DB-enforced exact reversal pairing: source/Branch/original PostingBatch match, new server-generated posting timestamp, original Journal unchanged, and reversal Line multiset equals exact flipped original debit/credit values (same GL Account and Counterparty). Lock original Journal and reject double reversals under concurrent transactions without adding unique `posting_batch_id` or a speculative reversal search index. Multiple JournalEntries per PostingBatch remain allowed.

Full business aggregate reversal completeness, idempotent command ownership and Posting Rules are future Backend concerns, not this SQL integrity proposal.

## 4. Alternatives considered

| Option | Result | Reason |
| --- | --- | --- |
| Only UPDATE/DELETE triggers | Rejected | Does not prevent append of later balanced lines |
| Session `posted` flag or writable GUC | Rejected | Client/SQL actor could spoof it |
| Compare only debit/credit totals | Rejected | Preserves totals while enabling changes in GL attribution |
| Compare current `xmin` to current transaction ID | Not selected | Freeze/wraparound and DB operational semantics make this a risky permanent integrity basis without stringent proof |
| Add mutable state columns directly to canonical Journal tables | Rejected for this slice | Unnecessary expansion of the frozen entity shape and update paths |
| Immutable commit seal in dedicated relation | **ACCEPTED (DESIGN)** | Separate audit proof, exact contents, clear fail-closed COMMIT and concurrency tests |

## 5. Implementation prerequisites and boundaries

The architecture is accepted for the next independent 0035 integrity slice. Before declaring 0035 complete, implementation and tests must confirm:
- durable seal structure/privileges and its non-Source-of-Truth status;
- allowed 0/0 line versus disallowed *empty* entry;
- exact same-source reversal content and duplicate-reverse prevention;
- preserving `0009`, `0019`, `0034` migration checksums and `28` Index Catalog;
- mandatory PG 17 race tests for seal-at-commit and immutable old entries;
- fail-closed preconditions on unknown pre-existing Journal history, not silent ledger rewriting.

**Next Action:** independent, forward-only 0035 Journal integrity SQL + migration metadata + PostgreSQL 17 security/concurrency/rollback test slice ONLY. This approval does not implement 0035, authorize a populated production migration, start the Journal Writer or 09.09 Posting Rules, close 09.08, or merge to `main`.

## 6. Acceptance record and non-negotiable implementation safety

**Decision date:** 2026-10-30. **Scope:** explicit architectural resolution of the 09.08 ADR-0028 decision, not executable approval or test certification. The requested decision accepts a separate, durable, immutable seal as *integrity evidence*; `journal_entries` and `journal_lines` remain the Accounting Sources of Truth. Acceptance remains subordinate to Architecture Baseline v1.7 and ADR-0021/0027.

The 0035 implementation must:

1. Deny ordinary application-role direct `INSERT/UPDATE/DELETE` on `journal_entry_seals`, protect its trigger/functions with an appropriate separate owner, restrictive `SECURITY DEFINER` and fixed safe `search_path` where needed, and never assume an app role owns tables or can disable triggers. Do not use writable GUCs or client claims as posting authority.
2. Fail closed if a historical/previously committed Journal header has no valid seal. A new header and its same-transaction lines may assemble before sealing, but no later transaction may append balanced lines or change IDs, GL attribution, counterparty or amounts. `SET CONSTRAINTS ALL IMMEDIATE` and savepoint behavior must be tested, not assumed to be a true COMMIT-only callback.
3. Lock/recheck the target Journal header and exact canonical line snapshot under `READ COMMITTED` at the final deferred validation point; test two independent writers, seal-creation versus late-line races, concurrent posting/reversals, failed COMMIT and rollback. A defensible implementation must prevent stale-snapshot read and write-skew bypass.
4. Validate exact reversed **multisets**, including repeated identical lines and permitted `0/0` lines, with debit and credit swapped, preserving GL Account and optional counterparty. Prevent double reversal using original-entry locking and a fresh committed-state check; preserve the non-unique PostingBatch→Journal relationship.
5. Reject pre-existing inconsistent Journal history before migration, require verified preflight and backup on actual populated environments, and never silently backfill or rewrite authoritative accounting history.
6. Preserve the checksums and trigger behavior of `0009`, `0019`, and `0034`, the frozen existing-table Index Catalog, `numeric(18,4)` semantics, server `posted_at`, and one atomic business transaction. Only the new seal relation's primary-key backing index is approved.

**Evidence boundary:** Full CI #1300 / run `41100003857` passed all four jobs on input documentation SHA `cbc23066ad60d80b09b3b9abfb311d5a8ec5016b`. This acceptance-record commit requires its own same-SHA Full CI. No 0035 DDL or executable protection was tested by #1300.
