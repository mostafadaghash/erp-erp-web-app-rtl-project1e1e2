# Phase 05.05 — Organization Gap Analysis

**Status:** `IN_PROGRESS`  
**Branch:** `agent/postgres-v1.7-core`  
**Architecture Source:** Business Tech ERP Architecture Baseline v1.7  
**Implementation Plan:** Business Tech ERP Master Implementation Plan v1.0

## Scope

05.05 implements only the Organization backend contract:

- Company settings.
- Branch lifecycle through create + active/inactive state.
- automatic creation of one active default Warehouse when a Branch is created.
- `branch_settings.default_warehouse_id` as the only Warehouse Default source of truth.
- prevent changing a Warehouse to another Branch after Inventory Movements exist.
- deactivate historical Warehouses instead of physically deleting them.
- audit Organization mutations.
- reuse existing PostgreSQL constraints and frozen indexes.

Phase 06 remains explicitly excluded.

## Baseline decisions

- V1 has one Company entity with multiple Branches.
- every Branch must own at least one Warehouse.
- creating a Branch through the Backend automatically creates its default Warehouse.
- a Warehouse belongs to exactly one Branch.
- after a Warehouse has movements, its `branch_id` must not change; inventory movement must use official Stock Transfer instead.
- Warehouses with balance/history are disabled rather than physically deleted.
- `branch_settings.default_warehouse_id` is the only official Warehouse Default truth.
- the default Warehouse must be active and belong to the same Branch.
- Company settings are configuration only; Business entities/balances must not be buried in JSON.
- Master Data mutations use Audit and authorization/scope rules when exposed through Business APIs.

## Current-state classification

| Area | Classification | Decision |
|---|---|---|
| `companies` / `company_settings` schema | موجود ومتوافق | reuse |
| `branches` / `branch_settings` schema | موجود ومتوافق | reuse |
| `warehouses` schema | موجود ومتوافق | reuse |
| active same-branch default Warehouse deferred constraint | موجود ومتوافق | reuse |
| Warehouse+Branch composite integrity for Inventory Movements | موجود ومتوافق | reuse |
| frozen Branch/Warehouse/Settings indexes | موجود ومتوافق | no index change |
| Company Settings backend service | غير موجود | create |
| atomic Branch + default Warehouse creation | غير موجود | create |
| Branch active/inactive lifecycle service | غير موجود | create |
| Default Warehouse read/change service | غير موجود | create |
| Warehouse branch mutation guard after movements | غير موجود في Backend | create; DB already provides final safety |
| historical Warehouse deactivation service | غير موجود | create |
| Organization Audit integration | غير موجود | create |
| exhaustive admin-management policy | غير محسوم في official sources | do not invent in 05.05 |

## Database decision

No migration is required.

The approved schema already enforces the critical invariants:

- `uq_branches__company_code`.
- `uq_warehouses__branch_code`.
- `ct_branch_settings__default_warehouse_valid_at_commit`.
- `ct_warehouses__preserve_default_reference_at_commit`.
- `uq_warehouses__id_branch`.
- `fk_inventory_movements__warehouse_branch`.

The frozen Index Catalog already contains the approved organization indexes. 05.05 consumes these invariants and does not add speculative indexes.

## Implementation

- add `OrganizationService`.
- `updateCompanySettings()`: transaction-bound upsert with `updated_by`, server timestamp, and Audit.
- `createBranch()`: one transaction creates Branch + active Warehouse + `branch_settings.default_warehouse_id` + Audit.
- `setBranchActive()`: active/inactive lifecycle without physical deletion.
- `getDefaultWarehouse()`: reads the official default only through `branch_settings`.
- `setDefaultWarehouse()`: requires an active Warehouse from the same Branch.
- `moveWarehouseToBranch()`: blocks current defaults and Warehouses with Inventory Movements; DB composite FK remains final defense.
- `setWarehouseActive()`: allows historical Warehouse deactivation but blocks deactivation of the current default.
- Organization failures use stable `ORGANIZATION_OPERATION_REJECTED` with a safe reason only.
- no Organization HTTP API is exposed in this step because the official sources do not freeze exhaustive technical permission keys/default grants for those commands.

## Tests / Exit evidence required

- PostgreSQL 17 migrations on a clean database.
- Company Settings create/update/read.
- Branch creation atomically creates exactly one initial default Warehouse.
- default Warehouse is active and belongs to the Branch.
- no competing `warehouses.is_default` truth exists.
- Branch deactivate/reactivate keeps the row and history.
- Default Warehouse change accepts active same-branch Warehouse only.
- current default Warehouse cannot be deactivated or moved.
- a non-default Warehouse can move before movements.
- a Warehouse with Inventory Movements cannot move branches through the Backend.
- direct SQL branch mutation after movements is rejected by the approved composite FK.
- a historical Warehouse can be deactivated instead of deleted.
- late failure rolls back Branch + Warehouse + Settings + Audit atomically.
- Organization Audit records are written.
- exact frozen indexes for `branches`, `warehouses`, `branch_settings`, and `company_settings` remain unchanged.
- migration verify-only proves no migration/index addition.
- Full CI must pass on the same implementation SHA.

## Gate 05 boundary

The Master Plan still contains:

`last/system admin protection according to final policy`.

The reviewed official Architecture Baseline and Master Plan do not define the final command policy for this item beyond that placeholder. 05.05 does not invent a policy or reuse legacy behavior as Source of Truth.

Therefore:

- 05.05 can be closed on its own evidence.
- PHASE 05 / Gate 05 cannot be marked fully CLOSED while this policy item remains unresolved.
- Phase 06 must not start until Gate 05 is closed according to an approved final policy.

## Explicit exclusions

- no Phase 06 Counterparties implementation.
- no user/role administration commands beyond already closed 05.01–05.04.
- no invented last/System Admin policy.
- no Frontend Organization cutover.
- no Convex runtime Organization cutover.
- no dual write.
- no `main` merge.
- no Convex Production change.
- no new migration.
- no new index.

## Next action

Run Full CI on the 05.05 implementation SHA through a validation-only PR. Only after the same-SHA gates are green may 05.05 itself be documented as CLOSED.
