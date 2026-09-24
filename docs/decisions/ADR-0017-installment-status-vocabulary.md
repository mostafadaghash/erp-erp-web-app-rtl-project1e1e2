# ADR-0017 — Installment Status Canonical Vocabulary

**Status:** ACCEPTED  
**Date:** 2026-09-13  
**Phase:** 03.06 — Constraints  
**Branch:** `agent/postgres-v1.7-core`

## Context

Phase 03.06 Gap Analysis identified an internal terminology conflict inside Architecture Baseline v1.7 for `installments.status`.

The architecture defines the installment lifecycle consistently in three normative/domain-oriented locations:

- §11 Finance Discovery / installment scheduling: `UPCOMING / DUE / PARTIAL / PAID / OVERDUE`.
- §25.13 Cheques / Installments Schema: `UPCOMING / DUE / PARTIAL / PAID / OVERDUE`.
- §27.10 Installment Settlement: `UPCOMING / DUE / PARTIAL / PAID / OVERDUE`.

However, §28.6 Index Catalog contains one partial-index predicate using:

- `PENDING / PARTIALLY_PAID / DUE / OVERDUE`.

This creates a direct vocabulary mismatch between the approved domain/schema/transaction model and one index predicate. A strict CHECK constraint cannot safely be authored until the canonical vocabulary is versioned.

## Decision

1. The canonical V1 vocabulary for `installments.status` is:

   - `UPCOMING`
   - `DUE`
   - `PARTIAL`
   - `PAID`
   - `OVERDUE`

2. `PENDING` is **not** a canonical installment status in V1.
3. `PARTIALLY_PAID` is **not** a canonical installment status in V1; the canonical value is `PARTIAL`.
4. The single conflicting §28.6 partial-index predicate is treated as a terminology defect in the Index Catalog line, not as a second domain model.
5. 03.06 may therefore implement the installment status CHECK only against the five canonical values above.
6. 03.07, when reached, must align the installments open-items partial-index predicate with the canonical vocabulary. Conceptually the open set is every non-`PAID` canonical state relevant to open installments: `UPCOMING`, `DUE`, `PARTIAL`, `OVERDUE`. The exact index DDL remains owned by 03.07 and is not created by this ADR.
7. This ADR resolves vocabulary only. It does not invent state-transition precedence where the baseline is silent. In particular, if a partially paid installment is also past due, the later Finance service implementation must use the approved lifecycle rules/tests to determine the resulting state; this ADR does not silently add a sixth combined status.
8. `paid_amount_projection` and `status` remain rebuildable projections from approved Financial Allocations; they do not become independent Sources of Truth.
9. No existing migration `0002`–`0011` is rewritten by this decision.
10. No 03.07 index is pulled forward into 03.06.

## Rationale

The decision follows the architecture's own repeated wording rather than guessing from current implementation code:

- the domain/discovery section uses `UPCOMING / DUE / PARTIAL / PAID / OVERDUE`;
- the physical schema section §25.13 uses the same five values;
- the transaction/locking section §27.10 again uses the same five values;
- only the later Index Catalog predicate uses `PENDING / PARTIALLY_PAID`.

Because the Index Catalog should index the approved domain model rather than redefine it, the repeated domain/schema/transaction vocabulary is authoritative for the status CHECK and later service behavior.

## Consequences

- Phase 03.06 is unblocked for the installment status CHECK.
- Future service code, tests, API contracts, seeds, migrations, and reporting must use only the five canonical status values unless a later explicitly versioned architecture decision changes them.
- Any legacy/imported value named `PENDING` or `PARTIALLY_PAID` must not be copied blindly into the new PostgreSQL Core. A later data-migration/reconciliation step must map legacy source semantics into the canonical lifecycle using due date, paid allocation state, and the approved business rules.
- The future 03.07 Index Catalog implementation must not reproduce the conflicting `PENDING` / `PARTIALLY_PAID` predicate literally.

## Verification contract for subsequent 03.06 work

Subsequent constraint migration/tests must prove:

- `installments.status` accepts exactly `UPCOMING`, `DUE`, `PARTIAL`, `PAID`, `OVERDUE`;
- `PENDING` is rejected as an installment status;
- `PARTIALLY_PAID` is rejected as an installment status;
- no index is introduced by 03.06 merely to enforce or query these values;
- existing Finance schema types/nullability from migration `0008` remain unchanged;
- no Convex Production, frontend cutover, dual write, or `main` merge occurs.

## Non-goals

ADR-0017 does not:

- create or modify PostgreSQL constraints;
- create an index;
- change installment payment/allocation behavior;
- define a new installment state machine beyond the canonical value set;
- migrate legacy data;
- start 03.07;
- change current Product Shell / Convex behavior;
- merge to `main` or change Convex Production.

## References

- Architecture Baseline v1.7 — Finance Discovery / installment status vocabulary.
- Architecture Baseline v1.7 — §25.13 Cheques / Installments Schema.
- Architecture Baseline v1.7 — §27.10 Installment Settlement.
- Architecture Baseline v1.7 — §28.6 Finance / Treasury / Ledgers / Advances / Cheques / Installments Index Catalog.
- `docs/gap-analysis/phase-03-06-constraints-gap-analysis.md`.
- Master Implementation Plan v1.0 — Phase 03.06 Constraints.
