# Wave 0 — Architecture Baseline

**Status:** BASELINE CAPTURED  
**Observed branch:** `main`  
**Observed commit:** `5b77e8695a5d1d3d8de4dcec00c619110bdee214`  
**Observed tree:** `d819a1d1d50cab0dd999003305598da5613d3b55`  
**Scope:** documentation and reconciliation baseline only; no business behavior changes.

## 1. Purpose

This document freezes the architecture that actually exists before Wave 1. It is descriptive, not a target implementation. Where the current system and the target architecture differ, this file records the gap without changing runtime behavior.

The Wave 0 rule is: preserve verified business behavior, identify ownership of balances/ledgers, and build evidence that later refactors must reproduce.

## 2. Runtime topology on the observed `main`

```text
React / TypeScript UI
        |
        | Convex generated APIs + useQuery/useMutation
        v
Convex query/mutation modules
        |
        +-- authorization / branch checks
        +-- validation
        +-- application orchestration
        +-- domain calculations
        +-- persistence through ctx.db
        +-- audit side effects
        +-- GL / subledger / inventory / finance bridges
        v
Convex tables and indexes
```

There is not yet a formal Application Layer / Domain Core / Repository boundary. A Convex mutation is commonly the application transaction boundary.

## 3. Code structure and responsibilities

### UI

Primary UI lives under `src/`, with a large composition shell in `src/components/ERPApp.tsx`. Feature pages call Convex APIs directly. `src/i18n/` supplies Arabic/English and RTL/LTR support, including a compatibility DOM bridge.

### Shared rules

`shared/` contains the most reusable pure or mostly-pure business rules. Important Wave 0 assets include:

- `shared/inventoryRules.ts` — inventory valuation / MWA calculations.
- `shared/businessRules.ts` and `shared/moneyRules.ts` — validation, rounding and workflow/business helpers.
- `shared/businessDate.ts` — business-date behavior.
- purchase-return, supplier-payment and reporting rules.

These are knowledge assets. Wave 0 does not move or redesign them.

### Convex backend

`convex/` mixes API validation, authorization, orchestration and persistence. The main financial/inventory areas are:

- `convex/invoices.ts`, `convex/salesReturns.ts` — sales, COGS and returns.
- `convex/products.ts`, `convex/lib/inventory.ts` — product stock/value snapshots and inventory movements.
- `convex/customerLedger.ts`, `convex/lib/customerLedger.ts` — customer subledger and balance projection.
- `convex/supplierPayments.ts`, `convex/lib/supplierLedger.ts` — supplier subledger/payments and projection.
- `convex/finance.ts`, `convex/lib/finance.ts` — treasury transactions, account movements and current account balance.
- `convex/generalLedger.ts`, `convex/lib/generalLedger*.ts` — journal posting, reversals, bridges and GL projections.
- `convex/purchaseReturns.ts` plus purchase/receipt flows — purchase valuation and supplier effects.
- `convex/auditLogs.ts` and centralized logging helpers — audit evidence.

### Persistence

The current persistence model is Convex-only. Vendor IDs (`Id<"table">`), `ctx.db`, Convex validators/index names and Convex transaction semantics are present inside application paths.

## 4. Current financial transaction boundaries

The strongest current invariant is server ownership of sensitive calculations. Business operations generally run inside one Convex mutation, and the mutation writes multiple related records atomically.

Examples that must not change in Wave 0:

- Sales can write invoice state, inventory movement/snapshot, frozen historical COGS, customer ledger, finance records, GL and audit evidence.
- Customer ledger posting is idempotent, records deltas and before/after values, and updates a `customerBalances` projection.
- Supplier ledger posting is idempotent, records a delta and before/after balance, and updates `supplierBalances`.
- Finance posting creates a transaction header, appends `financialMovements`, updates `financialAccounts.currentBalance`, posts the GL bridge and writes audit evidence.
- Inventory stock changes calculate quantity/value/average cost, patch the product snapshot, then append an `inventoryMovements` record carrying before/after valuation snapshots.
- Reversals create compensating records; posted financial history is not corrected by deletion.

