# Phase 03.06 — Constraints Gap Analysis

**Status:** COMPLETE  
**Phase:** 03.06 — Constraints  
**Date:** 2026-09-13  
**Branch:** `agent/postgres-v1.7-core`  
**Starting SHA:** `0734525dcd084e4687d64d65dbf3140787b5b8f6`  
**Architecture authority:** `Business-Tech-ERP-Architecture-Baseline-v1.7-Final.docx` — especially §§25–28  
**Execution authority:** `Business-Tech-ERP-Master-Implementation-Plan-v1.0.md`

## 1. Purpose and boundary

This document performs the required Gap Analysis before any Phase 03.06 constraint DDL is written.

It compares:

1. the approved Architecture Baseline v1.7 relational-safety rules;
2. the physical PostgreSQL schema already created by migrations `0002` through `0011`;
3. the decisions already frozen in ADRs through ADR-0016.

This step is **documentation only**. It does not create, modify, remove, validate, or backfill any database constraint. It does not start Phase 03.07 Index Catalog.

## 2. Current physical-schema inventory

The committed schema from migrations `0002` through `0011` currently contains:

- `0002` Core / Organization / Security: **19 tables**.
- `0003` Counterparties: **6 tables**.
- `0004` Product Catalog: **13 tables**.
- `0005` Inventory: **20 tables**.
- `0006` Sales: **12 tables + 1 view** (`sales_returnable_quantities_v`).
- `0007` Purchasing / Tax: **5 tables + 1 view** (`purchase_returnable_quantities_v`).
- `0008` Finance / Settlement: **13 tables**.
- `0009` Accounting: **3 tables**, plus the approved deferred journal-balance function/constraint trigger.
- `0010` Repairs / Follow-Up / Notifications: **12 tables**.
- `0011` Printing / Export / Reporting Read Models: **7 tables**.

Total: **110 tables + 2 views**, plus the accounting balance function and deferred constraint trigger.

Column names, physical types and nullability were already frozen and verified during 03.05. Phase 03.06 must be additive: constraints are introduced using new forward migration(s); the already-verified historical migration SQL files are not rewritten merely to insert constraints into old CREATE TABLE statements.

## 3. Architecture rules governing 03.06

Architecture Baseline v1.7 closes Referential Integrity & Relational Safety in §26 and requires the database and backend to share responsibility for invariants; the UI is not the only safety layer.

The relevant rules are:

- Internal entity identities use UUID primary keys; business document numbers are not relation identities.
- Negative numeric values are forbidden unless a field is explicitly designed to be signed or negative-capable.
- Branch/Warehouse and Branch/Treasury context must match.
- Product Variant and Product Unit references must belong to the same Product where both occur together.
- Delivery lines must belong to the same Sales Order as their delivery.
- Return source lines must belong to the same source invoice/purchase invoice as the return document.
- Default user branch must be within effective branch access.
- Warehouse history must prevent direct delete/branch reassignment once historical inventory references exist.
- Historical/business/financial/inventory relationships default to `ON DELETE RESTRICT`.
- `CASCADE` is allowed only for true child/config rows with no independent business/financial/inventory history.
- `SET NULL` is allowed only for optional descriptive references whose loss does not break historical interpretation.
- Posted document deletion uses reversal + tombstone; document numbers are not reused.
- Journal-entry balance is checked at COMMIT via an `INITIALLY DEFERRED` constraint trigger, not a row-level balance CHECK.
- Returnable-quantity views are read models; race-safe return posting is enforced later by transaction locking/recalculation, not by treating the views as lockable Sources of Truth.
- Operational `available` stock remains derived from `on_hand - reserved`; 03.06 does not add an independent stored balance source.

## 4. Gap classification

### 4.1 Exists and compliant

The following implementation already matches the approved design and must be preserved:

- Physical column types and nullability created by `0002`–`0011`.
- `sales_returnable_quantities_v` and `purchase_returnable_quantities_v` as read-only returnable-quantity views.
- `fn_journal_entries_balanced_at_commit()` plus `ct_journal_entries__balanced_at_commit`, which is already `DEFERRABLE INITIALLY DEFERRED` and validates full journal balance at COMMIT.
- Operational stock `available` remains derived rather than a separately persisted historical/source balance.
- ADR-0016: `branch_print_defaults` is the canonical normalized branch print-default map; the two `branch_settings` print-template columns remain compatibility fields and must not become a second independent write authority.

### 4.2 Exists but needs an additive constraint layer

All 110 physical tables exist, but most of the PK/FK/UNIQUE/CHECK/referential-action/composite-context layer was intentionally deferred from 03.05 to 03.06.

