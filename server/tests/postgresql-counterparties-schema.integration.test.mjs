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
const TARGET_TABLES = ["counterparties","counterparty_roles","customer_profiles","supplier_profiles","customer_ledger_entries","supplier_ledger_entries"];
const EXPECTED_COLUMNS = {"counterparties":[["id","uuid",true],["name","text",true],["phone","text",false],["normalized_phone","text",false],["address","text",false],["notes","text",false],["is_active","boolean",true],["created_at","timestamp with time zone",true],["updated_at","timestamp with time zone",true]],"counterparty_roles":[["counterparty_id","uuid",true],["role","text",true]],"customer_profiles":[["counterparty_id","uuid",true],["default_price_list_id","uuid",false],["credit_limit","numeric(18,4)",false]],"supplier_profiles":[["counterparty_id","uuid",true],["notes","text",false]],"customer_ledger_entries":[["id","uuid",true],["counterparty_id","uuid",true],["branch_id","uuid",true],["entry_type","text",true],["amount","numeric(18,4)",true],["source_type","text",true],["source_id","uuid",true],["posting_batch_id","uuid",true],["occurred_at","timestamp with time zone",true],["created_by","uuid",true]],"supplier_ledger_entries":[["id","uuid",true],["counterparty_id","uuid",true],["branch_id","uuid",true],["entry_type","text",true],["amount","numeric(18,4)",true],["source_type","text",true],["source_id","uuid",true],["posting_batch_id","uuid",true],["occurred_at","timestamp with time zone",true],["created_by","uuid",true]]};
const MIGRATIONS = ["0001","0002","0003","0004","0005"];

async function withClient(fn) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

async function cleanup() {
  await withClient(async (client) => {
    for (const table of [...INVENTORY_TABLES].reverse()) await client.query(`DROP TABLE IF EXISTS public.${table}`);
    for (const table of [...PRODUCT_TABLES].reverse()) await client.query(`DROP TABLE IF EXISTS public.${table}`);
    for (const table of [...COUNTERPARTY_TABLES].reverse()) await client.query(`DROP TABLE IF EXISTS public.${table}`);
    for (const table of [...CORE_TABLES].reverse()) await client.query(`DROP TABLE IF EXISTS public.${table}`);
    await client.query("DROP TABLE IF EXISTS public.schema_migrations");
    await client.query("DROP EXTENSION IF EXISTS pg_trgm");
  });
}

test("03.B Counterparties schema remains canonical after later schema migrations", async (t) => {
  if (!databaseUrl) return t.skip("ERP_TEST_DATABASE_URL is not configured");
  await cleanup();
  try {
    const first = await runMigrations({ databaseUrl });
    assert.deepEqual(first.applied, MIGRATIONS);

    await withClient(async (client) => {
      const tables = await client.query(
        `SELECT tablename FROM pg_catalog.pg_tables
         WHERE schemaname = 'public' AND tablename = ANY($1::text[]) ORDER BY tablename`,
        [TARGET_TABLES],
      );
      assert.deepEqual(tables.rows.map((r) => r.tablename), [...TARGET_TABLES].sort());

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
        [TARGET_TABLES],
      );
      const actual = Object.fromEntries(TARGET_TABLES.map((table) => [table, []]));
      for (const row of columns.rows) actual[row.table_name].push([row.column_name, row.data_type, row.not_null]);
      assert.deepEqual(actual, EXPECTED_COLUMNS);

      const constraints = await client.query(
        `SELECT count(*)::int AS count FROM pg_catalog.pg_constraint con
         JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
         JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])`,
        [TARGET_TABLES],
      );
      assert.equal(constraints.rows[0].count, 0, "03.06 constraints must remain deferred");

      const indexes = await client.query(
        `SELECT count(*)::int AS count FROM pg_catalog.pg_index i
         JOIN pg_catalog.pg_class c ON c.oid = i.indrelid
         JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])`,
        [TARGET_TABLES],
      );
      assert.equal(indexes.rows[0].count, 0, "03.07 indexes must remain deferred");

      const futureDomain = await client.query("SELECT to_regclass('public.sales_quotes') IS NULL AS absent");
      assert.equal(futureDomain.rows[0].absent, true, "03.E Sales must not start during 03.D");

      const history = await client.query("SELECT version, name, checksum FROM schema_migrations ORDER BY version");
      assert.equal(history.rowCount, 5);
      const target = history.rows.find((row) => row.version === "0003");
      assert.equal(target?.name, "counterparties");
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
