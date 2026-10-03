# ADR-0002 — PostgreSQL Physical Naming Convention

**Status:** ACCEPTED  
**Date:** 2026-09-11  
**Phase:** 03.01 — Physical Naming Convention  
**Branch:** `agent/postgres-v1.7-core`

## Context

Phase 03 converts Architecture Baseline v1.7 sections §25–§28 into executable PostgreSQL Physical Schema and migrations. Before extensions, data types, migration structure, or Business DDL are created, the physical naming contract must be frozen so later migrations do not create parallel aliases, mixed identifier styles, or unstable technical object names.

Architecture Baseline v1.7 remains authoritative for Domain/Database/Integrity/Transactions/Indexes. The Master Implementation Plan defines the execution sequence and explicitly requires in 03.01:

- `snake_case` physical names;
- UUID internal primary keys;
- deterministic technical constraint names;
- physical table names to follow the canonical catalog names where the baseline has a final name;
- no duplicate aliases for the same Domain Entity.

This ADR only closes the physical naming convention. It does **not** authorize PostgreSQL extensions, type decisions, migration files, Business tables, indexes, triggers, or module cutover.

## Decision

### 1. General identifier format

All project-owned PostgreSQL identifiers use lowercase ASCII `snake_case` and are created unquoted.

This applies to:

- tables;
- columns;
- views;
- constraints;
- indexes;
- triggers;
- project-owned database functions when introduced by an approved later phase.

Rules:

- no camelCase or PascalCase physical identifiers;
- no quoted mixed-case identifiers;
- no `tbl_`, `table_`, `t_`, or similar technical table prefixes;
- no environment, branch, customer, or deployment name embedded in schema object names;
- abbreviations are only used where they are already canonical in v1.7 (for example `gl_accounts`, `vat`-related names where explicitly defined).

### 2. Canonical table and view names

A Domain Entity has one physical relation name only.

Resolution order for a physical relation name is:

1. the final relation name explicitly established in Architecture Baseline v1.7 §28 when present;
2. otherwise the canonical name established by the approved v1.7 Database Schema Plan (§25);
3. the Phase 03 schema-build catalog in the Master Implementation Plan may be used as the execution catalog only when it does not conflict with v1.7;
4. if a relation name remains genuinely ambiguous, DDL for that relation is blocked until a versioned architecture decision resolves it. A second alias must not be created.

Examples of canonical physical names used by Phase 03 include:

- `counterparties`;
- `counterparty_roles`;
- `customer_profiles`;
- `supplier_profiles`;
- `product_variants`;
- `product_units`;
- `posting_batches`;
- `financial_allocations`;
- `installment_plans`;
- `repair_orders`;
- `inventory_stock_positions`;
- `treasury_balance_positions`.

Rendered RTL labels or historical implementation names are not authorization to create a second table for the same entity. For example, when the canonical catalog resolves the relation as `counterparty_roles`, no parallel `roles_counterparty` table or compatibility alias is created.

Approved helper views keep their canonical v1.7 names, including `sales_returnable_quantities_v` and `purchase_returnable_quantities_v` when those views are implemented in their planned phase.

### 3. Column names

Columns use lowercase `snake_case` and follow the field names defined by the v1.7 schema contract.

Foreign-key columns use the canonical `<referenced_entity>_id` form where the baseline defines that relationship, for example:

- `branch_id`;
- `warehouse_id`;
- `counterparty_id`;
- `variant_id`;
- `posting_batch_id`.

Polymorphic/source-reference fields keep the explicit canonical names defined by the baseline, such as `source_type` and `source_id`; they are not renamed merely to fit a generic FK pattern.

Business-visible numbers are not renamed to `id` and are never treated as internal identifiers. Examples include `document_number`, `serial_number`, `batch_number`, and similar business keys defined by v1.7.

### 4. Primary-key naming and UUID rule

Entity surrogate keys use an internal UUID column named `id` where the canonical v1.7 table model defines an entity identity row.

Business-visible numbers must never be used as relational primary keys.

This rule does not override canonical key-only profile/projection/lock-row designs that v1.7 explicitly defines around their parent/business grain. Examples include:

- `branch_settings(branch_id)`;
- `customer_profiles(counterparty_id)`;
- `supplier_profiles(counterparty_id)`;
- `treasury_balance_positions(treasury_id)`;
- `inventory_stock_positions(warehouse_id, variant_id)`.

For those tables, the approved grain/key in v1.7 remains authoritative; 03.01 does not invent an unnecessary surrogate `id` column.

