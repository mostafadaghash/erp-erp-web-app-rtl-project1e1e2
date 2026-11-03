# Phase 09.08 — Chart of Accounts Management / Services Gap Review

**Date:** 2026-11-03
**Status:** GAP REVIEW COMPLETE / CONTRACT DECISIONS REQUIRED / NO IMPLEMENTATION
**Branch / reviewed SHA:** `agent/postgres-v1.7-core` / `98446e08d227ca3e915597885feb3c7f8cbc4300`
**Authority:** Architecture Baseline v1.7 §§1.3, 2.1, 11.1, 11.5, 24.16, 25.14, 26.7, 27, 28.6 and canonical Accounting schema table; Master Implementation Plan v1.0 §09.08; ADR-0013, ADR-0021, accepted ADR-0027/0028; prior 09.08 GL Gap Analysis and 0034/0035/Journaling closure.
**Scope of this review:** classify the remaining Chart-of-Accounts master-data and system mapping administration work only. No SQL, backend source, permissions, UI, Posting Rules, index, Production, or main merge.

## 1. Mandatory architectural boundaries

- `gl_accounts` is a **Company-scoped internal Chart of Accounts**, with columns `id, company_id, code, name, account_type, parent_id, is_system, is_active` and unique `(company_id,code)`.
- `journal_entries` + `journal_lines` are historical accounting Sources of Truth. Business operations generate balanced Journal entries automatically. V1 ordinary users **must not** manually create Journals or operate a heavy accounting tree/advanced accounting UI.
- The system mapping storage and six foundation role keys are **already frozen by ADR-0027**; the mapping relation is configuration, not a second ledger. Further event-account role keys and debit/credit recipes belong **only to 09.09**.
- `account_type` is **open text** under ADR-0021; do not add a made-up fixed enumeration or a database CHECK just to simplify administration.
- The existing §28.6 frozen indexes are not available for discretionary changes. `READ COMMITTED` plus compatible row locks and fixed metadata lock ordering remain mandatory.
- The Baseline does not freeze a complete Chart-of-Accounts CRUD/administration command policy. Such a policy must not be invented silently inside code.

## 2. Current-state classification

Classification means: **A** existing/compliant; **B** existing but adjustment or missing service integration needed; **C** absent/create after contract approval; **D** present but requires replacement; **P** policy/ADR blocker (not permission to implement).

| # | Capability / invariant | Evidence and exact state | Classification |
|---|---|---|---|
| 1 | Canonical Company GL account relation | `0009_accounting.sql` creates eight prescribed fields; `0019_accounting_constraints.sql` adds PK, Company FK, parent FK and Company+code UNIQUE | A |
| 2 | Approved chart query indexes | Frozen `0022` catalog covers parent, account type/active, and Company+code uniqueness; no new index is required by this review | A |
| 3 | Same-Company hierarchy and cycle guard | `0034` guards against cross-Company parentage, self-parent and indirect cycles; Company reassignment prohibited | A |
| 4 | Protect mapped or historically posted leaf accounts | `0034` prevents adding children below accounts used by mapping or posted JournalLine and prevents deactivating an actively mapped account | A, bounded |
| 5 | System mapping persistence and target integrity | `0034` creates `system_account_mappings`, COMPANY/TREASURY scopes, PK and distinct Treasury-to-GL UNIQUE; triggers validate account scope, active leaf and Treasury context | A |
| 6 | Internal mapping **resolution** | `SystemAccountResolver` exists in `server/infrastructure/accounting/journal-writer-service.ts`; accepts only ADR-0027 six foundation keys and fails closed | A |
| 7 | Journal posting / reversal security | Existing `JournalWriterService` and `0035` protect line integrity and exact reversal; this is **not** account master-data administration | A, out-of-slice |
| 8 | List/query Chart of Accounts by Company, hierarchy and active state | No dedicated Chart-of-Accounts backend service found in `server/infrastructure/accounting/`; no GL administration route in `server/api/routes/` | C |
| 9 | Account creation with code/name/type/parent/is_system validation | Database permits structurally valid rows, but no authorized `GLAccountService` command found; account-type and system-account creation policy not frozen | C + P |
| 10 | Account rename/recode/reparent/type/system-flag editing | Physical uniqueness and hierarchy guards exist; controlled mutation service, allowed-field matrix, historical display/audit impact and editing policy missing | B + P |
| 11 | Activate/deactivate/delete lifecycle | `0034` protects mapped accounts; historical FKs protect referenced accounts. General policy for unused/posted/non-mapped, parent/child, or finance-category-linked accounts and physical delete remains unfrozen | B + P |
| 12 | Authorized mapping add/rotate/remove | DB structurally supports writes and tracks `updated_by/updated_at`, but no permissioned, audited, idempotency/version-aware configuration command found | C + P |
| 13 | Finance Category GL reference usability | `finance_categories.gl_account_id` FK exists and ADR-0027 retains it as separate from System Mappings. Administration and runtime validation of inactive/cross-Company category account use are not implemented in a Chart management service | B; command ownership decision required |
| 14 | Authorization and Company/Branch scope | Effective Permissions and Branch Scope frameworks exist. No explicitly approved Chart-specific manage/view permission/default or Company-wide administration scope rule is frozen | B + P |
| 15 | Change Audit, idempotent command contract and concurrence | Audit, Idempotency and transaction infrastructure exist, while no Chart/mapping admin command uses them. `gl_accounts` has no explicit `version` column; do not assume one or add a migration without approval | B + P |
| 16 | Mapping/key governance | Resolver only accepts approved six roles; `0034` SQL checks uppercase format, not full technical key vocabulary. An admin command must never create arbitrary keys for posting | A (resolver), C (admin) |
| 17 | Default chart/template and initial system mappings | Baseline/ADR-0027 **do not** require seeding mappings when an empty Company is created; no approved full default account template exists | P / deliberately undefined |
| 18 | Public manual journals, heavy GL screens, GL posting recipes | Explicitly outside ordinary V1 / reserved for 09.09 or later front-end phases; do **not** implement as a 09.08 CoA workaround | Not a gap |

