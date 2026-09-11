import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";

const { Client } = pg;
const databaseUrl = process.env.ERP_TEST_DATABASE_URL;

const CORE_TABLES = ["companies","company_phones","company_settings","branches","branch_settings","warehouses","users","auth_sessions","roles","permissions","role_permissions","user_permission_overrides","user_branch_access","document_sequences","idempotency_keys","posting_batches","audit_logs","outbox_events","document_tombstones"];
const COUNTERPARTY_TABLES = ["counterparties","counterparty_roles","customer_profiles","supplier_profiles","customer_ledger_entries","supplier_ledger_entries"];
const PRODUCT_TABLES = ["product_categories","products","product_variants","units","product_units","variant_barcodes","attributes","attribute_values","product_attributes","variant_attribute_values","price_lists","price_list_items","reorder_levels"];
const INVENTORY_TABLES = ["serial_numbers","batches","inventory_movements","inventory_movement_lines","inventory_line_serials","inventory_line_batches","inventory_stock_positions","variant_warehouse_cost_projection","batch_stock_positions","stock_reservations","stock_transfers","stock_transfer_lines","stocktake_sessions","stocktake_lines","stocktake_line_serials","stocktake_line_batches","inventory_adjustments","inventory_adjustment_lines","inventory_adjustment_line_serials","inventory_adjustment_line_batches"];
const SALES_TABLES = ["sales_quotes","sales_quote_lines","sales_orders","sales_order_lines","sales_order_status_history","sales_order_shipping_details","sales_order_deliveries","sales_order_delivery_lines","sales_invoices","sales_invoice_lines","sales_returns","sales_return_lines"];
const MIGRATIONS = ["0001","0002","0003","0004","0005","0006"];

const EXPECTED_COLUMNS = {
  serial_numbers: [["id","uuid",true],["variant_id","uuid",true],["serial_number","text",true],["current_warehouse_id","uuid",false],["status","text",true],["created_at","timestamp with time zone",true]],
  batches: [["id","uuid",true],["variant_id","uuid",true],["batch_number","text",true],["expiry_date","date",false],["created_at","timestamp with time zone",true]],
  inventory_movements: [["id","uuid",true],["branch_id","uuid",true],["warehouse_id","uuid",true],["movement_type","text",true],["source_type","text",true],["source_id","uuid",true],["posting_batch_id","uuid",true],["occurred_at","timestamp with time zone",true],["created_by","uuid",true],["reason_code","text",false],["notes","text",false]],
  inventory_movement_lines: [["id","uuid",true],["movement_id","uuid",true],["variant_id","uuid",true],["quantity_signed","numeric(18,6)",true],["unit_cost","numeric(18,4)",true],["total_cost","numeric(18,4)",true]],
  inventory_line_serials: [["movement_line_id","uuid",true],["serial_id","uuid",true]],
  inventory_line_batches: [["movement_line_id","uuid",true],["batch_id","uuid",true],["quantity","numeric(18,6)",true]],
  inventory_stock_positions: [["warehouse_id","uuid",true],["variant_id","uuid",true],["on_hand","numeric(18,6)",true],["reserved","numeric(18,6)",true],["version","integer",true],["updated_at","timestamp with time zone",true]],
  variant_warehouse_cost_projection: [["warehouse_id","uuid",true],["variant_id","uuid",true],["weighted_average_cost","numeric(18,4)",true],["last_purchase_cost","numeric(18,4)",true],["inventory_value","numeric(18,4)",true],["updated_at","timestamp with time zone",true]],
  batch_stock_positions: [["warehouse_id","uuid",true],["batch_id","uuid",true],["on_hand","numeric(18,6)",true],["reserved","numeric(18,6)",true],["version","integer",true],["updated_at","timestamp with time zone",true]],
  stock_reservations: [["id","uuid",true],["sales_order_id","uuid",true],["sales_order_line_id","uuid",true],["warehouse_id","uuid",true],["variant_id","uuid",true],["quantity","numeric(18,6)",true],["status","text",true],["created_at","timestamp with time zone",true],["released_at","timestamp with time zone",false]],
  stock_transfers: [["id","uuid",true],["document_number","bigint",true],["issuing_branch_id","uuid",true],["from_warehouse_id","uuid",true],["to_warehouse_id","uuid",true],["status","text",true],["notes","text",false],["created_by","uuid",true],["posted_at","timestamp with time zone",true]],
  stock_transfer_lines: [["id","uuid",true],["transfer_id","uuid",true],["variant_id","uuid",true],["quantity","numeric(18,6)",true]],
  stocktake_sessions: [["id","uuid",true],["branch_id","uuid",true],["document_number","bigint",true],["warehouse_id","uuid",true],["status","text",true],["started_by","uuid",true],["started_at","timestamp with time zone",true],["approved_by","uuid",false],["approved_at","timestamp with time zone",false]],
  stocktake_lines: [["id","uuid",true],["session_id","uuid",true],["variant_id","uuid",true],["book_quantity_at_count","numeric(18,6)",true],["counted_quantity","numeric(18,6)",true],["counted_at","timestamp with time zone",true],["stock_position_version_at_count","integer",true],["difference","numeric(18,6)",true],["notes","text",false]],
  stocktake_line_serials: [["stocktake_line_id","uuid",true],["serial_id","uuid",true]],
  stocktake_line_batches: [["stocktake_line_id","uuid",true],["batch_id","uuid",true],["quantity","numeric(18,6)",true]],
  inventory_adjustments: [["id","uuid",true],["branch_id","uuid",true],["document_number","bigint",true],["warehouse_id","uuid",true],["source_stocktake_id","uuid",false],["reason_code","text",true],["notes","text",false],["created_by","uuid",true],["posted_at","timestamp with time zone",true]],
  inventory_adjustment_lines: [["id","uuid",true],["adjustment_id","uuid",true],["variant_id","uuid",true],["quantity_difference","numeric(18,6)",true],["unit_cost","numeric(18,4)",true]],
  inventory_adjustment_line_serials: [["adjustment_line_id","uuid",true],["serial_id","uuid",true]],
  inventory_adjustment_line_batches: [["adjustment_line_id","uuid",true],["batch_id","uuid",true],["quantity","numeric(18,6)",true]],
};