### 5. Deterministic technical constraint names

All project-owned constraints are named explicitly. Migrations must not depend on PostgreSQL-generated constraint names.

Naming patterns:

- Primary key: `pk_<table>`
- Unique constraint: `uq_<table>__<ordered_columns_or_semantic_key>`
- Foreign key: `fk_<table>__<local_columns>__<referenced_table>`
- Check constraint: `ck_<table>__<semantic_rule>`
- Exclusion constraint, if ever approved: `ex_<table>__<semantic_rule>`
- Deferred constraint trigger: `ct_<table>__<semantic_rule>`

Examples:

- `pk_companies`
- `uq_branches__company_id_code`
- `fk_warehouses__branch_id__branches`
- `ck_journal_lines__debit_credit_non_negative`
- `uq_inventory_stock_positions__warehouse_id_variant_id`
- `ct_journal_entries__balanced_at_commit`

For multi-column constraints, column order in the technical name follows the actual ordered constraint definition. A semantic suffix is used only where a raw column list would not identify the rule clearly.

### 6. Deterministic index and trigger names

Although the actual Index Catalog is implemented later exactly as v1.7 §28 requires, its technical object names follow the same deterministic policy:

- normal B-tree or implementation-neutral index: `ix_<table>__<columns_or_purpose>`;
- unique index: `ux_<table>__<columns_or_purpose>`;
- GIN index: `gin_<table>__<column_or_purpose>`;
- ordinary trigger: `trg_<table>__<purpose>`.

These names do **not** authorize any index outside the closed v1.7 Index Catalog. A deterministic name is not permission to add an index.

### 7. Identifier-length rule

PostgreSQL identifiers must never rely on silent server-side truncation.

When the full deterministic technical name would exceed PostgreSQL's identifier limit, the migration must shorten the descriptive middle portion and append a stable lowercase hash suffix derived from the complete logical name. The shortening must be reproducible for the same logical object and collision-checked within the migration.

The canonical table/column name itself must not be shortened merely for convenience. This shortening rule is for long technical names such as constraints, indexes, or triggers.

### 8. No alias / duplicate-entity rule

The following are prohibited:

- two physical tables representing the same v1.7 entity;
- a legacy-name table plus a canonical-name table for the same entity;
- compatibility views that pretend two different physical names are independent business sources of truth;
- using Convex collection names as PostgreSQL table aliases merely to simplify migration;
- plural/singular variants of the same entity as separate physical tables.

If compatibility mapping is required during later data migration, it belongs in migration code/read adapters, not as a second authoritative business relation.

### 9. Naming does not alter v1.7 integrity

This ADR is naming-only. It does not change:

- required primary/unique grains;
- FK target/context rules;
- `ON DELETE` policy;
- deferred journal balance enforcement;
- partial-index predicates;
- lock-row design;
- Sources of Truth vs operational projections;
- transaction isolation or lock ordering;
- Index Catalog contents.

Those remain governed by Architecture Baseline v1.7.

## Explicitly deferred to later Phase 03 steps

03.01 does not decide or implement:

- `pg_trgm` or other extensions — 03.02;
- money/quantity/time/JSON physical types — 03.03;
- migration directory/tool/versioning structure — 03.04;
- table creation, constraints, indexes, views, triggers, functions, or Business DDL — 03.05 and its approved build order.

## Consequences

- Every future PostgreSQL migration has one canonical vocabulary for relation/column/object names.
- The architecture catalog, not the current Convex collection names, determines PostgreSQL business relation names.
- Visible business document numbers stay separate from internal relational identity.
- Operational lock rows/projections keep their architecture-defined grain instead of receiving unnecessary surrogate IDs.
- Technical constraint/index names become reviewable and stable across environments.
- Any unresolved naming conflict blocks that DDL fragment rather than creating an alias and fixing it later.

## Verification required for 03.01

- this ADR is present and accepted on `agent/postgres-v1.7-core`;
- the change introduces no Business SQL migration or Business table;
- no extension/type/migration-structure decision from 03.02–03.04 is implemented;
- primary CI remains green on the final 03.01 SHA;
- Phase 03 remains in progress, with 03.02 as the only next action after 03.01 closes.

## References

- Architecture Baseline v1.7 — §25 Database Schema Plan, §26 Referential Integrity, §28 final Index Catalog.
- Architecture Baseline v1.7 — internal entity identifiers use UUIDs; operational positions use architecture-defined PK/unique grains.
- Master Implementation Plan v1.0 — Phase 03.01 Physical Naming Convention and Phase 03 execution pointer.
