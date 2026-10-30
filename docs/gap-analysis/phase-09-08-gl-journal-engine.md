# Phase 09.08 — GL / Journal Engine Gap Analysis

**Status:** `GAP_ANALYSIS_COMPLETE / BLOCKED_PENDING_ADR`  
**Authoritative source:** Business Tech ERP Architecture Baseline v1.7.  
**Analysis baseline SHA:** `bf89b8fa3b76ae3231549e2f97d2590cc2d17f6f`.  
**Scope of this step:** analysis/documentation only. No 09.08 Journal DDL, Backend Journal/GL implementation, frontend cutover, Convex Production change, or `main` merge is introduced.

## 1. Authoritative V1 accounting behavior

Architecture Baseline v1.7 fixes the following accounting model:

- `JournalEntry + JournalLines` are the Accounting Source of Truth.
- Business documents and financial/inventory operations generate Journal Entries through Backend Posting Rules; ordinary V1 operation has no direct JournalEntry creation screen.
- Users do not choose debit/credit or counterpart GL accounts during ordinary sales/purchasing/finance workflows.
- VAT, Inventory, COGS, Receivable/Payable, Treasury, Expenses and Income must balance inside the same atomic posting transaction as the source document.
- `journal_lines.debit` and `journal_lines.credit` are non-negative and both may not be positive on the same row.
- Whole-entry balance is enforced at COMMIT with a `DEFERRABLE INITIALLY DEFERRED` constraint trigger, with additional Backend validation.
- Approved Journal Lines are historically immutable; corrections/reversals append new accounting effects linked to the original posting rather than UPDATE/DELETE old history.
- `reversal_of_entry_id` links a compensating entry to the historical original.
- `posting_batch_id` links the Journal effect to the coordinated business posting and is explicitly not unique.
- Chart of Accounts is Company-scoped through `gl_accounts.company_id`; `UNIQUE(company_id, code)` is canonical.
- The architecture requires suitable System Account/Mapping behavior, but does not define a dedicated mapping relation or a closed technical mapping-key catalogue.
- The frozen Index Catalog for GL/Journal remains authoritative; 09.08 must not add speculative indexes.

## 2. Current physical Accounting foundation

Phase 03 already created the canonical physical Accounting relations:

- `gl_accounts(id, company_id, code, name, account_type, parent_id, is_system, is_active)`
- `journal_entries(id, branch_id, source_type, source_id, posting_batch_id, reversal_of_entry_id, posted_at, created_by, description)`
- `journal_lines(id, journal_entry_id, gl_account_id, debit, credit, counterparty_id)`

Existing migration/constraint coverage already provides:

- exact `numeric(18,4)` debit/credit persistence;
- `UNIQUE(company_id, code)`;
- canonical PK/FK relationships;
- non-negative debit/credit checks;
- not-both-positive row check;
- `DEFERRABLE INITIALLY DEFERRED` full-entry balance trigger;
- `finance_categories.gl_account_id -> gl_accounts(id)`;
- approved §28 indexes only.

The PostgreSQL 17 Accounting schema/constraint tests already prove balanced commit success, intentional unbalanced COMMIT failure, exact numeric behavior, canonical FKs/checks and migration/idempotency verification.

Therefore 09.08 must build on the existing schema rather than recreate it.

## 3. Current Backend state

There is currently no Central Backend GL/Journal writer or Chart-of-Accounts service under `server/`.

Finance services through 09.07 create Treasury/FinancialMovement/Allocation/Advance/Cheque/Installment effects but intentionally do not create Journal Entries yet. This is correct sequencing: 09.08 supplies the generic Accounting engine and 09.09 supplies business-specific Posting Rules.

Reusable infrastructure already exists for:

- transaction-bound work under `READ COMMITTED`;
- Idempotency;
- Posting Batch;
- effective Permission + Branch Scope checks;
- Audit;
- Transactional Outbox;
- stable API error mapping.

09.08 must reuse these primitives and must not create a parallel transaction/idempotency/audit stack.

## 4. Current-state classification

| Requirement | Current implementation | Classification |
| --- | --- | --- |
| canonical GL/Journal tables | exist | Existing / compliant |
| exact money type | `numeric(18,4)` | Existing / compliant |
| GL code uniqueness per Company | DB constraint exists | Existing / compliant |
| approved GL/Journal indexes | frozen catalog implemented | Existing / compliant |
| row debit/credit integrity | DB checks exist | Existing / compliant |
| whole-entry balance at COMMIT | deferred constraint trigger exists | Existing / compliant |
| Backend pre-COMMIT balance validation | absent | Missing / create |
| internal Journal writer | absent | Missing / create |
| Chart-of-Accounts service | absent | Missing / create |
| System Account Mapping registry/resolver | no canonical V1 storage/key contract exists | Blocking architecture gap |
| Company/Branch/GL context validation in writer | no Backend writer exists; DB direct FKs do not prove all cross-context coherence | Missing / ADR clarification required |
| PostingBatch/Journal branch-source coherence | no Backend writer exists | Missing / create |
| active GL account validation | absent | Missing / create |
| Journal reversal primitive | absent | Missing / create |
| immutable approved JournalLine history | Baseline requires it; no dedicated 09.08 mutation guard/writer exists | Missing / create |
| direct operational Journal creation | legacy Convex has manual Journal behavior | Existing legacy behavior / do not port to V1 |
| business-specific debit/credit mappings | not implemented | Correctly deferred to 09.09 |
| Sales/Purchasing/Inventory posting integration | not implemented | Later phases + 09.09 |
| frontend/Convex cutover | not started | Later Phase 14 |

