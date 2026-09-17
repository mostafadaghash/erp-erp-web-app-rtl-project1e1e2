import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";
import { cleanupDatabase, MIGRATIONS } from "./postgresql-schema-test-support.mjs";

const { Client } = pg;
const databaseUrl = process.env.ERP_TEST_DATABASE_URL;
const TARGET = ["purchase_invoices","purchase_invoice_lines","purchase_returns","purchase_return_lines","tax_codes"];

const EXPECTED = {
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

async function seedViewFixture(client) {
  const ids = {
    company: "51000000-0000-4000-8000-000000000001",
    branch: "51000000-0000-4000-8000-000000000002",
    warehouse: "51000000-0000-4000-8000-000000000003",
    role: "51000000-0000-4000-8000-000000000004",
    user: "51000000-0000-4000-8000-000000000005",
    counterparty: "51000000-0000-4000-8000-000000000006",
    category: "51000000-0000-4000-8000-000000000007",
    unit: "51000000-0000-4000-8000-000000000008",
    product: "51000000-0000-4000-8000-000000000009",
    productUnit: "51000000-0000-4000-8000-000000000010",
    variant: "51000000-0000-4000-8000-000000000011",
    invoice: "51000000-0000-4000-8000-000000000012",
    line: "51000000-0000-4000-8000-000000000013",
    activeReturn: "51000000-0000-4000-8000-000000000014",
    deletedReturn: "51000000-0000-4000-8000-000000000015",
  };

  await client.query(`INSERT INTO companies (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at)
    VALUES ($1,'Purchasing Schema Co','EGP','ar-EG','Africa/Cairo',true,now(),now())`, [ids.company]);
  await client.query(`INSERT INTO branches (id,company_id,name,code,is_active,created_at,updated_at)
    VALUES ($1,$2,'Main','MAIN',true,now(),now())`, [ids.branch, ids.company]);
  await client.query(`INSERT INTO warehouses (id,branch_id,name,code,is_active,created_at,updated_at)
    VALUES ($1,$2,'Main WH','MAIN-WH',true,now(),now())`, [ids.warehouse, ids.branch]);
  await client.query(`INSERT INTO roles (id,role_key,display_name_key,is_system)
    VALUES ($1,'PURCH_SCHEMA','roles.purchSchema',true)`, [ids.role]);
  await client.query(`INSERT INTO users
    (id,name,username,email,password_hash,role_id,default_branch_id,branch_scope_mode,preferred_language,is_active,created_at,updated_at)
    VALUES ($1,'Purchasing Schema User','purch-schema',NULL,'hash',$2,$3,'ALL','ar-EG',true,now(),now())`,
    [ids.user, ids.role, ids.branch]);
  await client.query(`INSERT INTO counterparties
    (id,name,phone,normalized_phone,address,notes,is_active,created_at,updated_at)
    VALUES ($1,'Schema Supplier',NULL,NULL,NULL,NULL,true,now(),now())`, [ids.counterparty]);
  await client.query(`INSERT INTO counterparty_roles (counterparty_id,role) VALUES ($1,'SUPPLIER')`, [ids.counterparty]);
  await client.query(`INSERT INTO product_categories (id,name,parent_id,is_active) VALUES ($1,'Schema Purchase',NULL,true)`, [ids.category]);
  await client.query(`INSERT INTO units (id,name,symbol,allows_fraction,is_active) VALUES ($1,'Schema Piece','spc',false,true)`, [ids.unit]);

  await client.query("BEGIN");
  await client.query(`INSERT INTO products
    (id,name,category_id,product_type,base_unit_id,tracking_serial,tracking_batch,tracking_expiry,is_active,created_at,updated_at)
    VALUES ($1,'Schema Product',$2,'STOCK',$3,false,false,false,true,now(),now())`, [ids.product, ids.category, ids.productUnit]);
  await client.query(`INSERT INTO product_units (id,product_id,unit_id,conversion_to_base,is_sellable,is_purchasable)
    VALUES ($1,$2,$3,1.000000,true,true)`, [ids.productUnit, ids.product, ids.unit]);
  await client.query(`INSERT INTO product_variants
    (id,product_id,name,sku,is_default,combination_signature,minimum_selling_price,is_active,created_at,updated_at)
    VALUES ($1,$2,'Default','PUR-SCHEMA',true,'DEFAULT-SCHEMA',0.0000,true,now(),now())`, [ids.variant, ids.product]);
  await client.query("COMMIT");

  await client.query(`INSERT INTO purchase_invoices
    (id,branch_id,document_number,document_date,document_version,counterparty_id,warehouse_id,subtotal,discount_total,additional_cost,tax_total,grand_total,paid_total,due_total,payment_status,notes,posted_at,created_by,deleted_at,deleted_by,delete_reason)
    VALUES ($1,$2,1,CURRENT_DATE,1,$3,$4,400.0000,0.0000,0.0000,0.0000,400.0000,400.0000,0.0000,'POSTED',NULL,now(),$5,NULL,NULL,NULL)`,
    [ids.invoice, ids.branch, ids.counterparty, ids.warehouse, ids.user]);
  await client.query(`INSERT INTO purchase_invoice_lines
    (id,purchase_invoice_id,variant_id,product_unit_id,quantity,purchase_unit_price,discount_amount,net_before_tax,landed_cost_allocation,landed_unit_cost,tax_code_id,tax_amount,line_total)
    VALUES ($1,$2,$3,$4,8.000000,50.0000,0.0000,400.0000,0.0000,50.0000,NULL,0.0000,400.0000)`,
    [ids.line, ids.invoice, ids.variant, ids.productUnit]);
  await client.query(`INSERT INTO purchase_returns
    (id,branch_id,document_number,document_date,document_version,counterparty_id,warehouse_id,source_purchase_invoice_id,total,posted_at,created_by,deleted_at,deleted_by,delete_reason)
    VALUES ($1,$3,1,CURRENT_DATE,1,$4,$5,$6,150.0000,now(),$7,NULL,NULL,NULL),
           ($2,$3,2,CURRENT_DATE,1,$4,$5,$6,50.0000,now(),$7,now(),$7,'reversed test return')`,
    [ids.activeReturn, ids.deletedReturn, ids.branch, ids.counterparty, ids.warehouse, ids.invoice, ids.user]);
  await client.query(`INSERT INTO purchase_return_lines
    (id,purchase_return_id,source_purchase_invoice_line_id,variant_id,quantity,commercial_unit_value_snapshot,inventory_unit_cost_snapshot,cost_variance,tax_amount,line_total)
    VALUES ('51000000-0000-4000-8000-000000000016',$1,$2,$3,3.000000,50.0000,48.0000,6.0000,0.0000,150.0000),
           ('51000000-0000-4000-8000-000000000017',$4,$2,$3,1.000000,50.0000,48.0000,2.0000,0.0000,50.0000)`,
    [ids.activeReturn, ids.line, ids.variant, ids.deletedReturn]);

  return ids;
}

test("03.F Purchasing/Tax remains canonical after its 03.06 constraint slice", async (t) => {
  if (!databaseUrl) return t.skip("ERP_TEST_DATABASE_URL is not configured");
  await cleanupDatabase(databaseUrl);
  try {
    const first = await runMigrations({ databaseUrl });
    assert.deepEqual(first.applied, MIGRATIONS);
    assert.deepEqual(first.skipped, []);

    await withClient(async (client) => {
      const cols = await client.query(`SELECT c.relname table_name,a.attname column_name,
        pg_catalog.format_type(a.atttypid,a.atttypmod) data_type,a.attnotnull not_null
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
        JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
        WHERE n.nspname='public' AND c.relkind='r' AND c.relname=ANY($1::text[])
          AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`, [TARGET]);
      const actual = Object.fromEntries(TARGET.map((table) => [table, []]));
      for (const row of cols.rows) actual[row.table_name].push([row.column_name,row.data_type,row.not_null]);
      assert.deepEqual(actual, EXPECTED);

      const viewCols = await client.query(`SELECT a.attname column_name,pg_catalog.format_type(a.atttypid,a.atttypmod) data_type
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
        JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
        WHERE n.nspname='public' AND c.relname='purchase_returnable_quantities_v'
          AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`);
      assert.deepEqual(viewCols.rows.map((row) => [row.column_name,row.data_type]), [
        ["source_purchase_invoice_line_id","uuid"],
        ["purchased_quantity","numeric(18,6)"],
        ["posted_returned_quantity","numeric(18,6)"],
        ["returnable_quantity","numeric(18,6)"],
      ]);

      const requiredConstraints = await client.query(`SELECT conname FROM pg_catalog.pg_constraint
        WHERE conname = ANY($1::text[]) ORDER BY conname`, [[
          "pk_tax_codes","uq_tax_codes__code","pk_purchase_invoices","uq_purchase_invoices__branch_document",
          "pk_purchase_invoice_lines","pk_purchase_returns","uq_purchase_returns__branch_document","pk_purchase_return_lines",
          "fk_purchase_invoices__warehouse_branch","fk_purchase_returns__warehouse_branch",
          "fk_purchase_invoice_lines__tax_code","ck_purchase_invoices__due_requires_counterparty",
        ]]);
      assert.equal(requiredConstraints.rowCount, 12);

      const independentIndexes = await client.query(`SELECT idx.relname AS index_name
        FROM pg_catalog.pg_index i
        JOIN pg_catalog.pg_class tbl ON tbl.oid=i.indrelid
        JOIN pg_catalog.pg_namespace n ON n.oid=tbl.relnamespace
        JOIN pg_catalog.pg_class idx ON idx.oid=i.indexrelid
        LEFT JOIN pg_catalog.pg_constraint con ON con.conindid=i.indexrelid
        WHERE n.nspname='public' AND tbl.relname=ANY($1::text[]) AND con.oid IS NULL
        ORDER BY idx.relname`, [TARGET]);
      assert.deepEqual(independentIndexes.rows, [], "03.07 Purchasing/Tax indexes remain deferred");

      const ids = await seedViewFixture(client);
      const returnable = await client.query(`SELECT purchased_quantity,posted_returned_quantity,returnable_quantity
        FROM purchase_returnable_quantities_v WHERE source_purchase_invoice_line_id=$1`, [ids.line]);
      assert.deepEqual(returnable.rows[0], {
        purchased_quantity: "8.000000", posted_returned_quantity: "3.000000", returnable_quantity: "5.000000",
      });

      const history = await client.query("SELECT version,name,checksum FROM schema_migrations ORDER BY version");
      assert.equal(history.rowCount, MIGRATIONS.length);
      const original = history.rows.find((row) => row.version === "0007");
      assert.equal(original?.name, "purchasing_tax");
      const purchasingSlice = history.rows.find((row) => row.version === "0017");
      assert.equal(purchasingSlice?.name, "purchasing_tax_constraints");
      assert.match(purchasingSlice?.checksum ?? "", /^[0-9a-f]{64}$/);
      const latest = history.rows.at(-1);
      assert.equal(latest.version, "0020");
      assert.equal(latest.name, "repairs_followup_notifications_constraints");
      assert.match(latest.checksum, /^[0-9a-f]{64}$/);
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
