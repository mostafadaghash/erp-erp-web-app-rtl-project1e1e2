# Phase 05.03 — Effective Permissions Gap Analysis

**Status:** `CLOSED`  
**Branch:** `agent/postgres-v1.7-core`  
**Architecture Source:** Business Tech ERP Architecture Baseline v1.7  
**Implementation Plan:** Business Tech ERP Master Implementation Plan v1.0

## Scope

05.03 implements only the backend Effective Permission resolution contract:

```text
Role Default
→ User Override ALLOW/DENY
→ Effective Permission
```

Branch Scope is explicitly excluded until 05.04.

## Baseline decisions

- every functional permission belongs to the central `permissions` catalog.
- a role contributes Default Grants through `role_permissions`.
- a user override is `ALLOW` or `DENY`; logical `INHERIT` is represented by no override row.
- a user override takes precedence over the role default.
- backend authorization is authoritative; UI hiding is never sufficient.
- permissions are not branch-specific in V1; branch access is a separate decision layer owned by 05.04.
- disabled/missing users and unknown permissions fail closed.

## Current-state classification

| Area | Classification | Decision |
|---|---|---|
| `permissions` table + `UNIQUE(permission_key)` | موجود ومتوافق | reuse |
| `role_permissions(role_id, permission_id, is_allowed)` | موجود ومتوافق | reuse |
| `user_permission_overrides(user_id, permission_id, effect)` | موجود ومتوافق | reuse |
| ALLOW/DENY CHECK + PK/FK integrity | موجود ومتوافق | reuse |
| frozen indexes for permission mappings | موجود ومتوافق | no index change |
| backend Effective Permission resolver | تم إنشاؤه ومتوافق | verified |
| stable permission-denied error contract | تم إنشاؤه ومتوافق | verified |
| allow/deny precedence tests | تم إنشاؤها ونجحت | verified |
| Branch SELECTED/ALL enforcement | مؤجل إلى 05.04 | do not implement here |

## Permission-catalog boundary

Architecture Baseline v1.7 fixes the permission model and the main functional groups, but does not provide an exhaustive closed list of technical permission keys plus a complete per-role grant matrix.

Therefore 05.03 does **not** invent that matrix and does not copy the current Convex registry. The current Convex registry is implementation/historical context only and also contains legacy roles that are not part of the canonical seven-role v1.7 catalog.

05.03 consumes approved permission rows and Role Defaults from PostgreSQL and resolves them correctly. Module-specific permission keys/default grants must be introduced only when their approved module contract is implemented.

## Implementation

- add `EffectivePermissionService` under backend authorization infrastructure.
- one PostgreSQL read resolves user state + permission + role default + user override.
- precedence is deterministic: inactive/missing fails closed; then ALLOW/DENY override; otherwise Role Default.
- missing `role_permissions` row is treated as deny.
- `requirePermission()` throws a typed `PermissionDeniedError`.
- Error Mapper exposes only stable `PERMISSION_DENIED` + safe permission key.
- no Branch ID is accepted by this service in 05.03, preventing accidental 05.04 implementation.
- no write/admin HTTP API is exposed in this step.

## Tests / Exit evidence

- unit proof of Role Default behavior.
- unit proof that ALLOW overrides deny and DENY overrides allow.
- fail-closed proof for inactive/missing subjects.
- stable public `PERMISSION_DENIED` contract.
- PostgreSQL 17 integration using the real `permissions`, `role_permissions`, and `user_permission_overrides` tables.
- logical INHERIT proof by deleting the override row and falling back to the role default.
- exact frozen index inventory proof for the three permission tables.
- migration verify-only proof: no migration or index was added.
- explicit proof that `user_branch_access` remains untouched by 05.03.

## Explicit exclusions

- no 05.04 Branch Scope.
- no SELECTED/ALL authorization behavior.
- no cross-branch authorization.
- no Frontend permission cutover.
- no Convex runtime permission cutover.
- no dual write.
- no `main` merge.
- no Convex Production change.
- no new migration.
- no new index.

## Closure evidence

- Verified implementation SHA: `01f2e5c683a90b2465b8147a396fab394637ecbc`.
- Full CI: Run `#966` / `35481086538` — SUCCESS on the same implementation SHA.
- `verify`: SUCCESS.
- `backend-verify`: SUCCESS, including the PostgreSQL 17 Effective Permissions integration gate.
- `browser-contract`: SUCCESS.
- `release-gate`: SUCCESS.
- no migration added.
- no index added.
- no Branch Scope behavior implemented.
- no frontend/Convex permission cutover.
- Validation PR: `#221`, validation-only, to be closed without merge after final documentation-SHA CI.

## Next action

After final documentation-SHA validation, 05.04 Branch Scope is the one next action. It has not been started by 05.03.
