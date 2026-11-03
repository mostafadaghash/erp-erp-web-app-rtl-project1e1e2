# Phase 09.08-A — Chart of Accounts Listing and Creation Service

**Status:** CODE IMPLEMENTED / PG17 and Full CI PASSED; final documentation-SHA gate pending
**Date:** 2026-11-03
**Authority:** Architecture Baseline v1.7, accepted ADR-0029, Master Plan 09.08, closed 09.08 Chart Gap Review.
**Code validation SHA:** `c6f1c0a9e6659b3f8b194dd65cb901da5dddcb62`
**Full CI:** [#1319](https://github.com/mostafadaghash/erp-erp-web-app-rtl-project1e1e2/actions/runs/41698008388) / `41698008388` with `verify`, `backend-verify`, `browser-contract` and `release-gate` all SUCCESS on the same code SHA.
**Validation PR:** [#265](https://github.com/mostafadaghash/erp-erp-web-app-rtl-project1e1e2/pull/265), DRAFT; close WITHOUT Merge only after final documentation CI passes.

## Implementation

- `server/infrastructure/accounting/gl-account-service.ts`: internal Company-scoped `GLAccountService` supporting authorized list (optionally inactive) and idempotent account creation. Exact canonical `gl_accounts` relation; no new DDL, index or data Source of Truth.
- Create checks code (ASCII uppercase, length, preserves leading zeroes), Arabic-capable name, open `account_type` text, nonblank audit reason, optional same-Company active parent and disallows direct `isSystem` creation.
- Company-wide access requires active User, active target Company, approved Chart permission, `branch_scope_mode=ALL`, and the actor's trusted home Branch in the same Company. User `DENY` override takes precedence; no role bypass, no cross-tenant listing.
- `IdempotencyService` executes on a transaction runner which enforces `accounting.chart.manage` **before both first execution and replay**. Create uses a Company row `FOR UPDATE` as the serialization root; the canonical `(company_id, code)` UNIQUE handles collision. Audit and effects commit together; new account creation always returns `is_system=false`.
- Stable safe `GL_ACCOUNT_OPERATION_REJECTED` errors; no raw SQL errors exposed by the common mapper.

## PostgreSQL 17 gates and regressions

- `server/tests/gl-account-service.test.ts` validates invalid input without database access.
- `server/tests/gl-account-service.integration.test.mjs` validates code/Arabic label/type, persisted audit and Idempotency replay/replay mismatch; inactive display filter and verify-only migration catalog; no other-Company/SELECTED/inactive-user access; role permissions and explicit allow/deny overrides; Company parent correctness/inactive parent; duplicate-code concurrent requests and same-key concurrent replay without duplicate audit or rows.
- The initial unit run rejected a whitespace-only overlength key using the earlier 'required' validation rather than testing the intended length limit. The fixture was corrected to use a nonblank overlength key. No business rule was weakened.
- PostgreSQL 17 environment and `runMigrations verifyOnly` completed successfully, all earlier Finance/Inventory/Accounting regression gates and full release gate passed on the exact code SHA.

## Explicitly deferred and safety

- **CRITICAL operational limit:** The four approved ADR-0029 permission keys have NOT been seeded in the production permission catalog. Integration tests insert only temporary test permissions. Until a separately approved/versioned catalog provisioning step, this new service **fails closed** for real unprovisioned users. It is NOT an enabled customer-facing feature.
- GL account rename/recode/type/parent updates, activation/deactivation, System Mapping admin, advanced Chart UI/HTTP route, runtime permission seeds, migrations, indexes, ordinary Journal UI and 09.09 Posting Rules remain outside this slice.
- The new service does not mutate `main`, Production data or Convex. No direct PostgreSQL connections from Frontend, no dual writers, no merge to `main`.
- The documentation SHA must also pass all four Full CI gates before administrative PR closure. **Phase 09.08 remains IN_PROGRESS.**

**Next Action:** validate final doc SHA on Full CI then close PR #265 WITHOUT Merge; next independent slice is versioned permission-catalog provisioning, not 09.09.
