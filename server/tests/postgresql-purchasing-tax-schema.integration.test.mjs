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
const PURCHASING_TABLES = ["purchase_invoices","purchase_invoice_lines","purchase_returns","purchase_return_lines","tax_codes"];
const MIGRATIONS = ["0001","0002","0003","0004","0005","0006","0007"];

const EXPECTED_COLUMNS = {
  purchase_invoices: [["id","uuid",true],["branch_id","uuid",true],["document_number","bigint",true],["document_date","date",true],["document_version","integer",true],["counterparty_id","uuid",false],["warehouse_id","uuid",true],["subtotal","numeric(18,4)",true],["discount_total","numeric(18,4)",true],["additional_cost","numeric(18,4)",true],["tax_total","numeric(18,4)",true],["grand_total","numeric(18,4)",true],["paid_total","numeric(18,4)",true],["due_total","numeric(18,4)",true],["payment_status","text",true],["notes","text",false],["posted_at","timestamp with time zone",true],["created_by","uuid",true],["deleted_at","timestamp with time zone",false],["deleted_by","uuid",false],["delete_reason","text",false]],
  purchase_invoice_lines: [["id","uuid",true],["purchase_invoice_id","uuid",true],["variant_id","uuid",true],["product_unit_id","uuid",true],["quantity","numeric(18,6)",true],["purchase_unit_price","numeric(18,4)",true],["discount_amount","numeric(18,4)",true],["net_before_tax","numeric(18,4)",true],["landed_cost_allocation","numeric(18,4)",true],["landed_unit_cost","numeric(18,4)",false],["tax_code_id","uuid",false],["tax_amount","numeric(18,4)",true],["line_total","numeric(18,4)",true]],
  purchase_returns: [["id","uuid",true],["branch_id","uuid",true],["document_number","bigint",true],["document_date","date",true],["document_version","integer",true],["counterparty_id","uuid",false],["warehouse_id","uuid",true],["source_purchase_invoice_id","uuid",false],["total","numeric(18,4)",true],["posted_at","timestamp with time zone",true],["created_by","uuid",true],["deleted_at","timestamp with time zone",false],["deleted_by","uuid",false],["delete_reason","text",false]],
  purchase_return_lines: [["id","uuid",true],["purchase_return_id","uuid",true],["source_purchase_invoice_line_id","uuid",false],["variant_id","uuid",true],["quantity","numeric(18,6)",true],["commercial_unit_value_snapshot","numeric(18,4)",true],["inventory_unit_cost_snapshot","numeric(18,4)",false],["cost_variance","numeric(18,4)",false],["tax_amount","numeric(18,4)",true],["line_total","numeric(18,4)",true]],
  tax_codes: [["id","uuid",true],["name","text",true],["code","text",true],["rate","numeric(18,4)",true],["tax_type","text",true],["is_purchase_recoverable","boolean",true],["is_active","boolean",true]],
};

async function withClient(fn) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

async function cleanup() {
  await withClient(async (client) => {
    await client.query("DROP VIEW IF EXISTS public.purchase_returnable_quantities_v");
    await client.query("DROP VIEW IF EXISTS public.sales_returnable_quantities_v");
    for (const table of [...PURCHASING_TABLES].reverse()) await client.query(`DROP TABLE IF EXISTS public.${table}`);
    for (const table of [...SALES_TABLES].reverse()) await client.query(`DROP TABLE IF EXISTS public.${table}`);
    for (const table of [...INVENTORY_TABLES].reverse()) await client.query(`DROP TABLE IF EXISTS public.${table}`);
    for (const table of [...PRODUCT_TABLES].reverse()) await client.query(`DROP TABLE IF EXISTS public.${table}`);
    for (const table of [...COUNTERPARTY_TABLES].reverse()) await client.query(`DROP TABLE IF EXISTS public.${table}`);
    for (const table of [...CORE_TABLES].reverse()) await client.query(`DROP TABLE IF EXISTS public.${table}`);
    await client.query("DROP TABLE IF EXISTS public.schema_migrations");
    await client.query("DROP EXTENSION IF EXISTS pg_trgm");
  });
}

