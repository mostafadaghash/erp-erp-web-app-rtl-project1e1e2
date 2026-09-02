# ADR-0001 — Wave 0 Scope and Current Authority

**Status:** Accepted  
**Date:** 2026-09-02  
**Decision scope:** Wave 0 only

## Context

The approved ERP strategy is an Evolutionary Refactor. The current repository on `main` is still the working legacy implementation and must be measured before any Domain/Application extraction or persistence migration.

Wave 0 exists to establish architecture and reconciliation evidence without changing business behavior.

The verified GitHub baseline used by this decision is:

- branch: `main`
- commit: `5b77e8695a5d1d3d8de4dcec00c619110bdee214`
- commit message: `Merge PR #162: sales order lifecycle and follow-up operations`

## Decision

1. **Convex remains the current production/application authority during Wave 0.**
2. Wave 0 may add only:
   - architecture/source-of-truth documentation,
   - read-only reconciliation/replay tooling,
   - deterministic fixtures,
   - behavioral/reconciliation tests,
   - ADRs and status/exit reports.
3. Wave 0 must not alter the business behavior of sales, purchases, inventory, ledgers, treasury, GL, permissions, audit, Business Date, reversals or idempotency.
4. Wave 0 must not start:
   - Wave 1 Domain/Application extraction,
   - Tenant/Company migration,
   - PostgreSQL or shadow writes,
   - Inventory V2,
   - Tax Engine,
   - ETA eInvoice/eReceipt,
   - Local Server or Cloud Sync work.
5. Legacy fields must not be removed or rewritten merely because a future target model is already approved.

## Consequences

- The baseline is descriptive; it records current coupling and legacy data ownership without correcting it.
- Future refactors must reproduce the protected behavioral evidence before old implementations can be retired.
- A Wave 0 PR can be reverted without requiring business-data migration.
- Wave 1 remains blocked until the Wave 0 Exit Report is accepted.

## Rejected alternatives

- Full Rewrite.
- Starting Repository/Domain extraction before current balances are reconciled.
- Introducing Company/Tenant or PostgreSQL as part of the baseline work.
- Treating future-state blueprints as proof of what the current code already does.
