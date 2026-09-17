import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";
import { cleanupDatabase, MIGRATIONS } from "./postgresql-schema-test-support.mjs";

const { Client } = pg;
const databaseUrl = process.env.ERP_TEST_DATABASE_URL;
const INVENTORY_TABLES = [
  "serial_numbers","batches","inventory_movements","inventory_movement_lines","inventory_line_serials","inventory_line_batches",
  "inventory_stock_positions","variant_warehouse_cost_projection","batch_stock_positions","stock_reservations","stock_transfers",
  "stock_transfer_lines","stocktake_sessions","stocktake_lines","stocktake_line_serials","stocktake_line_batches",
  "inventory_adjustments","inventory_adjustment_lines","inventory_adjustment_line_serials","inventory_adjustment_line_batches",
];

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
    company: "30000000-0000-4000-8000-000000000001",
    branch1: "30000000-0000-4000-8000-000000000002",
    branch2: "30000000-0000-4000-8000-000000000003",
    warehouse1: "30000000-0000-4000-8000-000000000004",
    warehouse2: "30000000-0000-4000-8000-000000000005",
    role: "30000000-0000-4000-8000-000000000006",
    user: "30000000-0000-4000-8000-000000000007",
    category: "30000000-0000-4000-8000-000000000008",
    unit: "30000000-0000-4000-8000-000000000009",
    product: "30000000-0000-4000-8000-000000000010",
    productUnit: "30000000-0000-4000-8000-000000000011",
    variant: "30000000-0000-4000-8000-000000000012",
    postingBatch: "30000000-0000-4000-8000-000000000013",
    source: "30000000-0000-4000-8000-000000000014",
    counterparty: "30000000-0000-4000-8000-000000000015",
    priceList: "30000000-0000-4000-8000-000000000016",
    salesOrder: "30000000-0000-4000-8000-000000000017",
    salesOrderLine: "30000000-0000-4000-8000-000000000018",
  };

  await client.query(`INSERT INTO companies (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at)
    VALUES ($1,'Inventory Test Co','EGP','ar-EG','Africa/Cairo',true,now(),now())`, [ids.company]);
  await client.query(`INSERT INTO branches (id,company_id,name,code,is_active,created_at,updated_at)
    VALUES ($1,$3,'Main','MAIN',true,now(),now()),($2,$3,'Remote','REMOTE',true,now(),now())`, [ids.branch1, ids.branch2, ids.company]);
  await client.query(`INSERT INTO warehouses (id,branch_id,name,code,is_active,created_at,updated_at)
    VALUES ($1,$3,'Main WH','MAIN-WH',true,now(),now()),($2,$4,'Remote WH','REMOTE-WH',true,now(),now())`, [ids.warehouse1, ids.warehouse2, ids.branch1, ids.branch2]);
  await client.query(`INSERT INTO roles (id,role_key,display_name_key,is_system) VALUES ($1,'INVENTORY_ADMIN','roles.inventoryAdmin',true)`, [ids.role]);
  await client.query(`INSERT INTO users (id,name,username,email,password_hash,role_id,default_branch_id,branch_scope_mode,preferred_language,is_active,created_at,updated_at)
    VALUES ($1,'Inventory User','inventory-user',NULL,'hash',$2,$3,'ALL','ar-EG',true,now(),now())`, [ids.user, ids.role, ids.branch1]);
  await client.query(`INSERT INTO counterparties (id,name,phone,normalized_phone,address,notes,is_active,created_at,updated_at)
    VALUES ($1,'Inventory Reservation Customer',NULL,NULL,NULL,NULL,true,now(),now())`, [ids.counterparty]);
  await client.query(`INSERT INTO counterparty_roles (counterparty_id,role) VALUES ($1,'CUSTOMER')`, [ids.counterparty]);
  await client.query(`INSERT INTO price_lists (id,name,is_active,created_at,updated_at)
    VALUES ($1,'Inventory Reservation Retail',true,now(),now())`, [ids.priceList]);
  await client.query(`INSERT INTO product_categories (id,name,parent_id,is_active) VALUES ($1,'Inventory',NULL,true)`, [ids.category]);
  await client.query(`INSERT INTO units (id,name,symbol,allows_fraction,is_active) VALUES ($1,'Inventory Piece','pc',false,true)`, [ids.unit]);

  await client.query("BEGIN");
  await client.query(`INSERT INTO products (id,name,category_id,product_type,base_unit_id,tracking_serial,tracking_batch,tracking_expiry,is_active,created_at,updated_at)
    VALUES ($1,'Inventory Product',$2,'STOCK',$3,false,false,false,true,now(),now())`, [ids.product, ids.category, ids.productUnit]);
  await client.query(`INSERT INTO product_units (id,product_id,unit_id,conversion_to_base,is_sellable,is_purchasable)
    VALUES ($1,$2,$3,1.000000,true,true)`, [ids.productUnit, ids.product, ids.unit]);
  await client.query(`INSERT INTO product_variants (id,product_id,name,sku,is_default,combination_signature,minimum_selling_price,is_active,created_at,updated_at)
    VALUES ($1,$2,'Default','INV-001',true,'DEFAULT',0.0000,true,now(),now())`, [ids.variant, ids.product]);
  await client.query("COMMIT");

  await client.query(`INSERT INTO sales_orders
    (id,branch_id,document_number,counterparty_id,warehouse_id,price_list_id,status,delivery_method,sales_user_id,customer_service_user_id,customer_notes,internal_notes,source_quote_id,version,created_at,updated_at)
    VALUES ($1,$2,1,$3,$4,$5,'PENDING','PICKUP',$6,$6,NULL,NULL,NULL,0,now(),now())`,
    [ids.salesOrder, ids.branch1, ids.counterparty, ids.warehouse1, ids.priceList, ids.user]);
  await client.query(`INSERT INTO sales_order_lines
    (id,sales_order_id,variant_id,product_unit_id,ordered_quantity,unit_price,discount_amount,tax_code_id,line_total)
    VALUES ($1,$2,$3,$4,5.000000,100.0000,0.0000,NULL,500.0000)`,
    [ids.salesOrderLine, ids.salesOrder, ids.variant, ids.productUnit]);

  await client.query(`INSERT INTO posting_batches
    (id,branch_id,source_type,source_id,operation_type,document_version,reverses_posting_batch_id,posted_at,created_by)
    VALUES ($1,$2,'INVENTORY_TEST',$3,'POST',1,NULL,now(),$4)`, [ids.postingBatch, ids.branch1, ids.source, ids.user]);

  return ids;
}

