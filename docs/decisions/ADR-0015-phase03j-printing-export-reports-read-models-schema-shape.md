# ADR-0015 — Phase 03.J Printing / Export / Reports Read Models Schema Shape

**Status:** ACCEPTED  
**Date:** 2026-09-13  
**Phase:** 03.05 / 03.J — Printing / Export / Reports Read Models  
**Branch:** `agent/postgres-v1.7-core`

## Context

Architecture Baseline v1.7 fixes the V1 printing/export behavior and the reporting/read-model schema in §17, §24.15, and §25.17. The Master Implementation Plan requires 03.J to create the final physical schema slice for Printing / Export / Reports Read Models before the general 03.06 Constraints pass and 03.07 Index Catalog pass.

The current Product Shell already contains useful printing, reporting, and CSV export UX. That legacy implementation remains a behavior/reference surface only. It does not define the PostgreSQL physical model and it does not authorize Convex collections, hard-coded React print layouts, or direct Convex report queries as the new Core source of truth.

03.J freezes only the PostgreSQL relation/column/type/nullability shape for the seven relations explicitly listed by the Master Implementation Plan. It does not implement the central Excel/PDF export engine, report refresh/rebuild jobs, print-template management commands, frontend cutover, or module write ownership changes.

## Decision

### 1. Canonical physical relations

03.J defines exactly these seven PostgreSQL relations:

- `print_templates`
- `branch_print_defaults`
- `reporting_daily_branch_metrics`
- `reporting_inventory_balances`
- `reporting_counterparty_balances`
- `reporting_treasury_balances`
- `reporting_followup_metrics`

No legacy aliases or duplicate relations are created.

The parsed RTL rendering of Architecture Baseline §25.17 can display the logical name as `templates_print`; this is a BiDi/text-extraction ordering artifact, not authorization for a second physical relation. Under ADR-0002 and the Master Implementation Plan execution catalog, the canonical physical relation is `print_templates`.

### 2. `print_templates`

Physical shape:

- `id uuid NOT NULL`
- `document_type text NOT NULL`
- `name text NOT NULL`
- `paper_size text NOT NULL`
- `template_code text NOT NULL`
- `template_config_json jsonb NOT NULL`
- `is_active boolean NOT NULL`
- `created_at timestamptz NOT NULL`

Semantics:

- `id` is the internal template identity.
- `paper_size` is constrained by the architecture to the V1 catalog values `A4`, `A3`, `THERMAL_80`, and `THERMAL_57`; the actual CHECK constraint is deferred to 03.06.
- QR visibility and other per-template rendering configuration belong in `template_config_json` exactly because §25.17 models them as template configuration rather than business entities.
- In accordance with ADR-0004, the configuration representation is `jsonb`; this does not authorize a GIN index.
- `document_type` identifies the document family for which the template is valid. The service/catalog layer implemented later decides which active templates are offered for each supported document type.
- No `updated_at` column is invented in 03.J because the approved §25.17 schema does not require one and the final Index Catalog does not require it.

03.J does not seed default template rows. Catalog/bootstrap data is a later implementation concern and must not silently create business behavior during schema-shape construction.

### 3. `branch_print_defaults`

Physical shape:

- `branch_id uuid NOT NULL`
- `document_type text NOT NULL`
- `print_template_id uuid NOT NULL`

Logical grain:

- one row per `(branch_id, document_type)`.

No surrogate `id` is added because the architecture explicitly models this relation by branch + document type. Architecture Baseline §26 requires uniqueness on `(branch_id, document_type)`; the PK/FK/UNIQUE implementation remains deferred to 03.06.

This relation stores configuration only. It does not duplicate template JSON or rendered document content.

### 4. `reporting_daily_branch_metrics`

Physical shape:

- `branch_id uuid NOT NULL`
- `date date NOT NULL`
- `sales_net numeric(18,4) NOT NULL`
- `sales_returns numeric(18,4) NOT NULL`
- `cogs numeric(18,4) NOT NULL`
- `gross_profit numeric(18,4) NOT NULL`
- `purchases_net numeric(18,4) NOT NULL`
- `expenses numeric(18,4) NOT NULL`
- `other_income numeric(18,4) NOT NULL`

Logical grain:

