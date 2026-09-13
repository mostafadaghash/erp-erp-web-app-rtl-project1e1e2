import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";
import { cleanupDatabase, MIGRATIONS, REPORTING_TABLES } from "./postgresql-schema-test-support.mjs";

const { Client } = pg;
const databaseUrl = process.env.ERP_TEST_DATABASE_URL;

const EXPECTED_COLUMNS = {
  print_templates: [["id","uuid",true],["document_type","text",true],["name","text",true],["paper_size","text",true],["template_code","text",true],["template_config_json","jsonb",true],["is_active","boolean",true],["created_at","timestamp with time zone",true]],
  branch_print_defaults: [["branch_id","uuid",true],["document_type","text",true],["print_template_id","uuid",true]],
  reporting_daily_branch_metrics: [["branch_id","uuid",true],["date","date",true],["sales_net","numeric(18,4)",true],["sales_returns","numeric(18,4)",true],["cogs","numeric(18,4)",true],["gross_profit","numeric(18,4)",true],["purchases_net","numeric(18,4)",true],["expenses","numeric(18,4)",true],["other_income","numeric(18,4)",true]],
  reporting_inventory_balances: [["branch_id","uuid",true],["warehouse_id","uuid",true],["variant_id","uuid",true],["on_hand","numeric(18,6)",true],["available","numeric(18,6)",true],["weighted_cost","numeric(18,4)",true],["inventory_value","numeric(18,4)",true]],
  reporting_counterparty_balances: [["counterparty_id","uuid",true],["customer_balance","numeric(18,4)",true],["supplier_balance","numeric(18,4)",true],["net_balance","numeric(18,4)",true],["updated_at","timestamp with time zone",true]],
  reporting_treasury_balances: [["treasury_id","uuid",true],["balance","numeric(18,4)",true],["updated_at","timestamp with time zone",true]],
  reporting_followup_metrics: [["branch_id","uuid",true],["date","date",true],["source_type","text",true],["created_count","bigint",true],["completed_count","bigint",true],["overdue_count","bigint",true]],
};

async function withClient(fn) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