## 5. Current data model facts relevant to Wave 0

### Inventory

Current `products` records contain catalog data and mutable inventory projection fields together: `stock`, `costPrice`, `inventoryValue`, and optional `branchId`. `inventoryMovements` records the movement delta plus stock/value/average-cost before and after.

This is not the future Inventory V2 model. Wave 0 only documents and reconciles it.

### Customer accounting

Customer accounting currently contains three layers:

1. legacy master fields on `customers` (`balance`, `totalPurchases`),
2. `customerBalances` projection (`receivableBalance`, `advanceBalance`, `totalPurchases`),
3. `customerLedgerEntries` append-style operational history with deltas and before/after snapshots.

The customer-ledger helper explicitly treats legacy master values as opening-review inputs, not normal operating writes.

### Supplier accounting

Supplier accounting similarly contains legacy `suppliers.balance`, the `supplierBalances` projection, and `supplierLedgerEntries` history.

### Treasury

`financialTransactions` is the transaction header. `financialMovements` carries signed account deltas and before/after balances. `financialAccounts.currentBalance` is the mutable current-balance projection.

### General Ledger

GL uses `journalEntries` and `journalLines` for posted accounting history. Separate daily/account/period balance tables are read projections. Journal reversals are linked rather than deleting posted history.

### Documents

Invoices, returns, purchase receipts/returns, repairs, shipments and other documents contain operational totals and snapshots. They are source documents for posting, but they are not substitutes for the GL or subledger balances after posting.

## 6. Architecture strengths that are frozen as behavior

Wave 0 treats these as protected behavioral assets:

- Moving Weighted Average.
- Historical COGS frozen at posting.
- Historical return costing.
- Inventory value before/after evidence.
- Server-owned financial calculations.
- Idempotency keys/fingerprints on sensitive writes.
- Reversal lineage.
- Customer and supplier subledger semantics.
- Double-entry GL invariants.
- Finance movement history.
- Permission and branch-access checks.
- Business Date behavior.
- Audit concepts and correlation/document references.
- Migration/reconciliation discipline.

`KEEP BEHAVIOR` does not mean `KEEP IMPLEMENTATION` in later Waves.

## 7. Current architecture gaps recorded, not fixed, in Wave 0

1. No true Company/Tenant ownership boundary exists in the current schema.
2. Convex is coupled to application transactions and IDs.
3. Several balances have a ledger plus mutable projection plus legacy master field.
4. Inventory current state lives on `products`, while history lives in `inventoryMovements`.
5. Money is still represented broadly as JavaScript `number` with local rounding policies.
6. Audit logging and some operational side effects are coupled more tightly than the target architecture permits.
7. Workflow/status rules are distributed across schema, shared rules, backend and UI.
8. Source/regex guards remain common beside valuable behavioral integration tests.
9. Full browser execution is not yet a universal release gate.
10. Tax/ETA, Tenant/Company, PostgreSQL Shadow and Inventory V2 belong to later Waves and are explicitly out of scope here.

## 8. Test/evidence baseline

The verified merge evidence on the observed `main` records 1501/1501 tests passing, plus TypeScript, security, production build and release preflight. The repository currently contains significant behavioral suites including COGS/sales returns, customer ledger, supplier payments, finance, GL foundation/purchases, purchase receipts/returns, COD/delivery and repairs, as well as Playwright staging specifications.

Wave 0 will reuse their business expectations as evidence and will add technology-neutral golden reconciliation vectors without modifying production behavior.

## 9. Change freeze for this baseline

Until the Wave 0 Exit Report is accepted:

- no Application/Domain extraction,
- no PostgreSQL code or shadow writes,
- no Tenant/Company migration,
- no Inventory V2 migration,
- no Tax Engine or ETA implementation,
- no business-rule rewrite,
- no deletion of legacy balance fields.

Only documentation, read-only/replay reconciliation tooling, fixtures, tests and ADRs needed to establish the baseline are allowed.
