import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";
import { cleanupDatabase, MIGRATIONS, REPORTING_TABLES } from "./postgresql-schema-test-support.mjs";

const { Client } = pg;
const databaseUrl = process.env.ERP_TEST_DATABASE_URL;

async function withClient(fn) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

async function expectConstraint(promise, code, constraint) {
  await assert.rejects(promise, (error) => error?.code === code && error?.constraint === constraint);
}

async function seedFixture(client) {
  const ids = {
    company: "90000000-0000-4000-8000-000000000001",
    branch1: "90000000-0000-4000-8000-000000000002",
    branch2: "90000000-0000-4000-8000-000000000003",
    warehouse1: "90000000-0000-4000-8000-000000000004",
    category: "90000000-0000-4000-8000-000000000005",
    product: "90000000-0000-4000-8000-000000000006",
    variant: "90000000-0000-4000-8000-000000000007",
    unit: "90000000-0000-4000-8000-000000000008",
    productUnit: "90000000-0000-4000-8000-000000000009",
    counterparty: "90000000-0000-4000-8000-000000000010",
    treasury: "90000000-0000-4000-8000-000000000011",
    templateA4: "90000000-0000-4000-8000-000000000012",
    templateCompat: "90000000-0000-4000-8000-000000000013",
  };

  await client.query(`INSERT INTO companies
    (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at)
    VALUES ($1,'Reporting Test Co','EGP','ar-EG','Africa/Cairo',true,now(),now())`, [ids.company]);
  await client.query(`INSERT INTO branches
    (id,company_id,name,code,is_active,created_at,updated_at)
    VALUES ($1,$3,'Main','MAIN',true,now(),now()),($2,$3,'Second','SECOND',true,now(),now())`,
    [ids.branch1, ids.branch2, ids.company]);
  await client.query(`INSERT INTO warehouses
    (id,branch_id,name,code,is_active,created_at,updated_at)
    VALUES ($1,$2,'Main Warehouse','MAIN',true,now(),now())`, [ids.warehouse1, ids.branch1]);

  await client.query(`INSERT INTO product_categories (id,name,parent_id,is_active)
    VALUES ($1,'Reporting Category',NULL,true)`, [ids.category]);
  await client.query(`INSERT INTO units (id,name,symbol,allows_fraction,is_active)
    VALUES ($1,'Piece','pc',false,true)`, [ids.unit]);
  await client.query("BEGIN");
  await client.query(`INSERT INTO products
    (id,name,category_id,product_type,base_unit_id,tracking_serial,tracking_batch,tracking_expiry,is_active,created_at,updated_at)
    VALUES ($1,'Reporting Product',$2,'STOCK',$3,false,false,false,true,now(),now())`,
    [ids.product, ids.category, ids.productUnit]);
  await client.query(`INSERT INTO product_units
    (id,product_id,unit_id,conversion_to_base,is_sellable,is_purchasable)
    VALUES ($1,$2,$3,1,true,true)`, [ids.productUnit, ids.product, ids.unit]);
  await client.query(`INSERT INTO product_variants
    (id,product_id,name,sku,is_default,combination_signature,minimum_selling_price,is_active,created_at,updated_at)
    VALUES ($1,$2,'Default',NULL,true,'DEFAULT',0,true,now(),now())`, [ids.variant, ids.product]);
  await client.query("COMMIT");

  await client.query(`INSERT INTO counterparties
    (id,name,phone,normalized_phone,address,notes,is_active,created_at,updated_at)
    VALUES ($1,'Reporting Counterparty',NULL,NULL,NULL,NULL,true,now(),now())`, [ids.counterparty]);
  await client.query(`INSERT INTO treasuries
    (id,branch_id,name,is_active,notes,created_at)
    VALUES ($1,$2,'Main Cash',true,NULL,now())`, [ids.treasury, ids.branch1]);

  await client.query(`INSERT INTO print_templates
    (id,document_type,name,paper_size,template_code,template_config_json,is_active,created_at)
    VALUES ($1,'SALES_INVOICE','Sales A4','A4','sales-a4','{}'::jsonb,true,now()),
           ($2,'PURCHASE_INVOICE','Purchase A4','A4','purchase-a4','{}'::jsonb,true,now())`,
    [ids.templateA4, ids.templateCompat]);
  await client.query(`INSERT INTO branch_settings
    (branch_id,default_warehouse_id,default_price_list_id,default_sales_print_template_id,default_purchase_print_template_id,settings_json,updated_at)
    VALUES ($1,$2,NULL,$3,$4,'{}'::jsonb,now())`,
    [ids.branch1, ids.warehouse1, ids.templateA4, ids.templateCompat]);

  return ids;
}