- one row per `(branch_id, date)`.

The `date` column is a PostgreSQL calendar `date`, not `timestamptz`, because this model is explicitly daily-grain reporting state. Monetary values follow ADR-0004 and use exact `numeric(18,4)`.

The row is an administrative Read Model only. It is rebuildable from source documents, ledgers, and movements and must never become the source of truth for Sales, Purchasing, COGS, Expenses, or Income.

### 5. `reporting_inventory_balances`

Physical shape:

- `branch_id uuid NOT NULL`
- `warehouse_id uuid NOT NULL`
- `variant_id uuid NOT NULL`
- `on_hand numeric(18,6) NOT NULL`
- `available numeric(18,6) NOT NULL`
- `weighted_cost numeric(18,4) NOT NULL`
- `inventory_value numeric(18,4) NOT NULL`

Logical grain:

- one row per `(branch_id, warehouse_id, variant_id)`.

`on_hand` and `available` are inventory quantities and therefore use `numeric(18,6)`. `weighted_cost` and `inventory_value` are monetary/cost values and use `numeric(18,4)`.

This table is a reporting projection for stock/capital analysis. It does not replace `inventory_movements`, `inventory_stock_positions`, batch/serial state, or the approved weighted-average cost state as authoritative operational/history sources.

### 6. `reporting_counterparty_balances`

Physical shape:

- `counterparty_id uuid NOT NULL`
- `customer_balance numeric(18,4) NOT NULL`
- `supplier_balance numeric(18,4) NOT NULL`
- `net_balance numeric(18,4) NOT NULL`
- `updated_at timestamptz NOT NULL`

Logical grain:

- one row per `counterparty_id`.

This is a rebuildable net-account projection. Customer and supplier ledger entries remain the historical sources of truth. The projection must not be manually edited as an independent balance.

### 7. `reporting_treasury_balances`

Physical shape:

- `treasury_id uuid NOT NULL`
- `balance numeric(18,4) NOT NULL`
- `updated_at timestamptz NOT NULL`

Logical grain:

- one row per `treasury_id`.

This is a reporting projection. `financial_movements` remain the historical source of truth; approved treasury operational positions remain the synchronous lock/projection mechanism. This read model does not become a second writable treasury balance.

### 8. `reporting_followup_metrics`

Physical shape:

- `branch_id uuid NOT NULL`
- `date date NOT NULL`
- `source_type text NOT NULL`
- `created_count bigint NOT NULL`
- `completed_count bigint NOT NULL`
- `overdue_count bigint NOT NULL`

Logical grain:

- one row per `(branch_id, date, source_type)`.

The architecture specifies counts but does not prescribe a scalar width. 03.J chooses PostgreSQL `bigint` for aggregate counters so the physical model does not impose a low ceiling on cumulative/reporting counts. This is a storage-width decision only and does not alter follow-up business semantics.

The projection is rebuildable from `customer_followups`, follow-up history/actions, and their original source references. It is not a task source of truth.

### 9. Read-model invariants and rebuildability

All five `reporting_*` relations are cached/rebuildable projections, never historical Sources of Truth.

The later reporting implementation must preserve these architecture rules:

- source documents, ledgers, and movements remain authoritative;
- every important KPI supports drill-down to the source documents/movements that formed it, within the user's effective permissions and branch scope;
- rebuilding a projection from authoritative history must reproduce the same result;
- branch scope, reporting period, language, and cost/profit visibility permissions are applied by the backend/reporting layer;
- no report projection is manually edited as an independent business balance.

03.J only supplies physical storage shape. Refresh/rebuild/reconciliation mechanics are implemented in later Reporting/Read Models work.

### 10. Printing and export behavior is not additional schema

Architecture Baseline v1.7 requires:

- a central export framework for Excel + PDF;
- export of the current filtered result only;
- permission-based columns in a fixed V1 dataset order;
- RTL/LTR, locale, and branch-scope enforcement;
- print preview before the operating-system print dialog;
- direct PDF save;
- an active template catalog supporting A4, A3, Thermal 80mm, and Thermal 57mm;
- per-branch default print templates;
- ordinary reprint without a special reprint permission, while template administration has separate authorization.

