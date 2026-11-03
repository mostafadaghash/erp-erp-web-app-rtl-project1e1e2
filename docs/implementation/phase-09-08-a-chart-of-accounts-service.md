# Phase 09.08-A — Chart of Accounts Listing and Creation Service

**Status:** IMPLEMENTATION CANDIDATE / NOT YET VALIDATED
**Date:** 2026-11-03
**Baseline:** Architecture v1.7, accepted ADR-0029, 0009/0019/0034/0035, 09.08 Gap Review.
**Scope:** First independent service slice, no 09.09.

## Existing and reused
Canonical Company-scoped \`gl_accounts\`, Company+Code UNIQUE, hierarchy/cycle trigger, AuditService, IdempotencyService, Effective Permissions precedence, PostgreSQL READ COMMITTED transaction helper. No new SQL or indexes.

## Added now
Internal-only GLAccountService list and create; code/name/type/reason validation; controlled parent; Company ALL user from same Company, explicit view/manage keys, fail-closed overrides; idempotent create, unique conflict mapping, atomic audit, serialized Company-row creation; PostgreSQL 17 positive/negative/replay/concurrency tests.

## Explicitly excluded
Permission-catalog **production provisioning** (new keys are tested through test fixtures; absent keys deny at runtime), account updates/deactivation, System Mapping mutation, migrations, CoA HTTP route/UX, direct Journal writes, and Posting Rules 09.09.

## Independent gate
PostgreSQL 17 integration tests and unit/typecheck/full CI all four jobs on final SHA before considering the slice code verified. Keep Phase 09.08 IN_PROGRESS.
