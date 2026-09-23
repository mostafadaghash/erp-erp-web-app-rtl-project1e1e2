import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";
import { RoleCatalogService } from "../infrastructure/authorization/role-catalog-service.ts";
import { withTransaction } from "../infrastructure/database/transaction.ts";
import { InventoryCostService } from "../infrastructure/inventory/inventory-cost-service.ts";
import {
  InventoryAdjustmentError,
  InventoryAdjustmentService,
} from "../infrastructure/inventory/inventory-adjustment-service.ts";
import { StockReservationService } from "../infrastructure/inventory/stock-reservation-service.ts";
import { ProductModelService } from "../infrastructure/products/product-model-service.ts";
import { ProductUnitService } from "../infrastructure/products/product-unit-service.ts";
import { cleanupDatabase, MIGRATIONS } from "./postgresql-schema-test-support.mjs";

const databaseUrl=process.env.ERP_TEST_DATABASE_URL;
const I={
 company:"89090000-0000-4000-8000-000000000001",branch:"89090000-0000-4000-8000-000000000002",
 warehouse:"89090000-0000-4000-8000-000000000003",admin:"89090000-0000-4000-8000-000000000004",
 category:"89090000-0000-4000-8000-000000000005",counterparty:"89090000-0000-4000-8000-000000000006",
 priceList:"89090000-0000-4000-8000-000000000007",order:"89090000-0000-4000-8000-000000000008",
 orderLine:"89090000-0000-4000-8000-000000000009",
};