Accounting is the one deliberate exception: the multi-row deferred journal-balance trigger already exists. `journal_lines` still needs its row-level debit/credit validity CHECKs and normal PK/FK relationships.

### 4.3 Missing and must be created in 03.06

The approved constraint layer still needs:

- primary/composite keys and identity protection;
- direct foreign keys where the target is unambiguous;
- composite context protection for branch-scoped Warehouse/Treasury relationships;
- mandatory UNIQUE constraints;
- approved partial/expression uniqueness where the architecture defines it as an integrity rule;
- approved CHECK constraints for closed domains and numeric invariants;
- `RESTRICT` / `CASCADE` / `SET NULL` referential actions according to §26.5;
- cross-table integrity enforcement where a conventional FK cannot express the invariant without inventing new schema columns.

### 4.4 Exists but needs replacement

**None identified.**

No approved table/column from 03.05 needs deletion or replacement to implement 03.06.

### 4.5 Blocked / requires versioned clarification

A strict `CHECK` on `installments.status` is **blocked** because Architecture Baseline v1.7 contains two incompatible status vocabularies:

- §25.13: `UPCOMING / DUE / PARTIAL / PAID / OVERDUE`
- §28.6 partial-index predicate: `PENDING / PARTIALLY_PAID / DUE / OVERDUE`

03.06 must not silently pick one. This ambiguity must be resolved/versioned before writing the status CHECK or the later 03.07 partial-index predicate.

Two additional mismatches were recorded for the future 03.07 Index Catalog pass, but they do **not** authorize a 03.06 schema change:

- §28.6 references `receipts.sales_order_id`, while the approved §25.12 / migration `0008` receipts shape has no `sales_order_id` column.
- §28.6 references `advance_applications.posting_batch_id`, while the approved §25.12 / migration `0008` shape has no `posting_batch_id` column.

These are 03.07 blockers and are only recorded here so they are not lost.

## 5. Required constraint catalogue by domain

This is the implementation catalogue for 03.06. It separates integrity constraints from 03.07 performance indexes.

### 5.1 Core / Organization / Security

Required identity and mapping protection includes:

- PKs for entity tables such as `companies(id)`, `branches(id)`, `warehouses(id)`, `users(id)`, `auth_sessions(id)`, `roles(id)`, `permissions(id)`, `document_sequences(id)`, `idempotency_keys(id)`, `posting_batches(id)`, `audit_logs(id)`, `outbox_events(id)`, `document_tombstones(id)` and equivalent entity-id tables.
- configuration-row identity such as `company_settings(company_id)` and `branch_settings(branch_id)`.
- required FKs among company/branch/warehouse/user/security/configuration rows.
- `UNIQUE (company_id, code)` for branches.
- `UNIQUE (branch_id, code)` for warehouses.
- unique normalized username and nullable-email semantics according to the closed catalog; because these are expression/partial uniqueness rules, implementation must preserve their integrity purpose without treating unrelated search indexes as 03.06 work.
- unique role key and permission key.
- `UNIQUE (role_id, permission_id)` on `role_permissions`.
- `UNIQUE (user_id, permission_id)` on `user_permission_overrides`.
- `UNIQUE (user_id, branch_id)` on `user_branch_access`.
- `UNIQUE (branch_id, document_type)` on `document_sequences`.
- unique idempotency claim key.
- tombstone uniqueness on `(branch_id, document_type, document_number)` and `(original_id, document_type)`.
- closed-domain CHECKs such as `users.branch_scope_mode = SELECTED | ALL` and permission override `effect = ALLOW | DENY`.
- `posting_batches.operation_type` restricted to the approved posting-operation vocabulary.
- direct and composite branch/company integrity as applicable.

The special invariant “user default branch is inside effective branch access” cannot be expressed by a simple FK alone; it needs an approved cross-table constraint mechanism/equivalent without inventing a new business column.

### 5.2 Counterparties and ledgers

Required items include:

- PK for `counterparties(id)` and historical ledger entity IDs.
- one-row profile identities for `customer_profiles(counterparty_id)` and `supplier_profiles(counterparty_id)`.
- FK from profiles/roles/ledger entries to canonical counterparty rows.
- `UNIQUE (counterparty_id, role)` for `counterparty_roles`.
- role CHECK `CUSTOMER | SUPPLIER | OTHER`.
- ledger FKs to branch, posting batch and creator where physically/directly expressible.
- historical ledger relationships default to RESTRICT.
- approved amount sign/domain rules only; do not invent a blanket balance rule that changes ledger semantics.

### 5.3 Product Catalog

Required items include:

