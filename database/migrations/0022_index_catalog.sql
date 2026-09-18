-- Phase 03.07 — closed Index Catalog implementation.
-- Source of truth: Architecture Baseline v1.7 §28 + frozen inventory
-- docs/gap-analysis/phase-03-07-index-inventory.md.
-- Corrections: ADR-0017 and ADR-0024.
-- Forward-only. Do not add speculative indexes outside this file/catalog.

-- §28.2
CREATE INDEX ix_company_phones__company_id
  ON public.company_phones (company_id);

CREATE INDEX ix_branches__company_id_is_active
  ON public.branches (company_id, is_active);

CREATE INDEX ix_warehouses__branch_id__where_is_active_true
  ON public.warehouses (branch_id)
  WHERE is_active = true;

CREATE UNIQUE INDEX ux_users__lower_username
  ON public.users (lower(username));

CREATE UNIQUE INDEX ux_users__lower_email__where_email_is_not_null
  ON public.users (lower(email))
  WHERE email IS NOT NULL;

CREATE INDEX ix_users__role_id
  ON public.users (role_id);

CREATE INDEX ix_users__default_branch_id
  ON public.users (default_branch_id);

CREATE INDEX ix_auth_sessions__user_id_expires_at
  ON public.auth_sessions (user_id, expires_at);

CREATE INDEX ix_idempotency_keys__expires_at
  ON public.idempotency_keys (expires_at);

CREATE INDEX ix_posting_batches__source_type_source_id_posted_at_desc
  ON public.posting_batches (source_type, source_id, posted_at DESC);

CREATE INDEX ix_audit_logs__entity_type_entity_id_created_at_desc
  ON public.audit_logs (entity_type, entity_id, created_at DESC);

CREATE INDEX ix_audit_logs__branch_id_created_at_desc
  ON public.audit_logs (branch_id, created_at DESC);

CREATE INDEX ix_audit_logs__user_id_created_at_desc
  ON public.audit_logs (user_id, created_at DESC);

CREATE INDEX ix_outbox_events__created_at_id__where_processed_at_is_null
  ON public.outbox_events (created_at, id)
  WHERE processed_at IS NULL;

-- §28.3
CREATE INDEX ix_counterparties__normalized_phone
  ON public.counterparties (normalized_phone);

CREATE INDEX gin_counterparties__name_trgm
  ON public.counterparties USING gin (name gin_trgm_ops);

CREATE INDEX ix_counterparty_roles__role_counterparty_id
  ON public.counterparty_roles (role, counterparty_id);

CREATE INDEX ix_product_categories__parent_id
  ON public.product_categories (parent_id);

CREATE INDEX ix_products__category_id
  ON public.products (category_id);

CREATE INDEX ix_products__category_id_id__where_is_active_true
  ON public.products (category_id, id)
  WHERE is_active = true;

CREATE INDEX gin_products__name_trgm
  ON public.products USING gin (name gin_trgm_ops);

CREATE UNIQUE INDEX ux_product_variants__sku__where_sku_is_not_null
  ON public.product_variants (sku)
  WHERE sku IS NOT NULL;

CREATE INDEX ix_product_variants__product_id_id__where_is_active_true
  ON public.product_variants (product_id, id)
  WHERE is_active = true;

CREATE INDEX ix_product_units__unit_id
  ON public.product_units (unit_id);

CREATE INDEX ix_variant_barcodes__variant_id
  ON public.variant_barcodes (variant_id);

CREATE INDEX ix_attributes__usage_type_is_active
  ON public.attributes (usage_type, is_active);

CREATE INDEX ix_attribute_values__attribute_id_sort_order
  ON public.attribute_values (attribute_id, sort_order);

CREATE INDEX ix_variant_attribute_values__attribute_value_id_variant_id
  ON public.variant_attribute_values (attribute_value_id, variant_id);

CREATE INDEX ix_price_list_items__variant_id_price_list_id
  ON public.price_list_items (variant_id, price_list_id);

