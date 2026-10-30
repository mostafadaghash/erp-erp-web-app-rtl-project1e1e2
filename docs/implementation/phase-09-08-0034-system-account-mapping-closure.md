# Phase 09.08 / Slice 0034 — GL System Account Mapping Integrity

**Status:** 0034 CLOSED — full implementation + documentation CI validated; final status-commit CI required  
**Date:** 2026-10-30  
**Implementation baseline SHA:** `dec47e237e9e470f673b0d9a7c88fc360ffd7aee`  
**Verified implementation HEAD:** `b9a140c48e26be9d0417b90504749140761b5569`  
**Full CI:** [#1297](https://github.com/mostafadaghash/erp-erp-web-app-rtl-project1e1e2/actions/runs/41095299470) implementation and [#1298](https://github.com/mostafadaghash/erp-erp-web-app-rtl-project1e1e2/actions/runs/41096103880) documentation, all four jobs SUCCESS.  
**Validation PR:** #258, validation-only, do not merge, close only after final documentation SHA passes Full CI.

## Scope and artifacts

This is **only** the forward-only `0034_gl_system_account_mapping_integrity` slice under accepted ADR-0027. The code changes:

- Add `database/migrations/0034_gl_system_account_mapping_integrity.sql` and matching `.meta.json` with `transactional: true`, explicit fail-closed historical `preconditionSql`, postcondition `verificationSql` and forward-correction recovery contract.
- Add `system_account_mappings` containing Company, COMPANY/TREASURY Scope, internal Role, GL Account, audit actor and timestamp; primary key and mandatory role/account uniqueness constraint.
- Validate Scope→Company/Treasury→Branch→Company and Account→Company, active-leaf target, format and Treasury role; refuse duplicate target GL for two distinct Treasuries in one Company.
- Guard mapped GL Accounts against deactivation, cross-Company reassignment and becoming summary parents. Guard GL hierarchy cycles/cross-Company parentage, mapped Treasury reassign/deactivation/deletion and Branch Company reassignment.
- Preserve the frozen legacy Accounting tables and existing Index Catalog; no speculative performance index. New table's PK and UNIQUE backing indexes exist only for mandatory integrity.
- Keep the pre-`0034` read-only baseline preflight compatible with a code repository that now contains a pending `0034`; check original 33 applied migrations and their checksums rather than incorrectly requiring all source migrations to be applied.
- Align legacy PostgreSQL 17 test cleanup/order and migration-tail assertions without altering their historical schema or accounting behavior assertions.
- Integrate `server/tests/postgresql-gl-system-account-mapping.integration.test.mjs` into CI.

**Explicitly excluded:** No Journal Backend Writer, no business event Posting Rules (09.09), no 0035 Journal context/reversal migration, no frontend/Convex cutover, no `main` merge, no Convex Production or populated target database changes.

## Executed verification

On implementation SHA `b9a140c48e26be9d0417b90504749140761b5569`, Full CI #1297 / run `41095299470` passed:

| Gate | Result |
| --- | --- |
| `verify` | SUCCESS |
| `backend-verify` | SUCCESS |
| `browser-contract` | SUCCESS |
| `release-gate` | SUCCESS |
| PostgreSQL 17 mapping structural/positive/negative checks | SUCCESS |
| Duplicate mapping PK and distinct Treasury GL UNIQUE | SUCCESS |
| Company/Treasury/GL scope and hierarchy protection | SUCCESS |
| Concurrency: mapping versus GL deactivation and Treasury changes | SUCCESS |
| Dirty historical GL parent precondition and atomic migration abort | SUCCESS |
| Pre-`0034` PostgreSQL 17 read-only migration readiness test | SUCCESS |
| Existing PostgreSQL Accounting/Inventory/Finance schema and index regressions | SUCCESS |

**Audit of temporary failures:** Early CI runs failed because isolated test cleanups referenced GL Accounts before dropping the new dependent Mapping table, legacy tests hard-coded `0033` as migration tail, and one new uniqueness fixture collided with the primary key before testing the intended separate UNIQUE constraint. These were corrected, then the final implementation SHA passed Full CI. No production defect was inferred from those test failures.

## Actual database coverage and recovery

The PostgreSQL database used for validation is the **temporary CI test database only**. No populated local, staging or Production PostgreSQL database has been inspected or migrated in this slice; a real target must independently pass the read-only baseline preflight at `0033` and confirm a valid backup/recovery point before applying `0034`. All applied migrations remain checksum-immutable. No destructive rollback is permitted; after a committed migration, subsequent corrections require a new forward migration.

## Closure gate

- [x] ADR-0027 accepted and Gap Analysis completed.
- [x] New `0034` SQL + metadata created with atomic/fail-closed preconditions and verification.
- [x] Legacy and new PostgreSQL 17 tests aligned and passing.
- [x] Full CI #1297 SUCCESS on `b9a140c48e26be9d0417b90504749140761b5569`.
- [x] Documentation SHA `5302317adf9f054185e95b9b3879be96f74b3b51` passed Full CI #1298 / run `41096103880`.
- [ ] Final closure-status SHA Full CI pending (required before PR #258 closure).
- [ ] Validation PR #258 closed without Merge.
- [ ] No populated target DB migration claimed (separately gated, not a blocker for development-code closure).

**Next Action after final closure:** bounded **09.08 Journal context, historical immutability and reversal integrity design/gap review only**, considering the previously proposed `0035` slice. Do not start Journal Writer or 09.09 Posting Rules in this `0034` closure.