- PKs for category/product/variant/unit/product-unit/barcode/attribute/value/price-list entities.
- FKs across category hierarchy, product→category, variant→product, product-unit→product/unit, attributes, price lists and reorder levels.
- `UNIQUE (product_id, combination_signature)` on variants.
- SKU uniqueness only in the approved nullable/company-catalog scope.
- `UNIQUE (product_id, unit_id)` on product units.
- `UNIQUE (barcode)` on variant barcodes.
- `UNIQUE (attribute_id, value)` on attribute values.
- `UNIQUE (product_id, attribute_id)` on product attributes.
- `UNIQUE (variant_id, attribute_value_id)` on variant attribute values.
- `UNIQUE (price_list_id, variant_id, product_unit_id)` on price-list items.
- `UNIQUE (variant_id, warehouse_id)` on reorder levels.
- CHECKs for approved product/attribute domain vocabularies and valid positive conversion/price/quantity values where the architecture explicitly requires them.

`products.base_unit_id` is the only Base Unit Source of Truth. Because it points to a `product_units` row which itself points back to `products`, the implementation must handle that cycle safely (for example with an approved deferrable relationship/equivalent). 03.06 must not reintroduce `product_units.is_base`.

The invariant “Variant and ProductUnit on the same barcode/document line belong to the same Product” is not expressible by a single conventional FK with the current approved physical columns. It needs a database constraint trigger/equivalent or another architecture-authorized integrity mechanism; adding redundant `product_id` columns solely to make the FK easy is not authorized by this Gap Analysis.

### 5.4 Inventory

Required items include:

- PKs for serials, batches, movement headers/lines, reservations, transfers, stocktakes and adjustments.
- direct child FKs for movement lines, line serials/batches, transfer lines, stocktake lines/details and adjustment lines/details.
- `UNIQUE (movement_line_id, serial_id)` and `UNIQUE (movement_line_id, batch_id)`.
- operational position keys/grains: `(warehouse_id, variant_id)` for `inventory_stock_positions` and `variant_warehouse_cost_projection`; `(warehouse_id, batch_id)` for `batch_stock_positions`.
- `UNIQUE (variant_id, batch_number)`.
- `UNIQUE (variant_id, serial_number)`.
- active stock-reservation uniqueness on `(sales_order_line_id, warehouse_id, variant_id)` for active/partially-consumed reservation state.
- document-number uniqueness for stock transfers, stocktake sessions and inventory adjustments in their approved branch scope.
- transfer/stocktake/adjustment child uniqueness defined by the approved catalogue.
- CHECK that stock-transfer source and destination warehouses differ.
- approved positive quantity/cost rules, while preserving explicitly signed fields such as movement `quantity_signed`, stocktake `difference`, and adjustment `quantity_difference`.
- branch/warehouse composite-context integrity.
- warehouse historical references must prevent deletion or branch reassignment when movement history exists.

Operational `available` must remain derived from `on_hand - reserved`; 03.06 does not create a second writable availability balance.

### 5.5 Sales

Required items include:

- PKs for quote/order/status/delivery/invoice/return entity rows and line rows where appropriate.
- direct FKs from child rows to their document/root rows and product/catalog references.
- document-number uniqueness by branch for quotes, orders, invoices and returns.
- `sales_order_shipping_details` one-to-one identity/uniqueness on `sales_order_id`.
- `UNIQUE (delivery_id, sales_order_line_id)` on delivery lines.
- source-delivery uniqueness for invoice linkage where the approved catalogue requires one invoice per source delivery.
- approved row checks for positive quantities, permitted monetary ranges and `price_source = PRICE_LIST | MANUAL`.
- branch/warehouse composite-context integrity.
- same-product Variant/ProductUnit integrity on all applicable lines.
- delivery line must reference an order line from the same Sales Order as the delivery.
- a source-linked sales return line must reference a line belonging to the same source invoice as the return header.
- historical document/dependent relationships use RESTRICT unless a pure-child CASCADE is explicitly safe.

The returnable view is not replaced. Over-return race protection remains a posting-transaction concern using original-line locking and recalculation.

### 5.6 Purchasing and Tax

Required items include:

- PKs and direct child FKs for purchase invoices/lines and returns/lines.
- document-number uniqueness by branch for purchase invoices and purchase returns.
- `UNIQUE (code)` for tax codes.
- approved positive quantity/money rules while preserving explicitly signed `cost_variance` semantics.
- branch/warehouse composite-context integrity.
- same-product Variant/ProductUnit integrity on applicable purchase invoice lines.
- source-linked purchase return line must belong to the same source purchase invoice as the return header.
- historical document relationships use RESTRICT according to §26.5.