CREATE INDEX ix_reorder_levels__warehouse_id_variant_id
  ON public.reorder_levels (warehouse_id, variant_id);

-- §28.4
CREATE INDEX ix_inventory_movements__warehouse_id_occurred_at_desc_id_desc
  ON public.inventory_movements (warehouse_id, occurred_at DESC, id DESC);

CREATE INDEX ix_inventory_movements__branch_id_occurred_at_desc_id_desc
  ON public.inventory_movements (branch_id, occurred_at DESC, id DESC);

CREATE INDEX ix_inventory_movements__source_type_source_id
  ON public.inventory_movements (source_type, source_id);

CREATE INDEX ix_inventory_movements__posting_batch_id
  ON public.inventory_movements (posting_batch_id);

CREATE INDEX ix_inventory_movement_lines__movement_id
  ON public.inventory_movement_lines (movement_id);

CREATE INDEX ix_inventory_movement_lines__variant_id_movement_id
  ON public.inventory_movement_lines (variant_id, movement_id);

CREATE INDEX ix_inventory_line_serials__serial_id_movement_line_id
  ON public.inventory_line_serials (serial_id, movement_line_id);

CREATE INDEX ix_inventory_line_batches__batch_id_movement_line_id
  ON public.inventory_line_batches (batch_id, movement_line_id);

CREATE INDEX ix_inventory_stock_positions__variant_id_warehouse_id
  ON public.inventory_stock_positions (variant_id, warehouse_id);

CREATE INDEX ix_variant_warehouse_cost_projection__variant_id_warehouse_id
  ON public.variant_warehouse_cost_projection (variant_id, warehouse_id);

CREATE INDEX ix_batches__variant_id_expiry_date_created_at
  ON public.batches (variant_id, expiry_date, created_at);

CREATE INDEX ix_batch_stock_positions__warehouse_id_batch_id__where_64b43f37
  ON public.batch_stock_positions (warehouse_id, batch_id)
  WHERE on_hand > 0;

CREATE INDEX ix_serial_numbers__serial_number
  ON public.serial_numbers (serial_number);

CREATE INDEX ix_serial_numbers__current_warehouse_id_variant_id_status
  ON public.serial_numbers (current_warehouse_id, variant_id, status);

CREATE UNIQUE INDEX ux_stock_reservations__sales_order_line_id_warehouse_i_7a546c4c
  ON public.stock_reservations (sales_order_line_id, warehouse_id, variant_id)
  WHERE status IN ('ACTIVE','PARTIALLY_CONSUMED');

CREATE INDEX ix_stock_reservations__sales_order_id_status
  ON public.stock_reservations (sales_order_id, status);

CREATE INDEX ix_stock_reservations__warehouse_id_variant_id__where__9001b813
  ON public.stock_reservations (warehouse_id, variant_id)
  WHERE status IN ('ACTIVE','PARTIALLY_CONSUMED');

CREATE INDEX ix_stock_transfers__from_warehouse_id_posted_at_desc
  ON public.stock_transfers (from_warehouse_id, posted_at DESC);

CREATE INDEX ix_stock_transfers__to_warehouse_id_posted_at_desc
  ON public.stock_transfers (to_warehouse_id, posted_at DESC);

CREATE INDEX ix_stocktake_sessions__warehouse_id_started_at_desc
  ON public.stocktake_sessions (warehouse_id, started_at DESC);

CREATE INDEX ix_stocktake_sessions__warehouse_id_started_at_desc__w_944b561d
  ON public.stocktake_sessions (warehouse_id, started_at DESC)
  WHERE status IN ('OPEN','COUNTED');

CREATE INDEX ix_inventory_adjustments__warehouse_id_posted_at_desc
  ON public.inventory_adjustments (warehouse_id, posted_at DESC);

-- §28.5
CREATE INDEX ix_sales_quotes__branch_id_status_created_at_desc_id_desc
  ON public.sales_quotes (branch_id, status, created_at DESC, id DESC);

