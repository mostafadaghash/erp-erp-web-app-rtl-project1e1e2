# ADR-0027 — System Account Mapping and GL Context-Coherence Contract

**Status:** ACCEPTED — architecture-owner-delegated decision; implementation remains a separate gated step  
**Date:** 2026-10-30  
**Phase:** 09.08 — GL / Journal Engine  
**Branch:** `agent/postgres-v1.7-core`  
**Decision baseline SHA:** `89f23e78e18c2c9c6c1f81763ca26ee59320a224`  
**Authority:** `Business-Tech-ERP-Architecture-Baseline-v1.7-Final.docx` §§24.16, 25.14, 26.7, 27, 28.6, 30; `docs/decisions/ADR-0013-phase03h-accounting-schema-shape.md`; `docs/decisions/ADR-0021-phase03-accounting-constraints.md`; `docs/gap-analysis/phase-09-08-gl-journal-engine.md`.

> **Decision authority:** The project owner explicitly delegated the difficult architectural choice to the assistant on 2026-10-30, prioritizing accounting integrity over convenience. This ADR is the accepted, bounded v1.7 architectural addendum for 09.08. Acceptance authorizes only **later gated implementation**, not SQL/Backend changes in this decision step. The Master Plan must carry the acceptance and pass Full CI on its final SHA.

## 1. Decision problem and already-frozen invariants

The canonical Accounting schema has exactly `gl_accounts`, `journal_entries`, and `journal_lines` (Phase 03.H). The Baseline requires a hidden **System Account/Mapping** capability, while leaving its storage and technical key contract unspecified. `gl_accounts.is_system` identifies a kind of account but **does not identify the posting role** or the Treasury to which it belongs.

The existing physical FKs are also insufficient by themselves to prove:

- `journal_entries.branch_id = posting_batches.branch_id`;
- `journal_lines.gl_account_id` belongs to the Company of the Journal's Branch;
- `gl_accounts.parent_id` belongs to the same Company as its child;
- reversal Journal and reversal PostingBatch reference the same historical source, Branch and original posting.

These are **coherence requirements of the later executable writer**, not grounds to rewrite the closed Phase 03 schema history.

Frozen requirements that this ADR must preserve:

- one Central Backend + one Central PostgreSQL per customer in V1;
- generated journals only for ordinary V1 workflows, not direct user-created journals;
- `numeric(18,4)` values and complete balanced Journal at COMMIT;
- `JournalEntry + JournalLines` are historical Accounting Sources of Truth;
- immutable posted history, compensating reversal, server-generated `posted_at`;
- one atomic business transaction including source and accounting effects;
- `READ COMMITTED`, explicit row locks, deterministic lock order, Idempotency;
- `posting_batch_id` remains **non-unique**, and source IDs remain polymorphic;
- the frozen §28.6 Accounting query/performance indexes remain unchanged;
- 09.09 owns the **business-event-to-debit/credit recipe**, not 09.08.

## 2. Decision A — storage of System Account Mappings (ACCEPTED)

**Adopt a dedicated, normalized configuration relation `system_account_mappings`**, introduced only by an additive, forward-only **09.08 migration in the subsequent implementation step**. This relation is configuration/reference data, **not an Accounting Ledger, Journal or balance Source of Truth**.

Accepted minimum physical contract:

| Field | Type | Meaning |
| --- | --- | --- |
| `company_id` | `uuid NOT NULL` | owning Company |
| `scope_type` | `text NOT NULL` | exactly `COMPANY` or `TREASURY` in V1 |
| `scope_id` | `uuid NOT NULL` | Company ID for COMPANY scope; Treasury ID for TREASURY scope |
| `role_key` | `text NOT NULL` | stable internal accounting **role**, not a GL code or document event |
| `gl_account_id` | `uuid NOT NULL` | target Chart-of-Accounts account |
| `updated_by` | `uuid NOT NULL` | authorized actor |
| `updated_at` | `timestamptz NOT NULL` | last change |