The purchase returnable view remains a read model; posting concurrency remains a later transaction-layer invariant.

### 5.7 Finance / Settlement

Required items include:

- PKs for treasury/receipt/disbursement/category/transfer/movement/allocation/advance/cheque/installment entities.
- one-row operational treasury position key `treasury_balance_positions(treasury_id)`.
- branch/treasury composite-context integrity for every branch-scoped financial document/movement.
- treasury-name uniqueness within branch using the approved case-normalized rule.
- document-number uniqueness for receipts/disbursements and treasury transfers in the approved issuing branch scope.
- `UNIQUE (financial_source_type, financial_source_id, target_type, target_id)` on allocations.
- `UNIQUE (receipt_id)` on customer advances.
- transfer IN/OUT duplicate prevention by the approved posting-batch/direction rule.
- CHECK `amount > 0` for `financial_allocations` and `advance_applications`.
- CHECK `from_treasury_id <> to_treasury_id` on treasury transfers.
- `financial_movements.direction = IN | OUT`.
- finance category type `INCOME | EXPENSE`.
- cheque direction `RECEIVABLE | PAYABLE` and status `PENDING | CLEARED | BOUNCED | CANCELLED`.
- direct FKs to counterparty, treasury, branch, user and canonical documents where the reference is not polymorphic.
- no fake conventional FK on polymorphic `source_type/source_id` or `target_type/target_id`; enforce those through the approved posting/service/database integrity pattern.

A strict `installments.status` CHECK is deferred pending the recorded architecture ambiguity resolution.

### 5.8 Accounting

Required items include:

- PKs for `gl_accounts`, `journal_entries`, `journal_lines`.
- FKs to company, branch, posting batch, creator, parent account, journal entry, GL account and optional counterparty where applicable.
- `UNIQUE (company_id, code)` on GL accounts.
- row CHECKs on `journal_lines`: debit and credit are non-negative, and a row cannot have both debit and credit greater than zero.
- preserve the already-implemented `DEFERRABLE INITIALLY DEFERRED` full-entry balance constraint trigger.
- journal/posting historical references use RESTRICT.
- reversal linkage must preserve auditability and must not permit destructive history edits.

The existing deferred journal-balance trigger is **not** replaced by a row CHECK.

### 5.9 Repairs / Follow-Up / Notifications

Required items include:

- PKs and direct FKs for repair roots/history/assignments/issues/decisions/tracking tokens and follow-up/action/history/notification entities.
- repair document-number uniqueness by branch.
- one active assignment per repair order using the approved partial uniqueness rule (`ended_at IS NULL`).
- `UNIQUE (repair_issue_report_id)` on customer decisions.
- unique automatic follow-up source-event key where non-null.
- notification event/type deduplication where outbox event is non-null.
- `UNIQUE (notification_id, user_id)` for recipient state.
- CHECK customer repair decision `APPROVED | REJECTED`.
- CHECK approved repair-status vocabulary.
- CHECK follow-up source domain where closed by the architecture.
- historical repair/follow-up timeline rows remain protected from destructive parent deletion.

### 5.10 Printing / Reporting Read Models

Required items include:

- PK `print_templates(id)` and FK from print defaults to branches/templates.
- `UNIQUE (branch_id, document_type)` on `branch_print_defaults`.
- CHECK `print_templates.paper_size IN ('A4','A3','THERMAL_80','THERMAL_57')`.
- read-model grain protection:
  - `reporting_daily_branch_metrics(branch_id, date)`;
  - `reporting_inventory_balances(branch_id, warehouse_id, variant_id)`;
  - `reporting_counterparty_balances(counterparty_id)`;
  - `reporting_treasury_balances(treasury_id)`;
  - `reporting_followup_metrics(branch_id, date, source_type)`.
- FKs from reporting dimensions to canonical entities where required by v1.7 and compatible with rebuildability.

These reporting relations remain rebuildable projections, not independent business balances.

ADR-0016 remains controlling for print defaults: `branch_print_defaults` is canonical for the new PostgreSQL service; the legacy print-template shortcut fields in `branch_settings` cannot become a competing independent write source.

## 6. Composite-context implementation requirements

The following integrity rules require more than ordinary single-column FKs:

1. **Branch + Warehouse** — a branch-scoped document referencing a warehouse must reference a warehouse belonging to that branch.
2. **Branch + Treasury** — receipt/disbursement/movement/transfer context must not point to a treasury outside the allowed branch context.
3. **Variant + ProductUnit** — both references on a line/barcode must belong to the same Product.
4. **Delivery + SalesOrderLine** — delivery line order identity must match the delivery's order.
5. **Return + Source Line** — source invoice/purchase-invoice line must match the source header of the return.
6. **User Default Branch** — default branch must be inside effective branch access.
7. **Warehouse history** — branch reassignment/delete must be blocked once historical inventory references exist.

