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

test("03.J + 03.06 create canonical Printing / Export / Reports Read Models schema and integrity", async (t) => {
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

      const expectedConstraints = [
        "pk_print_templates","ck_print_templates__paper_size","pk_branch_print_defaults",
        "fk_branch_print_defaults__branch","fk_branch_print_defaults__print_template",
        "pk_reporting_daily_branch_metrics","fk_reporting_daily_branch_metrics__branch",
        "pk_reporting_inventory_balances","fk_reporting_inventory_balances__warehouse_branch",
        "fk_reporting_inventory_balances__variant","pk_reporting_counterparty_balances",
        "fk_reporting_counterparty_balances__counterparty","pk_reporting_treasury_balances",
        "fk_reporting_treasury_balances__treasury","pk_reporting_followup_metrics",
        "fk_reporting_followup_metrics__branch","ck_reporting_followup_metrics__created_count_nonnegative",
        "ck_reporting_followup_metrics__completed_count_nonnegative","ck_reporting_followup_metrics__overdue_count_nonnegative",
      ];
      const constraints = await client.query(`SELECT conname FROM pg_catalog.pg_constraint
        WHERE conname=ANY($1::text[]) ORDER BY conname`, [expectedConstraints]);
      assert.equal(constraints.rowCount, expectedConstraints.length);

      const independentIndexes = await client.query(
        `SELECT idx.relname AS index_name FROM pg_catalog.pg_index i
         JOIN pg_catalog.pg_class c ON c.oid=i.indrelid
         JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
         JOIN pg_catalog.pg_class idx ON idx.oid=i.indexrelid
         LEFT JOIN pg_catalog.pg_constraint con ON con.conindid=i.indexrelid
         WHERE n.nspname='public' AND c.relname = ANY($1::text[]) AND con.oid IS NULL`, [REPORTING_TABLES]);
      assert.deepEqual(independentIndexes.rows, [], "frozen 03.07 catalog authorizes no independent Printing/Reporting indexes");

      const branchSettingsShape = await client.query(
        `SELECT
           EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='branch_settings' AND column_name='default_sales_print_template_id') AS has_sales_compatibility_field,
           EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='branch_settings' AND column_name='default_purchase_print_template_id') AS has_purchase_compatibility_field,
           EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conname='fk_branch_settings__default_sales_print_template') AS has_sales_compatibility_fk,
           EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conname='fk_branch_settings__default_purchase_print_template') AS has_purchase_compatibility_fk`,
      );
      assert.deepEqual(branchSettingsShape.rows[0], {
        has_sales_compatibility_field: true,
        has_purchase_compatibility_field: true,
        has_sales_compatibility_fk: true,
        has_purchase_compatibility_fk: true,
      });

      const history = await client.query("SELECT version,name,checksum FROM schema_migrations ORDER BY version");
      assert.equal(history.rowCount, MIGRATIONS.length);
      const schemaSlice = history.rows.find((row) => row.version === "0011");
      assert.equal(schemaSlice?.name, "printing_export_reports_read_models");
      const constraintSlice = history.rows.find((row) => row.version === "0021");
      assert.equal(constraintSlice?.name, "printing_export_reporting_read_models_constraints");
      assert.match(constraintSlice?.checksum ?? "", /^[0-9a-f]{64}$/);
      assert.equal(history.rows.at(-1)?.version, "0025");
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