**Primary key**: `(company_id, scope_type, scope_id, role_key)`; direct FKs to `companies(id)`, `gl_accounts(id)`, `users(id)`. The PK implements one effective mapping per Company + Scope + Role.

**Additional accounting-integrity UNIQUE constraint**: `(company_id, scope_type, role_key, gl_account_id)`. In the TREASURY / TREASURY_ASSET scope this prevents two distinct Treasuries of the same Company from resolving to the same GL account. This is an intentional **business/accounting uniqueness guarantee** on the *new* relation, not an arbitrary query index on a frozen existing table. The necessary PK/UNIQUE backing indexes are allowed constraint artifacts; no other speculative search/performance index is approved.

**Why the distinct Treasury target is mandatory:** if two Treasuries share one GL account, a transfer between them can produce equal debit and credit to the same account, eliminating the GL-level evidence of movement between two different Treasury balances. Separate target accounts preserve exact per-Treasury reconciliation, traceability and easier independent cash/bank verification. The same GL account may legitimately back a *different* COMPANY role only if the future Posting Rule's semantic checks allow it; this ADR does not manufacture a general-purpose uniqueness rule across unrelated roles.

Since `scope_id` has two permitted targets, its contextual reference must be proven with a narrowly scoped PostgreSQL integrity function/trigger plus the Backend writer:

- `COMPANY` requires `scope_id = company_id`;
- `TREASURY` requires an existing Treasury whose Branch belongs to `company_id`;
- target `gl_accounts.company_id` must equal `company_id`;
- target GL Account must be active and a posting-eligible **leaf** account when creating/changing a mapping and again when posting; account type remains an open text vocabulary under ADR-0021 (no invented enum or new `is_posting` column);
- reject Company/Branch/Treasury/account context mismatches; do not infer them from user input;
- edits to Treasury/Branch/GL master data cannot silently invalidate an existing mapping.

The trigger is an explicit, **versioned integrity exception** to the previously closed Phase 03 physical shape, requiring accepted ADR and forward-only migration. It does **not** reopen or rewrite `0009`, `0019`, or `0022`. No extra performance index is approved: a required PK backing index is a constraint artifact, not an arbitrary new §28 search index. Any additional index needs measured `EXPLAIN ANALYZE` plus separate catalog decision.

### Why not `company_settings.settings_json`?

The Baseline permits JSON for configuration, so this is a technically possible alternative. **Rejected for this critical mapping** because it cannot offer ordinary FKs and Company/Treasury referential protection for individual account targets; stale or cross-Company IDs are easier to introduce and harder to reconcile. Reject a generic mutable JSON dictionary as the sole authoritative mapping store.

### Why not `gl_accounts.system_key`?

Rejected: a single column on a GL Account cannot safely express mapping to **multiple independently identifiable Treasuries**, nor future scope-specific roles. It would also add a non-canonical column to the frozen GL entity and unnecessarily couple an account's identity to a single technical role.

### Why not the legacy Convex mapping?

Rejected: the legacy `systemKey` catalogue and `generalLedger*` routines are historical implementation, not v1.7 architectural authority. Neither their account types nor their two-decimal `toCents` arithmetic are transferred automatically.

## 3. Decision B — stable role key and resolver contract (ACCEPTED)

`role_key` identifies an **accounting purpose**, not an operation type, payment method, display label, account code, or debit/credit direction. Keys are internal uppercase `SNAKE_CASE`, stable across languages and GL renumbering. No user-defined arbitrary key may be used to drive posting.

Accepted small 09.08 **foundation vocabulary**:

