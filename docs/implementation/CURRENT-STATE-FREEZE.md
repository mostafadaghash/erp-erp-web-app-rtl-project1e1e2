# Business Tech ERP — Current-State Freeze

**Phase:** PHASE 01 — New Branch & Current-State Capture  
**Freeze date:** 2026-09-11  
**Repository:** `mostafadaghash/erp-erp-web-app-rtl-project1e1e2`  
**Source branch:** `agent/local-server-edition`  
**Frozen source SHA:** `b6db4010953a3ecf96c8e8244c1fc5b5b8562516`  
**Target branch:** `agent/postgres-v1.7-core`  
**Validation PR:** `#183`  
**Architecture source of truth:** `Business-Tech-ERP-Architecture-Baseline-v1.7-Final.docx`  
**Execution source of truth:** `Business-Tech-ERP-Master-Implementation-Plan-v1.0.md`

---

## 1. Freeze purpose

This file records the implementation state before PostgreSQL v1.7 Core work begins. It is a regression and migration baseline, not an endorsement of legacy implementation choices.

No Business Schema DDL, new business backend, module cutover, main merge, or Convex Production mutation is part of this phase.

## 2. Branch and commit state

- The target branch `agent/postgres-v1.7-core` was created directly from the frozen source SHA.
- The frozen SHA resolves to commit: `Align reporting UI contract with executive dashboard permission`.
- The new branch was not created from `main`.
- No production deployment or production data change was performed.
- GitHub remote state is deterministic: the branch started from the exact frozen commit. A developer-machine working tree is not used as the source of this freeze.

## 3. Baseline and Phase 01 CI evidence

Baseline GitHub Actions run `33982265835` completed successfully for the frozen source SHA.

During Phase 01 validation, npm later reported a new high-severity advisory:

- package: `js-yaml`
- advisory: `GHSA-2883-xcg3-v3hh`
- vulnerable range: `>=4.0.0 <4.3.2`
- dependency chain: project → `eslint 9.37.0` → `js-yaml ^4.1.0` → locked `js-yaml 4.3.1`

The root cause was resolved with the minimum compatible dependency-tree change: `package-lock.json` now resolves `js-yaml` to patched version `4.3.2`. No `--force`, audit suppression, broad dependency upgrade, or direct `js-yaml` application dependency was introduced.

Validation commit `35463a7df5173302c4fa42b30c406407c312abaa` passed GitHub Actions run `34607422133` with all of the following successful on the same SHA:

- Dependency audit
- TypeScript typecheck
- Orders pagination guard
- Full tests
- Security check
- Production build
- Release candidate preflight
- Browser contract / Playwright discovery
- Release gate

The final Phase 01 documentation commit must also pass the same CI gate before closure becomes effective.

## 4. Current runtime and dependency snapshot

Current frontend/runtime stack includes:

- React `^19.0.0`
- React DOM `^19.0.0`
- TypeScript `~5.7.2`
- Vite `^6.2.0`
- Convex `^1.44.0`
- `@convex-dev/auth` `^0.0.95`
- Node-based test suite
- Playwright test tooling
- Existing release, security, migration, backup/restore, local-server and LAN scripts

Current package scripts still define the backend as:

`dev:backend = convex dev`

The frontend entry point creates `ConvexReactClient` from `VITE_CONVEX_URL` and wraps the application in `ConvexAuthProvider`.

Therefore the existing frontend shell is still directly coupled to Convex runtime and must be migrated module-by-module, not treated as already API-decoupled.

## 5. Current local-server infrastructure

The existing local Docker stack contains:

- PostgreSQL 17
- Self-hosted Convex backend
- Self-hosted Convex dashboard

The PostgreSQL service is currently persistence for Convex through `POSTGRES_URL`.

This is **not** the final v1.7 business persistence architecture. The target remains:

`React Frontend → Central Backend API → PostgreSQL Business Schema`

The existing Docker/local tooling is reusable where compatible, but the self-hosted Convex backend is transitional and must not become the final application backend.

## 6. Current repository structure — high-level classification

