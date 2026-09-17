import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";
import { cleanupDatabase, MIGRATIONS } from "./postgresql-schema-test-support.mjs";

const { Client } = pg;
const databaseUrl = process.env.ERP_TEST_DATABASE_URL;
const PURCHASING_TABLES = ["purchase_invoices","purchase_invoice_lines","purchase_returns","purchase_return_lines","tax_codes"];

async function withClient(fn) { const client = new Client({ connectionString: databaseUrl }); await client.connect(); try { return await fn(client); } finally { await client.end(); } }
async function expectConstraint(promise, code, constraint) { await assert.rejects(promise, (error) => error?.code === code && error?.constraint === constraint); }
async function expectDeferredConstraint(client, work, constraint) { await client.query("BEGIN"); try { await work(); await assert.rejects(client.query("COMMIT"), (error) => error?.code === "23514" && error?.constraint === constraint); } finally { await client.query("ROLLBACK").catch(() => {}); } }

async function createProduct(client, ids, name, sku, signature) {
  await client.query("BEGIN");
  try {
    await client.query(`INSERT INTO products (id,name,category_id,product_type,base_unit_id,tracking_serial,tracking_batch,tracking_expiry,is_active,created_at,updated_at) VALUES ($1,$2,$3,'STOCK',$4,false,false,false,true,now(),now())`, [ids.product, name, ids.category, ids.productUnit]);
    await client.query(`INSERT INTO product_units (id,product_id,unit_id,conversion_to_base,is_sellable,is_purchasable) VALUES ($1,$2,$3,1.000000,true,true)`, [ids.productUnit, ids.product, ids.unit]);
    await client.query(`INSERT INTO product_variants (id,product_id,name,sku,is_default,combination_signature,minimum_selling_price,is_active,created_at,updated_at) VALUES ($1,$2,'Default',$3,true,$4,0.0000,true,now(),now())`, [ids.variant, ids.product, sku, signature]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
}

async function seedFixture(client) {
  const ids = { company:"50000000-0000-4000-8000-000000000001",branch1:"50000000-0000-4000-8000-000000000002",branch2:"50000000-0000-4000-8000-000000000003",warehouse1:"50000000-0000-4000-8000-000000000004",warehouse2:"50000000-0000-4000-8000-000000000005",role:"50000000-0000-4000-8000-000000000006",user:"50000000-0000-4000-8000-000000000007",supplier:"50000000-0000-4000-8000-000000000008",category:"50000000-0000-4000-8000-000000000009",unit:"50000000-0000-4000-8000-000000000010",product1:"50000000-0000-4000-8000-000000000011",productUnit1:"50000000-0000-4000-8000-000000000012",variant1:"50000000-0000-4000-8000-000000000013",product2:"50000000-0000-4000-8000-000000000014",productUnit2:"50000000-0000-4000-8000-000000000015",variant2:"50000000-0000-4000-8000-000000000016",priceList:"50000000-0000-4000-8000-000000000017",tax:"50000000-0000-4000-8000-000000000018" };
  await client.query(`INSERT INTO companies (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at) VALUES ($1,'Purchasing Test Co','EGP','ar-EG','Africa/Cairo',true,now(),now())`, [ids.company]);
  await client.query(`INSERT INTO branches (id,company_id,name,code,is_active,created_at,updated_at) VALUES ($1,$3,'Main','MAIN',true,now(),now()),($2,$3,'Remote','REMOTE',true,now(),now())`, [ids.branch1, ids.branch2, ids.company]);
  await client.query(`INSERT INTO warehouses (id,branch_id,name,code,is_active,created_at,updated_at) VALUES ($1,$3,'Main WH','MAIN-WH',true,now(),now()),($2,$4,'Remote WH','REMOTE-WH',true,now(),now())`, [ids.warehouse1, ids.warehouse2, ids.branch1, ids.branch2]);
  await client.query(`INSERT INTO roles (id,role_key,display_name_key,is_system) VALUES ($1,'PURCHASING_TEST','roles.purchasingTest',true)`, [ids.role]);
  await client.query(`INSERT INTO users (id,name,username,email,password_hash,role_id,default_branch_id,branch_scope_mode,preferred_language,is_active,created_at,updated_at) VALUES ($1,'Purchasing User','purchasing-test',NULL,'hash',$2,$3,'ALL','ar-EG',true,now(),now())`, [ids.user, ids.role, ids.branch1]);
  await client.query(`INSERT INTO counterparties (id,name,phone,normalized_phone,address,notes,is_active,created_at,updated_at) VALUES ($1,'Purchasing Supplier',NULL,NULL,NULL,NULL,true,now(),now())`, [ids.supplier]);
  await client.query(`INSERT INTO counterparty_roles (counterparty_id,role) VALUES ($1,'SUPPLIER')`, [ids.supplier]);
  await client.query(`INSERT INTO product_categories (id,name,parent_id,is_active) VALUES ($1,'Purchasing',NULL,true)`, [ids.category]);
  await client.query(`INSERT INTO units (id,name,symbol,allows_fraction,is_active) VALUES ($1,'Purchasing Piece','pc',false,true)`, [ids.unit]);
  await client.query(`INSERT INTO price_lists (id,name,is_active,created_at,updated_at) VALUES ($1,'Purchasing Sales Tax Probe',true,now(),now())`, [ids.priceList]);
  await createProduct(client,{product:ids.product1,productUnit:ids.productUnit1,variant:ids.variant1,category:ids.category,unit:ids.unit},"Purchasing Product 1","PUR-001","DEFAULT-P1");
  await createProduct(client,{product:ids.product2,productUnit:ids.productUnit2,variant:ids.variant2,category:ids.category,unit:ids.unit},"Purchasing Product 2","PUR-002","DEFAULT-P2");
  await client.query(`INSERT INTO tax_codes (id,name,code,rate,tax_type,is_purchase_recoverable,is_active) VALUES ($1,'VAT 14%','VAT14',14.0000,'VAT',true,true)`, [ids.tax]);
  return ids;
}

async function insertPurchaseInvoice(client, values, ids) { const {id,branchId=ids.branch1,documentNumber,warehouseId=ids.warehouse1,counterpartyId=ids.supplier,grandTotal="100.0000",paidTotal="100.0000",dueTotal="0.0000"}=values; await client.query(`INSERT INTO purchase_invoices (id,branch_id,document_number,document_date,document_version,counterparty_id,warehouse_id,subtotal,discount_total,additional_cost,tax_total,grand_total,paid_total,due_total,payment_status,notes,posted_at,created_by,deleted_at,deleted_by,delete_reason) VALUES ($1,$2,$3,CURRENT_DATE,1,$4,$5,$6,0.0000,0.0000,0.0000,$6,$7,$8,'POSTED',NULL,now(),$9,NULL,NULL,NULL)`,[id,branchId,documentNumber,counterpartyId,warehouseId,grandTotal,paidTotal,dueTotal,ids.user]); }
async function insertPurchaseInvoiceLine(client, values, ids) { const {id,invoiceId,variantId=ids.variant1,productUnitId=ids.productUnit1,quantity="8.000000",taxCodeId=ids.tax}=values; await client.query(`INSERT INTO purchase_invoice_lines (id,purchase_invoice_id,variant_id,product_unit_id,quantity,purchase_unit_price,discount_amount,net_before_tax,landed_cost_allocation,landed_unit_cost,tax_code_id,tax_amount,line_total) VALUES ($1,$2,$3,$4,$5,50.0000,0.0000,400.0000,0.0000,50.0000,$6,56.0000,456.0000)`,[id,invoiceId,variantId,productUnitId,quantity,taxCodeId]); }
async function insertPurchaseReturn(client, values, ids) { const {id,branchId=ids.branch1,documentNumber,warehouseId=ids.warehouse1,sourceInvoiceId=null,counterpartyId=ids.supplier,total="150.0000",deleted=false}=values; await client.query(`INSERT INTO purchase_returns (id,branch_id,document_number,document_date,document_version,counterparty_id,warehouse_id,source_purchase_invoice_id,total,posted_at,created_by,deleted_at,deleted_by,delete_reason) VALUES ($1,$2,$3,CURRENT_DATE,1,$4,$5,$6,$7,now(),$8,$9,$10,$11)`,[id,branchId,documentNumber,counterpartyId,warehouseId,sourceInvoiceId,total,ids.user,deleted?new Date():null,deleted?ids.user:null,deleted?"reversed test return":null]); }
async function insertPurchaseReturnLine(client, values, ids) { const {id,returnId,sourceLineId=null,variantId=ids.variant1,quantity="3.000000",commercialValue="50.0000",inventoryCost="48.0000",costVariance="6.0000",taxAmount="0.0000",lineTotal="150.0000"}=values; await client.query(`INSERT INTO purchase_return_lines (id,purchase_return_id,source_purchase_invoice_line_id,variant_id,quantity,commercial_unit_value_snapshot,inventory_unit_cost_snapshot,cost_variance,tax_amount,line_total) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[id,returnId,sourceLineId,variantId,quantity,commercialValue,inventoryCost,costVariance,taxAmount,lineTotal]); }

test("03.06 Purchasing / Tax constraints enforce canonical integrity on PostgreSQL 17", async (t) => {
  if (!databaseUrl) return t.skip("ERP_TEST_DATABASE_URL is not configured");
  await cleanupDatabase(databaseUrl);
  try {
    const first=await runMigrations({databaseUrl}); assert.deepEqual(first.applied,MIGRATIONS); assert.deepEqual(first.skipped,[]);
    await withClient(async(client)=>{
      const expectedConstraints=["pk_tax_codes","uq_tax_codes__code","pk_purchase_invoices","uq_purchase_invoices__branch_document","pk_purchase_invoice_lines","pk_purchase_returns","uq_purchase_returns__branch_document","pk_purchase_return_lines","fk_purchase_invoices__warehouse_branch","fk_purchase_returns__warehouse_branch","fk_purchase_invoice_lines__tax_code","fk_sales_quote_lines__tax_code","fk_sales_order_lines__tax_code","fk_sales_invoice_lines__tax_code","fk_sales_return_lines__tax_code","ck_purchase_invoices__due_requires_counterparty","ck_tax_codes__rate_nonnegative","ct_purchase_invoice_lines__product_unit_match_at_commit","ct_purchase_return_lines__source_match_at_commit","ct_purchase_returns__preserve_source_hierarchy_at_commit","ct_purchase_invoice_lines__preserve_return_source_at_commit"];
      const constraints=await client.query(`SELECT conname,contype FROM pg_catalog.pg_constraint WHERE conname=ANY($1::text[]) ORDER BY conname`,[expectedConstraints]); assert.equal(constraints.rowCount,expectedConstraints.length);
      const independentIndexes=await client.query(`SELECT idx.relname AS index_name FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class tbl ON tbl.oid=i.indrelid JOIN pg_catalog.pg_namespace n ON n.oid=tbl.relnamespace JOIN pg_catalog.pg_class idx ON idx.oid=i.indexrelid LEFT JOIN pg_catalog.pg_constraint con ON con.conindid=i.indexrelid WHERE n.nspname='public' AND tbl.relname=ANY($1::text[]) AND con.oid IS NULL ORDER BY idx.relname`,[PURCHASING_TABLES]); assert.deepEqual(independentIndexes.rows,[],"03.07 independent/partial Purchasing/Tax indexes must remain deferred");
      const ids=await seedFixture(client);
      await expectConstraint(client.query(`INSERT INTO tax_codes (id,name,code,rate,tax_type,is_purchase_recoverable,is_active) VALUES ('50000000-0000-4000-8000-000000000019','Duplicate VAT','VAT14',14.0000,'VAT',true,true)`),"23505","uq_tax_codes__code");
      await expectConstraint(client.query(`INSERT INTO tax_codes (id,name,code,rate,tax_type,is_purchase_recoverable,is_active) VALUES ('50000000-0000-4000-8000-000000000020','Bad Tax','BAD',-1.0000,'CUSTOM',false,true)`),"23514","ck_tax_codes__rate_nonnegative");
      await client.query(`INSERT INTO tax_codes (id,name,code,rate,tax_type,is_purchase_recoverable,is_active) VALUES ('50000000-0000-4000-8000-000000000021','Custom Tax','CUSTOM5',5.0000,'CUSTOM',false,true)`);
      const invoice1="50000000-0000-4000-8000-000000000030",invoice2="50000000-0000-4000-8000-000000000031",invoiceLine1="50000000-0000-4000-8000-000000000032",invoiceLine2="50000000-0000-4000-8000-000000000033";
      await insertPurchaseInvoice(client,{id:invoice1,documentNumber:1},ids); await insertPurchaseInvoice(client,{id:invoice2,documentNumber:2},ids);
      await expectConstraint(insertPurchaseInvoice(client,{id:"50000000-0000-4000-8000-000000000034",documentNumber:1},ids),"23505","uq_purchase_invoices__branch_document");
      await expectConstraint(insertPurchaseInvoice(client,{id:"50000000-0000-4000-8000-000000000035",documentNumber:3,warehouseId:ids.warehouse2},ids),"23503","fk_purchase_invoices__warehouse_branch");
      await expectConstraint(insertPurchaseInvoice(client,{id:"50000000-0000-4000-8000-000000000036",documentNumber:4,counterpartyId:null,grandTotal:"100.0000",paidTotal:"50.0000",dueTotal:"50.0000"},ids),"23514","ck_purchase_invoices__due_requires_counterparty");
      await insertPurchaseInvoiceLine(client,{id:invoiceLine1,invoiceId:invoice1},ids); await insertPurchaseInvoiceLine(client,{id:invoiceLine2,invoiceId:invoice2,quantity:"4.000000"},ids);
      await expectDeferredConstraint(client,async()=>{await insertPurchaseInvoiceLine(client,{id:"50000000-0000-4000-8000-000000000037",invoiceId:invoice1,variantId:ids.variant1,productUnitId:ids.productUnit2},ids);},"ct_purchase_invoice_lines__product_unit_match_at_commit");
      await expectConstraint(insertPurchaseInvoiceLine(client,{id:"50000000-0000-4000-8000-000000000038",invoiceId:invoice1,taxCodeId:"ffffffff-ffff-4fff-8fff-ffffffffffff"},ids),"23503","fk_purchase_invoice_lines__tax_code");
      const quote="50000000-0000-4000-8000-000000000039";
      await client.query(`INSERT INTO sales_quotes (id,branch_id,document_number,counterparty_id,price_list_id,status,valid_until,subtotal,discount_total,tax_total,grand_total,notes,created_by,created_at) VALUES ($1,$2,50,$3,$4,'OPEN',CURRENT_DATE+30,10.0000,0.0000,0.0000,10.0000,NULL,$5,now())`,[quote,ids.branch1,ids.supplier,ids.priceList,ids.user]);
      await expectConstraint(client.query(`INSERT INTO sales_quote_lines (id,quote_id,variant_id,product_unit_id,quantity,unit_price,discount_amount,tax_code_id,tax_rate_snapshot,line_total) VALUES ('50000000-0000-4000-8000-000000000040',$1,$2,$3,1.000000,10.0000,0.0000,'ffffffff-ffff-4fff-8fff-ffffffffffff',NULL,10.0000)`,[quote,ids.variant1,ids.productUnit1]),"23503","fk_sales_quote_lines__tax_code");
      await expectConstraint(insertPurchaseReturn(client,{id:"50000000-0000-4000-8000-000000000041",branchId:ids.branch2,warehouseId:ids.warehouse2,documentNumber:1,sourceInvoiceId:invoice1},ids),"23503","fk_purchase_returns__source_invoice_branch");
      const linkedReturn="50000000-0000-4000-8000-000000000042"; await insertPurchaseReturn(client,{id:linkedReturn,documentNumber:10,sourceInvoiceId:invoice1},ids);
      await expectDeferredConstraint(client,async()=>{await insertPurchaseReturnLine(client,{id:"50000000-0000-4000-8000-000000000043",returnId:linkedReturn,sourceLineId:invoiceLine2,variantId:ids.variant1},ids);},"ct_purchase_return_lines__source_match_at_commit");
      await expectDeferredConstraint(client,async()=>{await insertPurchaseReturnLine(client,{id:"50000000-0000-4000-8000-000000000044",returnId:linkedReturn,sourceLineId:invoiceLine1,variantId:ids.variant2},ids);},"ct_purchase_return_lines__source_match_at_commit");
      await expectConstraint(insertPurchaseReturnLine(client,{id:"50000000-0000-4000-8000-000000000045",returnId:linkedReturn,sourceLineId:invoiceLine1,quantity:"0.000000"},ids),"23514","ck_purchase_return_lines__quantity_positive");
      const validReturnLine="50000000-0000-4000-8000-000000000046"; await insertPurchaseReturnLine(client,{id:validReturnLine,returnId:linkedReturn,sourceLineId:invoiceLine1,quantity:"3.000000",costVariance:"-6.0000"},ids);
      const signedVariance=await client.query(`SELECT cost_variance::text AS cost_variance FROM purchase_return_lines WHERE id=$1`,[validReturnLine]); assert.equal(signedVariance.rows[0].cost_variance,"-6.0000","Purchase Return cost variance is intentionally signed");
      const deletedReturn="50000000-0000-4000-8000-000000000047"; await insertPurchaseReturn(client,{id:deletedReturn,documentNumber:11,sourceInvoiceId:invoice1,total:"50.0000",deleted:true},ids); await insertPurchaseReturnLine(client,{id:"50000000-0000-4000-8000-000000000048",returnId:deletedReturn,sourceLineId:invoiceLine1,quantity:"1.000000",lineTotal:"50.0000",costVariance:"2.0000"},ids);
      const returnable=await client.query(`SELECT purchased_quantity,posted_returned_quantity,returnable_quantity FROM purchase_returnable_quantities_v WHERE source_purchase_invoice_line_id=$1`,[invoiceLine1]); assert.deepEqual(returnable.rows[0],{purchased_quantity:"8.000000",posted_returned_quantity:"3.000000",returnable_quantity:"5.000000"});
      await expectDeferredConstraint(client,async()=>{await client.query(`UPDATE purchase_invoice_lines SET variant_id=$1,product_unit_id=$2 WHERE id=$3`,[ids.variant2,ids.productUnit2,invoiceLine1]);},"ct_purchase_invoice_lines__preserve_return_source_at_commit");
      await expectConstraint(client.query(`DELETE FROM tax_codes WHERE id=$1`,[ids.tax]),"23503","fk_purchase_invoice_lines__tax_code");
      const history=await client.query("SELECT version,name,checksum FROM schema_migrations ORDER BY version"); assert.equal(history.rowCount,MIGRATIONS.length);
      const purchasingSlice=history.rows.find((row)=>row.version==="0017"); assert.equal(purchasingSlice?.name,"purchasing_tax_constraints"); assert.match(purchasingSlice?.checksum??"",/^[0-9a-f]{64}$/);
      const latest=history.rows.at(-1); assert.equal(latest.version,"0021"); assert.equal(latest.name,"printing_export_reporting_read_models_constraints"); assert.match(latest.checksum,/^[0-9a-f]{64}$/);
    });
    const second=await runMigrations({databaseUrl}); assert.deepEqual(second.applied,[]); assert.deepEqual(second.skipped,MIGRATIONS);
    const verification=await runMigrations({databaseUrl,verifyOnly:true}); assert.deepEqual(verification.applied,[]); assert.deepEqual(verification.skipped,MIGRATIONS);
  } finally { await cleanupDatabase(databaseUrl); }
});