**Replacement finding:** no existing PostgreSQL Chart-of-Accounts service was found that must be replaced (D = none). Legacy Convex accounting code is historical evidence, not a V1 authority, and is not a migration target for CRUD rules.

## 3. Material unresolved contract decisions

These are blockers for **new master-data mutation commands**, not defects in the closed 0034/0035 gates.

1. **Administration surface and authorization:** backend-internal only versus a restricted configuration API at this point; explicit permission keys and role defaults; whether a user with only one Branch can manage a Company-wide Chart used by every Branch. Never silently reuse `finance.accounts.manage`, which currently governs Treasury management.
2. **Create/edit rules:** mandatory code/name normalization and allowed lengths, whether `account_type` needs a separately approved technical vocabulary, policy for assigning/toggling `is_system`, edit/recode/name/parent/type matrix after mapping/posting, and leaf/summary presentation. Baseline does not settle these.
3. **Lifecycle/deletion:** permitted deactivation of previously posted but currently unmapped accounts, rule for active Finance Category references, inactive parent/child behavior, when (if ever) unused GL accounts may be deleted rather than deactivated, and how historical reports present later account renames. Current DB guards are narrower than a complete lifecycle policy.
4. **Mapping administration:** who may add, change or remove the six existing roles; reason/Audit requirements; concurrency and lock order versus posting and account/treasury administration; optimistic precondition/idempotency without inventing a column; no role auto-generation and no inappropriate fallback. Treasury account uniqueness stays immutable.
5. **Read/query boundary:** narrowly scoped CoA listing for authorized administration versus user-facing business `قائمة الحسابات / كشف حساب`, which refers primarily to operational account/treasury and counterparty views. Advanced manual General Ledger UI is out of scope.

Do **not** interpret absent detailed policy as permission to invent account types, a default chart, new Posting Rule keys, a direct Journal UI, a new index or migration.

## 4. Independent evidence and future exit gate (not executed here)

Review artifacts: Architecture Baseline v1.7; 0009/0019/0034/0035 SQL; ADR-0013/0021/0027/0028; `JournalWriterService`, `SystemAccountResolver`, Branch Scope/Audit/Idempotency/PostingBatch services; `server/api/routes/` and `server/infrastructure/accounting/`; prior PostgreSQL 17 0034/0035 tests. These show structural integrity and missing command entry points, but **do not** themselves prove a future CoA service.

After the command policy is accepted, an **independent implementation** must prove at least: Company-code uniqueness and safe concurrent creation, Company/Branch authorization, parent ownership/cycle constraints, existing mapped/posted leaf restrictions, account activation/deactivation policy, source-Category dependency, approved mapping CRUD and two-Treasury distinct accounts, concurrent mapping rotation versus posting, Audit/transaction rollback/idempotency behavior, stable public errors, frozen indexes, migration verify-only, and full same-SHA CI on PostgreSQL 17. No new migration/index unless a separately approved, demonstrated integrity gap requires it.

## 5. Review decision and single next action

**09.08 remains IN_PROGRESS**. The physical Chart and Journal foundation is implemented, but the Chart-of-Accounts administration/service command contract is not fully defined and no new service should be written yet.

**Next action only:** prepare a bounded **proposed** versioned Chart-of-Accounts Administration / Authorization Contract decision (candidate `ADR-0029`) covering the unresolved five items above, for explicit owner approval before any CoA business code or 09.09 Posting Rules. The ADR proposal is **not accepted by this review**.

**Safety:** This review creates only documentation; no SQL migration, authorization seed, Backend service, UI, Production or Convex mutation, or `main` merge.
