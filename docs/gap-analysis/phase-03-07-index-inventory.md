# Phase 03.07 — Exact Index Inventory

**Status:** FROZEN  
**Date:** 2026-09-18  
**Branch:** `agent/postgres-v1.7-core`  
**Architecture authority:** `Business-Tech-ERP-Architecture-Baseline-v1.7-Final.docx` — §28  
**Execution authority:** `Business-Tech-ERP-Master-Implementation-Plan-v1.0.md`  
**Decision corrections:** ADR-0017, ADR-0024  
**Boundary:** inventory/classification only. **No Index Migration is created by this step.**

## 1. Classification contract

Every concrete §28 catalog entry is frozen as exactly one of:

- `ALREADY_SATISFIED` — an existing PK/UNIQUE/integrity index already supplies the approved key, or the catalog explicitly requires no extra DDL.
- `CREATE_IN_03_07` — exact B-Tree / GIN / expression / partial / partial-unique index to be created by the later forward index migration.
- `OMITTED_BY_ADR` — a versioned architecture correction explicitly removes the catalog line from V1 implementation.
- `BLOCKED` — unresolved architecture/schema issue. **There are no blocked entries after ADR-0017 and ADR-0024.**

The inventory is based on the committed schema/migrations through `0021_printing_export_reporting_read_models_constraints`.

### Frozen totals

| Classification | Count |
| --- | ---: |
| ALREADY_SATISFIED | 74 |
| CREATE_IN_03_07 | 155 |
| OMITTED_BY_ADR | 2 |
| BLOCKED | 0 |
| **Total catalog decisions** | **231** |

These 231 rows are catalog decisions, not 231 new indexes. Only the 155 `CREATE_IN_03_07` entries authorize new index DDL.

## 2. Governing rules applied during classification

1. PostgreSQL PK/UNIQUE backing indexes count as satisfied; no duplicate index is created on the same key.
2. No redundant prefix indexes.
3. A partial index is not treated as redundant with a general index when the approved predicate intentionally targets a hot subset.
4. Reverse-key indexes remain distinct when they serve reverse lookup.
5. `pg_trgm` is already enabled by migration `0001`; only the approved GIN indexes remain to be created.
6. The canonical phone search column is `counterparties.normalized_phone`, consistent with the physical schema and §28.8 search policy.
7. ADR-0017 corrects the installment open-set predicate to `UPCOMING / DUE / PARTIAL / OVERDUE`.
8. ADR-0024 omits the invalid indexes on `receipts.sales_order_id` and `advance_applications.posting_batch_id`.
9. Constraint-owned target keys such as `warehouses(id, branch_id)`, `sales_orders(id, branch_id)`, etc. are preserved as relational-integrity infrastructure even when not listed as independent performance indexes in §28.
10. No index outside this frozen inventory may be added without measurement + `EXPLAIN (ANALYZE, BUFFERS)` and a versioned decision.

---

## 3. §28.2 Core / Security / Infrastructure

| Table | ALREADY_SATISFIED | CREATE_IN_03_07 | Omitted / Blocked |
| --- | --- | --- | --- |
| companies | PK `(id)` | — | — |
| company_phones | — | `(company_id)` | — |
| branches | UNIQUE `(company_id, code)` | `(company_id, is_active)` | — |
| warehouses | UNIQUE `(branch_id, code)` | PARTIAL `(branch_id) WHERE is_active = true` | — |
| branch_settings | PK `(branch_id)` | — | — |
| users | — | UNIQUE `(lower(username))`; UNIQUE `(lower(email)) WHERE email IS NOT NULL`; `(role_id)`; `(default_branch_id)` | — |
| auth_sessions | UNIQUE `(refresh_token_hash)` | `(user_id, expires_at)` | — |
| roles | UNIQUE `(role_key)` | — | — |
| permissions | UNIQUE `(permission_key)` | — | — |
| role_permissions | UNIQUE key already supplied by PK `(role_id, permission_id)` | — | — |
| user_permission_overrides | UNIQUE key already supplied by PK `(user_id, permission_id)` | — | — |
| user_branch_access | UNIQUE key already supplied by PK `(user_id, branch_id)` | — | — |
| document_sequences | UNIQUE `(branch_id, document_type)` | — | — |
| idempotency_keys | UNIQUE `(key)` | `(expires_at)` | — |
| posting_batches | — | `(source_type, source_id, posted_at DESC)` | — |
| audit_logs | — | `(entity_type, entity_id, created_at DESC)`; `(branch_id, created_at DESC)`; `(user_id, created_at DESC)` | — |
| outbox_events | — | PARTIAL `(created_at, id) WHERE processed_at IS NULL` | — |
| document_tombstones | UNIQUE `(branch_id, document_type, document_number)`; UNIQUE `(original_id, document_type)` | — | — |