## 5. Blocking architecture gap — System Account Mapping contract

The Baseline states that the Company Chart of Accounts includes suitable System Account/Mapping behavior, and Master Plan 09.08 explicitly requires `system account mappings`.

However, the canonical V1 physical schema contains:

- `gl_accounts.is_system` boolean;
- no `system_key` column;
- no dedicated `system_account_mappings` table;
- no frozen technical key vocabulary for Accounts Receivable, Accounts Payable, Treasury/Cash, VAT, Inventory, COGS, Customer Advances, cheque control accounts, return variance, etc.

The legacy Convex GL contains its own historical `systemKey` catalogue and posting behavior. That code is implementation history, not Architecture Source of Truth, and its keys must not be copied silently into PostgreSQL V1.

A versioned Architecture Decision is required before 09.08 implementation to freeze:

1. where Company-level System Account mappings are stored;
2. the stable resolver contract used by later 09.09 Posting Rules;
3. whether mapping storage is configuration in existing `company_settings.settings_json` or requires a versioned physical-schema change;
4. how missing/inactive/mismatched mappings fail closed;
5. what minimal technical mapping-key contract belongs to 09.08 versus the business event-to-account mapping owned by 09.09.

No mapping table/column/key list is authorized by this Gap Analysis.

## 6. Context-integrity gap that must be resolved with the same ADR

Existing ADR-0021 intentionally did not invent same-Company parent-account or Branch-to-GL composite DB rules because the Phase 03 constraint catalogue did not define them.

For an executable Journal writer, the runtime contract still must avoid cross-context accounting such as:

- a Journal Entry for Branch A using a PostingBatch belonging to Branch B;
- a Journal line for a Branch whose Company differs from the GL Account Company;
- a child GL Account pointing to a parent in a different Company;
- a reversal linked to an unrelated cross-context Journal Entry.

The architecture strongly models Company-scoped GL accounts and Branch-scoped Journal Entries, but the exact enforcement boundary was deliberately not frozen in Phase 03.

The 09.08 ADR must therefore state the Backend coherence rules and explicitly say whether any additional database protection is required. This analysis does not add a composite FK, trigger or speculative constraint.

## 7. Journal immutability and reversal requirements

The Baseline explicitly makes approved Journal Lines historical immutable data.

09.08 implementation must therefore provide a safe append-only path:

- ordinary Journal creation is generated internally from approved posting input;
- no direct UPDATE/DELETE correction path for posted Journal Lines;
- reversal creates a new balanced compensating entry;
- the original Journal remains unchanged;
- the reversal entry links through `reversal_of_entry_id`;
- the reversal PostingBatch links through `reverses_posting_batch_id`;
- `posted_at` reflects the real effect order and backdating never rewrites historical accounting;
- failure at any point rolls the complete posting/reversal transaction back.

The physical mechanism for enforcing historical immutability may be implemented only after this Gap Analysis and the required ADR; no Journal DDL is introduced here.

## 8. 09.08 boundary versus 09.09

### 09.08 owns

- Chart-of-Accounts management contract required by V1;
- System Account Mapping infrastructure/resolution contract;
- internal transaction-bound Journal writer;
- Backend balanced-entry validation in addition to the DB deferred trigger;
- active/context-valid account validation;
- PostingBatch/source/Branch coherence;
- historical reversal primitive;
- immutable Journal history enforcement;
- stable internal/accounting error contract;
- PostgreSQL 17 integration coverage for the generic engine.

### 09.08 does not own

- Sales Invoice debit/credit recipe;
- Sales Return recipe;
- Purchase Invoice/Return/VAT/Cost Variance recipe;
- Receipt/Disbursement recipe;
- Treasury Transfer recipe;
- Customer Advance recipe;
- Cheque lifecycle recipe;
- Installment settlement recipe;
- Inventory Adjustment recipe;
- Stock Transfer reclassification recipe.

Those business event mappings belong to 09.09 Posting Rules Catalog.

## 9. Legacy General Ledger assessment

The repository still contains a substantial Convex General Ledger implementation and UI. It is useful only as historical implementation evidence.

Potentially reusable concepts after independent v1.7 validation:

- generated balanced journals;
- reversal by compensating lines;
- branch-scoped journal queries;
- the concept of stable System Account resolution;
- historical links from business operations to journals.

Legacy behavior that must not be copied automatically into V1:

- direct/manual Journal posting UI;
- legacy accounting-period/cutover workflow;
- mutable aggregate GL balance tables as authoritative accounting state;
- legacy JRN numbering;
- JavaScript floating-point/two-decimal cent arithmetic;
- the exact legacy `systemKey` list;
- legacy opening-entry behavior before Phase 15 opening-state/migration work;
- any legacy rule that conflicts with v1.7 posting semantics.

The target remains `React Frontend -> Central Backend API -> PostgreSQL`, with Journal generation owned by the Backend.

## 10. Required implementation after the blocking ADR

After the architecture decision is accepted, 09.08 may implement only the generic GL/Journal engine slice:

1. transaction-bound Chart-of-Accounts/mapping resolver according to the ADR;
2. Backend Journal request validation using exact decimal strings/values, never JS floating point for accounting amounts;
3. Branch/Company/PostingBatch/source context validation;
4. active account validation;
5. balanced debit/credit validation before persistence;
6. JournalEntry + JournalLine append in the caller's existing transaction;
7. reversal primitive that writes compensating lines and never edits the original;
8. approved historical immutability protection;
9. Audit/Outbox only at the correct aggregate/command boundary without duplicate business events;
10. no 09.09 business-specific Posting Rule catalogue;
11. no direct Journal operational UI;
12. no new speculative index;
13. no frontend/Convex cutover.

## 11. Required PostgreSQL 17 validation for 09.08

At implementation time, the final 09.08 SHA should prove at minimum:

- Chart-of-Accounts code uniqueness remains Company-scoped;
- mapping resolver accepts only the ADR-approved mapping contract;
- missing/inactive mapping fails closed;
- inactive/missing GL account fails closed;
- cross-context Branch/Company/PostingBatch/account usage is rejected according to the ADR;
- balanced multi-line Journal commits;
- Backend rejects unbalanced Journal before persistence;
- direct SQL unbalanced final state still fails at COMMIT through the existing deferred trigger;
- no floating-point accounting persistence;
- generated Journal uses the caller's PostingBatch/source context;
- reversal creates exact opposite debit/credit lines;
- reversal leaves original header/lines unchanged;
- approved Journal history cannot be corrected via UPDATE/DELETE;
- forced mid-transaction failure rolls back Journal/lines and associated transaction effects;
- no direct operational/manual Journal API is exposed;
- frozen §28 Accounting indexes remain exact;
- migration verify-only remains clean;
- all historical PostgreSQL schema/constraint/index/Finance/Inventory regressions remain green;
- Full CI succeeds on the final implementation SHA.

## 12. Pre-existing housekeeping findings recorded during the 09.08 review

These findings pre-date 09.08 and are recorded here so they are not lost. They are not authorization to change Journal DDL/Backend behavior in this analysis step.

### H1 — Project Knowledge Master Plan is stale

The Project/Library copy available to ChatGPT still carries an older Execution Pointer around Phase 03, while the repository Master Plan at the analysis baseline is at Phase 09.08. Repository state is the current implementation record; stale Project Knowledge creates a high risk of future context regression and should be refreshed separately.

### H2 — Phase 05 parent status is stale

The current repository Master Plan still labels PHASE 05 as `IN_PROGRESS` even though 05.01 through 05.05 are CLOSED, Gate 05 is explicitly CLOSED, and no Gate 05 checkbox remains open. This is documentation drift only; it is not evidence that the implementation must be reopened.

### H3 — Gate 09 contains stale unchecked evidence

At least these Gate 09 items are already directly covered by green pre-09.08 PostgreSQL integration tests but remain unchecked in the Master Plan:

- FinancialMovement total reconciliation to Treasury position;
- Treasury Transfer second-leg failure rolls back both sides;
- Customer Advance concurrent double-consumption protection.

They should be reconciled as a separate documentation cleanup, without falsely closing the still-unimplemented Journal/Posting Rule items.

### H4 — Four existing server test files are not wired into current CI

Repository review found 103 `server/tests` test files, with four existing files not referenced by the current package scripts or CI workflow:

- `server/tests/customer-advance-service.test.ts`
- `server/tests/cheque-service.test.ts`
- `server/tests/installment-service.test.ts`
- `server/tests/postgresql-finance-settlement-constraints.integration.test.mjs`

The stronger 09.05-09.07 PostgreSQL integration gates are wired and green, but CI cannot be described as literally executing every existing server test file until this wiring drift is corrected.

## 13. Exit from this analysis step

The 09.08 Gap Analysis is complete.

09.08 is **not ready for Journal DDL or Backend implementation** because the System Account Mapping contract and related Company/Branch/GL context enforcement boundary are not frozen by the authoritative source material.

No legacy Convex accounting rule has been promoted silently into PostgreSQL V1.

**Next Action:** create one bounded `ADR-0027` for the 09.08 GL / Journal Engine contract, resolving System Account Mapping storage/key semantics and the Backend/DB context-coherence boundary only. Do not implement Journal DDL, Journal Backend code, 09.09 Posting Rules, frontend cutover, or Convex Production changes in that ADR step.