test("03.06 Printing / Export / Reporting Read Models constraints enforce canonical integrity on PostgreSQL 17", async (t) => {
  if (!databaseUrl) return t.skip("ERP_TEST_DATABASE_URL is not configured");
  await cleanupDatabase(databaseUrl);
  try {
    const first = await runMigrations({ databaseUrl });
    assert.deepEqual(first.applied, MIGRATIONS);
    assert.deepEqual(first.skipped, []);

    await withClient(async (client) => {
      const expectedConstraints = [
        "pk_print_templates","ck_print_templates__paper_size","pk_branch_print_defaults",
        "fk_branch_print_defaults__branch","fk_branch_print_defaults__print_template",
        "fk_branch_settings__default_sales_print_template","fk_branch_settings__default_purchase_print_template",
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

      const independentIndexes = await client.query(`SELECT idx.relname AS index_name
        FROM pg_catalog.pg_index i
        JOIN pg_catalog.pg_class tbl ON tbl.oid=i.indrelid
        JOIN pg_catalog.pg_namespace n ON n.oid=tbl.relnamespace
        JOIN pg_catalog.pg_class idx ON idx.oid=i.indexrelid
        LEFT JOIN pg_catalog.pg_constraint con ON con.conindid=i.indexrelid
        WHERE n.nspname='public' AND tbl.relname=ANY($1::text[]) AND con.oid IS NULL
        ORDER BY idx.relname`, [REPORTING_TABLES]);
      assert.deepEqual(independentIndexes.rows, [], "frozen 03.07 catalog authorizes no independent Printing/Reporting indexes");

      const aliases = await client.query(`SELECT
        to_regclass('public.export_jobs') IS NULL AS no_export_jobs,
        to_regclass('public.report_exports') IS NULL AS no_report_exports`);
      assert.deepEqual(aliases.rows[0], { no_export_jobs: true, no_report_exports: true });

      const ids = await seedFixture(client);

      for (const [index, paperSize] of ["A4","A3","THERMAL_80","THERMAL_57"].entries()) {
        await client.query(`INSERT INTO print_templates
          (id,document_type,name,paper_size,template_code,template_config_json,is_active,created_at)
          VALUES ($1,'PROBE',$2,$3,$4,'{}'::jsonb,true,now())`,
          [`91000000-0000-4000-8000-${String(index + 1).padStart(12,"0")}`, `Probe ${paperSize}`, paperSize, `probe-${index}`]);
      }
      await expectConstraint(client.query(`INSERT INTO print_templates
        (id,document_type,name,paper_size,template_code,template_config_json,is_active,created_at)
        VALUES ('91000000-0000-4000-8000-000000000099','PROBE','Bad','LETTER','bad','{}'::jsonb,true,now())`),
        "23514", "ck_print_templates__paper_size");

      await client.query(`INSERT INTO branch_print_defaults (branch_id,document_type,print_template_id)
        VALUES ($1,'SALES_INVOICE',$2)`, [ids.branch1, ids.templateA4]);
      await expectConstraint(client.query(`INSERT INTO branch_print_defaults (branch_id,document_type,print_template_id)
        VALUES ($1,'SALES_INVOICE',$2)`, [ids.branch1, ids.templateCompat]), "23505", "pk_branch_print_defaults");
      await expectConstraint(client.query(`INSERT INTO branch_print_defaults (branch_id,document_type,print_template_id)
        VALUES ('ffffffff-ffff-4fff-8fff-ffffffffffff','PROBE',$1)`, [ids.templateA4]), "23503", "fk_branch_print_defaults__branch");
      await expectConstraint(client.query(`INSERT INTO branch_print_defaults (branch_id,document_type,print_template_id)
        VALUES ($1,'PROBE','ffffffff-ffff-4fff-8fff-ffffffffffff')`, [ids.branch2]), "23503", "fk_branch_print_defaults__print_template");
      await expectConstraint(client.query(`DELETE FROM print_templates WHERE id=$1`, [ids.templateA4]), "23503", "fk_branch_print_defaults__print_template");

      await client.query(`DELETE FROM print_templates WHERE id=$1`, [ids.templateCompat]);
      const compatibility = await client.query(`SELECT default_purchase_print_template_id
        FROM branch_settings WHERE branch_id=$1`, [ids.branch1]);
      assert.equal(compatibility.rows[0].default_purchase_print_template_id, null);

      await client.query(`INSERT INTO reporting_daily_branch_metrics
        (branch_id,date,sales_net,sales_returns,cogs,gross_profit,purchases_net,expenses,other_income)
        VALUES ($1,DATE '2026-09-17',100,20,90,-10,50,30,-5)`, [ids.branch1]);
      await expectConstraint(client.query(`INSERT INTO reporting_daily_branch_metrics
        (branch_id,date,sales_net,sales_returns,cogs,gross_profit,purchases_net,expenses,other_income)
        VALUES ($1,DATE '2026-09-17',1,1,1,1,1,1,1)`, [ids.branch1]), "23505", "pk_reporting_daily_branch_metrics");

      await client.query(`INSERT INTO reporting_inventory_balances
        (branch_id,warehouse_id,variant_id,on_hand,available,weighted_cost,inventory_value)
        VALUES ($1,$2,$3,-2,-3,10,-20)`, [ids.branch1, ids.warehouse1, ids.variant]);
      await expectConstraint(client.query(`INSERT INTO reporting_inventory_balances
        (branch_id,warehouse_id,variant_id,on_hand,available,weighted_cost,inventory_value)
        VALUES ($1,$2,$3,1,1,1,1)`, [ids.branch2, ids.warehouse1, ids.variant]),
        "23503", "fk_reporting_inventory_balances__warehouse_branch");
      await expectConstraint(client.query(`INSERT INTO reporting_inventory_balances
        (branch_id,warehouse_id,variant_id,on_hand,available,weighted_cost,inventory_value)
        VALUES ($1,$2,'ffffffff-ffff-4fff-8fff-ffffffffffff',1,1,1,1)`, [ids.branch1, ids.warehouse1]),
        "23503", "fk_reporting_inventory_balances__variant");

      await client.query(`INSERT INTO reporting_counterparty_balances
        (counterparty_id,customer_balance,supplier_balance,net_balance,updated_at)
        VALUES ($1,-100,50,-150,now())`, [ids.counterparty]);
      await expectConstraint(client.query(`INSERT INTO reporting_counterparty_balances
        (counterparty_id,customer_balance,supplier_balance,net_balance,updated_at)
        VALUES ('ffffffff-ffff-4fff-8fff-ffffffffffff',0,0,0,now())`),
        "23503", "fk_reporting_counterparty_balances__counterparty");

      await client.query(`INSERT INTO reporting_treasury_balances (treasury_id,balance,updated_at)
        VALUES ($1,-250,now())`, [ids.treasury]);
      await expectConstraint(client.query(`INSERT INTO reporting_treasury_balances (treasury_id,balance,updated_at)
        VALUES ('ffffffff-ffff-4fff-8fff-ffffffffffff',0,now())`), "23503", "fk_reporting_treasury_balances__treasury");

      await client.query(`INSERT INTO reporting_followup_metrics
        (branch_id,date,source_type,created_count,completed_count,overdue_count)
        VALUES ($1,DATE '2026-09-17','CUSTOM_EXTENSION',1,0,0)`, [ids.branch1]);
      await expectConstraint(client.query(`INSERT INTO reporting_followup_metrics
        (branch_id,date,source_type,created_count,completed_count,overdue_count)
        VALUES ($1,DATE '2026-09-18','MANUAL',-1,0,0)`, [ids.branch1]),
        "23514", "ck_reporting_followup_metrics__created_count_nonnegative");
      await expectConstraint(client.query(`INSERT INTO reporting_followup_metrics
        (branch_id,date,source_type,created_count,completed_count,overdue_count)
        VALUES ($1,DATE '2026-09-18','MANUAL',1,-1,0)`, [ids.branch1]),
        "23514", "ck_reporting_followup_metrics__completed_count_nonnegative");
      await expectConstraint(client.query(`INSERT INTO reporting_followup_metrics
        (branch_id,date,source_type,created_count,completed_count,overdue_count)
        VALUES ($1,DATE '2026-09-18','MANUAL',1,0,-1)`, [ids.branch1]),
        "23514", "ck_reporting_followup_metrics__overdue_count_nonnegative");

      const history = await client.query("SELECT version,name,checksum FROM schema_migrations ORDER BY version");
      assert.equal(history.rowCount, MIGRATIONS.length);
      const target = history.rows.find((row) => row.version === "0021");
      assert.equal(target?.name, "printing_export_reporting_read_models_constraints");
      assert.match(target?.checksum ?? "", /^[0-9a-f]{64}$/);
      assert.equal(history.rows.at(-1)?.version, "0022");
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
