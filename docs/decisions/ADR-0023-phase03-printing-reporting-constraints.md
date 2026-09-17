# ADR-0023 — Phase 03.06 Printing / Export / Reporting Read Models Constraint Boundary

**Status:** ACCEPTED  
**Date:** 2026-09-17  
**Phase:** 03.06 — Constraints  
**Authority:** Architecture Baseline v1.7 §§17, 25.17, 26 plus ADR-0016 and the Phase 03.06 Gap Analysis

## Context

Migration `0011_printing_export_reports_read_models` froze the V1 physical shape for print templates, normalized branch print defaults, and five rebuildable reporting projections. ADR-0016 already establishes `branch_print_defaults` as the canonical normalized print-default source once the PostgreSQL printing/configuration service becomes the single write owner. The two `branch_settings` print-template columns remain compatibility fields only.

Phase 03.06 must add integrity without turning reporting projections into Sources of Truth and without pulling query/performance indexes from the closed Phase 03.07 Index Catalog.

## Decision

Migration `0021_printing_export_reporting_read_models_constraints` will:

- use `print_templates(id)` as the template identity;
- restrict `paper_size` to `A4 | A3 | THERMAL_80 | THERMAL_57`;
- use `(branch_id, document_type)` as the canonical `branch_print_defaults` grain;
- reference the canonical Branch and PrintTemplate from `branch_print_defaults`;
- keep `branch_settings.default_sales_print_template_id` and `default_purchase_print_template_id` as optional compatibility references only, with `ON DELETE SET NULL`; they do not become independent write authorities;
- protect the reporting grains:
  - `reporting_daily_branch_metrics(branch_id, date)`;
  - `reporting_inventory_balances(branch_id, warehouse_id, variant_id)`;
  - `reporting_counterparty_balances(counterparty_id)`;
  - `reporting_treasury_balances(treasury_id)`;
  - `reporting_followup_metrics(branch_id, date, source_type)`;
- enforce canonical dimension FKs for Branch, Warehouse+Branch, Variant, Counterparty and Treasury;
- use cascading deletion only for rebuildable read-model/config children, never for historical ledgers or business documents;
- require Follow-Up metric counts to be non-negative.

## Deliberate non-decisions

- No closed vocabulary is invented for print `document_type` or reporting `source_type` because Baseline v1.7 does not close those technical value sets in this slice.
- No blanket non-negative rule is applied to reporting monetary/balance/profit fields. Read-model balances, profit, stock and inventory value may legitimately be signed depending on the underlying canonical movements and policies.
- No `export_jobs`, export-history table or export queue is created. The approved V1 Export Engine is a later service/framework responsibility, not a missing physical business table in §25.17.
- No query/search/performance index is created in this migration. PK/UNIQUE backing indexes are constraint-owned and are not Phase 03.07 work.
- This slice does not implement print-template CRUD, PDF/Excel rendering, permission-based export columns, RTL/LTR rendering, preview/Windows print dialogs, projection rebuild workers, dashboard queries, or frontend cutover.

## Consequences

- A branch has at most one normalized default template per document type.
- Invalid print paper sizes are rejected by PostgreSQL.
- Read-model duplicate grains and invalid dimension references are rejected while the projections remain fully rebuildable.
- Branch/Warehouse mismatch cannot enter `reporting_inventory_balances`.
- Legacy branch-setting template shortcuts cannot reference deleted templates and are nulled safely if a compatibility-only template reference disappears.
- Phase 03.07 can add only the cataloged non-redundant performance indexes and must not duplicate constraint-owned indexes.

## Verification contract

PostgreSQL 17 behavioral integration must prove paper-size enforcement, print-default grain/FKs, compatibility `SET NULL`, reporting grain uniqueness, Branch+Warehouse context, dimension FKs, non-negative Follow-Up counts, legitimate signed projection values, absence of unapproved Export tables, absence of independent pre-03.07 indexes, migration checksum/idempotent rerun/verify-only behavior, and preservation of ADR-0016 single-write-authority semantics.
