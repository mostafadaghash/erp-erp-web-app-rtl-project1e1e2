import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";
import { cleanupDatabase, MIGRATIONS } from "./postgresql-schema-test-support.mjs";

const { Client } = pg;
const databaseUrl = process.env.ERP_TEST_DATABASE_URL;

const SALES_TABLES = [
  "sales_quotes","sales_quote_lines","sales_orders","sales_order_lines","sales_order_status_history",
  "sales_order_shipping_details","sales_order_deliveries","sales_order_delivery_lines",
  "sales_invoices","sales_invoice_lines","sales_returns","sales_return_lines",
];

async function withClient(fn) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

async function expectConstraint(promise, code, constraint) {
  await assert.rejects(promise, (error) => error?.code === code && error?.constraint === constraint);
}

async function expectDeferredConstraint(client, work, constraint) {
  await client.query("BEGIN");
  try {
    await work();
    await assert.rejects(client.query("COMMIT"), (error) => error?.code === "23514" && error?.constraint === constraint);
  } finally {
    await client.query("ROLLBACK").catch(() => {});
  }
}

async function createProduct(client, ids, name, sku, signature) {
  await client.query("BEGIN");
  try {
    await client.query(`INSERT INTO products
      (id,name,category_id,product_type,base_unit_id,tracking_serial,tracking_batch,tracking_expiry,is_active,created_at,updated_at)
      VALUES ($1,$2,$3,'STOCK',$4,false,false,false,true,now(),now())`,
      [ids.product, name, ids.category, ids.productUnit]);
    await client.query(`INSERT INTO product_units
      (id,product_id,unit_id,conversion_to_base,is_sellable,is_purchasable)
      VALUES ($1,$2,$3,1.000000,true,true)`, [ids.productUnit, ids.product, ids.unit]);
    await client.query(`INSERT INTO product_variants
      (id,product_id,name,sku,is_default,combination_signature,minimum_selling_price,is_active,created_at,updated_at)
      VALUES ($1,$2,'Default',$3,true,$4,0.0000,true,now(),now())`,
      [ids.variant, ids.product, sku, signature]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

async function seedFixture(client) {
  const ids = {
    company: "40000000-0000-4000-8000-000000000001",
    branch1: "40000000-0000-4000-8000-000000000002",
    branch2: "40000000-0000-4000-8000-000000000003",
    warehouse1: "40000000-0000-4000-8000-000000000004",
    warehouse1b: "40000000-0000-4000-8000-000000000005",
    warehouse2: "40000000-0000-4000-8000-000000000006",
    role: "40000000-0000-4000-8000-000000000007",
    user: "40000000-0000-4000-8000-000000000008",
    counterparty: "40000000-0000-4000-8000-000000000009",
    priceList: "40000000-0000-4000-8000-000000000010",
    category: "40000000-0000-4000-8000-000000000011",
    unit: "40000000-0000-4000-8000-000000000012",
    product1: "40000000-0000-4000-8000-000000000013",
    productUnit1: "40000000-0000-4000-8000-000000000014",
    variant1: "40000000-0000-4000-8000-000000000015",
    product2: "40000000-0000-4000-8000-000000000016",
    productUnit2: "40000000-0000-4000-8000-000000000017",
    variant2: "40000000-0000-4000-8000-000000000018",
  };

  await client.query(`INSERT INTO companies
    (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at)
    VALUES ($1,'Sales Test Co','EGP','ar-EG','Africa/Cairo',true,now(),now())`, [ids.company]);
  await client.query(`INSERT INTO branches
    (id,company_id,name,code,is_active,created_at,updated_at)
    VALUES ($1,$3,'Main','MAIN',true,now(),now()),($2,$3,'Remote','REMOTE',true,now(),now())`,
    [ids.branch1, ids.branch2, ids.company]);
  await client.query(`INSERT INTO warehouses
    (id,branch_id,name,code,is_active,created_at,updated_at)
    VALUES ($1,$4,'Main WH','MAIN-WH',true,now(),now()),
           ($2,$4,'Main WH 2','MAIN-WH-2',true,now(),now()),
           ($3,$5,'Remote WH','REMOTE-WH',true,now(),now())`,
    [ids.warehouse1, ids.warehouse1b, ids.warehouse2, ids.branch1, ids.branch2]);
  await client.query(`INSERT INTO roles (id,role_key,display_name_key,is_system)
    VALUES ($1,'SALES_TEST','roles.salesTest',true)`, [ids.role]);
  await client.query(`INSERT INTO users
    (id,name,username,email,password_hash,role_id,default_branch_id,branch_scope_mode,preferred_language,is_active,created_at,updated_at)
    VALUES ($1,'Sales User','sales-test',NULL,'hash',$2,$3,'ALL','ar-EG',true,now(),now())`,
    [ids.user, ids.role, ids.branch1]);
  await client.query(`INSERT INTO counterparties
    (id,name,phone,normalized_phone,address,notes,is_active,created_at,updated_at)
    VALUES ($1,'Sales Customer',NULL,NULL,NULL,NULL,true,now(),now())`, [ids.counterparty]);
  await client.query(`INSERT INTO counterparty_roles (counterparty_id,role) VALUES ($1,'CUSTOMER')`, [ids.counterparty]);
  await client.query(`INSERT INTO price_lists (id,name,is_active,created_at,updated_at)
    VALUES ($1,'Retail',true,now(),now())`, [ids.priceList]);
  await client.query(`INSERT INTO product_categories (id,name,parent_id,is_active)
    VALUES ($1,'Sales',NULL,true)`, [ids.category]);
  await client.query(`INSERT INTO units (id,name,symbol,allows_fraction,is_active)
    VALUES ($1,'Sales Piece','pc',false,true)`, [ids.unit]);

  await createProduct(client, {
    product: ids.product1, productUnit: ids.productUnit1, variant: ids.variant1,
    category: ids.category, unit: ids.unit,
  }, "Sales Product 1", "SALE-001", "DEFAULT-1");
  await createProduct(client, {
    product: ids.product2, productUnit: ids.productUnit2, variant: ids.variant2,
    category: ids.category, unit: ids.unit,
  }, "Sales Product 2", "SALE-002", "DEFAULT-2");

  return ids;
}

function quoteValues(id, branchId, documentNumber, counterpartyId, priceListId, userId) {
  return [id, branchId, documentNumber, counterpartyId, priceListId, userId];
}

async function insertQuote(client, id, branchId, documentNumber, ids) {
  await client.query(`INSERT INTO sales_quotes
    (id,branch_id,document_number,counterparty_id,price_list_id,status,valid_until,subtotal,discount_total,tax_total,grand_total,notes,created_by,created_at)
    VALUES ($1,$2,$3,$4,$5,'OPEN',CURRENT_DATE + 30,100.0000,0.0000,0.0000,100.0000,NULL,$6,now())`,
    quoteValues(id, branchId, documentNumber, ids.counterparty, ids.priceList, ids.user));
}

async function insertOrder(client, id, branchId, documentNumber, warehouseId, sourceQuoteId, ids) {
  await client.query(`INSERT INTO sales_orders
    (id,branch_id,document_number,counterparty_id,warehouse_id,price_list_id,status,delivery_method,sales_user_id,customer_service_user_id,customer_notes,internal_notes,source_quote_id,version,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,'PENDING','PICKUP',$7,$7,NULL,NULL,$8,0,now(),now())`,
    [id, branchId, documentNumber, ids.counterparty, warehouseId, ids.priceList, ids.user, sourceQuoteId]);
}

async function insertOrderLine(client, id, orderId, variantId, productUnitId) {
  await client.query(`INSERT INTO sales_order_lines
    (id,sales_order_id,variant_id,product_unit_id,ordered_quantity,unit_price,discount_amount,tax_code_id,line_total)
    VALUES ($1,$2,$3,$4,5.000000,100.0000,0.0000,NULL,500.0000)`,
    [id, orderId, variantId, productUnitId]);
}

async function insertInvoice(client, values, ids) {
  const {
    id, branchId = ids.branch1, documentNumber, warehouseId = ids.warehouse1,
    counterpartyId = ids.counterparty, sourceOrderId = null, sourceDeliveryId = null,
    grandTotal = "100.0000", paidTotal = "100.0000", dueTotal = "0.0000",
  } = values;
  await client.query(`INSERT INTO sales_invoices
    (id,branch_id,document_number,document_date,document_version,counterparty_id,warehouse_id,price_list_id,source_sales_order_id,source_delivery_id,subtotal,discount_total,tax_total,grand_total,paid_total,due_total,payment_status,seller_user_id,customer_notes,internal_notes,posted_at,created_by,updated_at,deleted_at,deleted_by,delete_reason)
    VALUES ($1,$2,$3,CURRENT_DATE,1,$4,$5,$6,$7,$8,$9,0.0000,0.0000,$9,$10,$11,'PAID',$12,NULL,NULL,now(),$12,now(),NULL,NULL,NULL)`,
    [id, branchId, documentNumber, counterpartyId, warehouseId, ids.priceList, sourceOrderId, sourceDeliveryId, grandTotal, paidTotal, dueTotal, ids.user]);
}

async function insertInvoiceLine(client, id, invoiceId, variantId, productUnitId, priceSource = "PRICE_LIST") {
  await client.query(`INSERT INTO sales_invoice_lines
    (id,invoice_id,variant_id,product_unit_id,quantity,unit_price,price_source,discount_amount,tax_code_id,tax_rate_snapshot,tax_amount,line_total,unit_cogs_snapshot,cogs_total)
    VALUES ($1,$2,$3,$4,1.000000,100.0000,$5,0.0000,NULL,NULL,0.0000,100.0000,60.0000,60.0000)`,
    [id, invoiceId, variantId, productUnitId, priceSource]);
}

test("03.06 Sales constraints enforce canonical integrity on PostgreSQL 17", async (t) => {
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
          "pk_sales_quotes","pk_sales_orders","pk_sales_order_shipping_details","pk_sales_order_delivery_lines",
          "pk_sales_invoices","pk_sales_returns","uq_sales_quotes__branch_document","uq_sales_orders__branch_document",
          "uq_sales_invoices__branch_document","uq_sales_returns__branch_document","fk_sales_orders__warehouse_branch",
          "fk_sales_invoices__warehouse_branch","fk_sales_returns__warehouse_branch","fk_stock_reservations__sales_order",
          "fk_stock_reservations__sales_order_line","ck_sales_invoice_lines__price_source",
          "ct_sales_order_delivery_lines__source_match_at_commit","ct_sales_invoices__source_match_at_commit",
          "ct_sales_return_lines__source_match_at_commit","ct_stock_reservations__sales_context_at_commit",
        ]]);
      assert.equal(constraints.rowCount, 20);

      const productTriggers = await client.query(`
        SELECT tgname FROM pg_catalog.pg_trigger
        WHERE tgname = ANY($1::text[]) AND NOT tgisinternal ORDER BY tgname`, [[
          "ct_sales_quote_lines__product_unit_match_at_commit",
          "ct_sales_order_lines__product_unit_match_at_commit",
          "ct_sales_invoice_lines__product_unit_match_at_commit",
          "ct_sales_return_lines__product_unit_match_at_commit",
        ]]);
      assert.equal(productTriggers.rowCount, 4);

      const independentIndexes = await client.query(`
        SELECT idx.relname AS index_name
        FROM pg_catalog.pg_index i
        JOIN pg_catalog.pg_class tbl ON tbl.oid=i.indrelid
        JOIN pg_catalog.pg_namespace n ON n.oid=tbl.relnamespace
        JOIN pg_catalog.pg_class idx ON idx.oid=i.indexrelid
        LEFT JOIN pg_catalog.pg_constraint con ON con.conindid=i.indexrelid
        WHERE n.nspname='public' AND tbl.relname=ANY($1::text[]) AND con.oid IS NULL
        ORDER BY idx.relname`, [SALES_TABLES]);
      assert.deepEqual(independentIndexes.rows, [], "03.07 independent/partial Sales indexes must remain deferred");

      const taxFks = await client.query(`
        SELECT conname FROM pg_catalog.pg_constraint
        WHERE conrelid = ANY($1::regclass[]) AND conname LIKE '%tax_code%'
        ORDER BY conname`, [[
          "public.sales_quote_lines","public.sales_order_lines","public.sales_invoice_lines","public.sales_return_lines",
        ]]);
      assert.deepEqual(taxFks.rows.map((row) => row.conname), [
        "fk_sales_invoice_lines__tax_code",
        "fk_sales_order_lines__tax_code",
        "fk_sales_quote_lines__tax_code",
        "fk_sales_return_lines__tax_code",
      ]);

      const ids = await seedFixture(client);
      const quote1 = "40000000-0000-4000-8000-000000000020";
      const order1 = "40000000-0000-4000-8000-000000000021";
      const order2 = "40000000-0000-4000-8000-000000000022";
      const orderLine1 = "40000000-0000-4000-8000-000000000023";
      const orderLine2 = "40000000-0000-4000-8000-000000000024";
      const delivery1 = "40000000-0000-4000-8000-000000000025";
      const invoice1 = "40000000-0000-4000-8000-000000000026";
      const invoice2 = "40000000-0000-4000-8000-000000000027";
      const invoiceLine1 = "40000000-0000-4000-8000-000000000028";
      const invoiceLine2 = "40000000-0000-4000-8000-000000000029";
      const salesReturn1 = "40000000-0000-4000-8000-000000000030";

      await insertQuote(client, quote1, ids.branch1, 1, ids);
      await expectConstraint(insertQuote(client, "40000000-0000-4000-8000-000000000031", ids.branch1, 1, ids), "23505", "uq_sales_quotes__branch_document");

      await expectConstraint(insertOrder(client, "40000000-0000-4000-8000-000000000032", ids.branch1, 2, ids.warehouse2, null, ids), "23503", "fk_sales_orders__warehouse_branch");
      await expectConstraint(insertOrder(client, "40000000-0000-4000-8000-000000000033", ids.branch2, 1, ids.warehouse2, quote1, ids), "23503", "fk_sales_orders__source_quote_branch");

      await insertOrder(client, order1, ids.branch1, 2, ids.warehouse1, quote1, ids);
      await insertOrder(client, order2, ids.branch1, 3, ids.warehouse1, null, ids);
      await insertOrderLine(client, orderLine1, order1, ids.variant1, ids.productUnit1);
      await insertOrderLine(client, orderLine2, order2, ids.variant1, ids.productUnit1);

      await expectDeferredConstraint(client, async () => {
        await insertOrderLine(client, "40000000-0000-4000-8000-000000000034", order1, ids.variant1, ids.productUnit2);
      }, "ct_sales_order_lines__product_unit_match_at_commit");

      const reservation = "40000000-0000-4000-8000-000000000035";
      await client.query(`INSERT INTO stock_reservations
        (id,sales_order_id,sales_order_line_id,warehouse_id,variant_id,quantity,status,created_at,released_at)
        VALUES ($1,$2,$3,$4,$5,2.000000,'ACTIVE',now(),NULL)`,
        [reservation, order1, orderLine1, ids.warehouse1, ids.variant1]);

      await expectDeferredConstraint(client, async () => {
        await client.query(`INSERT INTO stock_reservations
          (id,sales_order_id,sales_order_line_id,warehouse_id,variant_id,quantity,status,created_at,released_at)
          VALUES ('40000000-0000-4000-8000-000000000036',$1,$2,$3,$4,1.000000,'ACTIVE',now(),NULL)`,
          [order1, orderLine1, ids.warehouse1b, ids.variant1]);
      }, "ct_stock_reservations__sales_context_at_commit");

      await expectDeferredConstraint(client, async () => {
        await client.query(`UPDATE sales_orders SET warehouse_id=$1,updated_at=now() WHERE id=$2`, [ids.warehouse1b, order1]);
      }, "ct_sales_orders__preserve_reservation_context_at_commit");

      await client.query(`INSERT INTO sales_order_deliveries
        (id,sales_order_id,delivery_type,status,delivered_at,created_by)
        VALUES ($1,$2,'PICKUP','DELIVERED',now(),$3)`, [delivery1, order1, ids.user]);

      await expectDeferredConstraint(client, async () => {
        await client.query(`INSERT INTO sales_order_delivery_lines (delivery_id,sales_order_line_id,quantity)
          VALUES ($1,$2,1.000000)`, [delivery1, orderLine2]);
      }, "ct_sales_order_delivery_lines__source_match_at_commit");

      await client.query(`INSERT INTO sales_order_delivery_lines (delivery_id,sales_order_line_id,quantity)
        VALUES ($1,$2,1.000000)`, [delivery1, orderLine1]);
      await expectConstraint(client.query(`INSERT INTO sales_order_delivery_lines (delivery_id,sales_order_line_id,quantity)
        VALUES ($1,$2,1.000000)`, [delivery1, orderLine1]), "23505", "pk_sales_order_delivery_lines");

      await expectConstraint(insertInvoice(client, {
        id: "40000000-0000-4000-8000-000000000037", branchId: ids.branch1, documentNumber: 1,
        warehouseId: ids.warehouse2,
      }, ids), "23503", "fk_sales_invoices__warehouse_branch");

      await expectConstraint(insertInvoice(client, {
        id: "40000000-0000-4000-8000-000000000038", documentNumber: 1,
        counterpartyId: null, grandTotal: "100.0000", paidTotal: "0.0000", dueTotal: "100.0000",
      }, ids), "23514", "ck_sales_invoices__due_requires_counterparty");

      await expectDeferredConstraint(client, async () => {
        await insertInvoice(client, {
          id: "40000000-0000-4000-8000-000000000039", documentNumber: 1,
          sourceOrderId: order2, sourceDeliveryId: delivery1,
        }, ids);
      }, "ct_sales_invoices__source_match_at_commit");

      await insertInvoice(client, {
        id: invoice1, documentNumber: 1, sourceOrderId: order1, sourceDeliveryId: delivery1,
      }, ids);
      await insertInvoiceLine(client, invoiceLine1, invoice1, ids.variant1, ids.productUnit1);
      await expectConstraint(insertInvoiceLine(client, "40000000-0000-4000-8000-000000000040", invoice1, ids.variant1, ids.productUnit1, "INVALID"), "23514", "ck_sales_invoice_lines__price_source");

      await expectDeferredConstraint(client, async () => {
        await insertInvoiceLine(client, "40000000-0000-4000-8000-000000000041", invoice1, ids.variant1, ids.productUnit2);
      }, "ct_sales_invoice_lines__product_unit_match_at_commit");

      await insertInvoice(client, {
        id: invoice2, documentNumber: 2, sourceOrderId: order1, sourceDeliveryId: delivery1,
      }, ids);
      await insertInvoiceLine(client, invoiceLine2, invoice2, ids.variant1, ids.productUnit1);
      const sameDeliveryInvoices = await client.query(`SELECT count(*)::int AS count FROM sales_invoices WHERE source_delivery_id=$1`, [delivery1]);
      assert.equal(sameDeliveryInvoices.rows[0].count, 2, "source_delivery partial uniqueness remains intentionally deferred to 03.07");

      await client.query(`INSERT INTO sales_returns
        (id,branch_id,document_number,document_date,document_version,counterparty_id,warehouse_id,source_invoice_id,subtotal,tax_total,grand_total,posted_at,created_by,deleted_at,deleted_by,delete_reason)
        VALUES ($1,$2,1,CURRENT_DATE,1,$3,$4,$5,100.0000,0.0000,100.0000,now(),$6,NULL,NULL,NULL)`,
        [salesReturn1, ids.branch1, ids.counterparty, ids.warehouse1, invoice1, ids.user]);

      await expectDeferredConstraint(client, async () => {
        await client.query(`INSERT INTO sales_return_lines
          (id,sales_return_id,source_invoice_line_id,variant_id,product_unit_id,quantity,unit_price,discount_amount,tax_code_id,historical_unit_cost,line_total)
          VALUES ('40000000-0000-4000-8000-000000000042',$1,$2,$3,$4,1.000000,100.0000,0.0000,NULL,60.0000,100.0000)`,
          [salesReturn1, invoiceLine2, ids.variant1, ids.productUnit1]);
      }, "ct_sales_return_lines__source_match_at_commit");

      const returnLine = "40000000-0000-4000-8000-000000000043";
      await client.query(`INSERT INTO sales_return_lines
        (id,sales_return_id,source_invoice_line_id,variant_id,product_unit_id,quantity,unit_price,discount_amount,tax_code_id,historical_unit_cost,line_total)
        VALUES ($1,$2,$3,$4,$5,1.000000,100.0000,0.0000,NULL,60.0000,100.0000)`,
        [returnLine, salesReturn1, invoiceLine1, ids.variant1, ids.productUnit1]);

      await expectConstraint(client.query(`UPDATE sales_return_lines SET quantity=0 WHERE id=$1`, [returnLine]), "23514", "ck_sales_return_lines__quantity_positive");

      await expectDeferredConstraint(client, async () => {
        await client.query(`UPDATE sales_invoice_lines SET invoice_id=$1 WHERE id=$2`, [invoice2, invoiceLine1]);
      }, "ct_sales_invoice_lines__preserve_return_source_at_commit");

      const reservationFks = await client.query(`
        SELECT conname FROM pg_catalog.pg_constraint
        WHERE conrelid='public.stock_reservations'::regclass
          AND conname IN ('fk_stock_reservations__sales_order','fk_stock_reservations__sales_order_line')
        ORDER BY conname`);
      assert.equal(reservationFks.rowCount, 2);
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
