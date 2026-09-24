# Gate 05 — Last / System Admin Protection

**Status:** `CLOSED`  
**Branch:** `agent/postgres-v1.7-core`  
**Architecture Source:** Business Tech ERP Architecture Baseline v1.7  
**Implementation Plan:** Business Tech ERP Master Implementation Plan v1.0  
**Decision Date:** 2026-09-20

## Final policy decision

The previously unresolved Gate 05 policy is now fixed as follows:

1. The system must always retain **at least one ACTIVE user assigned to the canonical `SYSTEM_ADMIN` role**.
2. Only the canonical role key `SYSTEM_ADMIN` counts for this invariant.
3. A custom role does **not** count as a System Admin substitute, even when `roles.is_system = true`.
4. Disabling the last active `SYSTEM_ADMIN` is rejected.
5. Changing the role of the last active `SYSTEM_ADMIN` to any other role is rejected.
6. Enabling a System Admin is allowed.
7. Promoting a user to `SYSTEM_ADMIN` is allowed.
8. Disabling or demoting a System Admin is allowed when at least one other active canonical `SYSTEM_ADMIN` remains.
9. User physical deletion is not introduced by this Gate. Any future delete command that can remove a System Admin must apply the same invariant before deletion.
10. Direct PostgreSQL administration is not a supported client path in V1; this invariant is enforced by the authoritative Backend user-administration command path.
11. Sensitive user mutations remain Audit-recorded in the same transaction.
12. Phase 06 remains forbidden until this Gate passes on the same final SHA.

## Concurrency policy

The policy must remain correct under `READ COMMITTED`.

Every protected user-active/role mutation:

1. opens the Backend transaction;
2. locks the canonical `SYSTEM_ADMIN` role row with `SELECT ... FOR UPDATE`;
3. locks the target user row;
4. determines whether the mutation would remove one active canonical System Admin;
5. if so, counts the active users assigned to the locked canonical System Admin role;
6. rejects the mutation when the count is `<= 1`;
7. otherwise performs the mutation and writes Audit in the same transaction.

The canonical System Admin role row is the shared serialization guard. Therefore two concurrent attempts to disable/demote two different System Admin users cannot both observe the pre-change count and both succeed.

## Current-state classification

| Area | Classification | Decision |
|---|---|---|
| canonical `SYSTEM_ADMIN` role | موجود ومتوافق | reuse |
| `users.role_id` + `users.is_active` | موجود ومتوافق | reuse |
| role/user indexes | موجود ومتوافق | frozen; no change |
| disabled-user authentication enforcement | موجود ومتوافق | already closed in 05.01 |
| role catalog | موجود ومتوافق | already closed in 05.02 |
| Audit service | موجود ومتوافق | reuse |
| last active System Admin policy | كان غير محسوم | fixed by this Gate |
| concurrency-safe Backend guard | غير موجود | create |
| public safe rejection contract | غير موجود | create |
| PostgreSQL 17 concurrency proof | غير موجود | create |

## Implementation

- add `SystemAdminProtectionService`.
- add protected `setUserActive()` command.
- add protected `changeUserRole()` command.
- lock `SYSTEM_ADMIN` role row before target-user mutation.
- reject `LAST_ACTIVE_SYSTEM_ADMIN` before the update.
- allow promotion/enable paths.
- Audit successful user activation/deactivation/role changes.
- expose stable `SYSTEM_ADMIN_PROTECTION_REJECTED` with safe reason only.
- no HTTP/Frontend user-management cutover is introduced by this Gate.
- no migration.
- no index.

## Required tests

- one active System Admin cannot be disabled.
- one active System Admin cannot be demoted.
- an active custom `is_system=true` role does not satisfy the invariant.
- with two active System Admins, one may be disabled.
- with two active System Admins, one may be demoted.
- promotion to canonical `SYSTEM_ADMIN` is allowed.
- re-enabling a System Admin is allowed.
- two concurrent disable attempts against two active System Admins result in exactly one success and one `LAST_ACTIVE_SYSTEM_ADMIN` rejection.
- two concurrent demotion attempts behave the same way.
- final active canonical System Admin count never reaches zero.
- rejected mutations do not write a success Audit record.
- successful mutations write Audit.
- frozen `roles` and `users` indexes remain unchanged.
- migration verify-only confirms no migration/index addition.
- Full CI passes on the same implementation SHA.

## Explicit exclusions

- no Phase 06 implementation.
- no Frontend/Convex user-management cutover.
- no dual write.
- no `main` merge.
- no Convex Production change.
- no user-delete command.
- no role-management expansion beyond the already-approved catalog.

## Closure evidence

- Final policy fixed and implemented exactly as documented above.
- Verified implementation SHA: `6b7f6dd4f1297580c9ca682ee7a1e9479602b28b`.
- Full CI: Run `#975` / `35482913070` — SUCCESS on the same implementation SHA.
- `verify`: SUCCESS.
- `backend-verify`: SUCCESS, including the PostgreSQL 17 last System Admin protection integration gate.
- `browser-contract`: SUCCESS.
- `release-gate`: SUCCESS.
- one active canonical SYSTEM_ADMIN cannot be disabled.
- one active canonical SYSTEM_ADMIN cannot be demoted.
- custom `is_system=true` role does not satisfy the invariant.
- promotion and re-enable paths are allowed.
- concurrent disable race leaves exactly one active canonical SYSTEM_ADMIN.
- concurrent demotion race leaves exactly one active canonical SYSTEM_ADMIN.
- rejected mutations leave target state unchanged and do not write success Audit.
- successful mutations write Audit inside the same transaction.
- frozen `roles` and `users` index inventories remain unchanged.
- no migration added.
- no index added.
- no Phase 06 behavior implemented.
- Validation PR: `#224`, validation-only, to be closed without merge after final documentation-SHA CI.

## Next action

After final documentation-SHA validation, PHASE 05 is CLOSED. The next official step is PHASE 06 / 06.01 Unified Counterparty, READY_TO_START only.
