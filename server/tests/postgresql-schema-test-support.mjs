import pg from "pg";

const { Client } = pg;

export const REPORTING_TABLES = [
  "print_templates",
  "branch_print_defaults",
  "reporting_daily_branch_metrics",
  "reporting_inventory_balances",
  "reporting_counterparty_balances",
  "reporting_treasury_balances",
  "reporting_followup_metrics",
];

export const REPAIR_TABLES = [
  "repair_orders",
  "repair_status_history",
  "repair_assignments",
  "repair_issue_reports",
  "repair_customer_decisions",
  "repair_tracking_tokens",
  "customer_followups",
  "followup_actions",
  "followup_status_history",
  "message_templates",
  "notifications",
  "notification_recipients",
];

export const MIGRATIONS = [
  "0001",
  "0002",
  "0003",
  "0004",
  "0005",
  "0006",
  "0007",
  "0008",
  "0009",
  "0010",
  "0011",
  "0012",
  "0013",
  "0014",
  "0015",
  "0016",
  "0017",
  "0018",
  "0019",
  "0020",
  "0021",
  "0022",
  "0023",
  "0024",
];

export async function withClient(databaseUrl, fn) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function cleanupCoreConstraintLayer(client) {
  await client.query("DROP FUNCTION IF EXISTS public.fn_branch_settings_default_warehouse_valid_at_commit() CASCADE");
  await client.query("DROP FUNCTION IF EXISTS public.fn_warehouses_preserve_default_reference_at_commit() CASCADE");
  await client.query("DROP FUNCTION IF EXISTS public.fn_users_default_branch_access_at_commit() CASCADE");
  await client.query("DROP FUNCTION IF EXISTS public.fn_user_branch_access_preserves_default_at_commit() CASCADE");
  await client.query("ALTER TABLE IF EXISTS public.company_settings DROP CONSTRAINT IF EXISTS fk_company_settings__updated_by");
  await client.query("ALTER TABLE IF EXISTS public.branch_settings DROP CONSTRAINT IF EXISTS fk_branch_settings__default_warehouse");
  await client.query("ALTER TABLE IF EXISTS public.users DROP CONSTRAINT IF EXISTS fk_users__role");
}

async function cleanupProductConstraintLayer(client) {
  await client.query("DROP FUNCTION IF EXISTS public.fn_products_catalog_integrity_at_commit() CASCADE");
  await client.query("DROP FUNCTION IF EXISTS public.fn_product_units_preserve_catalog_integrity_at_commit() CASCADE");
  await client.query("DROP FUNCTION IF EXISTS public.fn_variant_barcodes_product_match_at_commit() CASCADE");
  await client.query("DROP FUNCTION IF EXISTS public.fn_product_variants_preserve_catalog_integrity_at_commit() CASCADE");
  await client.query("ALTER TABLE IF EXISTS public.products DROP CONSTRAINT IF EXISTS fk_products__base_unit");
  await client.query("ALTER TABLE IF EXISTS public.branch_settings DROP CONSTRAINT IF EXISTS fk_branch_settings__default_price_list");
  await client.query("ALTER TABLE IF EXISTS public.customer_profiles DROP CONSTRAINT IF EXISTS fk_customer_profiles__default_price_list");
}

async function cleanupSalesConstraintLayer(client) {
  await client.query("DROP FUNCTION IF EXISTS public.fn_sales_line_product_unit_match_at_commit() CASCADE");
  await client.query("DROP FUNCTION IF EXISTS public.fn_sales_delivery_line_source_match_at_commit() CASCADE");
  await client.query("DROP FUNCTION IF EXISTS public.fn_sales_delivery_hierarchy_preserve_at_commit() CASCADE");
  await client.query("DROP FUNCTION IF EXISTS public.fn_sales_invoice_source_match_at_commit() CASCADE");
  await client.query("DROP FUNCTION IF EXISTS public.fn_sales_return_source_match_at_commit() CASCADE");
  await client.query("DROP FUNCTION IF EXISTS public.fn_sales_return_source_preserve_at_commit() CASCADE");
  await client.query("DROP FUNCTION IF EXISTS public.fn_stock_reservations_sales_context_at_commit() CASCADE");
  await client.query("DROP FUNCTION IF EXISTS public.fn_sales_orders_preserve_reservation_context_at_commit() CASCADE");
  await client.query("DROP FUNCTION IF EXISTS public.fn_sales_order_lines_preserve_reservation_context_at_commit() CASCADE");
  await client.query("ALTER TABLE IF EXISTS public.stock_reservations DROP CONSTRAINT IF EXISTS fk_stock_reservations__sales_order_line");
  await client.query("ALTER TABLE IF EXISTS public.stock_reservations DROP CONSTRAINT IF EXISTS fk_stock_reservations__sales_order");
}

async function cleanupPurchasingConstraintLayer(client) {
  await client.query("DROP FUNCTION IF EXISTS public.fn_purchase_invoice_line_product_unit_match_at_commit() CASCADE");
  await client.query("DROP FUNCTION IF EXISTS public.fn_purchase_return_source_match_at_commit() CASCADE");
  await client.query("DROP FUNCTION IF EXISTS public.fn_purchase_return_source_preserve_at_commit() CASCADE");
  await client.query("ALTER TABLE IF EXISTS public.purchase_invoice_lines DROP CONSTRAINT IF EXISTS fk_purchase_invoice_lines__tax_code");
  await client.query("ALTER TABLE IF EXISTS public.sales_quote_lines DROP CONSTRAINT IF EXISTS fk_sales_quote_lines__tax_code");
  await client.query("ALTER TABLE IF EXISTS public.sales_order_lines DROP CONSTRAINT IF EXISTS fk_sales_order_lines__tax_code");
  await client.query("ALTER TABLE IF EXISTS public.sales_invoice_lines DROP CONSTRAINT IF EXISTS fk_sales_invoice_lines__tax_code");
  await client.query("ALTER TABLE IF EXISTS public.sales_return_lines DROP CONSTRAINT IF EXISTS fk_sales_return_lines__tax_code");
}

