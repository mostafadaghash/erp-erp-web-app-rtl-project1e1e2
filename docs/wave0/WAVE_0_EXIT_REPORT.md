# Wave 0 — Exit Report

**Report date:** 2026-09-02  
**Wave:** 0 — Architecture Baseline + Reconciliation  
**Overall exit status:** **BLOCKED — NOT ACCEPTED YET**  
**Wave 1:** **MUST NOT START**

## 1. Verified baseline

GitHub `main` was checked directly before Wave 0 work began.

- Repository: `mostafadaghash/erp-erp-web-app-rtl-project1e1e2`
- Branch: `main`
- Verified commit: `5b77e8695a5d1d3d8de4dcec00c619110bdee214`
- Commit: `Merge PR #162: sales order lifecycle and follow-up operations`

The Wave 0 artifacts are deliberately additive. No production business path, schema or persisted business data is changed by these PRs.

## 2. Required output status

| Required output | Evidence | Status |
|---|---|---|
| Architecture Baseline | `docs/wave0/ARCHITECTURE_BASELINE.md` — PR #163 | CODE COMPLETE / PR OPEN |
| Source of Truth Matrix | `docs/wave0/SOURCE_OF_TRUTH_MATRIX.md` — PR #163 | CODE COMPLETE / PR OPEN |
| Accounting Reconciliation Pack | `docs/wave0/ACCOUNTING_RECONCILIATION_PACK.md` + normalized replay runner — PR #164 | CODE COMPLETE / PR OPEN; LIVE RUN PENDING |
| Inventory Reconciliation Pack | `docs/wave0/INVENTORY_RECONCILIATION_PACK.md` + normalized replay runner — PR #164 | CODE COMPLETE / PR OPEN; LIVE RUN PENDING |
| Golden Dataset | `tests/fixtures/wave0-golden-snapshot.json` — PR #165 | CODE COMPLETE / PR OPEN; CI PENDING |
| Golden Business Journey executable vectors | manifest + `tests/wave0GoldenReconciliation.test.ts` + existing integration test mappings — PR #165 | CODE COMPLETE / PR OPEN; CI PENDING |
| ADR set | ADR-0001 through ADR-0004 — PR #166 | CODE COMPLETE / PR OPEN |
| Wave 0 Exit Report | this document — PR #166 | CODE COMPLETE / PR OPEN |
| PRODUCT_STATUS update | repository `PRODUCT_STATUS.md` — PR #166 | CODE COMPLETE / PR OPEN |

`CODE COMPLETE` here never means merged, staging verified, production verified or accepted.

## 3. Protected behavior check

The Wave 0 changes do not intentionally modify:

- Moving Weighted Average,
- historical COGS,
- historical sales-return costing,
- inventory valuation,
- idempotency,
- reversals,
- customer/supplier ledgers,
- GL posting behavior,
- treasury behavior,
- server-owned financial calculations,
- permissions/branch checks,
- audit concepts,
- Business Date.

The reconciliation runner is a standalone read-only JSON tool and is not imported by production business code.

## 4. Exit criteria already established

Wave 0 now has explicit controls for:

- one canonical owner per GL/subledger/treasury balance,
- the legacy inventory opening/replay constraint,
- GL debits = credits,
- customer/supplier balance replay,
- financial-account movement replay,
- inventory quantity/value/MWA replay,
- frozen historical sale and return cost,
- difference classification and fail-closed reporting,
- deterministic Golden Dataset and journey vectors.

## 5. Blocking evidence still required

Wave 0 is **not accepted** until all of the following are true:

### B-01 — PR integration and exact-SHA CI

PRs #163, #164, #165 and #166 must be merged through the normal gate, and the final candidate SHA must pass the repository-required CI. A locally inferred result is not sufficient.

### B-02 — Current/staging accounting reconciliation

A normalized snapshot/export from the current Convex authority must be run through the Accounting Reconciliation Pack. Required result:

```text
UNEXPLAINED accounting differences = 0
```

Legacy exceptions may remain only when individually classified and owned; they must not be hidden inside the zero-difference total.

### B-03 — Current/staging inventory reconciliation

A normalized inventory snapshot/export must establish approved opening boundaries and replay covered movements. Required result:

```text
UNEXPLAINED quantity/value/cost differences = 0
```

Products lacking enough history must be enumerated as `LEGACY_OPENING_REQUIRED`; Wave 0 does not manufacture production movements to repair them.

### B-04 — Posting-map accounting sign-off

The approved Posting Matrix is the engineering basis, but no evidence in this Wave 0 repository work proves external Egyptian-accountant sign-off. If that sign-off remains an exit requirement, it must be attached/recorded before Wave 0 is accepted.

## 6. Known non-blocking deferrals by design

These are intentionally **not** Wave 0 exit work and must not be pulled forward:

- Domain/Application extraction — Wave 1,
- Tenant/Company — Wave 2,
- PostgreSQL Shadow / Outbox / Replay — Wave 3,
- Inventory V2 — Wave 4,
- Tax Engine — Wave 5,
- ETA eInvoice/eReceipt — Wave 6,
- Local Server pilot — Wave 7,
- Cloud Sync / Remote Access — Wave 8.

## 7. Decision

**Wave 0 remains ACTIVE and BLOCKED ON EXIT EVIDENCE.**

The architecture baseline and executable reconciliation foundation are now prepared in small PRs, but the Wave cannot be marked `DONE` or `ACCEPTED` until exact-SHA CI and real current/staging reconciliation evidence are complete. Wave 1 must remain `NOT STARTED`.