Where a composite FK can enforce the invariant without introducing a competing Source of Truth, it is preferred. Where the current approved columns cannot express the relationship as a conventional FK, 03.06 must use an approved constraint trigger/equivalent rather than silently adding new denormalized business fields.

## 7. CHECK-constraint policy

03.06 must not create speculative ENUM-like CHECKs merely because a text column exists.

Checks are permitted only where the architecture closes the vocabulary/invariant, including examples such as:

- branch scope mode;
- permission override effect;
- counterparty role;
- product type;
- attribute usage type;
- inventory reservation state;
- documented inventory movement types;
- sales line price source;
- finance category type;
- financial movement direction;
- cheque direction/status;
- repair decision/status vocabularies;
- print paper sizes;
- journal debit/credit row validity;
- explicit `amount > 0` rules;
- transfer source/target inequality.

A blanket `>= 0` rule must not be applied to signed business fields or legitimate signed reporting/balance/profit projections.

## 8. Partial/expression uniqueness boundary versus Phase 03.07

Some closed architecture rules are expressed physically as partial/expression unique indexes (for example active reservation uniqueness, active repair assignment, case-normalized treasury name, nullable SKU, nullable email, source-event/outbox deduplication).

For Phase 03.06 they are treated as **integrity requirements** because they prevent invalid duplicate state, even though PostgreSQL implements them using unique indexes. Phase 03.07 remains responsible for non-integrity performance/query indexes and must not duplicate any supporting index that PostgreSQL already creates for PK/UNIQUE constraints or any integrity unique index created in 03.06.

This separation is required to preserve the closed `No Redundant Prefix Indexes` policy.

## 9. Migration strategy for the future 03.06 implementation

The later implementation must:

- use new forward migration(s); do not rewrite already-verified 0002–0011 schema SQL;
- be transactional wherever PostgreSQL permits;
- use deterministic names for constraints/functions/triggers;
- add target uniqueness before FKs that depend on composite targets;
- use a fixed dependency order so FKs do not reference not-yet-protected targets;
- preserve the existing deferred journal-balance trigger;
- include negative/integrity tests proving invalid data is rejected, not only catalog-introspection tests;
- keep 03.07 performance indexes out of the migration except unique-index structures that are themselves the approved integrity mechanism;
- keep historical/reversal semantics unchanged.

## 10. Findings requiring explicit resolution

### 10.1 Blocking 03.06 ambiguity — Installment status vocabulary

**Severity:** BLOCKER for strict status CHECK.  
**Required action:** versioned architecture/ADR decision before constraint DDL.

Conflict:

- §25.13 uses `UPCOMING / DUE / PARTIAL / PAID / OVERDUE`.
- §28.6 uses `PENDING / PARTIALLY_PAID / DUE / OVERDUE` in the open-installments predicate.

No implicit translation is authorized by this Gap Analysis.

### 10.2 Recorded for 03.07 — `receipts.sales_order_id`

§28.6 defines an index on `receipts.sales_order_id`, but the approved receipts physical shape has no such column. Do not add the column during 03.06 merely to satisfy a future index line.

### 10.3 Recorded for 03.07 — `advance_applications.posting_batch_id`

§28.6 defines an index on `advance_applications.posting_batch_id`, but the approved physical shape has no such column. Do not add the column during 03.06 merely to satisfy a future index line.

## 11. Gap Analysis conclusion

Phase 03.06 implementation is justified and necessary: the relational constraint layer is intentionally mostly absent from the current 110-table physical schema.

No table redesign is required before starting constraint DDL. The main implementation work is additive and consists of PK/FK/composite-context/UNIQUE/partial-UNIQUE/CHECK/referential-action enforcement plus targeted constraint triggers/equivalents for cross-table invariants.

However, the installment-status vocabulary conflict is a genuine architecture ambiguity. Under the project rule that ambiguities must be surfaced/versioned rather than silently chosen, constraint DDL must **not** start until that specific conflict is resolved.

## 12. Tests for this Gap Analysis step

**Tests not run — documentation-only step.**

No executable code, migration, database object, frontend behavior, Convex runtime, Production data, or write owner was changed by this step.

## 13. Next Action — one action only

Create **ADR-0017** to resolve the canonical `installments.status` vocabulary between Architecture Baseline v1.7 §25.13 and §28.6.

Do **not** create 03.06 constraint DDL and do **not** start 03.07 until that ambiguity is resolved.