**§28.2 totals:** 14 satisfied / 14 create / 0 omitted / 0 blocked.

---

## 4. §28.3 Counterparties / Products / Units / Attributes / Pricing

| Table | ALREADY_SATISFIED | CREATE_IN_03_07 | Omitted / Blocked |
| --- | --- | --- | --- |
| PostgreSQL | `pg_trgm` extension enabled by `0001` | — | — |
| counterparties | — | `(normalized_phone)`; GIN `(name gin_trgm_ops)` | — |
| counterparty_roles | UNIQUE key supplied by PK `(counterparty_id, role)` | `(role, counterparty_id)` | — |
| customer_profiles | PK `(counterparty_id)` | — | — |
| supplier_profiles | PK `(counterparty_id)` | — | — |
| product_categories | — | `(parent_id)` | — |
| products | — | `(category_id)`; PARTIAL `(category_id, id) WHERE is_active = true`; GIN `(name gin_trgm_ops)` | — |
| product_variants | UNIQUE `(product_id, combination_signature)` | UNIQUE `(sku) WHERE sku IS NOT NULL`; PARTIAL `(product_id, id) WHERE is_active = true` | — |
| units | UNIQUE `(name)` | — | — |
| product_units | UNIQUE `(product_id, unit_id)` | `(unit_id)` | — |
| variant_barcodes | UNIQUE `(barcode)` | `(variant_id)` | — |
| attributes | — | `(usage_type, is_active)` | — |
| attribute_values | UNIQUE `(attribute_id, value)` | `(attribute_id, sort_order)` | — |
| product_attributes | UNIQUE key supplied by PK `(product_id, attribute_id)` | — | — |
| variant_attribute_values | UNIQUE key supplied by PK `(variant_id, attribute_value_id)` | `(attribute_value_id, variant_id)` | — |
| price_lists | Catalog explicitly says no standalone low-cardinality index by default | — | — |
| price_list_items | UNIQUE key supplied by PK `(price_list_id, variant_id, product_unit_id)` | `(variant_id, price_list_id)` | — |
| reorder_levels | UNIQUE key supplied by PK `(variant_id, warehouse_id)` | `(warehouse_id, variant_id)` | — |

**§28.3 totals:** 14 satisfied / 16 create / 0 omitted / 0 blocked.

---

## 5. §28.4 Inventory / Cost / Reservations / Transfers / Stocktake

| Table | ALREADY_SATISFIED | CREATE_IN_03_07 | Omitted / Blocked |
| --- | --- | --- | --- |
| inventory_movements | — | `(warehouse_id, occurred_at DESC, id DESC)`; `(branch_id, occurred_at DESC, id DESC)`; `(source_type, source_id)`; `(posting_batch_id)` | — |
| inventory_movement_lines | — | `(movement_id)`; `(variant_id, movement_id)` | — |
| inventory_line_serials | UNIQUE key supplied by PK `(movement_line_id, serial_id)` | `(serial_id, movement_line_id)` | — |
| inventory_line_batches | UNIQUE key supplied by PK `(movement_line_id, batch_id)` | `(batch_id, movement_line_id)` | — |
| inventory_stock_positions | PK `(warehouse_id, variant_id)` | `(variant_id, warehouse_id)` | — |
| variant_warehouse_cost_projection | UNIQUE grain supplied by PK `(warehouse_id, variant_id)` | `(variant_id, warehouse_id)` | — |
| batches | UNIQUE `(variant_id, batch_number)` | `(variant_id, expiry_date, created_at)` | — |
| batch_stock_positions | UNIQUE grain supplied by PK `(warehouse_id, batch_id)` | PARTIAL `(warehouse_id, batch_id) WHERE on_hand > 0` | — |
| serial_numbers | UNIQUE `(variant_id, serial_number)` | `(serial_number)`; `(current_warehouse_id, variant_id, status)` | — |
| stock_reservations | — | PARTIAL UNIQUE `(sales_order_line_id, warehouse_id, variant_id) WHERE status IN ('ACTIVE','PARTIALLY_CONSUMED')`; `(sales_order_id, status)`; PARTIAL `(warehouse_id, variant_id) WHERE status IN ('ACTIVE','PARTIALLY_CONSUMED')` | — |
| stock_transfers | UNIQUE `(issuing_branch_id, document_number)` | `(from_warehouse_id, posted_at DESC)`; `(to_warehouse_id, posted_at DESC)` | — |
| stock_transfer_lines | UNIQUE `(transfer_id, variant_id)` | — | — |
| stocktake_sessions | UNIQUE `(branch_id, document_number)` | `(warehouse_id, started_at DESC)`; PARTIAL `(warehouse_id, started_at DESC) WHERE status IN ('OPEN','COUNTED')` | — |
| stocktake_lines | UNIQUE `(session_id, variant_id)` | — | — |
| stocktake_line_serials | UNIQUE key supplied by PK `(stocktake_line_id, serial_id)` | — | — |
| stocktake_line_batches | UNIQUE key supplied by PK `(stocktake_line_id, batch_id)` | — | — |
| inventory_adjustments | UNIQUE `(branch_id, document_number)` | `(warehouse_id, posted_at DESC)` | — |
| inventory_adjustment_lines | UNIQUE `(adjustment_id, variant_id)` | — | — |
| inventory_adjustment_line_serials | UNIQUE key supplied by PK `(adjustment_line_id, serial_id)` | — | — |
| inventory_adjustment_line_batches | UNIQUE key supplied by PK `(adjustment_line_id, batch_id)` | — | — |