async function withClient(fn) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

async function cleanup() {
  await withClient(async (client) => {
    await client.query("DROP VIEW IF EXISTS public.sales_returnable_quantities_v");
    for (const table of [...SALES_TABLES].reverse()) await client.query(`DROP TABLE IF EXISTS public.${table}`);
    for (const table of [...INVENTORY_TABLES].reverse()) await client.query(`DROP TABLE IF EXISTS public.${table}`);
    for (const table of [...PRODUCT_TABLES].reverse()) await client.query(`DROP TABLE IF EXISTS public.${table}`);
    for (const table of [...COUNTERPARTY_TABLES].reverse()) await client.query(`DROP TABLE IF EXISTS public.${table}`);
    for (const table of [...CORE_TABLES].reverse()) await client.query(`DROP TABLE IF EXISTS public.${table}`);
    await client.query("DROP TABLE IF EXISTS public.schema_migrations");
    await client.query("DROP EXTENSION IF EXISTS pg_trgm");
  });
}

test("03.D Inventory schema remains canonical after later schema migrations", async (t) => {
  if (!databaseUrl) return t.skip("ERP_TEST_DATABASE_URL is not configured");
  await cleanup();
  try {
    const first = await runMigrations({ databaseUrl });
    assert.deepEqual(first.applied, MIGRATIONS);

    await withClient(async (client) => {
      const tables = await client.query(
        `SELECT tablename FROM pg_catalog.pg_tables
         WHERE schemaname = 'public' AND tablename = ANY($1::text[]) ORDER BY tablename`,
        [INVENTORY_TABLES],
      );
      assert.deepEqual(tables.rows.map((r) => r.tablename), [...INVENTORY_TABLES].sort());

      const columns = await client.query(
        `SELECT c.relname AS table_name, a.attname AS column_name,
                pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
                a.attnotnull AS not_null
         FROM pg_catalog.pg_class c
         JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
         WHERE n.nspname = 'public' AND c.relkind = 'r'
           AND c.relname = ANY($1::text[]) AND a.attnum > 0 AND NOT a.attisdropped
         ORDER BY c.relname, a.attnum`,
        [INVENTORY_TABLES],
      );
      const actual = Object.fromEntries(INVENTORY_TABLES.map((table) => [table, []]));
      for (const row of columns.rows) actual[row.table_name].push([row.column_name,row.data_type,row.not_null]);
      assert.deepEqual(actual, EXPECTED_COLUMNS);

      const generatedDeferred = await client.query(
        `SELECT
           EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='inventory_stock_positions' AND column_name='available') AS inventory_available_exists,
           EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='batch_stock_positions' AND column_name='available') AS batch_available_exists`,
      );
      assert.equal(generatedDeferred.rows[0].inventory_available_exists, false);
      assert.equal(generatedDeferred.rows[0].batch_available_exists, false);

      const adjustmentLineIdentity = await client.query(
        `SELECT
           EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='inventory_adjustment_lines' AND column_name='id') AS line_has_id,
           EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='inventory_adjustment_line_serials' AND column_name='adjustment_line_id') AS serial_child_uses_line_id,
           EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='inventory_adjustment_line_batches' AND column_name='adjustment_line_id') AS batch_child_uses_line_id`,
      );
      assert.equal(adjustmentLineIdentity.rows[0].line_has_id, true);
      assert.equal(adjustmentLineIdentity.rows[0].serial_child_uses_line_id, true);
      assert.equal(adjustmentLineIdentity.rows[0].batch_child_uses_line_id, true);

      const constraints = await client.query(
        `SELECT count(*)::int AS count FROM pg_catalog.pg_constraint con
         JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
         JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname='public' AND c.relname = ANY($1::text[])`, [INVENTORY_TABLES]);
      assert.equal(constraints.rows[0].count, 0, "03.06 constraints must remain deferred");

      const indexes = await client.query(
        `SELECT count(*)::int AS count FROM pg_catalog.pg_index i
         JOIN pg_catalog.pg_class c ON c.oid=i.indrelid
         JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relname = ANY($1::text[])`, [INVENTORY_TABLES]);
      assert.equal(indexes.rows[0].count, 0, "03.07 indexes must remain deferred");

      const futureDomain = await client.query("SELECT to_regclass('public.purchase_invoices') IS NULL AS absent");
      assert.equal(futureDomain.rows[0].absent, true, "03.F Purchasing must not start during 03.E");

      const history = await client.query("SELECT version,name,checksum FROM schema_migrations ORDER BY version");
      assert.equal(history.rowCount, 6);
      const target = history.rows.find((row) => row.version === "0005");
      assert.equal(target?.name, "inventory");
      assert.match(target?.checksum ?? "", /^[0-9a-f]{64}$/);
    });

    const second = await runMigrations({ databaseUrl });
    assert.deepEqual(second.applied, []);
    assert.deepEqual(second.skipped, MIGRATIONS);
    const verification = await runMigrations({ databaseUrl, verifyOnly: true });
    assert.deepEqual(verification.applied, []);
    assert.deepEqual(verification.skipped, MIGRATIONS);
  } finally {
    await cleanup();
  }
});
