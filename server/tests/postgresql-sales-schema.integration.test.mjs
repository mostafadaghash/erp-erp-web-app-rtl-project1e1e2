import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { runMigrations } from "../../scripts/database/migrations.mjs";
import { cleanupDatabase, MIGRATIONS } from "./postgresql-schema-test-support.mjs";

const { Client } = pg;
const databaseUrl = process.env.ERP_TEST_DATABASE_URL;

const TARGET = [
  "sales_quotes","sales_quote_lines","sales_orders","sales_order_lines","sales_order_status_history",
  "sales_order_shipping_details","sales_order_deliveries","sales_order_delivery_lines",
  "sales_invoices","sales_invoice_lines","sales_returns","sales_return_lines",
];

const EXPECTED = {
  sales_quotes:[["id","uuid",true],["branch_id","uuid",true],["document_number","bigint",true],["counterparty_id","uuid",true],["price_list_id","uuid",true],["status","text",true],["valid_until","date",true],["subtotal","numeric(18,4)",true],["discount_total","numeric(18,4)",true],["tax_total","numeric(18,4)",true],["grand_total","numeric(18,4)",true],["notes","text",false],["created_by","uuid",true],["created_at","timestamp with time zone",true]],
  sales_quote_lines:[["id","uuid",true],["quote_id","uuid",true],["variant_id","uuid",true],["product_unit_id","uuid",true],["quantity","numeric(18,6)",true],["unit_price","numeric(18,4)",true],["discount_amount","numeric(18,4)",true],["tax_code_id","uuid",false],["tax_rate_snapshot","numeric(18,4)",false],["line_total","numeric(18,4)",true]],
  sales_orders:[["id","uuid",true],["branch_id","uuid",true],["document_number","bigint",true],["counterparty_id","uuid",true],["warehouse_id","uuid",true],["price_list_id","uuid",true],["status","text",true],["delivery_method","text",true],["sales_user_id","uuid",false],["customer_service_user_id","uuid",true],["customer_notes","text",false],["internal_notes","text",false],["source_quote_id","uuid",false],["version","integer",true],["created_at","timestamp with time zone",true],["updated_at","timestamp with time zone",true]],
  sales_order_lines:[["id","uuid",true],["sales_order_id","uuid",true],["variant_id","uuid",true],["product_unit_id","uuid",true],["ordered_quantity","numeric(18,6)",true],["unit_price","numeric(18,4)",true],["discount_amount","numeric(18,4)",true],["tax_code_id","uuid",false],["line_total","numeric(18,4)",true]],
  sales_order_status_history:[["id","uuid",true],["sales_order_id","uuid",true],["from_status","text",false],["to_status","text",true],["changed_by","uuid",true],["reason","text",false],["changed_at","timestamp with time zone",true]],
  sales_order_shipping_details:[["sales_order_id","uuid",true],["shipping_company","text",false],["tracking_number","text",false],["shipping_cost","numeric(18,4)",false],["shipping_address","text",false],["recipient_name","text",false],["recipient_phone","text",false]],
  sales_order_deliveries:[["id","uuid",true],["sales_order_id","uuid",true],["delivery_type","text",true],["status","text",true],["delivered_at","timestamp with time zone",true],["created_by","uuid",true]],
  sales_order_delivery_lines:[["delivery_id","uuid",true],["sales_order_line_id","uuid",true],["quantity","numeric(18,6)",true]],
  sales_invoices:[["id","uuid",true],["branch_id","uuid",true],["document_number","bigint",true],["document_date","date",true],["document_version","integer",true],["counterparty_id","uuid",false],["warehouse_id","uuid",true],["price_list_id","uuid",true],["source_sales_order_id","uuid",false],["source_delivery_id","uuid",false],["subtotal","numeric(18,4)",true],["discount_total","numeric(18,4)",true],["tax_total","numeric(18,4)",true],["grand_total","numeric(18,4)",true],["paid_total","numeric(18,4)",true],["due_total","numeric(18,4)",true],["payment_status","text",true],["seller_user_id","uuid",false],["customer_notes","text",false],["internal_notes","text",false],["posted_at","timestamp with time zone",true],["created_by","uuid",true],["updated_at","timestamp with time zone",true],["deleted_at","timestamp with time zone",false],["deleted_by","uuid",false],["delete_reason","text",false]],
  sales_invoice_lines:[["id","uuid",true],["invoice_id","uuid",true],["variant_id","uuid",true],["product_unit_id","uuid",true],["quantity","numeric(18,6)",true],["unit_price","numeric(18,4)",true],["price_source","text",true],["discount_amount","numeric(18,4)",true],["tax_code_id","uuid",false],["tax_rate_snapshot","numeric(18,4)",false],["tax_amount","numeric(18,4)",true],["line_total","numeric(18,4)",true],["unit_cogs_snapshot","numeric(18,4)",false],["cogs_total","numeric(18,4)",false]],
  sales_returns:[["id","uuid",true],["branch_id","uuid",true],["document_number","bigint",true],["document_date","date",true],["document_version","integer",true],["counterparty_id","uuid",false],["warehouse_id","uuid",true],["source_invoice_id","uuid",false],["subtotal","numeric(18,4)",true],["tax_total","numeric(18,4)",true],["grand_total","numeric(18,4)",true],["posted_at","timestamp with time zone",true],["created_by","uuid",true],["deleted_at","timestamp with time zone",false],["deleted_by","uuid",false],["delete_reason","text",false]],
  sales_return_lines:[["id","uuid",true],["sales_return_id","uuid",true],["source_invoice_line_id","uuid",false],["variant_id","uuid",true],["product_unit_id","uuid",true],["quantity","numeric(18,6)",true],["unit_price","numeric(18,4)",true],["discount_amount","numeric(18,4)",true],["tax_code_id","uuid",false],["historical_unit_cost","numeric(18,4)",false],["line_total","numeric(18,4)",true]],
};