**§28.4 totals:** 17 satisfied / 22 create / 0 omitted / 0 blocked.

---

## 6. §28.5 Sales & Purchasing

### Sales

| Table | ALREADY_SATISFIED | CREATE_IN_03_07 | Omitted / Blocked |
| --- | --- | --- | --- |
| sales_quotes | UNIQUE `(branch_id, document_number)` | `(branch_id, status, created_at DESC, id DESC)`; `(branch_id, counterparty_id, created_at DESC)` | — |
| sales_quote_lines | — | `(quote_id)`; `(variant_id, quote_id)` | — |
| sales_orders | UNIQUE `(branch_id, document_number)` | `(branch_id, status, updated_at DESC, id DESC)`; `(branch_id, counterparty_id, created_at DESC)`; `(branch_id, sales_user_id, created_at DESC)`; `(source_quote_id)` | — |
| sales_order_lines | — | `(sales_order_id)`; `(variant_id, sales_order_id)` | — |
| sales_order_status_history | — | `(sales_order_id, changed_at DESC)` | — |
| sales_order_shipping_details | PK/UNIQUE `(sales_order_id)` | — | — |
| sales_order_deliveries | — | `(sales_order_id, delivered_at DESC, id DESC)` | — |
| sales_order_delivery_lines | UNIQUE key supplied by PK `(delivery_id, sales_order_line_id)` | `(sales_order_line_id)` | — |
| sales_invoices | UNIQUE `(branch_id, document_number)` | `(branch_id, posted_at DESC, id DESC)`; `(branch_id, counterparty_id, posted_at DESC)`; `(branch_id, seller_user_id, posted_at DESC)`; `(branch_id, payment_status, posted_at DESC)`; `(source_sales_order_id)`; UNIQUE `(source_delivery_id) WHERE source_delivery_id IS NOT NULL` | — |
| sales_invoice_lines | — | `(invoice_id)`; `(variant_id, invoice_id)` | — |
| sales_returns | UNIQUE `(branch_id, document_number)` | `(branch_id, posted_at DESC, id DESC)`; `(branch_id, counterparty_id, posted_at DESC)`; `(source_invoice_id, posted_at DESC)` | — |
| sales_return_lines | — | `(sales_return_id)`; `(source_invoice_line_id)`; `(variant_id, sales_return_id)` | — |

### Purchasing / Tax

| Table | ALREADY_SATISFIED | CREATE_IN_03_07 | Omitted / Blocked |
| --- | --- | --- | --- |
| purchase_invoices | UNIQUE `(branch_id, document_number)` | `(branch_id, posted_at DESC, id DESC)`; `(branch_id, counterparty_id, posted_at DESC)`; `(branch_id, payment_status, posted_at DESC)` | — |
| purchase_invoice_lines | — | `(purchase_invoice_id)`; `(variant_id, purchase_invoice_id)` | — |
| purchase_returns | UNIQUE `(branch_id, document_number)` | `(branch_id, posted_at DESC, id DESC)`; `(branch_id, counterparty_id, posted_at DESC)`; `(source_purchase_invoice_id, posted_at DESC)` | — |
| purchase_return_lines | — | `(purchase_return_id)`; `(source_purchase_invoice_line_id)`; `(variant_id, purchase_return_id)` | — |
| tax_codes | UNIQUE `(code)`; catalog says active partial only if measured need, so no default DDL | — | — |

**§28.5 totals:** 10 satisfied / 38 create / 0 omitted / 0 blocked.

---

