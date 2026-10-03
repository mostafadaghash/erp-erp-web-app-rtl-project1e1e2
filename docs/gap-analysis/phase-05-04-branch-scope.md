# Phase 05.04 — Branch Scope Gap Analysis

**Status:** `CLOSED`  
**Branch:** `agent/postgres-v1.7-core`  
**Architecture Source:** Business Tech ERP Architecture Baseline v1.7  
**Implementation Plan:** Business Tech ERP Master Implementation Plan v1.0

## Scope

05.04 implements only Backend Branch Scope and branch-scoped authorization:

- `users.branch_scope_mode = SELECTED | ALL`.
- `user_branch_access(user_id, branch_id)` for `SELECTED`.
- `default_branch_id` must remain inside effective branch access.
- sensitive Backend Business Queries/Commands must recheck Effective Permission + Branch Scope.
- cross-branch access must fail closed.

05.05 Organization remains explicitly excluded.

## Baseline decisions

- a user may be limited to one, several, or all branches.
- every user has a mandatory default branch.
- permissions are uniform across all branches the user may access in V1; permissions are not a per-branch matrix.
- `ALL` means every existing V1 branch is in scope without requiring `user_branch_access` rows.
- `SELECTED` means only explicit `user_branch_access` rows are in scope.
- Backend authorization is authoritative; UI hiding/filtering is not sufficient.
- missing users, inactive users, missing branches, and unauthorized cross-branch targets fail closed.
- branch lifecycle/activation policy belongs to 05.05 and is not invented in 05.04.

## Current-state classification

| Area | Classification | Decision |
|---|---|---|
| `users.branch_scope_mode` CHECK `SELECTED/ALL` | موجود ومتوافق | reuse |
| `user_branch_access(user_id, branch_id)` PK/FK integrity | موجود ومتوافق | reuse |
| selected-user default-branch deferred integrity | موجود ومتوافق | reuse |
| frozen `user_branch_access` index inventory | موجود ومتوافق | no index change |
| Backend Branch Scope resolver | غير موجود | create |
| branch-scoped Permission + Scope enforcement | غير موجود | create |
| stable branch-access-denied error contract | غير موجود | create |
| PostgreSQL 17 selected/all + cross-branch gate | غير موجود | create |
| Organization lifecycle/default warehouse behavior | 05.05 | do not implement here |

## Database decision

No migration is required.

The approved schema already contains:

- `ck_users__branch_scope_mode`.
- `pk_user_branch_access(user_id, branch_id)`.
- `ct_users__default_branch_access_at_commit`.
- `ct_user_branch_access__preserves_default_at_commit`.
- approved frozen index inventory for the involved tables.

05.04 must consume those invariants rather than duplicate them with a new schema layer.

## Implementation

- add `BranchScopeService` for explicit branch access evaluation.
- add `BranchScopedAuthorizationService` that combines Effective Permission + Branch Scope.
- expose `requireWithinTransaction()` so future sensitive Business Commands can recheck authorization inside the same transaction that performs business work.
- fail closed for unknown/inactive users, missing branches, and unauthorized SELECTED branches.
- prioritize Branch denial before Permission denial when both are not allowed.
- expose only stable `BRANCH_ACCESS_DENIED` + safe `branchId`.
- no HTTP Business API or Frontend cutover is introduced in this phase.

## Tests / Exit evidence required

- unit proof: `ALL` permits an existing branch without mapping rows.
- unit proof: `SELECTED` permits only explicit mapping rows.
- fail-closed proof for missing/inactive user, missing branch, and invalid scope.
- PostgreSQL 17 integration with real `users`, `branches`, and `user_branch_access`.
- selected default branch is accessible.
- `ALL` user needs no selected rows.
- cross-branch request for a SELECTED user is denied.
- combined Permission + Branch enforcement succeeds only when both succeed.
- transaction-bound recheck observes current `user_branch_access` state.
- deferred constraints reject an unauthorized default branch and reject removal of default access.
- frozen `user_branch_access` index inventory remains unchanged.
- migration verify-only proves no migration/index addition.

## Explicit exclusions

- no 05.05 Organization implementation.
- no branch create/update/deactivate command work.
- no warehouse lifecycle/default-warehouse work.
- no Frontend branch cutover.
- no Convex runtime branch cutover.
- no dual write.
- no `main` merge.
- no Convex Production change.
- no new migration.
- no new index.

## Closure evidence

- Verified implementation SHA: `9826a8d187ec84627c20c9eb6ca9ad6dfd3101a8`.
- Full CI: Run `#969` / `35481723808` — SUCCESS on the same implementation SHA.
- `verify`: SUCCESS.
- `backend-verify`: SUCCESS, including the PostgreSQL 17 Branch Scope integration gate.
- `browser-contract`: SUCCESS.
- `release-gate`: SUCCESS.
- SELECTED/ALL behavior verified.
- cross-branch denial verified.
- default-branch deferred integrity verified.
- transaction-bound Permission + Branch Scope recheck verified.
- no migration added.
- no index added.
- no 05.05 Organization behavior.
- no frontend/Convex branch cutover.
- Validation PR: `#222`, validation-only, to be closed without merge after final documentation-SHA CI.

## Next action

After final documentation-SHA validation, 05.05 Organization is the one next action. It has not been started by 05.04.
