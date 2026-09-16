import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { runMigrations } from "../../scripts/database/migrations.mjs";
import { cleanupDatabase, MIGRATIONS } from "./postgresql-schema-test-support.mjs";

const { Client } = pg;
const databaseUrl = process.env.ERP_TEST_DATABASE_URL;
const TARGET = ["serial_numbers","batches","inventory_movements","inventory_movement_lines","inventory_line_serials","inventory_line_batches","inventory_stock_positions","variant_warehouse_cost_projection","batch_stock_positions","stock_reservations","stock_transfers","stock_transfer_lines","stocktake_sessions","stocktake_lines","stocktake_line_serials","stocktake_line_batches","inventory_adjustments","inventory_adjustment_lines","inventory_adjustment_line_serials","inventory_adjustment_line_batches"];
const EXPECTED = {
  serial_numbers:[["id","uuid",true],["variant_id","uuid",true],["serial_number","text",true],["current_warehouse_id","uuid",false],["status","text",true],["created_at","timestamp with time zone",true]],
  batches:[["id","uuid",true],["variant_id","uuid",true],["batch_number","text",true],["expiry_date","date",false],["created_at","timestamp with time zone",true]],
  inventory_movements:[["id","uuid",true],["branch_id","uuid",true],["warehouse_id","uuid",true],["movement_type","text",true],["source_type","text",true],["source_id","uuid",true],["posting_batch_id","uuid",true],["occurred_at","timestamp with time zone",true],["created_by","uuid",true],["reason_code","text",false],["notes","text",false]],
  inventory_movement_lines:[["id","uuid",true],["movement_id","uuid",true],["variant_id","uuid",true],["quantity_signed","numeric(18,6)",true],["unit_cost","numeric(18,4)",true],["total_cost","numeric(18,4)",true]],
  inventory_line_serials:[["movement_line_id","uuid",true],["serial_id","uuid",true]],
  inventory_line_batches:[["movement_line_id","uuid",true],["batch_id","uuid",true],["quantity","numeric(18,6)",true]],
  inventory_stock_positions:[["warehouse_id","uuid",true],["variant_id","uuid",true],["on_hand","numeric(18,6)",true],["reserved","numeric(18,6)",true],["version","integer",true],["updated_at","timestamp with time zone",true]],
  variant_warehouse_cost_projection:[["warehouse_id","uuid",true],["variant_id","uuid",true],["weighted_average_cost","numeric(18,4)",true],["last_purchase_cost","numeric(18,4)",true],["inventory_value","numeric(18,4)",true],["updated_at","timestamp with time zone",true]],
  batch_stock_positions:[["warehouse_id","uuid",true],["batch_id","uuid",true],["on_hand","numeric(18,6)",true],["reserved","numeric(18,6)",true],["version","integer",true],["updated_at","timestamp with time zone",true]],
  stock_reservations:[["id","uuid",true],["sales_order_id","uuid",true],["sales_order_line_id","uuid",true],["warehouse_id","uuid",true],["variant_id","uuid",true],["quantity","numeric(18,6)",true],["status","text",true],["created_at","timestamp with time zone",true],["released_at","timestamp with time zone",false]],
  stock_transfers:[["id","uuid",true],["document_number","bigint",true],["issuing_branch_id","uuid",true],["from_warehouse_id","uuid",true],["to_warehouse_id","uuid",true],["status","text",true],["notes","text",false],["created_by","uuid",true],["posted_at","timestamp with time zone",true]],
  stock_transfer_lines:[["id","uuid",true],["transfer_id","uuid",true],["variant_id","uuid",true],["quantity","numeric(18,6)",true]],
  stocktake_sessions:[["id","uuid",true],["branch_id","uuid",true],["document_number","bigint",true],["warehouse_id","uuid",true],["status","text",true],["started_by","uuid",true],["started_at","timestamp with time zone",true],["approved_by","uuid",false],["approved_at","timestamp with time zone",false]],
  stocktake_lines:[["id","uuid",true],["session_id","uuid",true],["variant_id","uuid",true],["book_quantity_at_count","numeric(18,6)",true],["counted_quantity","numeric(18,6)",true],["counted_at","timestamp with time zone",true],["stock_position_version_at_count","integer",true],["difference","numeric(18,6)",true],["notes","text",false]],
  stocktake_line_serials:[["stocktake_line_id","uuid",true],["serial_id","uuid",true]],
  stocktake_line_batches:[["stocktake_line_id","uuid",true],["batch_id","uuid",true],["quantity","numeric(18,6)",true]],
  inventory_adjustments:[["id","uuid",true],["branch_id","uuid",true],["document_number","bigint",true],["warehouse_id","uuid",true],["source_stocktake_id","uuid",false],["reason_code","text",true],["notes","text",false],["created_by","uuid",true],["posted_at","timestamp with time zone",true]],
  inventory_adjustment_lines:[["id","uuid",true],["adjustment_id","uuid",true],["variant_id","uuid",true],["quantity_difference","numeric(18,6)",true],["unit_cost","numeric(18,4)",true]],
  inventory_adjustment_line_serials:[["adjustment_line_id","uuid",true],["serial_id","uuid",true]],
  inventory_adjustment_line_batches:[["adjustment_line_id","uuid",true],["batch_id","uuid",true],["quantity","numeric(18,6)",true]],
};