## 7. §28.6 Finance / Treasury / Ledgers / Advances / Cheques / Installments / Accounting

| Table | ALREADY_SATISFIED | CREATE_IN_03_07 | Omitted / Blocked |
| --- | --- | --- | --- |
| treasuries | — | UNIQUE `(branch_id, lower(name))`; PARTIAL `(branch_id, id) WHERE is_active = true` | — |
| treasury_balance_positions | PK `(treasury_id)` | — | — |
| financial_movements | — | `(treasury_id, occurred_at DESC, id DESC)`; `(branch_id, occurred_at DESC, id DESC)`; `(source_type, source_id)`; `(posting_batch_id)`; PARTIAL UNIQUE `(posting_batch_id, direction) WHERE source_type = 'TREASURY_TRANSFER'` | — |
| receipts | UNIQUE `(branch_id, document_number)` | `(branch_id, posted_at DESC, id DESC)`; `(branch_id, counterparty_id, posted_at DESC)`; `(treasury_id, posted_at DESC)` | **OMITTED_BY_ADR-0024:** `(sales_order_id) WHERE sales_order_id IS NOT NULL` |
| disbursements | UNIQUE `(branch_id, document_number)` | `(branch_id, posted_at DESC, id DESC)`; `(branch_id, counterparty_id, posted_at DESC)`; `(treasury_id, posted_at DESC)` | — |
| financial_allocations | UNIQUE `(financial_source_type, financial_source_id, target_type, target_id)`; this backing index already satisfies the shorter prefix lookup `(financial_source_type, financial_source_id)`, so no duplicate prefix index | `(target_type, target_id, created_at)` | — |
| customer_ledger_entries | — | `(counterparty_id, occurred_at DESC, id DESC)`; `(counterparty_id, branch_id, occurred_at DESC, id DESC)`; `(branch_id, occurred_at DESC, id DESC)`; `(source_type, source_id)`; `(posting_batch_id)` | — |
| supplier_ledger_entries | — | `(counterparty_id, occurred_at DESC, id DESC)`; `(counterparty_id, branch_id, occurred_at DESC, id DESC)`; `(branch_id, occurred_at DESC, id DESC)`; `(source_type, source_id)`; `(posting_batch_id)` | — |
| treasury_transfers | UNIQUE `(issuing_branch_id, document_number)` | `(from_treasury_id, posted_at DESC)`; `(to_treasury_id, posted_at DESC)`; `(issuing_branch_id, posted_at DESC, id DESC)` | — |
| customer_advances | UNIQUE `(receipt_id)` | `(counterparty_id, created_at DESC)`; `(sales_order_id, created_at DESC)`; PARTIAL `(counterparty_id, created_at DESC) WHERE remaining_amount_projection > 0` | — |
| advance_applications | Catalog explicitly says **do not** add UNIQUE `(advance_id, sales_invoice_id)`, preserving reversal/re-application history | `(advance_id, applied_at)`; `(sales_invoice_id, applied_at)` | **OMITTED_BY_ADR-0024:** `(posting_batch_id)` |
| cheques | — | `(branch_id, status, due_date, id)`; `(counterparty_id, status, due_date)`; `(source_type, source_id)`; `(cheque_number)`; PARTIAL `(branch_id, due_date, id) WHERE status = 'PENDING'` | — |
| installment_plans | — | `(counterparty_id, source_type, source_id)` | — |
| installments | — | `(plan_id, due_date)`; PARTIAL `(plan_id, due_date, id) WHERE status IN ('UPCOMING','DUE','PARTIAL','OVERDUE')` | Original conflicting predicate corrected by ADR-0017; not blocked |
| gl_accounts | UNIQUE `(company_id, code)` | `(parent_id)`; `(account_type, is_active)` | — |
| journal_entries | — | `(branch_id, posted_at DESC, id DESC)`; `(source_type, source_id)`; `(posting_batch_id)`; `(reversal_of_entry_id)` | — |
| journal_lines | — | `(journal_entry_id)`; `(gl_account_id, journal_entry_id)`; PARTIAL `(counterparty_id, journal_entry_id) WHERE counterparty_id IS NOT NULL` | — |

**§28.6 totals:** 9 satisfied / 49 create / 2 omitted / 0 blocked.

> Note: the section-level aggregate is 9 satisfied / 49 create because the redundant `financial_allocations(financial_source_type, financial_source_id)` catalog lookup is satisfied by the existing longer UNIQUE backing index and must not be materialized as a duplicate prefix index. Combined with the other sections, the frozen overall totals remain 74 / 155 / 2 / 0.

---

## 8. §28.7 Repairs / Customer Follow-Up / Notifications