| Scope | Role key | Semantic purpose |
| --- | --- | --- |
| `TREASURY` | `TREASURY_ASSET` | GL asset account linked to this exact Treasury |
| `COMPANY` | `CUSTOMER_RECEIVABLE_CONTROL` | customer receivables control account |
| `COMPANY` | `SUPPLIER_PAYABLE_CONTROL` | supplier payables control account |
| `COMPANY` | `CUSTOMER_ADVANCES_LIABILITY` | liability for unapplied customer advances |
| `COMPANY` | `CHEQUES_RECEIVABLE_CONTROL` | received cheques held for collection |
| `COMPANY` | `CHEQUES_PAYABLE_CONTROL` | cheques issued before clearing |

**No role is mandatory merely to create an empty Company/Chart of Accounts**. A role is required **when a specific posting rule needs it**, and that command must fail closed if absent. Further role keys (sales/revenue, purchases, inventory, COGS, VAT, returns/variances, service income, fees and other specialized controls) are frozen **by 09.09's versioned Posting Rules Catalog**, not invented in 09.08.

A trusted internal resolver accepts `(companyId, roleKey, scopeType, scopeId, existingTransaction)` only from the Backend:

1. validate key belongs to the versioned registry and is legal for its scope;
2. derive Company from the authoritative Branch / Treasury / business source, never from the client payload;
3. load exactly one configuration mapping for that Company + Scope + Role;
4. verify referenced account exists, is active, belongs to Company and is a posting-eligible **leaf** (no child accounts); do not treat `is_system` as a substitute for account-role mapping;
5. validate mapped Treasury exists and derives to that Company for TREASURY scope;
6. reject missing/invalid/ambiguous mapping with a stable safe error code; **never fall back to an arbitrary asset/income account**;
7. return the validated GL Account ID to the internal Journal writer within the **same** business transaction.

A `TREASURY_ASSET` mapping is Treasury-specific, not inferred from its payment-channel label. **Two distinct Treasuries in the same Company may not resolve to the same GL Account** for `TREASURY_ASSET`; the accepted UNIQUE constraint enforces this. A financial transfer between two Treasuries must therefore move value between distinct GL accounts and remain reconcilable per Treasury. No mapping is fabricated for an unmapped Treasury, and no account is created as a side effect of posting.

Existing `finance_categories.gl_account_id` remains the canonical direct mapping for Finance Categories; do not copy or duplicate these mappings into `system_account_mappings`. At use time validate that the category-selected GL Account belongs to the resolved source Company and is active.

Administration of mappings must be permissioned, audited, version-aware/idempotent where mutation supports retries, and must not be exposed as debit/credit choice in ordinary operational UI. Existing V1 authorization/branch-scope checks remain mandatory.

## 4. Decision C — Backend/DB Company–Branch–GL coherence (ACCEPTED)

### 4.1 Source context derivation

The caller to a Journal writer must pass an **existing transaction** and an internally verified PostingBatch, not unchecked client-provided Branch/Company/source identities.

The Journal writer resolves `branch_id -> branches.company_id` and verifies the Branch is active and in the caller's authorized effective Branch Scope. For every generated Journal Entry:

- `entry.branch_id = posting_batch.branch_id`;
- `entry.source_type = posting_batch.source_type`;
- `entry.source_id = posting_batch.source_id`;
- `created_by` and `posted_at` are inherited from the trusted posting context (not client-editable);
- all `journal_lines.gl_account_id` must belong to the **same Company** as the Branch;
- GL accounts must be active posting-eligible **leaf** accounts at posting time. Any attempt to add children beneath an already mapped or historically posted leaf must be rejected unless separately migrated/reclassified through approved accounting controls;
- `reversal_of_entry_id`, if present, must identify a prior JournalEntry of the same Branch, source and historical posting chain;
- the reversal PostingBatch must reference the original PostingBatch via `reverses_posting_batch_id` and the original Journal must remain unchanged;
- multiple JournalEntries may legitimately reference the same PostingBatch. Never add a unique constraint on `posting_batch_id`.

The source's actual business-document identity is resolved by the posting owner's **trusted source adapter**. The generic 09.08 writer enforces coherence with PostingBatch, but **does not invent the complete 09.09 business-source vocabulary**, nor assume polymorphic `source_id` is protected by an ordinary FK.