test("08.09 Inventory Adjustment posts formally and surfaces reservation shortfall without rewriting reservation",{skip:databaseUrl===undefined},async()=>{
 assert.ok(databaseUrl);await cleanupDatabase(databaseUrl);
 const pool=new Pool({connectionString:databaseUrl,max:20,application_name:"erp-adjustment-0809-test"});
 const database={transaction(work,options){return withTransaction(pool,work,options)}};
 const roles=new RoleCatalogService(database),units=new ProductUnitService(database),products=new ProductModelService(database);
 const costs=new InventoryCostService(database),reservations=new StockReservationService(database),adjustments=new InventoryAdjustmentService(database);
 try{
  const applied=await runMigrations({databaseUrl});assert.deepEqual(applied.applied,MIGRATIONS);assert.equal(MIGRATIONS.at(-1),"0026");
  const v=Number((await pool.query("SHOW server_version_num")).rows[0].server_version_num);assert.ok(v>=170000&&v<180000);
  const rs=await roles.ensureDefaultRoles(),adminRole=rs.find(r=>r.roleKey==="SYSTEM_ADMIN");assert.ok(adminRole);
  await pool.query(`INSERT INTO companies(id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at)
    VALUES($1,'Adjustment Co','EGP','ar-EG','Africa/Cairo',true,now(),now())`,[I.company]);
  await pool.query(`INSERT INTO branches(id,company_id,name,code,is_active,created_at,updated_at) VALUES($1,$2,'Branch','B1',true,now(),now())`,[I.branch,I.company]);
  await pool.query(`INSERT INTO warehouses(id,branch_id,name,code,is_active,created_at,updated_at) VALUES($1,$2,'Warehouse','W1',true,now(),now())`,[I.warehouse,I.branch]);
  await pool.query(`INSERT INTO users(id,name,username,email,password_hash,role_id,default_branch_id,branch_scope_mode,preferred_language,is_active,last_login_at,created_at,updated_at)
    VALUES($1,'Admin','adjust-admin','adjust-admin@example.test','hash',$2,$3,'ALL','ar-EG',true,NULL,now(),now())`,[I.admin,adminRole.id,I.branch]);
  await pool.query(`INSERT INTO counterparties(id,name,phone,normalized_phone,address,notes,is_active,created_at,updated_at) VALUES($1,'Customer',NULL,NULL,NULL,NULL,true,now(),now())`,[I.counterparty]);
  await pool.query(`INSERT INTO price_lists(id,name,is_active,created_at,updated_at) VALUES($1,'Default',true,now(),now())`,[I.priceList]);
  await pool.query(`INSERT INTO product_categories(id,name,parent_id,is_active) VALUES($1,'General',NULL,true)`,[I.category]);
  const piece=await units.createUnit({actorUserId:I.admin,name:"Piece",symbol:"pc",allowsFraction:false});
  const product=await products.createSimpleProduct({actorUserId:I.admin,name:"Adjusted Product",categoryId:I.category,productType:"STOCK",baseUnitMasterId:piece.id});
  const variantId=product.variants[0].id,productUnitId=product.baseProductUnit.id;
  await withTransaction(pool,c=>costs.applyInboundWithinTransaction(c,{actorUserId:I.admin,warehouseId:I.warehouse,variantId,quantity:"10",unitCost:"100",lastPurchaseCost:"100"}));
  await pool.query(`INSERT INTO sales_orders(id,branch_id,document_number,counterparty_id,warehouse_id,price_list_id,status,delivery_method,sales_user_id,customer_service_user_id,customer_notes,internal_notes,source_quote_id,version,created_at,updated_at)
    VALUES($1,$2,1,$3,$4,$5,'CONFIRMED','PICKUP',$6,$6,NULL,NULL,NULL,1,now(),now())`,[I.order,I.branch,I.counterparty,I.warehouse,I.priceList,I.admin]);
  await pool.query(`INSERT INTO sales_order_lines(id,sales_order_id,variant_id,product_unit_id,ordered_quantity,unit_price,discount_amount,tax_code_id,line_total)
    VALUES($1,$2,$3,$4,8,100,0,NULL,800)`,[I.orderLine,I.order,variantId,productUnitId]);
  const reserved=await reservations.setLineReservation({actorUserId:I.admin,salesOrderId:I.order,salesOrderLineId:I.orderLine,warehouseId:I.warehouse,variantId,desiredQuantity:"8"});
  assert.equal(reserved.quantity,"8.000000");

  await assert.rejects(adjustments.create({actorUserId:I.admin,idempotencyKey:"adj-other-no-note",warehouseId:I.warehouse,reasonCode:"OTHER",lines:[{variantId,quantityDifference:"-1"}]}),
    e=>e instanceof InventoryAdjustmentError&&e.reason==="OTHER_NOTE_REQUIRED");

  const result=await adjustments.create({actorUserId:I.admin,idempotencyKey:"adj-shortfall-1",warehouseId:I.warehouse,reasonCode:"DAMAGE",notes:"Damaged during handling",lines:[{variantId,quantityDifference:"-4"}]});
  assert.equal(result.state,"EXECUTED");assert.equal(result.value.reservationShortfallCount,1);
  const pos=(await pool.query(`SELECT on_hand::text,reserved::text FROM inventory_stock_positions WHERE warehouse_id=$1 AND variant_id=$2`,[I.warehouse,variantId])).rows[0];
  assert.deepEqual(pos,{on_hand:"6.000000",reserved:"8.000000"});
  const reservation=(await pool.query("SELECT quantity::text,status FROM stock_reservations WHERE id=$1",[reserved.id])).rows[0];
  assert.deepEqual(reservation,{quantity:"8.000000",status:"ACTIVE"});
  const adj=(await pool.query(`SELECT reason_code,notes FROM inventory_adjustments WHERE id=$1`,[result.value.id])).rows[0];
  assert.deepEqual(adj,{reason_code:"DAMAGE",notes:"Damaged during handling"});
  const mov=(await pool.query(`SELECT im.movement_type,iml.quantity_signed::text,iml.unit_cost::text FROM inventory_movements im JOIN inventory_movement_lines iml ON iml.movement_id=im.id WHERE im.source_type='INVENTORY_ADJUSTMENT' AND im.source_id=$1`,[result.value.id])).rows[0];
  assert.deepEqual(mov,{movement_type:"ADJUSTMENT",quantity_signed:"-4.000000",unit_cost:"100.0000"});
  const evt=await pool.query(`SELECT event_type,payload FROM outbox_events WHERE aggregate_id=$1 ORDER BY event_type`,[result.value.id]);
  assert.ok(evt.rows.some(r=>r.event_type==="inventory.reservation_shortfall.detected"));
  assert.ok(evt.rows.some(r=>r.event_type==="accounting.inventory_adjustment.posted"));
  const replay=await adjustments.create({actorUserId:I.admin,idempotencyKey:"adj-shortfall-1",warehouseId:I.warehouse,reasonCode:"DAMAGE",notes:"Damaged during handling",lines:[{variantId,quantityDifference:"-4"}]});
  assert.equal(replay.state,"REPLAYED");
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM inventory_adjustments")).rows[0].n,1);

  await assert.rejects(adjustments.create({actorUserId:I.admin,idempotencyKey:"adj-negative",warehouseId:I.warehouse,reasonCode:"DAMAGE",notes:"too much",lines:[{variantId,quantityDifference:"-7"}]}),
    e=>e instanceof InventoryAdjustmentError&&e.reason==="NEGATIVE_STOCK_PERMISSION_REQUIRED");
 }finally{await pool.end();await cleanupDatabase(databaseUrl)}
});