CREATE INDEX ix_sales_quotes__branch_id_counterparty_id_created_at_desc
  ON public.sales_quotes (branch_id, counterparty_id, created_at DESC);

CREATE INDEX ix_sales_quote_lines__quote_id
  ON public.sales_quote_lines (quote_id);

CREATE INDEX ix_sales_quote_lines__variant_id_quote_id
  ON public.sales_quote_lines (variant_id, quote_id);

CREATE INDEX ix_sales_orders__branch_id_status_updated_at_desc_id_desc
  ON public.sales_orders (branch_id, status, updated_at DESC, id DESC);

CREATE INDEX ix_sales_orders__branch_id_counterparty_id_created_at_desc
  ON public.sales_orders (branch_id, counterparty_id, created_at DESC);

CREATE INDEX ix_sales_orders__branch_id_sales_user_id_created_at_desc
  ON public.sales_orders (branch_id, sales_user_id, created_at DESC);

CREATE INDEX ix_sales_orders__source_quote_id
  ON public.sales_orders (source_quote_id);

CREATE INDEX ix_sales_order_lines__sales_order_id
  ON public.sales_order_lines (sales_order_id);

CREATE INDEX ix_sales_order_lines__variant_id_sales_order_id
  ON public.sales_order_lines (variant_id, sales_order_id);

CREATE INDEX ix_sales_order_status_history__sales_order_id_changed_at_desc
  ON public.sales_order_status_history (sales_order_id, changed_at DESC);

CREATE INDEX ix_sales_order_deliveries__sales_order_id_delivered_at_efba4c05
  ON public.sales_order_deliveries (sales_order_id, delivered_at DESC, id DESC);

CREATE INDEX ix_sales_order_delivery_lines__sales_order_line_id
  ON public.sales_order_delivery_lines (sales_order_line_id);

CREATE INDEX ix_sales_invoices__branch_id_posted_at_desc_id_desc
  ON public.sales_invoices (branch_id, posted_at DESC, id DESC);

CREATE INDEX ix_sales_invoices__branch_id_counterparty_id_posted_at_desc
  ON public.sales_invoices (branch_id, counterparty_id, posted_at DESC);

CREATE INDEX ix_sales_invoices__branch_id_seller_user_id_posted_at_desc
  ON public.sales_invoices (branch_id, seller_user_id, posted_at DESC);

CREATE INDEX ix_sales_invoices__branch_id_payment_status_posted_at_desc
  ON public.sales_invoices (branch_id, payment_status, posted_at DESC);

CREATE INDEX ix_sales_invoices__source_sales_order_id
  ON public.sales_invoices (source_sales_order_id);

CREATE UNIQUE INDEX ux_sales_invoices__source_delivery_id__where_source_de_7ebffff9
  ON public.sales_invoices (source_delivery_id)
  WHERE source_delivery_id IS NOT NULL;

CREATE INDEX ix_sales_invoice_lines__invoice_id
  ON public.sales_invoice_lines (invoice_id);

CREATE INDEX ix_sales_invoice_lines__variant_id_invoice_id
  ON public.sales_invoice_lines (variant_id, invoice_id);

CREATE INDEX ix_sales_returns__branch_id_posted_at_desc_id_desc
  ON public.sales_returns (branch_id, posted_at DESC, id DESC);

CREATE INDEX ix_sales_returns__branch_id_counterparty_id_posted_at_desc
  ON public.sales_returns (branch_id, counterparty_id, posted_at DESC);

CREATE INDEX ix_sales_returns__source_invoice_id_posted_at_desc
  ON public.sales_returns (source_invoice_id, posted_at DESC);

CREATE INDEX ix_sales_return_lines__sales_return_id
  ON public.sales_return_lines (sales_return_id);

CREATE INDEX ix_sales_return_lines__source_invoice_line_id
  ON public.sales_return_lines (source_invoice_line_id);

CREATE INDEX ix_sales_return_lines__variant_id_sales_return_id
  ON public.sales_return_lines (variant_id, sales_return_id);

