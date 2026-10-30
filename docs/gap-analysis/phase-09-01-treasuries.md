# Phase 09.01 — Treasuries Gap Analysis

**Status:** READY_FOR_IMPLEMENTATION  
**Authority:** Architecture Baseline v1.7; Master Implementation Plan v1.0, Phase 09.01.  
**Analysis baseline:** `agent/postgres-v1.7-core` @ `4ad52230ed13445b0806644519f7a9fee7402920`.  
**Safety:** Analysis/documentation only. No business code, API, PostgreSQL DDL, migration, or data change was made in this step.

## Required V1 behavior

Phase 09.01 requires:

- Treasury names are user-defined.
- Treasury name uniqueness is case-insensitive within the same branch.
- No mandatory treasury type exists.
- Cash / Bank / Wallet / InstaPay are ordinary treasuries named by the user, not enum-backed treasury types.
- Credit / Installment / Cheque are settlement modes, not treasuries.
- Treasury belongs to one branch.
- Current balance is not stored on the Treasury master row as a mutable source of truth. Financial Movements are the historical source of truth; `treasury_balance_positions` is a rebuildable operational projection handled in later Phase 09 steps.

## Current-state classification

### 1. PostgreSQL physical schema — EXISTING AND MOSTLY COMPLIANT

`database/migrations/0008_finance_settlement.sql` already defines:

```text
treasuries(
  id uuid,
  branch_id uuid,
  name text,
  is_active boolean,
  notes text,
  created_at timestamptz
)
```

This matches the v1.7 Treasury master shape:

- branch-owned: YES
- free user-defined name: YES
- mandatory treasury type: NO
- mutable balance column on Treasury master: NO
- active/inactive lifecycle field: YES

No Phase 09.01 schema migration is currently justified by the Treasury master shape itself.

### 2. Case-insensitive uniqueness — EXISTING AND COMPLIANT

The frozen Index Catalog migration already contains:

```sql
CREATE UNIQUE INDEX ux_treasuries__branch_id_lower_name
  ON public.treasuries (branch_id, lower(name));
```

Therefore the required case-insensitive uniqueness within a branch already exists at the database layer.

The existing active Treasury lookup index also matches the frozen catalog:

```sql
CREATE INDEX ix_treasuries__branch_id_id__where_is_active_true
  ON public.treasuries (branch_id, id)
  WHERE is_active = true;
```

Do not add another Treasury-name or branch index unless the Architecture Baseline is revised or measurement plus EXPLAIN ANALYZE proves a new requirement.

### 3. Referential integrity — EXISTING AND COMPLIANT FOR 09.01

`0018_finance_settlement_constraints.sql` already provides:

- Treasury primary key.
- `UNIQUE(id, branch_id)` to support composite branch-safe references.
- Treasury → Branch FK with `ON DELETE RESTRICT`.

Later finance documents already reference Treasury + Branch using composite FKs. That is consistent with branch ownership and prevents a document from silently using a Treasury belonging to another branch.

### 4. Central Backend Treasury capability — NOT IMPLEMENTED

The new Central Backend currently has infrastructure services through Organization, Counterparties, Products, Inventory, Idempotency, Posting Batch, Audit, Outbox, and related foundations.

There is currently no Treasury service/module/route in the new backend.

Missing Phase 09.01 application behavior therefore includes:

- create Treasury through the Central Backend.
- list/query Treasuries under effective Branch Scope.
- rename/update Treasury.
- activate/deactivate Treasury under the approved permission model.
- stable error mapping for duplicate case-insensitive names and invalid branch access.
- backend tests proving these rules against PostgreSQL.

This is the primary implementation gap for Phase 09.01.

### 5. Legacy Convex finance model — EXISTS BUT MUST NOT BE REUSED AS THE V1.7 TREASURY MODEL

The current Convex implementation uses `financialAccounts` with fields and behavior including:

- mandatory `type` enum such as cash, bank, instapay, clearing variants, etc.
- mandatory account `code`.
- `currentBalance` stored directly on the master record.
- `allowNegative`.
- settlement delay fields.
- opening-balance marker.
- uniqueness centered on a generated/code-based key rather than Treasury name semantics.

This conflicts with the approved v1.7 Treasury model in several important ways.

Classification: **EXISTING, MUST BE REPLACED FOR THE NEW CORE**, while remaining untouched until module cutover. It is legacy implementation/reference only and must not become a second write owner beside PostgreSQL.

### 6. Existing Treasury frontend — EXISTS BUT IS LEGACY-BOUND

`src/components/TreasuryPage.tsx` currently operates against the Convex finance model and exposes concepts such as:

- account code.
- mandatory account type.
- mutable current balance.
- available/pending balances.
- clearing account settlement behavior.
- opening balance from the same screen.

For Phase 09.01 this UI is **not** the source of truth and should not be cut over yet.