test("03.06 Inventory constraints enforce canonical integrity on PostgreSQL 17", async (t) => {
  if (!databaseUrl) return t.skip("ERP_TEST_DATABASE_URL is not configured");
  await cleanupDatabase(databaseUrl);
  try {
    const first = await runMigrations({ databaseUrl });
    assert.deepEqual(first.applied, MIGRATIONS);
    assert.deepEqual(first.skipped, []);

    await withClient(async (client) => {
      const constraints = await client.query(`
        SELECT conname, contype
        FROM pg_catalog.pg_constraint
        WHERE conname = ANY($1::text[])
        ORDER BY conname`, [[
          "pk_inventory_movements","pk_inventory_stock_positions","pk_batch_stock_positions",
          "uq_warehouses__id_branch","uq_serial_numbers__variant_serial","uq_batches__variant_batch",
          "uq_stock_transfers__branch_document","uq_stock_transfer_lines__transfer_variant",
          "uq_stocktake_sessions__branch_document","uq_stocktake_lines__session_variant",
          "uq_inventory_adjustments__branch_document","uq_inventory_adjustment_lines__adjustment_variant",
          "fk_inventory_movements__warehouse_branch","fk_stock_transfers__from_warehouse_branch",
          "fk_stocktake_sessions__warehouse_branch","fk_inventory_adjustments__warehouse_branch",
          "ck_stock_reservations__status","ck_stocktake_sessions__status","ck_stocktake_lines__difference_exact",
        ]]);
      assert.equal(constraints.rowCount, 19);

      const independentIndexes = await client.query(`
        SELECT idx.relname AS index_name
        FROM pg_catalog.pg_index i
        JOIN pg_catalog.pg_class tbl ON tbl.oid=i.indrelid
        JOIN pg_catalog.pg_namespace n ON n.oid=tbl.relnamespace
        JOIN pg_catalog.pg_class idx ON idx.oid=i.indexrelid
        LEFT JOIN pg_catalog.pg_constraint con ON con.conindid=i.indexrelid
        WHERE n.nspname='public' AND tbl.relname=ANY($1::text[]) AND con.oid IS NULL
        ORDER BY idx.relname`, [INVENTORY_TABLES]);
      assert.deepEqual(independentIndexes.rows, [], "03.07 independent/partial Inventory indexes must remain deferred");

      const ids = await seedFixture(client);

      await expectConstraint(client.query(`INSERT INTO serial_numbers (id,variant_id,serial_number,current_warehouse_id,status,created_at)
        VALUES ('30000000-0000-4000-8000-000000000020',$1,'SER-1',$2,'IN_STOCK',now()),
               ('30000000-0000-4000-8000-000000000021',$1,'SER-1',$2,'IN_STOCK',now())`, [ids.variant, ids.warehouse1]), "23505", "uq_serial_numbers__variant_serial");

      await client.query(`INSERT INTO batches (id,variant_id,batch_number,expiry_date,created_at)
        VALUES ('30000000-0000-4000-8000-000000000022',$1,'BATCH-1',CURRENT_DATE + 30,now())`, [ids.variant]);
      await expectConstraint(client.query(`INSERT INTO batches (id,variant_id,batch_number,expiry_date,created_at)
        VALUES ('30000000-0000-4000-8000-000000000023',$1,'BATCH-1',NULL,now())`, [ids.variant]), "23505", "uq_batches__variant_batch");

      await expectConstraint(client.query(`INSERT INTO inventory_movements
        (id,branch_id,warehouse_id,movement_type,source_type,source_id,posting_batch_id,occurred_at,created_by,reason_code,notes)
        VALUES ('30000000-0000-4000-8000-000000000024',$1,$2,'OPENING','TEST',$3,$4,now(),$5,NULL,NULL)`,
        [ids.branch1, ids.warehouse2, ids.source, ids.postingBatch, ids.user]), "23503", "fk_inventory_movements__warehouse_branch");

      const movement = "30000000-0000-4000-8000-000000000025";
      const movementLine = "30000000-0000-4000-8000-000000000026";
      await client.query(`INSERT INTO inventory_movements
        (id,branch_id,warehouse_id,movement_type,source_type,source_id,posting_batch_id,occurred_at,created_by,reason_code,notes)
        VALUES ($1,$2,$3,'OPENING','TEST',$4,$5,now(),$6,NULL,NULL)`, [movement, ids.branch1, ids.warehouse1, ids.source, ids.postingBatch, ids.user]);
      await client.query(`INSERT INTO inventory_movement_lines
        (id,movement_id,variant_id,quantity_signed,unit_cost,total_cost)
        VALUES ($1,$2,$3,-2.000000,10.0000,20.0000)`, [movementLine, movement, ids.variant]);

      await expectConstraint(client.query(`UPDATE warehouses SET branch_id=$1 WHERE id=$2`, [ids.branch2, ids.warehouse1]), "23503", "fk_inventory_movements__warehouse_branch");
      await expectConstraint(client.query(`DELETE FROM warehouses WHERE id=$1`, [ids.warehouse1]), "23503", "fk_inventory_movements__warehouse_branch");

      await client.query(`INSERT INTO inventory_stock_positions (warehouse_id,variant_id,on_hand,reserved,version,updated_at)
        VALUES ($1,$2,-5.000000,0.000000,0,now())`, [ids.warehouse1, ids.variant]);
      const negativeStock = await client.query(`SELECT on_hand::text FROM inventory_stock_positions WHERE warehouse_id=$1 AND variant_id=$2`, [ids.warehouse1, ids.variant]);
      assert.equal(negativeStock.rows[0].on_hand, "-5.000000", "permission-gated negative stock must not be blocked by a global CHECK");
      await expectConstraint(client.query(`UPDATE inventory_stock_positions SET reserved=-1 WHERE warehouse_id=$1 AND variant_id=$2`, [ids.warehouse1, ids.variant]), "23514", "ck_inventory_stock_positions__reserved_nonnegative");

      await expectConstraint(client.query(`INSERT INTO stock_reservations
        (id,sales_order_id,sales_order_line_id,warehouse_id,variant_id,quantity,status,created_at,released_at)
        VALUES ('30000000-0000-4000-8000-000000000030',$1,$2,$3,$4,1,'INVALID',now(),NULL)`,
        [ids.salesOrder, ids.salesOrderLine, ids.warehouse1, ids.variant]), "23514", "ck_stock_reservations__status");
      await expectConstraint(client.query(`INSERT INTO stock_reservations
        (id,sales_order_id,sales_order_line_id,warehouse_id,variant_id,quantity,status,created_at,released_at)
        VALUES ('30000000-0000-4000-8000-000000000031',$1,$2,$3,$4,0,'ACTIVE',now(),NULL)`,
        [ids.salesOrder, ids.salesOrderLine, ids.warehouse1, ids.variant]), "23514", "ck_stock_reservations__quantity_positive");

      await client.query(`INSERT INTO stock_reservations
        (id,sales_order_id,sales_order_line_id,warehouse_id,variant_id,quantity,status,created_at,released_at)
        VALUES ('30000000-0000-4000-8000-000000000032',$1,$2,$3,$4,1,'ACTIVE',now(),NULL),
               ('30000000-0000-4000-8000-000000000033',$1,$2,$3,$4,1,'PARTIALLY_CONSUMED',now(),NULL)`,
        [ids.salesOrder, ids.salesOrderLine, ids.warehouse1, ids.variant]);
      const duplicateActive = await client.query(`SELECT count(*)::int AS count FROM stock_reservations WHERE sales_order_line_id=$1 AND warehouse_id=$2 AND variant_id=$3 AND status IN ('ACTIVE','PARTIALLY_CONSUMED')`, [ids.salesOrderLine, ids.warehouse1, ids.variant]);
      assert.equal(duplicateActive.rows[0].count, 2, "active-reservation partial uniqueness remains intentionally deferred to 03.07");

      await expectConstraint(client.query(`INSERT INTO stock_transfers
        (id,document_number,issuing_branch_id,from_warehouse_id,to_warehouse_id,status,notes,created_by,posted_at)
        VALUES ('30000000-0000-4000-8000-000000000040',1,$1,$2,$2,'POSTED',NULL,$3,now())`, [ids.branch1, ids.warehouse1, ids.user]), "23514", "ck_stock_transfers__different_warehouses");
      await expectConstraint(client.query(`INSERT INTO stock_transfers
        (id,document_number,issuing_branch_id,from_warehouse_id,to_warehouse_id,status,notes,created_by,posted_at)
        VALUES ('30000000-0000-4000-8000-000000000041',1,$1,$2,$3,'POSTED',NULL,$4,now())`, [ids.branch1, ids.warehouse2, ids.warehouse1, ids.user]), "23503", "fk_stock_transfers__from_warehouse_branch");

      const transfer = "30000000-0000-4000-8000-000000000042";
      await client.query(`INSERT INTO stock_transfers
        (id,document_number,issuing_branch_id,from_warehouse_id,to_warehouse_id,status,notes,created_by,posted_at)
        VALUES ($1,1,$2,$3,$4,'POSTED',NULL,$5,now())`, [transfer, ids.branch1, ids.warehouse1, ids.warehouse2, ids.user]);
      await expectConstraint(client.query(`INSERT INTO stock_transfers
        (id,document_number,issuing_branch_id,from_warehouse_id,to_warehouse_id,status,notes,created_by,posted_at)
        VALUES ('30000000-0000-4000-8000-000000000043',1,$1,$2,$3,'POSTED',NULL,$4,now())`, [ids.branch1, ids.warehouse1, ids.warehouse2, ids.user]), "23505", "uq_stock_transfers__branch_document");
      await client.query(`INSERT INTO stock_transfer_lines (id,transfer_id,variant_id,quantity) VALUES ('30000000-0000-4000-8000-000000000044',$1,$2,2.000000)`, [transfer, ids.variant]);
      await expectConstraint(client.query(`INSERT INTO stock_transfer_lines (id,transfer_id,variant_id,quantity) VALUES ('30000000-0000-4000-8000-000000000045',$1,$2,1.000000)`, [transfer, ids.variant]), "23505", "uq_stock_transfer_lines__transfer_variant");

      await expectConstraint(client.query(`INSERT INTO stocktake_sessions
        (id,branch_id,document_number,warehouse_id,status,started_by,started_at,approved_by,approved_at)
        VALUES ('30000000-0000-4000-8000-000000000050',$1,1,$2,'OPEN',$3,now(),NULL,NULL)`, [ids.branch1, ids.warehouse2, ids.user]), "23503", "fk_stocktake_sessions__warehouse_branch");
      await expectConstraint(client.query(`INSERT INTO stocktake_sessions
        (id,branch_id,document_number,warehouse_id,status,started_by,started_at,approved_by,approved_at)
        VALUES ('30000000-0000-4000-8000-000000000051',$1,1,$2,'INVALID',$3,now(),NULL,NULL)`, [ids.branch1, ids.warehouse1, ids.user]), "23514", "ck_stocktake_sessions__status");

      const stocktake = "30000000-0000-4000-8000-000000000052";
      await client.query(`INSERT INTO stocktake_sessions
        (id,branch_id,document_number,warehouse_id,status,started_by,started_at,approved_by,approved_at)
        VALUES ($1,$2,1,$3,'COUNTED',$4,now(),NULL,NULL)`, [stocktake, ids.branch1, ids.warehouse1, ids.user]);
      await expectConstraint(client.query(`INSERT INTO stocktake_sessions
        (id,branch_id,document_number,warehouse_id,status,started_by,started_at,approved_by,approved_at)
        VALUES ('30000000-0000-4000-8000-000000000053',$1,1,$2,'OPEN',$3,now(),NULL,NULL)`, [ids.branch1, ids.warehouse1, ids.user]), "23505", "uq_stocktake_sessions__branch_document");
      await expectConstraint(client.query(`INSERT INTO stocktake_lines
        (id,session_id,variant_id,book_quantity_at_count,counted_quantity,counted_at,stock_position_version_at_count,difference,notes)
        VALUES ('30000000-0000-4000-8000-000000000054',$1,$2,-5.000000,2.000000,now(),0,6.000000,NULL)`, [stocktake, ids.variant]), "23514", "ck_stocktake_lines__difference_exact");
      await client.query(`INSERT INTO stocktake_lines
        (id,session_id,variant_id,book_quantity_at_count,counted_quantity,counted_at,stock_position_version_at_count,difference,notes)
        VALUES ('30000000-0000-4000-8000-000000000055',$1,$2,-5.000000,2.000000,now(),0,7.000000,NULL)`, [stocktake, ids.variant]);
      await expectConstraint(client.query(`INSERT INTO stocktake_lines
        (id,session_id,variant_id,book_quantity_at_count,counted_quantity,counted_at,stock_position_version_at_count,difference,notes)
        VALUES ('30000000-0000-4000-8000-000000000056',$1,$2,-5.000000,3.000000,now(),0,8.000000,NULL)`, [stocktake, ids.variant]), "23505", "uq_stocktake_lines__session_variant");

      await expectConstraint(client.query(`INSERT INTO inventory_adjustments
        (id,branch_id,document_number,warehouse_id,source_stocktake_id,reason_code,notes,created_by,posted_at)
        VALUES ('30000000-0000-4000-8000-000000000060',$1,1,$2,NULL,'MANUAL',NULL,$3,now())`, [ids.branch1, ids.warehouse2, ids.user]), "23503", "fk_inventory_adjustments__warehouse_branch");
      const adjustment = "30000000-0000-4000-8000-000000000061";
      await client.query(`INSERT INTO inventory_adjustments
        (id,branch_id,document_number,warehouse_id,source_stocktake_id,reason_code,notes,created_by,posted_at)
        VALUES ($1,$2,1,$3,$4,'STOCKTAKE','approved stocktake',$5,now())`, [adjustment, ids.branch1, ids.warehouse1, stocktake, ids.user]);
      await expectConstraint(client.query(`INSERT INTO inventory_adjustments
        (id,branch_id,document_number,warehouse_id,source_stocktake_id,reason_code,notes,created_by,posted_at)
        VALUES ('30000000-0000-4000-8000-000000000062',$1,1,$2,NULL,'MANUAL',NULL,$3,now())`, [ids.branch1, ids.warehouse1, ids.user]), "23505", "uq_inventory_adjustments__branch_document");
      await client.query(`INSERT INTO inventory_adjustment_lines (id,adjustment_id,variant_id,quantity_difference,unit_cost)
        VALUES ('30000000-0000-4000-8000-000000000063',$1,$2,-2.000000,10.0000)`, [adjustment, ids.variant]);
      await expectConstraint(client.query(`INSERT INTO inventory_adjustment_lines (id,adjustment_id,variant_id,quantity_difference,unit_cost)
        VALUES ('30000000-0000-4000-8000-000000000064',$1,$2,1.000000,10.0000)`, [adjustment, ids.variant]), "23505", "uq_inventory_adjustment_lines__adjustment_variant");
      await expectConstraint(client.query(`UPDATE inventory_adjustment_lines SET unit_cost=-1 WHERE adjustment_id=$1 AND variant_id=$2`, [adjustment, ids.variant]), "23514", "ck_inventory_adjustment_lines__unit_cost_nonnegative");

      const history = await client.query("SELECT version,name,checksum FROM schema_migrations ORDER BY version");
      assert.equal(history.rowCount, MIGRATIONS.length);
      const inventorySlice = history.rows.find((row) => row.version === "0015");
      assert.equal(inventorySlice?.name, "inventory_constraints");
      assert.match(inventorySlice?.checksum ?? "", /^[0-9a-f]{64}$/);
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