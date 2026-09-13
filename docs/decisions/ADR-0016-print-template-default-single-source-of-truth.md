# ADR-0016 — Print Template Default Single Source of Truth

**Status:** ACCEPTED  
**Date:** 2026-09-13  
**Phase:** 03.05 / 03.J — Printing / Export / Reports Read Models  
**Branch:** `agent/postgres-v1.7-core`

## Context

Architecture Baseline v1.7 contains two related physical representations for branch print defaults:

- §25.4 `branch_settings` contains `default_sales_print_template_id` and `default_purchase_print_template_id`.
- §25.17 defines `branch_print_defaults(branch_id, document_type, print_template_id)` and states that each branch may choose a different default template per document type.

Both structures are therefore part of the approved v1.7 schema, but allowing application code to write them independently would create two competing Sources of Truth for Sales/Purchase print defaults. That would violate the project rule that one module/configuration concept must have one write owner during migration and would allow silent divergence between the two representations.

## Decision

1. `branch_print_defaults` is the canonical normalized configuration source for per-document-type print-template defaults once the new PostgreSQL printing/configuration service becomes the write owner.
2. The two existing `branch_settings` columns remain physically present because they are explicitly part of Architecture Baseline v1.7 and were already created in Phase 03.A:
   - `default_sales_print_template_id`
   - `default_purchase_print_template_id`
3. Those two columns must not become independent write sources after the PostgreSQL print-default service is introduced.
4. Until the print-default service/cutover is implemented, 03.J only creates the normalized storage relation. It does not introduce any dual-write path and does not change current frontend/Convex behavior.
5. Any future compatibility mirror between `branch_settings` and `branch_print_defaults` must be one-directional and transactionally maintained by the single backend owner, or the legacy shortcut fields must remain unused by the new Core. No client or separate service may update both independently.
6. The authoritative mapping for a document type is conceptually:
   - key: `(branch_id, document_type)`
   - value: `print_template_id`
7. Sales and Purchase defaults are therefore represented in the normalized map as their corresponding document types. The legacy `branch_settings` columns are compatibility fields only for the existing baseline shape, not a second business configuration authority.
8. 03.06 will add only the integrity rules authorized by v1.7. This ADR does not pull FK/UNIQUE/CHECK work forward.
9. 03.07 remains the only phase for project-owned indexes.

## Consequences

- The schema preserves every v1.7 field while preventing two independent writers for the same setting.
- The normalized model can support every document type required by the print-template catalog without adding more columns to `branch_settings`.
- Existing Product Shell behavior can remain unchanged until the dedicated printing/settings cutover phase.
- Migration/reconciliation of any legacy configured Sales/Purchase defaults must occur later as an explicit, testable migration/cutover step; it is not performed in 03.J.

## Verification contract

03.J schema verification must prove:

- `branch_print_defaults` exists with exactly `branch_id`, `document_type`, and `print_template_id` in the approved types/nullability;
- the existing `branch_settings.default_sales_print_template_id` and `branch_settings.default_purchase_print_template_id` columns remain untouched;
- no trigger, generated column, application command, or dual-write mechanism is introduced in 03.J;
- 03.06 constraints and 03.07 indexes remain deferred.

## Non-goals

This ADR does not:

- remove or rename the two `branch_settings` compatibility columns;
- migrate existing configured values;
- implement print-template CRUD or default-selection commands;
- modify frontend behavior;
- add dual write;
- start 03.06 or 03.07;
- merge to `main` or modify Convex Production.

## References

- Architecture Baseline v1.7 §25.4 — `branch_settings`.
- Architecture Baseline v1.7 §25.17 — `print_templates` / `branch_print_defaults`.
- Architecture Baseline v1.7 §26 — integrity constraints.
- Architecture Baseline v1.7 §28 — index catalog.
- ADR-0015 — Phase 03.J schema shape.