CREATE INDEX ix_purchase_invoices__branch_id_posted_at_desc_id_desc
  ON public.purchase_invoices (branch_id, posted_at DESC, id DESC);

CREATE INDEX ix_purchase_invoices__branch_id_counterparty_id_posted_at_desc
  ON public.purchase_invoices (branch_id, counterparty_id, posted_at DESC);

CREATE INDEX ix_purchase_invoices__branch_id_payment_status_posted_at_desc
  ON public.purchase_invoices (branch_id, payment_status, posted_at DESC);

CREATE INDEX ix_purchase_invoice_lines__purchase_invoice_id
  ON public.purchase_invoice_lines (purchase_invoice_id);

CREATE INDEX ix_purchase_invoice_lines__variant_id_purchase_invoice_id
  ON public.purchase_invoice_lines (variant_id, purchase_invoice_id);

CREATE INDEX ix_purchase_returns__branch_id_posted_at_desc_id_desc
  ON public.purchase_returns (branch_id, posted_at DESC, id DESC);

CREATE INDEX ix_purchase_returns__branch_id_counterparty_id_posted_at_desc
  ON public.purchase_returns (branch_id, counterparty_id, posted_at DESC);

CREATE INDEX ix_purchase_returns__source_purchase_invoice_id_posted_at_desc
  ON public.purchase_returns (source_purchase_invoice_id, posted_at DESC);

CREATE INDEX ix_purchase_return_lines__purchase_return_id
  ON public.purchase_return_lines (purchase_return_id);

CREATE INDEX ix_purchase_return_lines__source_purchase_invoice_line_id
  ON public.purchase_return_lines (source_purchase_invoice_line_id);

CREATE INDEX ix_purchase_return_lines__variant_id_purchase_return_id
  ON public.purchase_return_lines (variant_id, purchase_return_id);

-- §28.6
CREATE UNIQUE INDEX ux_treasuries__branch_id_lower_name
  ON public.treasuries (branch_id, lower(name));

CREATE INDEX ix_treasuries__branch_id_id__where_is_active_true
  ON public.treasuries (branch_id, id)
  WHERE is_active = true;

CREATE INDEX ix_financial_movements__treasury_id_occurred_at_desc_id_desc
  ON public.financial_movements (treasury_id, occurred_at DESC, id DESC);

CREATE INDEX ix_financial_movements__branch_id_occurred_at_desc_id_desc
  ON public.financial_movements (branch_id, occurred_at DESC, id DESC);

CREATE INDEX ix_financial_movements__source_type_source_id
  ON public.financial_movements (source_type, source_id);

CREATE INDEX ix_financial_movements__posting_batch_id
  ON public.financial_movements (posting_batch_id);

CREATE UNIQUE INDEX ux_financial_movements__posting_batch_id_direction__wh_2ddfa8d4
  ON public.financial_movements (posting_batch_id, direction)
  WHERE source_type = 'TREASURY_TRANSFER';

CREATE INDEX ix_receipts__branch_id_posted_at_desc_id_desc
  ON public.receipts (branch_id, posted_at DESC, id DESC);

CREATE INDEX ix_receipts__branch_id_counterparty_id_posted_at_desc
  ON public.receipts (branch_id, counterparty_id, posted_at DESC);

CREATE INDEX ix_receipts__treasury_id_posted_at_desc
  ON public.receipts (treasury_id, posted_at DESC);

CREATE INDEX ix_disbursements__branch_id_posted_at_desc_id_desc
  ON public.disbursements (branch_id, posted_at DESC, id DESC);

CREATE INDEX ix_disbursements__branch_id_counterparty_id_posted_at_desc
  ON public.disbursements (branch_id, counterparty_id, posted_at DESC);

CREATE INDEX ix_disbursements__treasury_id_posted_at_desc
  ON public.disbursements (treasury_id, posted_at DESC);

CREATE INDEX ix_financial_allocations__target_type_target_id_created_at
  ON public.financial_allocations (target_type, target_id, created_at);