| Table | ALREADY_SATISFIED | CREATE_IN_03_07 | Omitted / Blocked |
| --- | --- | --- | --- |
| repair_orders | UNIQUE `(branch_id, document_number)` | `(branch_id, status, updated_at DESC, id DESC)`; `(branch_id, status, current_technician_id, updated_at DESC)`; `(counterparty_id, created_at DESC)` | — |
| repair_status_history | — | `(repair_order_id, changed_at DESC, id DESC)` | — |
| repair_assignments | PARTIAL UNIQUE `(repair_order_id) WHERE ended_at IS NULL` already created by `0020` | `(repair_order_id, assigned_at DESC)`; PARTIAL `(technician_id, assigned_at) WHERE ended_at IS NULL` | — |
| repair_issue_reports | — | `(repair_order_id, created_at DESC)` | — |
| repair_customer_decisions | UNIQUE `(repair_issue_report_id)` | — | — |
| customer_followups | UNIQUE `(source_event_id) WHERE source_event_id IS NOT NULL` already created by `0020` | `(branch_id, status, priority, due_at, id)`; PARTIAL `(assigned_user_id, status, due_at, id) WHERE completed_at IS NULL`; `(source_type, source_id, created_at DESC)` | — |
| followup_actions | — | `(followup_id, created_at DESC, id DESC)` | — |
| followup_status_history | — | `(followup_id, changed_at DESC, id DESC)` | — |
| notifications | UNIQUE `(outbox_event_id, notification_type) WHERE outbox_event_id IS NOT NULL` already created by `0020` | `(created_at DESC, id DESC)`; `(source_type, source_id)` | — |
| notification_recipients | UNIQUE key supplied by PK `(notification_id, user_id)` | `(user_id, notification_id)`; PARTIAL `(user_id) WHERE seen_at IS NULL` | — |

**§28.7 totals:** 6 satisfied / 16 create / 0 omitted / 0 blocked.

---

## 9. §28.8 Search / Read Models / Performance Verification

| Policy | Classification | Frozen decision |
| --- | --- | --- |
| Name search = `pg_trgm/GIN`; barcode/SKU/serial/document = B-Tree exact; phone = `normalized_phone` | ALREADY_SATISFIED as catalog policy | Concrete approved indexes are enumerated above; no new search family is authorized |
| Read Models: PK/UNIQUE first for grain; no random index before actual query | ALREADY_SATISFIED | Reporting grains are already PK-protected by `0021`; §28.8 alone authorizes no additional read-model index |
| Partitioning disabled in V1 | ALREADY_SATISFIED | No partition DDL |
| Post-DDL verification with `EXPLAIN (ANALYZE, BUFFERS)`, representative data, latency/buffer/write-amplification review | ALREADY_SATISFIED as verification requirement | Executed after Index DDL; not an index to create |

**§28.8 totals:** 4 satisfied / 0 create / 0 omitted / 0 blocked.

---

## 10. Cross-check totals

| Section | Satisfied | Create | Omitted | Blocked | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| §28.2 | 14 | 14 | 0 | 0 | 28 |
| §28.3 | 14 | 16 | 0 | 0 | 30 |
| §28.4 | 17 | 22 | 0 | 0 | 39 |
| §28.5 | 10 | 38 | 0 | 0 | 48 |
| §28.6 | 9 | 49 | 2 | 0 | 60 |
| §28.7 | 6 | 16 | 0 | 0 | 22 |
| §28.8 | 4 | 0 | 0 | 0 | 4 |
| **TOTAL** | **74** | **155** | **2** | **0** | **231** |

## 11. Freeze result

The Phase 03.07 pre-DDL inventory is now **FROZEN**:

- no unresolved catalog blocker remains;
- no speculative index is authorized;
- no missing-column index is permitted;
- no redundant prefix index is permitted;
- no existing PK/UNIQUE backing index is duplicated;
- all 155 future index definitions are explicitly listed above;
- ADR-0017 and ADR-0024 corrections are incorporated;
- no Index Migration exists yet.

## 12. Next action — exactly one

Create the **single forward-only Phase 03.07 Index Migration** from the 155 `CREATE_IN_03_07` entries above, with PostgreSQL 17 index-catalog integration tests that verify:

1. exact columns/order/opclass/predicates/uniqueness;
2. no duplicate PK/UNIQUE indexes;
3. no redundant prefix indexes;
4. the two ADR-0024 omitted indexes are absent;
5. the ADR-0017 installment predicate is canonical;
6. migration checksum, idempotent rerun and verify-only behavior;
7. no unapproved independent index exists.

Do not start 03.08 until that migration and Full CI are closed on the same final SHA.