async function withClient(fn) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

async function seedReturnableFixture(client) {
  const ids = {
    company:"00000000-0000-4000-8000-000000000100",
    branch:"00000000-0000-4000-8000-000000000101",
    warehouse:"00000000-0000-4000-8000-000000000102",
    role:"00000000-0000-4000-8000-000000000103",
    user:"00000000-0000-4000-8000-000000000104",
    category:"00000000-0000-4000-8000-000000000105",
    unit:"00000000-0000-4000-8000-000000000106",
    product:"00000000-0000-4000-8000-000000000107",
    productUnit:"00000000-0000-4000-8000-000000000108",
    variant:"00000000-0000-4000-8000-000000000109",
    priceList:"00000000-0000-4000-8000-000000000110",
    invoice:"00000000-0000-4000-8000-000000000111",
    line:"00000000-0000-4000-8000-000000000112",
    active:"00000000-0000-4000-8000-000000000113",
    deleted:"00000000-0000-4000-8000-000000000114",
  };

  await client.query(`INSERT INTO companies (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at)
    VALUES ($1,'Sales Regression Co','EGP','ar-EG','Africa/Cairo',true,now(),now())`, [ids.company]);
  await client.query(`INSERT INTO branches (id,company_id,name,code,is_active,created_at,updated_at)
    VALUES ($1,$2,'Main','MAIN',true,now(),now())`, [ids.branch, ids.company]);
  await client.query(`INSERT INTO warehouses (id,branch_id,name,code,is_active,created_at,updated_at)
    VALUES ($1,$2,'Main WH','MAIN-WH',true,now(),now())`, [ids.warehouse, ids.branch]);
  await client.query(`INSERT INTO roles (id,role_key,display_name_key,is_system) VALUES ($1,'SALES_REGRESSION','roles.salesRegression',true)`, [ids.role]);
  await client.query(`INSERT INTO users (id,name,username,email,password_hash,role_id,default_branch_id,branch_scope_mode,preferred_language,is_active,created_at,updated_at)
    VALUES ($1,'Regression User','sales-regression',NULL,'hash',$2,$3,'ALL','ar-EG',true,now(),now())`, [ids.user, ids.role, ids.branch]);
  await client.query(`INSERT INTO product_categories (id,name,parent_id,is_active) VALUES ($1,'Sales',NULL,true)`, [ids.category]);
  await client.query(`INSERT INTO units (id,name,symbol,allows_fraction,is_active) VALUES ($1,'Piece','pc',false,true)`, [ids.unit]);
  await client.query(`INSERT INTO price_lists (id,name,is_active,created_at,updated_at) VALUES ($1,'Retail',true,now(),now())`, [ids.priceList]);

  await client.query("BEGIN");
  await client.query(`INSERT INTO products (id,name,category_id,product_type,base_unit_id,tracking_serial,tracking_batch,tracking_expiry,is_active,created_at,updated_at)
    VALUES ($1,'Sales Product',$2,'STOCK',$3,false,false,false,true,now(),now())`, [ids.product, ids.category, ids.productUnit]);
  await client.query(`INSERT INTO product_units (id,product_id,unit_id,conversion_to_base,is_sellable,is_purchasable)
    VALUES ($1,$2,$3,1.000000,true,true)`, [ids.productUnit, ids.product, ids.unit]);
  await client.query(`INSERT INTO product_variants (id,product_id,name,sku,is_default,combination_signature,minimum_selling_price,is_active,created_at,updated_at)
    VALUES ($1,$2,'Default','SALE-REG',true,'DEFAULT',0.0000,true,now(),now())`, [ids.variant, ids.product]);
  await client.query("COMMIT");

  await client.query(`INSERT INTO sales_invoices
    (id,branch_id,document_number,document_date,document_version,counterparty_id,warehouse_id,price_list_id,source_sales_order_id,source_delivery_id,subtotal,discount_total,tax_total,grand_total,paid_total,due_total,payment_status,seller_user_id,customer_notes,internal_notes,posted_at,created_by,updated_at,deleted_at,deleted_by,delete_reason)
    VALUES ($1,$2,1,CURRENT_DATE,1,NULL,$3,$4,NULL,NULL,500.0000,0.0000,0.0000,500.0000,500.0000,0.0000,'PAID',$5,NULL,NULL,now(),$5,now(),NULL,NULL,NULL)`, [ids.invoice, ids.branch, ids.warehouse, ids.priceList, ids.user]);
  await client.query(`INSERT INTO sales_invoice_lines
    (id,invoice_id,variant_id,product_unit_id,quantity,unit_price,price_source,discount_amount,tax_code_id,tax_rate_snapshot,tax_amount,line_total,unit_cogs_snapshot,cogs_total)
    VALUES ($1,$2,$3,$4,5.000000,100.0000,'PRICE_LIST',0.0000,NULL,NULL,0.0000,500.0000,60.0000,300.0000)`, [ids.line, ids.invoice, ids.variant, ids.productUnit]);

  await client.query(`INSERT INTO sales_returns
    (id,branch_id,document_number,document_date,document_version,counterparty_id,warehouse_id,source_invoice_id,subtotal,tax_total,grand_total,posted_at,created_by,deleted_at,deleted_by,delete_reason)
    VALUES ($1,$2,1,CURRENT_DATE,1,NULL,$3,$4,200.0000,0.0000,200.0000,now(),$5,NULL,NULL,NULL),
           ($6,$2,2,CURRENT_DATE,1,NULL,$3,$4,100.0000,0.0000,100.0000,now(),$5,now(),$5,'reversed test return')`,
    [ids.active, ids.branch, ids.warehouse, ids.invoice, ids.user, ids.deleted]);
  await client.query(`INSERT INTO sales_return_lines
    (id,sales_return_id,source_invoice_line_id,variant_id,product_unit_id,quantity,unit_price,discount_amount,tax_code_id,historical_unit_cost,line_total)
    VALUES ('00000000-0000-4000-8000-000000000115',$1,$2,$3,$4,2.000000,100.0000,0.0000,NULL,60.0000,200.0000),
           ('00000000-0000-4000-8000-000000000116',$5,$2,$3,$4,1.000000,100.0000,0.0000,NULL,60.0000,100.0000)`,
    [ids.active, ids.line, ids.variant, ids.productUnit, ids.deleted]);

  return ids;
}