The approved product behavior should eventually present user-defined Treasuries without requiring a Treasury type. Opening balances, movements, transfers, clearing/settlement and derived balances belong to subsequent Phase 09 steps and must not be pulled forward into the 09.01 write owner.

## Gap summary

| Requirement | Current status | Classification |
| --- | --- | --- |
| Treasury table exists | Yes | Existing / compliant |
| Treasury belongs to Branch | Yes | Existing / compliant |
| User-defined name | Schema supports it | Existing / backend behavior missing |
| Case-insensitive unique name within Branch | Yes, frozen unique index | Existing / compliant |
| No mandatory Treasury type | PostgreSQL yes; legacy Convex no | New Core compliant, legacy must be replaced |
| Cash/Bank/Wallet/InstaPay as names, not types | Not implemented in new backend; legacy conflicts | Backend missing / legacy replace |
| Credit/Installment/Cheque are settlement modes | Schema separation exists elsewhere; legacy UI/model mixes account types and settlement concepts | Preserve v1.7 separation during implementation |
| Treasury current balance not mutable master data | PostgreSQL Treasury master complies; legacy Convex conflicts | New Core compliant, legacy replace |
| Central Backend Treasury CRUD/query commands | No | Must create |
| Branch Scope enforcement | Infrastructure exists, Treasury integration absent | Must integrate |
| Permission enforcement | Infrastructure exists, Treasury integration absent | Must integrate |
| PostgreSQL tests for 09.01 behavior | Physical schema/index tests exist; Treasury service behavior tests absent | Must add during implementation |
| Frontend cutover | Not started | Deferred to official cutover phase |

## Implementation boundary for the next step

The next implementation step should create the smallest canonical Treasury backend slice only.

Expected scope:

1. Add a Central Backend Treasury service/application boundary using the existing `treasuries` table.
2. Reuse existing authentication, effective-permission and branch-scope infrastructure.
3. Enforce trimmed non-empty names in the backend.
4. Let PostgreSQL remain the final authority for case-insensitive duplicate-name races through the frozen unique index.
5. Support create, list, update/rename and activate/deactivate behavior only to the extent required by the approved Treasury master lifecycle.
6. Do not add `type`, `code`, `current_balance`, `allow_negative`, settlement-delay fields, payment-method fields, or clearing semantics to `treasuries`.
7. Do not implement Financial Movements, balance-position mutation, Receipt, Disbursement, Transfer, Advance, Cheque, Installment, or GL posting inside 09.01.
8. Do not cut over the current Treasury frontend or Convex write owner during this step.
9. Do not add a migration or index unless implementation proves a genuine Baseline mismatch. Current analysis finds none.

## Required tests for 09.01 implementation

At minimum:

- create a Treasury with a free user-defined name.
- create without any Treasury type.
- reject empty/whitespace-only name at backend boundary.
- same name with different letter case in the same branch is rejected by PostgreSQL and mapped to a stable application error.
- same Treasury name in two different branches is allowed.
- Branch Scope blocks create/read/update outside the user's allowed branches.
- inactive/unauthorized branch behavior is rejected according to the existing Organization/Security rules.
- rename respects the same case-insensitive uniqueness rule.
- disabling a Treasury does not delete history.
- no test or implementation writes a balance onto the Treasury master row.

## Implementation and validation closure

Phase 09.01 implementation is complete within the approved Treasury-master boundary.

Implemented:
- Central Backend Treasury master service against the existing `treasuries` schema.
- create, list, update/rename, activate and deactivate lifecycle.
- Branch Scope and effective-permission enforcement.
- trimmed non-empty user-defined names.
- stable mapping of the frozen case-insensitive unique-name constraint.
- audit events for Treasury master changes.
- unit and PostgreSQL 17 integration coverage.

Explicitly not implemented in 09.01:
- Financial Movements or treasury balance-position mutation.
- Receipts, disbursements or treasury transfers.
- Advances, cheques, installments or GL posting.
- Treasury type/code/current-balance fields.
- schema migrations or new indexes.
- frontend/Convex cutover.

Implementation validation:
- validation PR: #245, validation-only, not for merge.
- validated code SHA: `ee778b532a3c5d7cb9147da492f095297ad48786`.
- GitHub Actions CI #1107 / run `36749615818`: **SUCCESS**.
- `verify`: SUCCESS.
- `backend-verify`: SUCCESS, including Phase 09.01 Treasury unit and PostgreSQL 17 integration tests.
- `browser-contract`: SUCCESS.
- `release-gate`: SUCCESS.
- dependency audit, backend typecheck, existing PostgreSQL regression gates and production validation gates completed successfully in the same run.

## Decision

**Phase 09.01 implementation and pre-closure validation are complete.**

Formal `CLOSED` status is recorded in the Master Implementation Plan only after the documentation commit itself passes the full CI on its own final SHA, preserving the rule that all gates must be green on the final phase commit.

**Next action:** Phase 09.02 Financial Movements — begin with Gap Analysis before any 09.02 business-code or database change.