async function cleanupAccountingConstraintLayer(client) {
  await client.query("ALTER TABLE IF EXISTS public.finance_categories DROP CONSTRAINT IF EXISTS fk_finance_categories__gl_account");
}

async function cleanupReportingConstraintLayer(client) {
  await client.query("ALTER TABLE IF EXISTS public.branch_settings DROP CONSTRAINT IF EXISTS fk_branch_settings__default_sales_print_template");
  await client.query("ALTER TABLE IF EXISTS public.branch_settings DROP CONSTRAINT IF EXISTS fk_branch_settings__default_purchase_print_template");
}

export async function cleanupReportingTables(databaseUrl) {
  await withClient(databaseUrl, async (client) => {
    await cleanupCoreConstraintLayer(client);
    await cleanupProductConstraintLayer(client);
    await cleanupSalesConstraintLayer(client);
    await cleanupPurchasingConstraintLayer(client);
    await cleanupAccountingConstraintLayer(client);
    await cleanupReportingConstraintLayer(client);
    for (const table of [...REPORTING_TABLES].reverse()) {
      await client.query(`DROP TABLE IF EXISTS public.${table}`);
    }
  });
}

export async function cleanupDatabase(databaseUrl) {
  await withClient(databaseUrl, async (client) => {
    await client.query("DROP FUNCTION IF EXISTS public.fn_inventory_ledger_row_immutable() CASCADE");
    await client.query("DROP FUNCTION IF EXISTS public.fn_inventory_movement_line_direction_valid() CASCADE");
    await client.query("DROP FUNCTION IF EXISTS public.fn_inventory_movement_posting_context_valid() CASCADE");
    await client.query("DROP FUNCTION IF EXISTS public.fn_counterparty_ledger_entry_immutable() CASCADE");
    await cleanupCoreConstraintLayer(client);
    await cleanupProductConstraintLayer(client);
    await cleanupSalesConstraintLayer(client);
    await cleanupPurchasingConstraintLayer(client);
    await cleanupAccountingConstraintLayer(client);
    await cleanupReportingConstraintLayer(client);
    for (const table of [...REPORTING_TABLES].reverse()) await client.query(`DROP TABLE IF EXISTS public.${table}`);
    for (const table of [...REPAIR_TABLES].reverse()) await client.query(`DROP TABLE IF EXISTS public.${table}`);
    await client.query("DROP TABLE IF EXISTS public.journal_lines, public.journal_entries, public.gl_accounts");
    await client.query("DROP FUNCTION IF EXISTS public.fn_journal_entries_balanced_at_commit()");
    await client.query("DROP TABLE IF EXISTS public.installments, public.installment_plans, public.cheques, public.advance_applications, public.customer_advances, public.financial_allocations, public.treasury_balance_positions, public.financial_movements, public.treasury_transfers, public.finance_categories, public.disbursements, public.receipts, public.treasuries");
    await client.query("DROP VIEW IF EXISTS public.purchase_returnable_quantities_v");
    await client.query("DROP VIEW IF EXISTS public.sales_returnable_quantities_v");
    await client.query("DROP TABLE IF EXISTS public.purchase_return_lines, public.purchase_returns, public.purchase_invoice_lines, public.purchase_invoices, public.tax_codes");
    await client.query("DROP TABLE IF EXISTS public.sales_return_lines, public.sales_returns, public.sales_invoice_lines, public.sales_invoices, public.sales_order_delivery_lines, public.sales_order_deliveries, public.sales_order_shipping_details, public.sales_order_status_history, public.sales_order_lines, public.sales_orders, public.sales_quote_lines, public.sales_quotes");
    await client.query("DROP TABLE IF EXISTS public.inventory_adjustment_line_batches, public.inventory_adjustment_line_serials, public.inventory_adjustment_lines, public.inventory_adjustments, public.stocktake_line_batches, public.stocktake_line_serials, public.stocktake_lines, public.stocktake_sessions, public.stock_transfer_lines, public.stock_transfers, public.stock_reservations, public.batch_stock_positions, public.variant_warehouse_cost_projection, public.inventory_stock_positions, public.inventory_line_batches, public.inventory_line_serials, public.inventory_movement_lines, public.inventory_movements, public.batches, public.serial_numbers");
    await client.query("DROP TABLE IF EXISTS public.reorder_levels, public.price_list_items, public.price_lists, public.variant_attribute_values, public.product_attributes, public.attribute_values, public.attributes, public.variant_barcodes, public.product_units, public.units, public.product_variants, public.products, public.product_categories");
    await client.query("DROP TABLE IF EXISTS public.supplier_ledger_entries, public.customer_ledger_entries, public.supplier_profiles, public.customer_profiles, public.counterparty_roles, public.counterparties");
    await client.query("DROP TABLE IF EXISTS public.document_tombstones, public.outbox_events, public.audit_logs, public.posting_batches, public.idempotency_keys, public.document_sequences, public.user_branch_access, public.user_permission_overrides, public.role_permissions, public.permissions, public.roles, public.auth_sessions, public.users, public.warehouses, public.branch_settings, public.branches, public.company_settings, public.company_phones, public.companies");
    await client.query("DROP TABLE IF EXISTS public.schema_migrations");
    await client.query("DROP EXTENSION IF EXISTS pg_trgm");
  });
}