### 4.2 Chart of Accounts hierarchy

If `parent_id` is non-null, the parent account must belong to the **same Company**. Company identity is immutable for an existing GL Account after creation; re-parenting across Companies is rejected. Master-data changes cannot silently make a previously valid Journal context invalid. Normal GL deactivation is blocked if it would invalidate an active system mapping. Reparenting/cross-Company reassignment must not corrupt previously mapped or posted accounts. Historical Journal lines remain unchanged regardless of later permitted master-data changes.

### 4.3 Defense in depth

**Backend validation is required but insufficient by itself** for cross-context accounting. After approval, 09.08 must introduce narrow, deterministic PostgreSQL protection (without speculative query indexes) for:

- Company/scope integrity of `system_account_mappings`, including one-to-one Treasury-to-GL mapping and leaf account eligibility;
- JournalEntry-to-PostingBatch Branch/source coherence;
- JournalLine-to-Branch-Company/GL-Account coherence;
- same-Company GL parent linkage;
- valid reversal Journal/PostingBatch lineage;
- immutability of posted Journal history.

A direct SQL insert/update that bypasses the Backend must not be capable of creating a **committed** cross-Company or cross-Branch Journal. The exact SQL trigger/constraint implementation is an **implementation detail** of the approved contract and must be proven on PostgreSQL 17 before this subphase closes.

Do not create redundant composite UNIQUE indexes merely to support an FK when a bounded referential integrity trigger can enforce the invariant; retain existing FK and §28 index inventory. Existing committed historical data must be preflight-verified before any new guard is applied.

### 4.4 Transaction and concurrency contract

- Reuse the leased PostgreSQL client and outer `READ COMMITTED` transaction from the owning business command. No autonomous Journal transaction.
- Root Business Document / dependent / Inventory / Treasury position lock order remains that of Architecture §27. Mapping/reference-account reads must use an agreed **deterministic metadata-lock order**, and any administration writes must take compatible locks so posting cannot race with mapping replacement or GL deactivation.
- Use consistent locking on mapping and referenced account rows, with read-compatible row locks strong enough to block concurrent changes to mapping targets, `is_active`, `company_id` or account hierarchy (e.g. `FOR SHARE` when appropriate; **do not rely on `FOR KEY SHARE` alone** for non-key changes). The implementation must prove row-lock ordering and both posting-vs-admin races under PostgreSQL 17. No company-wide exclusive lock for every Journal posting and no blanket `SERIALIZABLE`.
- Recheck mapping validity within the same transaction after the required reference locks; never cache a potentially stale account ID as authoritative across transactions.
- Business Idempotency, one PostingBatch, Journal, Audit, Outbox and all operational effects share a single COMMIT/ROLLBACK boundary.
- No second Journal writer, separate GL write owner, or dual Convex/PostgreSQL posting for the same business module.

## 5. What this ADR explicitly does NOT decide

This decision freezes **structural account-resolution and context safety only**. It does not define:

- which source operation debits/credits which role, nor amounts or tax/COGS allocation;
- VAT rates/rounding, sales/purchasing return formulas, transfer reclassification or cheque accrual semantics;
- full Chart-of-Accounts default template;
- GL opening/cutover period workflows or accounting closing semantics;
- a separate per-branch database, full offline synchronization or a manual Journal posting UI;
- extra §28 query indexes, general-purpose JSON account mapping, or a new accounting truth ledger.

These belong to 09.09, Phase 15, or separately authorized bounded design work as applicable.

## 6. Consequences and alternatives