CREATE INDEX ix_customer_ledger_entries__counterparty_id_occurred_a_6fc7e550
  ON public.customer_ledger_entries (counterparty_id, occurred_at DESC, id DESC);

CREATE INDEX ix_customer_ledger_entries__counterparty_id_branch_id__25c18ba1
  ON public.customer_ledger_entries (counterparty_id, branch_id, occurred_at DESC, id DESC);

CREATE INDEX ix_customer_ledger_entries__branch_id_occurred_at_desc_id_desc
  ON public.customer_ledger_entries (branch_id, occurred_at DESC, id DESC);

CREATE INDEX ix_customer_ledger_entries__source_type_source_id
  ON public.customer_ledger_entries (source_type, source_id);

CREATE INDEX ix_customer_ledger_entries__posting_batch_id
  ON public.customer_ledger_entries (posting_batch_id);

CREATE INDEX ix_supplier_ledger_entries__counterparty_id_occurred_a_b58bc910
  ON public.supplier_ledger_entries (counterparty_id, occurred_at DESC, id DESC);

CREATE INDEX ix_supplier_ledger_entries__counterparty_id_branch_id__e9ac4a61
  ON public.supplier_ledger_entries (counterparty_id, branch_id, occurred_at DESC, id DESC);

CREATE INDEX ix_supplier_ledger_entries__branch_id_occurred_at_desc_id_desc
  ON public.supplier_ledger_entries (branch_id, occurred_at DESC, id DESC);

CREATE INDEX ix_supplier_ledger_entries__source_type_source_id
  ON public.supplier_ledger_entries (source_type, source_id);

CREATE INDEX ix_supplier_ledger_entries__posting_batch_id
  ON public.supplier_ledger_entries (posting_batch_id);

CREATE INDEX ix_treasury_transfers__from_treasury_id_posted_at_desc
  ON public.treasury_transfers (from_treasury_id, posted_at DESC);

CREATE INDEX ix_treasury_transfers__to_treasury_id_posted_at_desc
  ON public.treasury_transfers (to_treasury_id, posted_at DESC);

CREATE INDEX ix_treasury_transfers__issuing_branch_id_posted_at_desc_id_desc
  ON public.treasury_transfers (issuing_branch_id, posted_at DESC, id DESC);

CREATE INDEX ix_customer_advances__counterparty_id_created_at_desc
  ON public.customer_advances (counterparty_id, created_at DESC);

CREATE INDEX ix_customer_advances__sales_order_id_created_at_desc
  ON public.customer_advances (sales_order_id, created_at DESC);

CREATE INDEX ix_customer_advances__counterparty_id_created_at_desc__aaca9c34
  ON public.customer_advances (counterparty_id, created_at DESC)
  WHERE remaining_amount_projection > 0;

CREATE INDEX ix_advance_applications__advance_id_applied_at
  ON public.advance_applications (advance_id, applied_at);

CREATE INDEX ix_advance_applications__sales_invoice_id_applied_at
  ON public.advance_applications (sales_invoice_id, applied_at);

CREATE INDEX ix_cheques__branch_id_status_due_date_id
  ON public.cheques (branch_id, status, due_date, id);

CREATE INDEX ix_cheques__counterparty_id_status_due_date
  ON public.cheques (counterparty_id, status, due_date);

CREATE INDEX ix_cheques__source_type_source_id
  ON public.cheques (source_type, source_id);

CREATE INDEX ix_cheques__cheque_number
  ON public.cheques (cheque_number);

CREATE INDEX ix_cheques__branch_id_due_date_id__where_status_pending
  ON public.cheques (branch_id, due_date, id)
  WHERE status = 'PENDING';

CREATE INDEX ix_installment_plans__counterparty_id_source_type_source_id
  ON public.installment_plans (counterparty_id, source_type, source_id);

CREATE INDEX ix_installments__plan_id_due_date
  ON public.installments (plan_id, due_date);

