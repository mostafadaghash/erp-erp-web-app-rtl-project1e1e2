# Phase 05.02 — Roles Gap Analysis

**Status:** VERIFYING  
**Branch:** `agent/postgres-v1.7-core`  
**Starting SHA:** `ebbecc688f64f8e51da3a65a1ac72a54f5882b2c`

## Official contract

Architecture Baseline v1.7 defines a central `roles` catalog with:

- `id`
- `role_key`
- `display_name_key`
- `is_system`

The approved default role set is seven roles. The Master Implementation Plan normalizes the technical keys as:

1. `SYSTEM_ADMIN`
2. `BRANCH_MANAGER`
3. `ACCOUNTANT`
4. `SALES`
5. `CUSTOMER_SERVICE`
6. `TECHNICIAN`
7. `WAREHOUSE_KEEPER`

The existing physical schema already provides `PRIMARY KEY(id)` and `UNIQUE(role_key)`.

## Gap classification

| Area | Current state | 05.02 action |
| --- | --- | --- |
| `roles` table | موجود ومتوافق | reuse |
| `UNIQUE(role_key)` | موجود ومتوافق | reuse |
| seven default role definitions | غير موجودة في Backend Core | implement |
| idempotent catalog initialization | غير موجود | implement |
| concurrent catalog initialization | غير مثبت | test |
| metadata drift correction | غير موجود | implement/test |
| custom-role preservation | غير مثبت | test |
| default permission grants | 05.03 | intentionally not started |
| user overrides | 05.03 | intentionally not started |
| branch scope | 05.04 | intentionally not started |
| role-management HTTP API | unsafe before authorization enforcement | intentionally not exposed |

## Implementation decisions

1. No migration and no new index. The frozen schema already owns role identity and uniqueness.
2. `role_key` is the technical identity used for authorization. `display_name_key` is localization metadata only and must never drive authorization decisions.
3. The canonical system role keys are exactly the seven keys listed in the Master Plan. The older test-only spelling `ADMIN_SYSTEM` is not created by the new catalog.
4. `ensureDefaultRoles()` performs one parameterized multi-row `INSERT ... ON CONFLICT (role_key) DO UPDATE` inside the existing READ COMMITTED transaction helper.
5. If a canonical role already exists, its existing `id` is preserved so user/permission references are not broken; metadata is reconciled to canonical `display_name_key` and `is_system=true`.
6. Extra custom roles are not deleted, renamed, or converted.
7. Repeated or parallel initialization is safe because the approved unique constraint on `role_key` is the concurrency arbiter.
8. 05.02 does not seed `role_permissions`. Default permission grants and effective permission resolution belong to 05.03.
9. No unauthenticated role-management route is exposed before 05.03 backend authorization exists.
10. The Baseline material reviewed for 05.02 does not provide a complete command policy for removing/changing the last active system administrator. Therefore the Gate-05 item for last/system-admin protection remains open rather than inventing a policy in this slice.

## Canonical display metadata

Implementation localization keys are stable metadata:

- `SYSTEM_ADMIN → roles.systemAdmin`
- `BRANCH_MANAGER → roles.branchManager`
- `ACCOUNTANT → roles.accountant`
- `SALES → roles.sales`
- `CUSTOMER_SERVICE → roles.customerService`
- `TECHNICIAN → roles.technician`
- `WAREHOUSE_KEEPER → roles.warehouseKeeper`

No frontend translation/cutover change is made in 05.02.

## Executable evidence

- `server/tests/role-catalog.test.ts`: exact seven technical keys, uniqueness, and rejection of legacy alias as a canonical key.
- `server/tests/role-catalog.integration.test.mjs`: PostgreSQL 17 migrations, 16-way concurrent initialization, drift repair while preserving the existing system-role ID, preservation of a custom role, no `role_permissions` seeding, exact role index inventory, and migrations verify-only.
- explicit PostgreSQL 17 Role Catalog CI gate.

## Non-goals

- No 05.03 Effective Permissions.
- No Permission grant matrix.
- No user ALLOW/DENY overrides.
- No 05.04 Branch Scope.
- No role-management API before backend authorization.
- No frontend cutover.
- No Convex Production change.
- No merge to `main`.

## Exit procedure

1. Full CI on the 05.02 implementation SHA.
2. If green, mark 05.02 CLOSED and advance the pointer to 05.03 only.
3. Full CI again on the final documentation SHA.
4. Close the validation-only PR without merge.