| Option | Benefit | Material risk | Decision |
| --- | --- | --- | --- |
| Normalized `system_account_mappings` | Referential/Company checks, one distinct GL per Treasury, auditable central resolver | Requires additive schema relation and integrity guards with additional concurrency tests | **ACCEPTED** |
| `company_settings.settings_json` | No new table, simpler migration | Weak per-reference DB integrity; accidental overwrite/stale IDs | Rejected |
| `gl_accounts.system_key` | Simple direct lookup | Cannot represent multidimensional scoped bindings; changes canonical GL shape | Rejected |
| Reuse Convex GL mapping | Faster initial port | Legacy semantic and decimal drift; violates Source-of-Truth priority | Rejected |

**Compatibility effect:** This is the **approved bounded 09.08 physical-schema addendum**, not a retroactive modification of the Phase 03 Accounting tables. The owner-delegated architecture decision authorizes a new normalized mapping relation and narrowly bounded integrity guards in a *future* 09.08 migration; existing migrations and the frozen Index Catalog remain authoritative for existing relations. The new table's PK and Treasury/GL UNIQUE constraint are integrity requirements, not speculative search indexes. Any optional performance index still requires measurement plus a versioned catalog decision.

**Migration/recovery:** only a new forward-only versioned migration is permissible after acceptance. It must include preconditions, integrity verification queries, existing-data checks, rollback/recovery documentation and PostgreSQL 17 tests. Never rewrite past migration files or change production data in this ADR step.

## 7. Accepted contract and implementation exit gates

The delegated architecture decision explicitly **ACCEPTS** the following contract:

1. dedicated `system_account_mappings` relation, not configuration JSON; PK plus accounting-integrity UNIQUE ensuring distinct Treasury GL targets;
2. COMPANY and TREASURY scopes, fixed foundation role-key semantics, active leaf posting accounts and fail-closed resolution;
3. preservation of `finance_categories.gl_account_id` as its own category mapping;
4. Backend + database fail-closed Company/Branch/PostingBatch/GL/reversal coherence rules;
5. no change to existing §28 Accounting indexes or direct Journal UI;
6. SQL changes are **not part of this ADR-only step**; the subsequent 09.08 implementation must introduce forward-only migration(s), PostgreSQL 17 behavioral/security/concurrency evidence, and Full CI on one final SHA.

### Verification matrix for later implementation (not executed by this ADR)

- mapping cannot reference wrong Company, inactive account, or a Treasury in another Company;
- mapping role+scope uniqueness, missing mapping fail closed and authorized mapping mutation/rotation under concurrency;
- separate Treasuries resolve by their exact IDs into **different** GL Account IDs, not by channel label;
- changing Company of a referenced Branch/GL Account or reparenting to another Company cannot corrupt historical mapping/Journals;
- Journal cannot use a PostingBatch of a different Branch/source;
- JournalLine cannot point at a different Company's GL Account even through direct SQL;
- reversal Journal cannot cross Branch/source/PostingBatch chain;
- posted Journals remain immutable with exact compensating reversal;
- balanced Journal committed, unbalanced Journal rejected at COMMIT and at Backend validation;
- concurrent mapping rotation versus posting is serializable by explicit lock order without global `SERIALIZABLE`;
- rollback after later failure undoes Journal, mapping-dependent effects, Audit and Outbox atomically;
- frozen Accounting indexes remain exact and migration verify-only is clean;
- full Finance/Inventory regressions and Full CI pass on the exact final implementation SHA.

## 8. Decision closure and exact next action

**ADR-0027 is ACCEPTED** under the project owner's explicit delegation of the design decision. The accepted decision is a bounded architectural clarification, not permission to skip Gap Analysis or Phase 09.08 tests. This decision step changes **documentation only**, not the database or Backend Journal Engine.

**Next Action (one only):** implement **09.08 generic GL / Journal Engine only** according to this accepted ADR and the already completed 09.08 Gap Analysis, beginning with a forward-only mapping/integrity migration design and preconditions, before any code changes; keep 09.09 Posting Rules, frontend/Convex cutover, production changes and `main` merge out of scope. The implementation phase must close only after the accepted contracts and Full CI pass on its final SHA.