CREATE INDEX ix_installments__plan_id_due_date_id__where_status_in__28b32c13
  ON public.installments (plan_id, due_date, id)
  WHERE status IN ('UPCOMING','DUE','PARTIAL','OVERDUE');

CREATE INDEX ix_gl_accounts__parent_id
  ON public.gl_accounts (parent_id);

CREATE INDEX ix_gl_accounts__account_type_is_active
  ON public.gl_accounts (account_type, is_active);

CREATE INDEX ix_journal_entries__branch_id_posted_at_desc_id_desc
  ON public.journal_entries (branch_id, posted_at DESC, id DESC);

CREATE INDEX ix_journal_entries__source_type_source_id
  ON public.journal_entries (source_type, source_id);

CREATE INDEX ix_journal_entries__posting_batch_id
  ON public.journal_entries (posting_batch_id);

CREATE INDEX ix_journal_entries__reversal_of_entry_id
  ON public.journal_entries (reversal_of_entry_id);

CREATE INDEX ix_journal_lines__journal_entry_id
  ON public.journal_lines (journal_entry_id);

CREATE INDEX ix_journal_lines__gl_account_id_journal_entry_id
  ON public.journal_lines (gl_account_id, journal_entry_id);

CREATE INDEX ix_journal_lines__counterparty_id_journal_entry_id__wh_4d79d29a
  ON public.journal_lines (counterparty_id, journal_entry_id)
  WHERE counterparty_id IS NOT NULL;

-- §28.7
CREATE INDEX ix_repair_orders__branch_id_status_updated_at_desc_id_desc
  ON public.repair_orders (branch_id, status, updated_at DESC, id DESC);

CREATE INDEX ix_repair_orders__branch_id_status_current_technician__a2e9ee06
  ON public.repair_orders (branch_id, status, current_technician_id, updated_at DESC);

CREATE INDEX ix_repair_orders__counterparty_id_created_at_desc
  ON public.repair_orders (counterparty_id, created_at DESC);

CREATE INDEX ix_repair_status_history__repair_order_id_changed_at_d_f089f00f
  ON public.repair_status_history (repair_order_id, changed_at DESC, id DESC);

CREATE INDEX ix_repair_assignments__repair_order_id_assigned_at_desc
  ON public.repair_assignments (repair_order_id, assigned_at DESC);

CREATE INDEX ix_repair_assignments__technician_id_assigned_at__wher_f6576645
  ON public.repair_assignments (technician_id, assigned_at)
  WHERE ended_at IS NULL;

CREATE INDEX ix_repair_issue_reports__repair_order_id_created_at_desc
  ON public.repair_issue_reports (repair_order_id, created_at DESC);

CREATE INDEX ix_customer_followups__branch_id_status_priority_due_at_id
  ON public.customer_followups (branch_id, status, priority, due_at, id);

CREATE INDEX ix_customer_followups__assigned_user_id_status_due_at__ea94de81
  ON public.customer_followups (assigned_user_id, status, due_at, id)
  WHERE completed_at IS NULL;

CREATE INDEX ix_customer_followups__source_type_source_id_created_at_desc
  ON public.customer_followups (source_type, source_id, created_at DESC);

CREATE INDEX ix_followup_actions__followup_id_created_at_desc_id_desc
  ON public.followup_actions (followup_id, created_at DESC, id DESC);

CREATE INDEX ix_followup_status_history__followup_id_changed_at_desc_id_desc
  ON public.followup_status_history (followup_id, changed_at DESC, id DESC);

CREATE INDEX ix_notifications__created_at_desc_id_desc
  ON public.notifications (created_at DESC, id DESC);

CREATE INDEX ix_notifications__source_type_source_id
  ON public.notifications (source_type, source_id);

CREATE INDEX ix_notification_recipients__user_id_notification_id
  ON public.notification_recipients (user_id, notification_id);

CREATE INDEX ix_notification_recipients__user_id__where_seen_at_is_null
  ON public.notification_recipients (user_id)
  WHERE seen_at IS NULL;