| Area | Current role | v1.7 treatment |
|---|---|---|
| `src/` | React/Vite product shell, pages, UI, i18n | **REUSE + REFACTOR** |
| `convex/` | current business backend, auth, data model, mutations/queries | **REFERENCE + REWRITE/CUTOVER**, then retire runtime dependency |
| `tests/` | business/regression/security/contract knowledge | **REUSE + ADAPT + EXPAND** |
| `scripts/` | release, migration, backup, local operation utilities | **REUSE where compatible + RETARGET** |
| `infra/local/` | PostgreSQL + Convex self-hosted topology | **REFACTOR/REPLACE backend service** |
| `docs/` | current operational/project documentation | **REUSE + add v1.7 implementation records** |
| `.github/workflows/` | CI and release gates | **REUSE + extend for PostgreSQL/database gates** |
| `migration/` | existing migration tooling/data packages | **REVIEW + ADAPT for final migration/reconciliation** |
| `artifacts/` | generated acceptance evidence | **REUSE** |

## 7. Reuse boundary

The migration strategy is:

**Greenfield Core + Existing Product Shell**

Keep and reuse when behavior is correct:

- React/Vite frontend shell
- UX/navigation decisions
- printing UI and acceptance knowledge
- i18n framework
- reporting presentation concepts
- workspace shell
- valid business rules captured by tests
- release/security/backup operational knowledge

Replace or rebuild cleanly according to Architecture Baseline v1.7:

- Convex business persistence
- physical PostgreSQL business schema
- central backend application layer
- posting engine
- inventory movement/projection model
- finance/accounting ledger core
- role/branch-access persistence and enforcement
- document numbering
- transaction/locking/idempotency infrastructure
- outbox/event persistence

## 8. Critical known reality gaps

1. PostgreSQL currently stores Convex persistence; there is no owned v1.7 physical business schema yet.
2. Frontend bootstrap directly depends on Convex client/auth.
3. Current backend ownership is Convex, so every future module cutover must enforce a single write owner.
4. Legacy inventory/accounting/document workflows cannot be assumed compliant merely because current tests pass.
5. Existing CI validates the legacy baseline; PostgreSQL-specific integrity, transaction, concurrency, accounting and rebuild tests still need to be added in later phases.
6. Existing local Docker topology must be changed before Convex runtime can be removed.
7. No random indexes or business DDL may be introduced before the relevant v1.7 schema phase.

## 9. Target project tree — frozen design

The target tree is defined in the approved Master Implementation Plan.

Important sequencing rule:

- PHASE 01 documents the target tree.
- PHASE 02 creates backend/toolchain scaffolding.
- PostgreSQL Business Schema and migrations start only in their designated subsequent phase.
- Empty/scaffold folders are not created early merely to make the repository look complete.

## 10. Safety state

Confirmed execution boundaries:

- `main` was not modified.
- Convex Cloud Production was not modified.
- Production data was not deleted or migrated.
- No local/cloud secret linking was introduced.
- No force push was used.
- No destructive migration was created.
- No dual-write path was introduced.

## 11. Phase 01 gate status

- [x] Target branch created from exact frozen SHA.
- [x] Frozen source commit verified.
- [x] Baseline CI evidence recorded from the exact source SHA.
- [x] Dependency/runtime state captured.
- [x] Current high-level directory classification captured.
- [x] Convex coupling and local infrastructure reality captured.
- [x] Target tree sequencing documented.
- [x] No Production changes.
- [x] Freeze report committed.
- [x] Security advisory root cause identified and patched with minimum compatible lockfile change.
- [x] PR CI successful on validation commit `35463a7df5173302c4fa42b30c406407c312abaa`.
- [ ] CI successful on this final Phase 01 documentation commit.

**Closure rule:** Phase 01 becomes `CLOSED` automatically when CI succeeds on this exact documentation commit. Until then it remains `VERIFYING`.

## 12. Next action

After the final documentation commit CI is green, update the official Master Implementation Plan with Phase 01 `CLOSED`, the final SHA, PR `#183`, test results, rollback note, and set the execution pointer to **PHASE 02 — Toolchain & Backend Scaffold**.

Do not create PostgreSQL Business DDL or start module cutover as part of Phase 01.