test("03.J creates canonical Printing / Export / Reports Read Models schema", async (t) => {
  if (!databaseUrl) return t.skip("ERP_TEST_DATABASE_URL is not configured");
  await cleanupDatabase(databaseUrl);
  try {
    const first = await runMigrations({ databaseUrl });
    assert.deepEqual(first.applied, MIGRATIONS);
    assert.deepEqual(first.skipped, []);

    await withClient(async (client) => {
      const tables = await client.query(
        `SELECT tablename FROM pg_catalog.pg_tables
         WHERE schemaname='public' AND tablename = ANY($1::text[]) ORDER BY tablename`,
        [REPORTING_TABLES],
      );
      assert.deepEqual(tables.rows.map((row) => row.tablename), [...REPORTING_TABLES].sort());

      const columns = await client.query(
        `SELECT c.relname AS table_name, a.attname AS column_name,
                pg_catalog.format_type(a.atttypid,a.atttypmod) AS data_type,
                a.attnotnull AS not_null
         FROM pg_catalog.pg_class c
         JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
         JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
         WHERE n.nspname='public' AND c.relkind='r'
           AND c.relname = ANY($1::text[]) AND a.attnum > 0 AND NOT a.attisdropped
         ORDER BY c.relname,a.attnum`, [REPORTING_TABLES]);
      const actual = Object.fromEntries(REPORTING_TABLES.map((table) => [table, []]));
      for (const row of columns.rows) actual[row.table_name].push([row.column_name,row.data_type,row.not_null]);
      assert.deepEqual(actual, EXPECTED_COLUMNS);

      const aliases = await client.query(
        `SELECT
           to_regclass('public.templates_print') IS NULL AS no_templates_print_alias,
           to_regclass('public.export_jobs') IS NULL AS no_export_jobs,
           to_regclass('public.report_exports') IS NULL AS no_report_exports`,
      );
      assert.deepEqual(aliases.rows[0], {
        no_templates_print_alias: true,
        no_export_jobs: true,
        no_report_exports: true,
      });

      const constraints = await client.query(
        `SELECT count(*)::int AS count FROM pg_catalog.pg_constraint con
         JOIN pg_catalog.pg_class c ON c.oid=con.conrelid
         JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relname = ANY($1::text[])`, [REPORTING_TABLES]);
      assert.equal(constraints.rows[0].count, 0, "03.06 Printing/Reporting constraints must remain deferred");

      const indexes = await client.query(
        `SELECT count(*)::int AS count FROM pg_catalog.pg_index i
         JOIN pg_catalog.pg_class c ON c.oid=i.indrelid
         JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relname = ANY($1::text[])`, [REPORTING_TABLES]);
      assert.equal(indexes.rows[0].count, 0, "03.07 Printing/Reporting indexes must remain deferred");

      const branchSettingsShape = await client.query(
        `SELECT
           EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='branch_settings' AND column_name='default_sales_print_template_id') AS has_sales_compatibility_field,
           EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='branch_settings' AND column_name='default_purchase_print_template_id') AS has_purchase_compatibility_field`,
      );
      assert.deepEqual(branchSettingsShape.rows[0], {
        has_sales_compatibility_field: true,
        has_purchase_compatibility_field: true,
      });

      const ids = {
        template: "00000000-0000-4000-8000-000000000601",
        branch: "00000000-0000-4000-8000-000000000602",
        warehouse: "00000000-0000-4000-8000-000000000603",
        variant: "00000000-0000-4000-8000-000000000604",
        counterparty: "00000000-0000-4000-8000-000000000605",
        treasury: "00000000-0000-4000-8000-000000000606",
      };

      await client.query(
        `INSERT INTO print_templates
         (id,document_type,name,paper_size,template_code,template_config_json,is_active,created_at)
         VALUES ($1,'SALES_INVOICE','A4 Classic','A4','sales-a4-classic',$2::jsonb,true,now())`,
        [ids.template, JSON.stringify({ qr: { visible: false }, layout: "classic" })],
      );
      await client.query(
        `INSERT INTO branch_print_defaults (branch_id,document_type,print_template_id)
         VALUES ($1,'SALES_INVOICE',$2)`,
        [ids.branch, ids.template],
      );
      await client.query(
        `INSERT INTO reporting_daily_branch_metrics
         (branch_id,date,sales_net,sales_returns,cogs,gross_profit,purchases_net,expenses,other_income)
         VALUES ($1,DATE '2026-09-13',12345678901234.5678,10.0000,800.0000,400.0000,700.0000,100.0000,5.0000)`,
        [ids.branch],
      );
      await client.query(
        `INSERT INTO reporting_inventory_balances
         (branch_id,warehouse_id,variant_id,on_hand,available,weighted_cost,inventory_value)
         VALUES ($1,$2,$3,123456789012.123456,123456789000.123456,99.1234,12237406184842.9630)`,
        [ids.branch,ids.warehouse,ids.variant],
      );
      await client.query(
        `INSERT INTO reporting_counterparty_balances
         (counterparty_id,customer_balance,supplier_balance,net_balance,updated_at)
         VALUES ($1,1200.0000,200.0000,1000.0000,now())`,
        [ids.counterparty],
      );
      await client.query(
        `INSERT INTO reporting_treasury_balances (treasury_id,balance,updated_at)
         VALUES ($1,12345678901234.5678,now())`,
        [ids.treasury],
      );
      await client.query(
        `INSERT INTO reporting_followup_metrics
         (branch_id,date,source_type,created_count,completed_count,overdue_count)
         VALUES ($1,DATE '2026-09-13','REPAIR_ORDER',9007199254740993,9007199254740992,1)`,
        [ids.branch],
      );

      const persisted = await client.query(
        `SELECT
           (SELECT template_config_json FROM print_templates WHERE id=$1) AS template_config,
           (SELECT sales_net::text FROM reporting_daily_branch_metrics WHERE branch_id=$2 AND date=DATE '2026-09-13') AS sales_net,
           (SELECT on_hand::text FROM reporting_inventory_balances WHERE branch_id=$2 AND warehouse_id=$3 AND variant_id=$4) AS on_hand,
           (SELECT balance::text FROM reporting_treasury_balances WHERE treasury_id=$5) AS treasury_balance,
           (SELECT created_count::text FROM reporting_followup_metrics WHERE branch_id=$2 AND date=DATE '2026-09-13' AND source_type='REPAIR_ORDER') AS created_count`,
        [ids.template,ids.branch,ids.warehouse,ids.variant,ids.treasury],
      );
      assert.deepEqual(persisted.rows[0].template_config, { qr: { visible: false }, layout: "classic" });
      assert.equal(persisted.rows[0].sales_net, "12345678901234.5678");
      assert.equal(persisted.rows[0].on_hand, "123456789012.123456");
      assert.equal(persisted.rows[0].treasury_balance, "12345678901234.5678");
      assert.equal(persisted.rows[0].created_count, "9007199254740993");

      const history = await client.query("SELECT version,name,checksum FROM schema_migrations ORDER BY version");
      assert.equal(history.rowCount, 11);
      assert.equal(history.rows[10].version, "0011");
      assert.equal(history.rows[10].name, "printing_export_reports_read_models");
      assert.match(history.rows[10].checksum, /^[0-9a-f]{64}$/);
    });

    const second = await runMigrations({ databaseUrl });
    assert.deepEqual(second.applied, []);
    assert.deepEqual(second.skipped, MIGRATIONS);
    const verification = await runMigrations({ databaseUrl, verifyOnly: true });
    assert.deepEqual(verification.applied, []);
    assert.deepEqual(verification.skipped, MIGRATIONS);
  } finally {
    await cleanupDatabase(databaseUrl);
  }
});