test("03.F creates the canonical Purchasing/Tax schema and returnable helper view", async (t) => {
  if (!databaseUrl) return t.skip("ERP_TEST_DATABASE_URL is not configured");
  await cleanup();
  try {
    const first = await runMigrations({ databaseUrl });
    assert.deepEqual(first.applied, MIGRATIONS);
    assert.deepEqual(first.skipped, []);

    await withClient(async (client) => {
      const expectedTables = [...CORE_TABLES,...COUNTERPARTY_TABLES,...PRODUCT_TABLES,...INVENTORY_TABLES,...SALES_TABLES,...PURCHASING_TABLES].sort();
      const allTables = await client.query(
        `SELECT tablename FROM pg_catalog.pg_tables
         WHERE schemaname='public' AND tablename <> 'schema_migrations' ORDER BY tablename`,
      );
      assert.deepEqual(allTables.rows.map((row) => row.tablename), expectedTables);

      const view = await client.query(
        `SELECT c.relname, c.relkind FROM pg_catalog.pg_class c
         JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relname='purchase_returnable_quantities_v'`,
      );
      assert.equal(view.rowCount, 1);
      assert.equal(view.rows[0].relkind, "v");

      const columns = await client.query(
        `SELECT c.relname AS table_name, a.attname AS column_name,
                pg_catalog.format_type(a.atttypid,a.atttypmod) AS data_type,
                a.attnotnull AS not_null
         FROM pg_catalog.pg_class c
         JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
         JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
         WHERE n.nspname='public' AND c.relkind='r'
           AND c.relname = ANY($1::text[]) AND a.attnum > 0 AND NOT a.attisdropped
         ORDER BY c.relname,a.attnum`, [PURCHASING_TABLES]);
      const actual = Object.fromEntries(PURCHASING_TABLES.map((table) => [table, []]));
      for (const row of columns.rows) actual[row.table_name].push([row.column_name,row.data_type,row.not_null]);
      assert.deepEqual(actual, EXPECTED_COLUMNS);

      const viewColumns = await client.query(
        `SELECT a.attname AS column_name, pg_catalog.format_type(a.atttypid,a.atttypmod) AS data_type
         FROM pg_catalog.pg_class c
         JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
         JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
         WHERE n.nspname='public' AND c.relname='purchase_returnable_quantities_v'
           AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum`,
      );
      assert.deepEqual(viewColumns.rows.map((row) => [row.column_name,row.data_type]), [
        ["source_purchase_invoice_line_id","uuid"],
        ["purchased_quantity","numeric(18,6)"],
        ["posted_returned_quantity","numeric(18,6)"],
        ["returnable_quantity","numeric(18,6)"],
      ]);

      const constraints = await client.query(
        `SELECT count(*)::int AS count FROM pg_catalog.pg_constraint con
         JOIN pg_catalog.pg_class c ON c.oid=con.conrelid
         JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relname = ANY($1::text[])`, [PURCHASING_TABLES]);
      assert.equal(constraints.rows[0].count, 0, "03.06 constraints must remain deferred");

      const indexes = await client.query(
        `SELECT count(*)::int AS count FROM pg_catalog.pg_index i
         JOIN pg_catalog.pg_class c ON c.oid=i.indrelid
         JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relname = ANY($1::text[])`, [PURCHASING_TABLES]);
      assert.equal(indexes.rows[0].count, 0, "03.07 indexes must remain deferred");

      const futureDomain = await client.query("SELECT to_regclass('public.treasuries') IS NULL AS absent");
      assert.equal(futureDomain.rows[0].absent, true, "03.G Finance must remain absent");

      const ids = {
        line: "00000000-0000-4000-8000-000000000201",
        invoice: "00000000-0000-4000-8000-000000000202",
        variant: "00000000-0000-4000-8000-000000000203",
        unit: "00000000-0000-4000-8000-000000000204",
        activeReturn: "00000000-0000-4000-8000-000000000205",
        deletedReturn: "00000000-0000-4000-8000-000000000206",
        branch: "00000000-0000-4000-8000-000000000207",
        warehouse: "00000000-0000-4000-8000-000000000208",
        user: "00000000-0000-4000-8000-000000000209",
      };
      await client.query(
        `INSERT INTO purchase_invoice_lines
         (id,purchase_invoice_id,variant_id,product_unit_id,quantity,purchase_unit_price,discount_amount,net_before_tax,landed_cost_allocation,landed_unit_cost,tax_amount,line_total)
         VALUES ($1,$2,$3,$4,8.000000,50.0000,0.0000,400.0000,0.0000,50.0000,0.0000,400.0000)`,
        [ids.line,ids.invoice,ids.variant,ids.unit],
      );
      await client.query(
        `INSERT INTO purchase_returns
         (id,branch_id,document_number,document_date,document_version,counterparty_id,warehouse_id,source_purchase_invoice_id,total,posted_at,created_by)
         VALUES ($1,$2,1,CURRENT_DATE,1,NULL,$3,$4,150.0000,now(),$5),
                ($6,$2,2,CURRENT_DATE,1,NULL,$3,$4,50.0000,now(),$5)`,
        [ids.activeReturn,ids.branch,ids.warehouse,ids.invoice,ids.user,ids.deletedReturn],
      );
      await client.query(
        "UPDATE purchase_returns SET deleted_at=now(), deleted_by=$1, delete_reason='reversed test return' WHERE id=$2",
        [ids.user,ids.deletedReturn],
      );
      await client.query(
        `INSERT INTO purchase_return_lines
         (id,purchase_return_id,source_purchase_invoice_line_id,variant_id,quantity,commercial_unit_value_snapshot,inventory_unit_cost_snapshot,cost_variance,tax_amount,line_total)
         VALUES
         ('00000000-0000-4000-8000-000000000210',$1,$2,$3,3.000000,50.0000,48.0000,6.0000,0.0000,150.0000),
         ('00000000-0000-4000-8000-000000000211',$4,$2,$3,1.000000,50.0000,48.0000,2.0000,0.0000,50.0000)`,
        [ids.activeReturn,ids.line,ids.variant,ids.deletedReturn],
      );
      const returnable = await client.query(
        "SELECT purchased_quantity,posted_returned_quantity,returnable_quantity FROM purchase_returnable_quantities_v WHERE source_purchase_invoice_line_id=$1",
        [ids.line],
      );
      assert.deepEqual(returnable.rows[0], {
        purchased_quantity: "8.000000",
        posted_returned_quantity: "3.000000",
        returnable_quantity: "5.000000",
      });

      const history = await client.query("SELECT version,name,checksum FROM schema_migrations ORDER BY version");
      assert.equal(history.rowCount, 7);
      assert.equal(history.rows[6].version, "0007");
      assert.equal(history.rows[6].name, "purchasing_tax");
      assert.match(history.rows[6].checksum, /^[0-9a-f]{64}$/);
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
