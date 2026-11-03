# Phase 09.08 — Post-09.08-B Chart Lifecycle & Mapping Administration Gap Review

**Status:** GAP_REVIEW_COMPLETE — DOCUMENTATION ONLY / IMPLEMENTATION NOT STARTED
**Date:** 2026-11-03
**Reviewed branch/SHA:** agent/postgres-v1.7-core / 4fcaeae22cbe6995a5d784e7df1f1ad0fb7639c9
**Authoritative contracts:** Architecture Baseline v1.7 §§8, 11, 24.16, 25.14, 26–28; Master Implementation Plan v1.0 Phase 09.08; accepted ADR-0027, ADR-0028, ADR-0029.
**Previous reviews:** docs/gap-analysis/phase-09-08-chart-of-accounts-management.md (pre-ADR-0029; historical snapshot), 09.08-A service closure, 09.08-B permission catalog CI #1329 and final-documentation CI #1330.
**Scope:** Delta review of GL account modification/lifecycle and existing six-role System Account Mapping administration after 09.08-A/B; no SQL, application code, new permissions, migration, UI, production data or main merge.

## 1. Executive finding

GL account list/create and approved permission provisioning are implemented and tested. No authenticated GL account update/activate/deactivate or System Mapping management service exists in the reviewed accounting infrastructure. The physical GL/mapping constraints are necessary but do not fully express the accepted ADR-0029 lifecycle and history safeguards. Do not equate a passing existing schema/Journal CI with verification of future administrative commands.

The reviewed ADR-0029 document retains its original architecture-acceptance wording; the later 09.08-A/B implementations supersede its original future-work description only for their bounded scopes. Do not retroactively edit the accepted ADR to pretend all of its decisions are implemented.

## 2. Grounded inventory / classification

Classification: A=existing/compliant; B=existing but additional behavior/verification required; C=missing/create only in a later approved implementation slice; D=existing/replacement necessary; P=policy boundary, not permission to expand scope.

| # | Domain / invariant | Current evidence | Class |
|---|---|---|---|
| 1 | GL physical account model and Company code uniqueness | database/migrations/0009_accounting.sql + 0019_accounting_constraints.sql; accepted account_type remains open text | A |
| 2 | Hierarchy same-Company and cycle detection; mapped/posted leaf protection | 0034_gl_system_account_mapping_integrity.sql, fn_gl_account_hierarchy_guard | A, bounded |
| 3 | Internal Chart read and create | server/infrastructure/accounting/gl-account-service.ts: list/create only; Company/ALL, effective permission, validated input, parent check, idempotency, transaction-bound Audit | A |
| 4 | Chart/mapping permission keys and role grants | database/migrations/0036_chart_of_accounts_permissions.sql, late role bootstrap and PostgreSQL tests: System Admin all four, Accountant two view permissions, all others no default grants; explicit user overrides preserved | A |
| 5 | Journal safety and internal mapping resolution | JournalWriterService, SystemAccountResolver, 0035 commit seal and reversal protections, approved six-role registry | A, not an administration service |
| 6 | Account rename, recode, type change, reparent | No update method on GLAccountService; ADR-0029 field freeze/allowed-change matrix unimplemented as authorized business command | C |
| 7 | Account activation/deactivation and no-physical-delete policy | No lifecycle command; 0034 forbids deactivation of mapped targets only, not every historically posted account | B + C |
| 8 | Active-child/parent and Finance Category dependencies | Create service rejects inactive parent; direct 0034 hierarchy SQL does not explicitly reject inactive parent; finance_categories.gl_account_id is a FK, but it does not itself prevent deactivation of referenced accounts | B |
| 9 | Mapping configuration listing and create/replace/remove | 0034 system_account_mappings table and triggers exist; no permissioned/audited/idempotent SystemAccountMappingAdministrationService; resolver reads for posting only | A (storage), C (admin) |
| 10 | Mapping history freeze and stale-expected-state contracts | ADR-0029 disallows removal/rotation once prior mapping target has any JournalLine; expects previous (gl_account_id,updated_at) or ABSENT with locks; no admin implementation | C |
| 11 | Mapping registry enforcement | Resolver accepts six ADR-0027 keys; 0034 SQL only checks role format and COMPANY/TREASURY scope convention; admin must enforce closed registry | A (resolver), C (admin) |
| 12 | Category GL mapping separation | finance_categories.gl_account_id remains separate from system_account_mappings; Finance service owns category mapping and use-time source-Company validation | P / future integration gate |
| 13 | HTTP routes and UI | server/api/routes contains auth and health only; no Chart/Mapping admin HTTP route. ADR-0029 defers restricted API until separately authorized cutover | Not a current 09.08 gap |
| 14 | Default Chart / historical GL recoding / ordinary manual Journals | Not authorized by ADR-0027/0029 or V1; 09.09 owns new posting-role/accounting recipes | P / out of scope |

**Replacement finding:** D=none. Legacy Convex is not the authoritative GL service for these rules.

## 3. Safety gaps and risk assessment

### G1 — Historical Journal reversal vs GL deactivation (HIGH)

The 0034 fn_gl_account_hierarchy_guard deactivation branch checks an existing System Mapping, not every journal_lines historical reference. By contrast, JournalWriterService.reverseWithinTransaction calls requireAccounts, which requires active GL accounts when appending compensating Journal lines. A posted but no-longer-mapped account could become inactive through an unsafe privileged SQL path and block a legitimate reversal. ADR-0029 expressly prohibits that lifecycle state. No service in 09.08-A exposes deactivation, so this is a **missing future command safeguard and unverified direct SQL/runtime-role boundary**, not evidence of a current UI exploit.