Those are backend/application behaviors. No `export_jobs`, `report_exports`, rendered-document snapshot, or other extra table is introduced by 03.J because neither Architecture Baseline v1.7 nor the Master Implementation Plan authorizes one in this schema slice.

The existing React printing layouts and Convex reporting/export paths may be reused or refactored later only where their behavior matches the approved architecture. They do not change the seven-relation PostgreSQL contract above.

### 11. Data-type policy

ADR-0004 remains authoritative:

- internal identities/references use `uuid`;
- money/cost/balance values use `numeric(18,4)`;
- inventory quantities use `numeric(18,6)`;
- instant timestamps use `timestamptz`;
- allowed configuration JSON uses `jsonb`;
- JavaScript floating-point values are not authoritative persistence representations for money, cost, balance, or quantity.

For daily read-model grains, PostgreSQL `date` is used because the value represents a business calendar day rather than an instant.

### 12. Constraints remain deferred to 03.06

03.J intentionally does **not** add project-owned PK, FK, UNIQUE, CHECK, delete-policy, or composite-context constraints.

03.06 remains responsible for, among other approved integrity rules:

- primary/composite keys for the seven relations;
- FKs from print defaults to branches/templates and from reporting dimensions to their canonical entities where required by v1.7;
- `UNIQUE (branch_id, document_type)` for `branch_print_defaults`;
- the approved `paper_size` value constraint;
- exact read-model grain uniqueness/protection;
- any non-negative or domain checks explicitly justified by the approved architecture.

No 03.06 work is pulled forward into this decision.

### 13. Indexes remain deferred to 03.07

03.J adds no project-owned index.

Architecture Baseline §28.8 explicitly requires read-model indexes to follow the real grain and actual drill-down/filter query patterns rather than receiving speculative indexes. The final 03.07 pass must apply only the closed Index Catalog and any read-model index decision supported by the approved grain/query evidence; any later index outside that catalog requires measurement and `EXPLAIN (ANALYZE, BUFFERS)` evidence.

`jsonb` template configuration does not receive an automatic GIN index.

### 14. Explicit non-goals

ADR-0015 does not authorize or implement:

- Migration `0011` itself;
- any table, column, or relation beyond the seven listed here;
- seed/default template data;
- Excel/PDF generation code;
- report rebuild workers or reconciliation jobs;
- print-template CRUD/services;
- frontend changes or module cutover;
- Convex data migration;
- dual write between Convex and PostgreSQL;
- 03.06 constraints;
- 03.07 indexes;
- merge to `main`;
- Convex Production changes.

## Verification required for the subsequent 03.J migration

The PostgreSQL 17 integration gate for Migration `0011` must prove, on one final commit:

- exactly the seven canonical 03.J relations exist;
- no `templates_print` alias or duplicate print-template relation exists;
- exact column names, order, PostgreSQL types, and nullability match ADR-0015;
- `template_config_json` is `jsonb` and remains configuration-only;
- daily grains use PostgreSQL `date`;
- money/cost/balance fields use `numeric(18,4)`;
- inventory quantity fields use `numeric(18,6)`;
- follow-up aggregate counters use `bigint`;
- no 03.06 project-owned PK/FK/UNIQUE/CHECK constraints have been pulled forward;
- no 03.07 project-owned indexes have been pulled forward;
- migration history records `0011` with checksum, reruns idempotently, and passes verify-only mode;
- all prior schema regressions through Migration `0010` remain green;
- no Business Module cutover, dual write, `main` merge, or Convex Production change occurs.

## References

- Architecture Baseline v1.7 — §17 Printing / Export.
- Architecture Baseline v1.7 — §24.15 Reports / Dashboards Read Models.
- Architecture Baseline v1.7 — §25.17 Printing / Export / Reports Read Models.
- Architecture Baseline v1.7 — §26.6 mandatory uniqueness including `branch_print_defaults(branch_id, document_type)`.
- Architecture Baseline v1.7 — §28.8 Search / Read Models / Performance Verification and §28.9 closed Index Catalog.
- ADR-0002 — PostgreSQL Physical Naming Convention.
- ADR-0004 — PostgreSQL Data Types Baseline.
- Master Implementation Plan v1.0 — Phase 03.05 / 03.J.