test("03.E Sales remains canonical through Sales constraint migration", async (t) => {
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

      const view = await client.query(`SELECT c.relkind FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='sales_returnable_quantities_v'`);
      assert.equal(view.rows[0].relkind, "v");
      const viewCols = await client.query(`SELECT a.attname column_name,pg_catalog.format_type(a.atttypid,a.atttypmod) data_type FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid WHERE n.nspname='public' AND c.relname='sales_returnable_quantities_v' AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`);
      assert.deepEqual(viewCols.rows.map((row) => [row.column_name,row.data_type]), [["source_invoice_line_id","uuid"],["sold_quantity","numeric(18,6)"],["posted_returned_quantity","numeric(18,6)"],["returnable_quantity","numeric(18,6)"]]);

      const constraints = await client.query(`SELECT count(*)::int count FROM pg_catalog.pg_constraint con JOIN pg_catalog.pg_class c ON c.oid=con.conrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[])`, [TARGET]);
      assert.ok(constraints.rows[0].count > 0, "03.06 Sales constraints must exist after migration 0016");
      const indexes = await client.query(`SELECT count(*)::int count FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_catalog.pg_constraint con ON con.conindid=i.indexrelid WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND con.oid IS NULL`, [TARGET]);
      assert.equal(indexes.rows[0].count, 0, "03.07 independent Sales indexes remain deferred");

      const ids = await seedReturnableFixture(client);
      const ret = await client.query("SELECT sold_quantity,posted_returned_quantity,returnable_quantity FROM sales_returnable_quantities_v WHERE source_invoice_line_id=$1", [ids.line]);
      assert.deepEqual(ret.rows[0], { sold_quantity:"5.000000", posted_returned_quantity:"2.000000", returnable_quantity:"3.000000" });

      const later = await client.query("SELECT to_regclass('public.print_templates') IS NOT NULL present");
      assert.equal(later.rows[0].present, true);
      const history = await client.query("SELECT version,name,checksum FROM schema_migrations ORDER BY version");
      assert.equal(history.rowCount, MIGRATIONS.length);
      const row = history.rows.find((entry) => entry.version === "0006");
      assert.equal(row?.name, "sales");
      assert.match(row?.checksum ?? "", /^[0-9a-f]{64}$/);
      const slice = history.rows.find((entry) => entry.version === "0016");
      assert.equal(slice?.name, "sales_constraints");
      assert.match(slice?.checksum ?? "", /^[0-9a-f]{64}$/);
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
