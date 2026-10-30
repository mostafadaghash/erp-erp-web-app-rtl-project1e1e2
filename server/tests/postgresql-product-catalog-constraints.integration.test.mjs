import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";
import { cleanupDatabase, MIGRATIONS } from "./postgresql-schema-test-support.mjs";

const { Client } = pg;
const databaseUrl = process.env.ERP_TEST_DATABASE_URL;
const PRODUCT_TABLES = ["product_categories","products","product_variants","units","product_units","variant_barcodes","attributes","attribute_values","product_attributes","variant_attribute_values","price_lists","price_list_items","reorder_levels"];

async function withClient(fn) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

async function expectConstraint(promise, code, constraint) {
  await assert.rejects(promise, (error) => error?.code === code && error?.constraint === constraint);
}

test("03.06 Product Catalog constraints enforce canonical integrity on PostgreSQL 17", async (t) => {
  if (!databaseUrl) return t.skip("ERP_TEST_DATABASE_URL is not configured");
  await cleanupDatabase(databaseUrl);
  try {
    const first = await runMigrations({ databaseUrl });
    assert.deepEqual(first.applied, MIGRATIONS);

    await withClient(async (client) => {
      const constraints = await client.query(`
        SELECT conname, contype, condeferrable, condeferred
        FROM pg_catalog.pg_constraint
        WHERE conname = ANY($1::text[])
        ORDER BY conname`, [[
          "pk_products","pk_product_variants","pk_product_units","pk_price_list_items","pk_reorder_levels",
          "uq_product_variants__product_combination","uq_units__name","uq_product_units__product_unit","uq_variant_barcodes__barcode",
          "fk_products__base_unit","fk_customer_profiles__default_price_list","fk_branch_settings__default_price_list",
          "ck_products__product_type","ck_products__tracking_policy","ck_product_units__conversion_to_base","ck_attributes__usage_type",
        ]]);
      assert.equal(constraints.rowCount, 16);
      const baseUnitFk = constraints.rows.find((row) => row.conname === "fk_products__base_unit");
      assert.deepEqual(baseUnitFk, { conname: "fk_products__base_unit", contype: "f", condeferrable: true, condeferred: true });

      const triggers = await client.query(`
        SELECT tgname, tgdeferrable, tginitdeferred
        FROM pg_catalog.pg_trigger
        WHERE tgname = ANY($1::text[]) AND NOT tgisinternal
        ORDER BY tgname`, [[
          "ct_products__catalog_integrity_at_commit",
          "ct_product_units__preserve_catalog_integrity_at_commit",
          "ct_variant_barcodes__product_match_at_commit",
          "ct_product_variants__preserve_catalog_integrity_at_commit",
        ]]);
      assert.equal(triggers.rowCount, 4);
      for (const row of triggers.rows) {
        assert.equal(row.tgdeferrable, true);
        assert.equal(row.tginitdeferred, true);
      }

      const independentIndexes = await client.query(`
        SELECT count(*)::int AS count
        FROM pg_catalog.pg_index i
        JOIN pg_catalog.pg_class c ON c.oid=i.indrelid
        JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
        LEFT JOIN pg_catalog.pg_constraint con ON con.conindid=i.indexrelid
        WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND con.oid IS NULL`, [PRODUCT_TABLES]);
      assert.ok(independentIndexes.rows[0].count > 0, "03.07 approved Product indexes must exist after migration 0022");

      const ids = {
        company:"10000000-0000-4000-8000-000000000001", branch:"10000000-0000-4000-8000-000000000002", warehouse:"10000000-0000-4000-8000-000000000003",
        role:"10000000-0000-4000-8000-000000000004", user:"10000000-0000-4000-8000-000000000005", counterparty:"10000000-0000-4000-8000-000000000006",
        category:"10000000-0000-4000-8000-000000000010", unit1:"10000000-0000-4000-8000-000000000011", unit2:"10000000-0000-4000-8000-000000000012",
        p1:"10000000-0000-4000-8000-000000000020", pu1:"10000000-0000-4000-8000-000000000021", v1:"10000000-0000-4000-8000-000000000022",
        p2:"10000000-0000-4000-8000-000000000030", pu2:"10000000-0000-4000-8000-000000000031", v2:"10000000-0000-4000-8000-000000000032",
        barcode:"10000000-0000-4000-8000-000000000040", attr:"10000000-0000-4000-8000-000000000041", attrValue:"10000000-0000-4000-8000-000000000042",
        priceList:"10000000-0000-4000-8000-000000000050", priceList2:"10000000-0000-4000-8000-000000000051",
      };

      await client.query(`INSERT INTO companies (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at) VALUES ($1,'Test Co','EGP','ar-EG','Africa/Cairo',true,now(),now())`,[ids.company]);
      await client.query(`INSERT INTO branches (id,company_id,name,code,is_active,created_at,updated_at) VALUES ($1,$2,'Main','MAIN',true,now(),now())`,[ids.branch,ids.company]);
      await client.query(`INSERT INTO warehouses (id,branch_id,name,code,is_active,created_at,updated_at) VALUES ($1,$2,'Main WH','WH1',true,now(),now())`,[ids.warehouse,ids.branch]);
      await client.query(`INSERT INTO roles (id,role_key,display_name_key,is_system) VALUES ($1,'ADMIN','roles.admin',true)`,[ids.role]);
      await client.query(`INSERT INTO users (id,name,username,email,password_hash,role_id,default_branch_id,branch_scope_mode,preferred_language,is_active,created_at,updated_at) VALUES ($1,'Admin','admin',NULL,'hash',$2,$3,'ALL','ar-EG',true,now(),now())`,[ids.user,ids.role,ids.branch]);
      await client.query(`INSERT INTO user_branch_access (user_id,branch_id) VALUES ($1,$2)`,[ids.user,ids.branch]);
      await client.query(`INSERT INTO branch_settings (branch_id,default_warehouse_id,settings_json,updated_at) VALUES ($1,$2,'{}'::jsonb,now())`,[ids.branch,ids.warehouse]);
      await client.query(`INSERT INTO counterparties (id,name,is_active,created_at,updated_at) VALUES ($1,'Customer',true,now(),now())`,[ids.counterparty]);
      await client.query(`INSERT INTO counterparty_roles (counterparty_id,role) VALUES ($1,'CUSTOMER')`,[ids.counterparty]);
      await client.query(`INSERT INTO customer_profiles (counterparty_id,default_price_list_id,credit_limit) VALUES ($1,NULL,NULL)`,[ids.counterparty]);

      await client.query(`INSERT INTO product_categories (id,name,parent_id,is_active) VALUES ($1,'General',NULL,true)`,[ids.category]);
      await client.query(`INSERT INTO units (id,name,symbol,allows_fraction,is_active) VALUES ($1,'Piece','pc',false,true),($2,'Box','box',false,true)`,[ids.unit1,ids.unit2]);

      await client.query("BEGIN");
      await client.query(`INSERT INTO products (id,name,category_id,product_type,base_unit_id,tracking_serial,tracking_batch,tracking_expiry,is_active,created_at,updated_at) VALUES ($1,'P1',$2,'STOCK',$3,false,false,false,true,now(),now())`,[ids.p1,ids.category,ids.pu1]);
      await client.query(`INSERT INTO product_units (id,product_id,unit_id,conversion_to_base,is_sellable,is_purchasable) VALUES ($1,$2,$3,1.000000,true,true)`,[ids.pu1,ids.p1,ids.unit1]);
      await client.query(`INSERT INTO product_variants (id,product_id,name,sku,is_default,combination_signature,minimum_selling_price,is_active,created_at,updated_at) VALUES ($1,$2,'Default','P1',true,'DEFAULT',10.0000,true,now(),now())`,[ids.v1,ids.p1]);
      await client.query("COMMIT");

      await client.query("BEGIN");
      await client.query(`INSERT INTO products (id,name,category_id,product_type,base_unit_id,tracking_serial,tracking_batch,tracking_expiry,is_active,created_at,updated_at) VALUES ($1,'P2',$2,'STOCK',$3,false,false,false,true,now(),now())`,[ids.p2,ids.category,ids.pu2]);
      await client.query(`INSERT INTO product_units (id,product_id,unit_id,conversion_to_base,is_sellable,is_purchasable) VALUES ($1,$2,$3,1.000000,true,true)`,[ids.pu2,ids.p2,ids.unit2]);
      await client.query(`INSERT INTO product_variants (id,product_id,name,sku,is_default,combination_signature,minimum_selling_price,is_active,created_at,updated_at) VALUES ($1,$2,'Default','P2',true,'DEFAULT',20.0000,true,now(),now())`,[ids.v2,ids.p2]);
      await client.query("COMMIT");

      await client.query("BEGIN");
      await client.query(`UPDATE products SET base_unit_id=$1 WHERE id=$2`,[ids.pu2,ids.p1]);
      await expectConstraint(client.query("COMMIT"),"23514","ct_products__catalog_integrity_at_commit");
      await client.query("ROLLBACK");

      await client.query("BEGIN");
      await client.query(`INSERT INTO variant_barcodes (id,variant_id,product_unit_id,barcode,is_primary) VALUES ($1,$2,$3,'CROSS',true)`,[ids.barcode,ids.v1,ids.pu2]);
      await expectConstraint(client.query("COMMIT"),"23514","ct_variant_barcodes__product_match_at_commit");
      await client.query("ROLLBACK");

      await client.query(`INSERT INTO variant_barcodes (id,variant_id,product_unit_id,barcode,is_primary) VALUES ($1,$2,$3,'BC-1',true)`,[ids.barcode,ids.v1,ids.pu1]);
      await expectConstraint(client.query(`INSERT INTO variant_barcodes (id,variant_id,product_unit_id,barcode,is_primary) VALUES ('10000000-0000-4000-8000-000000000043',$1,$2,'BC-1',false)`,[ids.v1,ids.pu1]),"23505","uq_variant_barcodes__barcode");

      await expectConstraint(client.query(`INSERT INTO product_variants (id,product_id,name,sku,is_default,combination_signature,minimum_selling_price,is_active,created_at,updated_at) VALUES ('10000000-0000-4000-8000-000000000044',$1,'Dup','P1-DUP',false,'DEFAULT',0,true,now(),now())`,[ids.p1]),"23505","uq_product_variants__product_combination");
      await expectConstraint(client.query(`INSERT INTO product_variants (id,product_id,name,sku,is_default,combination_signature,minimum_selling_price,is_active,created_at,updated_at) VALUES ('10000000-0000-4000-8000-000000000048',$1,'Duplicate SKU','P1',false,'OTHER',0,true,now(),now())`,[ids.p1]),"23505","ux_product_variants__sku__where_sku_is_not_null");
      await expectConstraint(client.query(`INSERT INTO units (id,name,symbol,allows_fraction,is_active) VALUES ('10000000-0000-4000-8000-000000000045','Piece','piece2',false,true)`),"23505","uq_units__name");
      await expectConstraint(client.query(`INSERT INTO product_units (id,product_id,unit_id,conversion_to_base,is_sellable,is_purchasable) VALUES ('10000000-0000-4000-8000-000000000046',$1,$2,2,true,true)`,[ids.p1,ids.unit1]),"23505","uq_product_units__product_unit");

      await expectConstraint(client.query(`INSERT INTO products (id,name,category_id,product_type,base_unit_id,tracking_serial,tracking_batch,tracking_expiry,is_active,created_at,updated_at) VALUES ('10000000-0000-4000-8000-000000000047','Bad',$1,'OTHER',$2,false,false,false,true,now(),now())`,[ids.category,ids.pu1]),"23514","ck_products__product_type");
      await expectConstraint(client.query(`UPDATE products SET tracking_serial=true,tracking_batch=true WHERE id=$1`,[ids.p1]),"23514","ck_products__tracking_policy");
      await expectConstraint(client.query(`UPDATE product_units SET conversion_to_base=0 WHERE id=$1`,[ids.pu1]),"23514","ck_product_units__conversion_to_base");
      await expectConstraint(client.query(`UPDATE product_variants SET minimum_selling_price=-1 WHERE id=$1`,[ids.v1]),"23514","ck_product_variants__minimum_selling_price");

      await client.query(`INSERT INTO attributes (id,name,attribute_type,usage_type,is_active) VALUES ($1,'Color','TEXT','VARIANT',true)`,[ids.attr]);
      await client.query(`INSERT INTO attribute_values (id,attribute_id,value,sort_order) VALUES ($1,$2,'Red',0)`,[ids.attrValue,ids.attr]);
      await client.query(`INSERT INTO product_attributes (product_id,attribute_id) VALUES ($1,$2)`,[ids.p1,ids.attr]);
      await client.query(`INSERT INTO variant_attribute_values (variant_id,attribute_value_id) VALUES ($1,$2)`,[ids.v1,ids.attrValue]);
      await expectConstraint(client.query(`INSERT INTO attributes (id,name,attribute_type,usage_type,is_active) VALUES ('10000000-0000-4000-8000-000000000048','Bad','TEXT','OTHER',true)`),"23514","ck_attributes__usage_type");
      await expectConstraint(client.query(`INSERT INTO attribute_values (id,attribute_id,value,sort_order) VALUES ('10000000-0000-4000-8000-000000000049',$1,'Red',1)`,[ids.attr]),"23505","uq_attribute_values__attribute_value");

      await client.query(`INSERT INTO price_lists (id,name,is_active,created_at,updated_at) VALUES ($1,'Retail',true,now(),now())`,[ids.priceList]);
      await client.query(`UPDATE branch_settings SET default_price_list_id=$1 WHERE branch_id=$2`,[ids.priceList,ids.branch]);
      await client.query(`UPDATE customer_profiles SET default_price_list_id=$1 WHERE counterparty_id=$2`,[ids.priceList,ids.counterparty]);
      await client.query(`INSERT INTO price_list_items (price_list_id,variant_id,product_unit_id,price,updated_at) VALUES ($1,$2,$3,100.0000,now())`,[ids.priceList,ids.v1,ids.pu1]);
      await expectConstraint(client.query(`INSERT INTO price_list_items (price_list_id,variant_id,product_unit_id,price,updated_at) VALUES ($1,$2,$3,101.0000,now())`,[ids.priceList,ids.v1,ids.pu1]),"23505","pk_price_list_items");
      await expectConstraint(client.query(`UPDATE price_list_items SET price=-1 WHERE price_list_id=$1 AND variant_id=$2 AND product_unit_id=$3`,[ids.priceList,ids.v1,ids.pu1]),"23514","ck_price_list_items__price");
      await client.query(`DELETE FROM price_lists WHERE id=$1`,[ids.priceList]);
      const defaults = await client.query(`SELECT (SELECT default_price_list_id IS NULL FROM branch_settings WHERE branch_id=$1) branch_cleared,(SELECT default_price_list_id IS NULL FROM customer_profiles WHERE counterparty_id=$2) customer_cleared`,[ids.branch,ids.counterparty]);
      assert.deepEqual(defaults.rows[0],{branch_cleared:true,customer_cleared:true});

      await client.query(`INSERT INTO reorder_levels (variant_id,warehouse_id,minimum_quantity) VALUES ($1,$2,5.000000)`,[ids.v1,ids.warehouse]);
      await expectConstraint(client.query(`INSERT INTO reorder_levels (variant_id,warehouse_id,minimum_quantity) VALUES ($1,$2,6.000000)`,[ids.v1,ids.warehouse]),"23505","pk_reorder_levels");
      await expectConstraint(client.query(`UPDATE reorder_levels SET minimum_quantity=-1 WHERE variant_id=$1 AND warehouse_id=$2`,[ids.v1,ids.warehouse]),"23514","ck_reorder_levels__minimum_quantity");

      await client.query("BEGIN");
      await client.query(`DELETE FROM product_variants WHERE id=$1`,[ids.v2]);
      await expectConstraint(client.query("COMMIT"),"23514","ct_product_variants__preserve_catalog_integrity_at_commit");
      await client.query("ROLLBACK");

      const history = await client.query("SELECT version,name,checksum FROM schema_migrations ORDER BY version");
      assert.equal(history.rowCount,MIGRATIONS.length);
      const row = history.rows.find((entry) => entry.version === "0014");
      assert.equal(row?.name,"product_catalog_constraints");
      assert.match(row?.checksum ?? "",/^[0-9a-f]{64}$/);
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