async function withClient(fn) { const client = new Client({ connectionString: databaseUrl }); await client.connect(); try { return await fn(client); } finally { await client.end(); } }

test("03.D Inventory remains canonical after its 03.06 constraint slice", async (t) => {
  if (!databaseUrl) return t.skip("ERP_TEST_DATABASE_URL is not configured");
  await cleanupDatabase(databaseUrl);
  try {
    const first = await runMigrations({ databaseUrl });
    assert.deepEqual(first.applied, MIGRATIONS);
    await withClient(async (client) => {
      const cols = await client.query(`SELECT c.relname table_name,a.attname column_name,pg_catalog.format_type(a.atttypid,a.atttypmod) data_type,a.attnotnull not_null FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid WHERE n.nspname='public' AND c.relkind='r' AND c.relname=ANY($1::text[]) AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`, [TARGET]);
      const actual = Object.fromEntries(TARGET.map((table) => [table, []]));
      for (const row of cols.rows) actual[row.table_name].push([row.column_name,row.data_type,row.not_null]);
      assert.deepEqual(actual, EXPECTED);

      const generated = await client.query(`SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='inventory_stock_positions' AND column_name='available') inventory_available_exists, EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='batch_stock_positions' AND column_name='available') batch_available_exists`);
      assert.deepEqual(generated.rows[0], { inventory_available_exists:false, batch_available_exists:false });

      const identity = await client.query(`SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='inventory_adjustment_lines' AND column_name='id') line_has_id, EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='inventory_adjustment_line_serials' AND column_name='adjustment_line_id') serial_child_uses_line_id, EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='inventory_adjustment_line_batches' AND column_name='adjustment_line_id') batch_child_uses_line_id`);
      assert.deepEqual(identity.rows[0], { line_has_id:true, serial_child_uses_line_id:true, batch_child_uses_line_id:true });

      const constraints = await client.query(`SELECT count(*)::int count FROM pg_catalog.pg_constraint con JOIN pg_catalog.pg_class c ON c.oid=con.conrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[])`, [TARGET]);
      assert.ok(constraints.rows[0].count > 0, "03.06 Inventory constraints must exist after migration 0015");

      const independentIndexes = await client.query(`SELECT count(*)::int count FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_catalog.pg_constraint con ON con.conindid=i.indexrelid WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND con.oid IS NULL`, [TARGET]);
      assert.equal(independentIndexes.rows[0].count, 0, "03.07 independent Inventory indexes must remain deferred");

      const later = await client.query("SELECT to_regclass('public.print_templates') IS NOT NULL present");
      assert.equal(later.rows[0].present, true);
      const history = await client.query("SELECT version,name,checksum FROM schema_migrations ORDER BY version");
      assert.equal(history.rowCount, MIGRATIONS.length);
      assert.equal(history.rows.find((row) => row.version === '0005')?.name, 'inventory');
      assert.equal(history.rows.find((row) => row.version === '0015')?.name, 'inventory_constraints');
      for (const row of history.rows) assert.match(row.checksum, /^[0-9a-f]{64}$/);
    });

    const second = await runMigrations({ databaseUrl });
    assert.deepEqual(second.applied, []);
    assert.deepEqual(second.skipped, MIGRATIONS);
    const verify = await runMigrations({ databaseUrl, verifyOnly:true });
    assert.deepEqual(verify.applied, []);
    assert.deepEqual(verify.skipped, MIGRATIONS);
  } finally {
    await cleanupDatabase(databaseUrl);
  }
});
