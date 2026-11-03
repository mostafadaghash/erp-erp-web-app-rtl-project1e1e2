# Phase 09.08-B — ADR-0029 Permission Catalog Provisioning

**Date:** 2026-11-03
**Status:** CODE / MIGRATION CANDIDATE — PostgreSQL 17 validation pending
**Authority:** Architecture Baseline v1.7, accepted ADR-0029, Master Plan §09.08, Index Catalog 0022, canonical 0035 migration, existing RoleCatalog/EffectivePermissionService and GLAccountService.

## Change boundary

- Forward-only, transactional `0036_chart_of_accounts_permissions.sql` / metadata pair registers exactly four new `accounting` keys: `accounting.chart.view`, `accounting.chart.manage`, `accounting.mappings.view`, `accounting.mappings.manage`.
- Role defaults follow accepted ADR-0029: SYSTEM_ADMIN has all four; ACCOUNTANT has only the two `.view` keys; other roles have no default grant. Existing User ALLOW / DENY Overrides preserve precedence.
- Migration assigns the six approved grants to *existing* canonical roles; never generates a new role or modifies an existing role. Fresh installs with no roles are handled by `RoleCatalogService.ensureDefaultRoles()` after 0036, which establishes the same six defaults when roles become available.
- Migration preflight requires last version 0035, no collision with any approved key or stable UUID, and already-present SYSTEM_ADMIN / ACCOUNTANT metadata canonical. Any conflict fails closed; SQL and history roll back atomically, no overwrite or ON CONFLICT silent repair.
- Migration verifies catalog rows exactly, role grant matrix if roles exist, absence of unexpected grants on the four keys, and immutable SQL metadata checksums. No additional indices, DDL, historical movement edit or user override write.

## Independent PG17 gates

- New `chart-of-accounts-permission-catalog.integration.test.mjs`: fresh installation with roles absent; late default-role creation; effective permissions for admin/accountant/sales; user ALLOW/DENY, inactive user, unauthorized SELECTED scope; real GLAccountService allowed/denied operations; repeat role bootstrap and verify-only.
- Upgrade simulation applying 0001–0035 first with canonical roles already initialized, then 0036; verifies same grants and no disturbance to unrelated role defaults.
- Collision preflight on a 0035 installation with an unexpectedly claimed key must abort before other permissions or a 0036 migration history row is recorded; correction is in a separate test fixture only. Tampered catalog verification must fail.
- All test migration enumerations and the earlier GLAccountService fixture are updated to rely on provisioned permissions rather than artificially inserting duplicate keys.

## Safety and implementation exit

- No changes to `main`, Convex Production, production data, existing migrations 0001–0035, new Index Catalog, company scope logic, General Ledger posting, finance mappings, Chart mutation lifecycle, HTTP routes, or 09.09 Posting Rules.
- The code commit and a final documentation commit must each pass the four-job Full CI on their exact SHA; validation PR closes WITHOUT MERGE only after verification.
- **Important:** Grant provisioning alone does not make GL account management user-facing. `GLAccountService` remains internal and system-account mapping administration is not yet implemented.

**Next action once CI closes this slice:** begin the next independent 09.08 Chart of Accounts account-update/lifecycle Gap delta and implementation against ADR-0029. Keep 09.08 IN_PROGRESS and 09.09 NOT STARTED.