**Required proof before lifecycle implementation:** PostgreSQL 17 negative tests against the actual server runtime DB role, including historically used, currently unmapped account and simultaneous Journal reversal/deactivation. If actual runtime-role direct DML can bypass mandatory rules, stop and seek separately reviewed forward-only integrity/privilege correction. Do not mutate 0034/0035 retrospectively.

### G2 — Inactive parent/active child and Finance Category dependencies (HIGH)

The current Create service checks an active same-Company parent, but 0034's hierarchy trigger is not an exhaustive active-parent lifecycle policy. finance_categories.gl_account_id has FK RESTRICT behavior, but FK alone cannot ensure active categories never reference deactivated GL accounts. ADR-0029 requires rejecting deactivation when there are active children or any active Finance Category reference. Test both sanctioned service and actual runtime SQL role access.

### G3 — Mapping rotation while posting (HIGH)

Posting resolver uses FOR SHARE on Treasury, mapping and referenced GL account inside the transaction. Mapping administration must lock a compatible Company/Treasury context and mapping/GL rows in deterministic order, then recheck JournalLine history after any blocking. Unconditional UPSERT, stale expected-state overwrite, removal of historically used targets and partial old/new resolution are prohibited. PostgreSQL 17 two-admin, posting-vs-rotation and rollback/race tests are mandatory, not inferred from a static read of SQL.

### G4 — Closed role vocabulary and privilege boundary (HIGH)

0036 authorizes viewing/managing Chart/Mappings with explicit Role Defaults and Override precedence; it does not create the missing commands. The SQL format CHECK alone accepts syntactically valid role names beyond the ADR-0027 six-role registry. Any future admin command must reject unauthorized keys, enforce Company/ALL scope and tenant context, and fail closed when required mapping is absent.

### G5 — History-safe account changes and observability (MEDIUM)

ADR-0029 freezes ID, Company and System flag, and freezes code/type/parent once mapped/posted/category-used. Historical display-name corrections are permitted with reason and Audit without rewriting JournalLines. There is no current business update/lifecycle path implementing this matrix. No physical DELETE. Mapping and Chart audit must be one transaction with effects; retries must not duplicate either.

## 4. Accepted command contracts, not yet implemented

**09.08-C, GL Account Mutation/Lifecycle only:** permission accounting.chart.manage and Company/ALL checks; update name/code/type/parent only per ADR-0029 eligibility matrix; activate/deactivate subject to history/children/mappings/active Finance Category; server-verified optimistic precondition without inventing a gl_accounts.version column; deterministic Company -> GL row lock order; idempotency, Audit/Reason, safe error codes, no DELETE and no system flag mutation.

**09.08-D, Mapping Administration later:** accounting.mappings.view/manage; list/create/replace/remove for exactly the six ADR-0027 keys with allowed Company/Treasury scope; expected previous mapping state and explicit ABSENT; transaction-scoped Company/Treasury -> mapping -> GL locking; prohibit replacement/removal when the mapped target has any JournalLine; preserve Treasury distinct-GL uniqueness, Audit and idempotent replay. No Chart/UI/Posting Rule coupling by shortcut.

The separation into bounded implementation slices is a **review recommendation**, not a modification to ADR-0029. No new SQL or app authorization is granted by this document.

## 5. Required verification matrix for the later 09.08-C/D gates

1. Permission: System Admin/Accountant role defaults, user ALLOW/DENY precedence, revoked user, SELECTED branch-only rejection, foreign Company rejection; recheck inside business transaction and on replay.
2. Account update: permissible unused leaf changes; mapped/posted/category-linked code/type/parent freeze; historical label-only correction + full before/after Audit and stable ID/code.
3. Lifecycle: disallow mapped/posted/active-category/active-child deactivation; inactive-parent child rejection; reactivation integrity; forbid physical DELETE even unused account.
4. Journal race: concurrent Journal posting/reversal versus GL change/deactivation, including exact original history and rollback preservation.
5. Mapping: exact six role keys, COMPANY/TREASURY scopes, same Company + active leaf, distinct Treasury GL, missing mapping fail-closed, no guessed mapping or auto-default Chart.
6. Mapping races: expected prior snapshot/ABSENT, two administrators, stale conflict and ABA limits, in-use mapping no replacement/removal, simultaneous resolver/posting lock ordering and no deadlocks.
7. Audit / transactions: exact idempotent replay, changed-payload conflict, no partial GL/Mapping/Audit/Outbox commits on failure.
8. Direct SQL privilege proof for the production-equivalent runtime role plus PostgreSQL 17 fresh and upgrade/preflight cases; any required exception needs a new separately approved forward-only migration, not a modified historical migration.
9. Same final SHA: TypeScript, security, PostgreSQL 17 integration/concurrency, frozen Index Catalog, full four-job CI, and validation PR closure without merge.

## 6. Exit criteria / next execution pointer

- [x] Compare ADR-0029 with the live branch after successful 09.08-B.
- [x] Identify implemented and missing services, existing SQL guarantees, and bounded residual risks.
- [x] Preserve Phase 09.08 IN_PROGRESS and Phase 09.09 NOT_STARTED.
- [x] No Business code, SQL migration, index, HTTP/API cutover, Convex Production mutation or main merge in this review.
- [ ] Documentation commit must pass Full CI on its own SHA before administrative PR closure.
- [ ] Review artifact and Master Plan status must be recorded on agent/postgres-v1.7-core.

**Single next action after review closure:** begin only the separately gated 09.08-C GL Account Mutation/Lifecycle pre-implementation PostgreSQL 17 runtime-role/integrity/concurrency proof against the accepted ADR-0029 contract; do not start mapping administration (09.08-D), a migration, or Phase 09.09 in the same step.

**Production warning:** CI uses isolated PostgreSQL 17 instances. No claim is made that populated local/staging/Production data or their runtime DB privileges have already passed these future tests.