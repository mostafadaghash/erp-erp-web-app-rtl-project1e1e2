# PRODUCT STATUS
## ERP Master Project — Execution Status

**Version:** 1.1  
**Last Updated:** 2026-09-02

## 1. Current GitHub baseline

- Repository: `mostafadaghash/erp-erp-web-app-rtl-project1e1e2`
- Branch: `main`
- Current verified `main` SHA at Wave 0 start: `5b77e8695a5d1d3d8de4dcec00c619110bdee214`
- Commit: `Merge PR #162: sales order lifecycle and follow-up operations`

Wave 0 work is currently in PR branches; therefore the verified `main` baseline above is intentionally unchanged until merges occur.

## 2. Official strategy

**Evolutionary Refactor — APPROVED**

Convex remains the current authority. No Wave 1+, PostgreSQL, Tenant/Company, Inventory V2, Tax or ETA implementation is authorized by the current PRs.

## 3. Active Wave

### Wave 0 — Architecture Baseline + Reconciliation

**Status: ACTIVE**

| Required output | Status | Current evidence |
|---|---|---|
| Architecture Baseline | CODE COMPLETE | PR #163 open |
| Source of Truth Matrix | CODE COMPLETE | PR #163 open |
| Accounting Reconciliation Pack | CODE COMPLETE | PR #164 open; current/staging execution still required |
| Inventory Reconciliation Pack | CODE COMPLETE | PR #164 open; current/staging execution still required |
| Golden Dataset | CODE COMPLETE | PR #165 open; exact-SHA CI still required |
| Golden Business Journey executable vectors | CODE COMPLETE | PR #165 open; exact-SHA CI still required |
| ADR set | CODE COMPLETE | PR #166 open |
| Wave 0 Exit Report | CODE COMPLETE | PR #166 open; Exit status remains BLOCKED until required evidence is complete |
| Repository PRODUCT_STATUS | CODE COMPLETE | PR #166 open |

## 4. Wave status overview

| Wave | Scope | Status |
|---|---|---|
| Wave 0 | Architecture Baseline + Reconciliation | ACTIVE |
| Wave 1 | Domain/Application boundaries while keeping Convex | NOT STARTED |
| Wave 2 | Tenant / Company | NOT STARTED |
| Wave 3 | PostgreSQL Shadow + Outbox + Replay + Reconciliation | NOT STARTED |
| Wave 4 | Inventory V2 | NOT STARTED |
| Wave 5 | Tax Engine | NOT STARTED |
| Wave 6 | ETA eInvoice / eReceipt | NOT STARTED |
| Wave 7 | Local Server Pilot if justified | NOT STARTED |
| Wave 8 | Cloud Sync / Remote Access | NOT STARTED |

## 5. Wave 0 decisions now documented

- GL source of truth: posted `journalEntries` + `journalLines`; balance tables are projections.
- Customer source of truth for ledger-covered activity: `customerLedgerEntries`; `customerBalances` is projection; legacy customer master balance is opening-review evidence only.
- Supplier source of truth for ledger-covered activity: `supplierLedgerEntries`; `supplierBalances` is projection; legacy supplier master balance is opening-review evidence only.
- Treasury balance history: `financialMovements`; `financialAccounts.currentBalance` is projection.
- Inventory: `inventoryMovements` own covered movement history, while current legacy snapshots remain on `products`; an approved opening boundary is required before replay.
- Historical sale/return cost is frozen from the original posting/document evidence and must never be replaced by current product cost.
- Audit is evidence, not a financial balance owner.
- Reconciliation is read-only and must fail closed on unexplained differences.

## 6. Golden Dataset status

The deterministic Wave 0 fixture now pins the following behavior:

```text
Opening: 10 @ 100 -> qty 10, value 1000, avg 100
Receipt: +10 @ 120 -> qty 20, value 2200, avg 110
Sale: -2 @ frozen 110 -> historical COGS 220
Later receipt: +2 @ 140 -> current avg 113
Sales return: +1 at original historical 110, not current 113
Ending: qty 21, value 2370, avg 112.8571
```

It also includes balanced GL, customer/supplier subledger replay and treasury movement replay. The executable test intentionally tampers with a projection and requires the checker to fail closed.

## 7. Wave 0 blockers

| Blocker | Status | Required evidence |
|---|---|---|
| Exact-SHA CI for Wave 0 PRs | BLOCKED | Required GitHub checks green on final candidate SHA |
| Current/staging accounting reconciliation | BLOCKED | Normalized Convex-authority snapshot; zero unexplained accounting differences |
| Current/staging inventory reconciliation | BLOCKED | Approved openings + movement replay; zero unexplained quantity/value/cost differences |
| Legacy exception inventory | BLOCKED | Explicit list/classification/owner for any missing opening or historical bridge |
| Accounting posting-map external sign-off, if retained as exit criterion | BLOCKED | Recorded Egyptian-accountant approval/evidence |

## 8. Explicit non-started work

The following remain `NOT STARTED`: Application/Domain extraction, Company/Tenant migration, PostgreSQL, Outbox, Inventory V2, Tax Engine, Egypt Tax Pack implementation, ETA adapters, Local Server and Cloud Sync.

## 9. Exit rule

Wave 0 is not `DONE` and not `ACCEPTED` merely because the files and PRs exist. It can become `ACCEPTED` only after the Exit Report blockers are closed with evidence.

Until then: **Wave 1 remains NOT STARTED.**
