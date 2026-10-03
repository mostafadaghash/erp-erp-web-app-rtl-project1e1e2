import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";
import { RoleCatalogService } from "../infrastructure/authorization/role-catalog-service.ts";
import { withTransaction } from "../infrastructure/database/transaction.ts";
import { CashDocumentPostingService } from "../infrastructure/finance/cash-document-posting-service.ts";
import { InstallmentError, InstallmentService } from "../infrastructure/finance/installment-service.ts";
import { TREASURY_PERMISSIONS } from "../infrastructure/finance/treasury-service.ts";
import { IdempotencyConflictError } from "../infrastructure/idempotency/idempotency-service.ts";
import { cleanupDatabase, MIGRATIONS } from "./postgresql-schema-test-support.mjs";

const url=process.env.ERP_TEST_DATABASE_URL;
const exp=new Date("2035-01-01T00:00:00Z");
const I={
 co:"ca070000-0000-4000-8000-000000000001",
 br:"ca070000-0000-4000-8000-000000000002",
 wh:"ca070000-0000-4000-8000-000000000003",
 user:"ca070000-0000-4000-8000-000000000004",
 perm:"ca070000-0000-4000-8000-000000000005",
 customer:"ca070000-0000-4000-8000-000000000006",
 supplier:"ca070000-0000-4000-8000-000000000007",
 otherCustomer:"ca070000-0000-4000-8000-000000000008",
 pl:"ca070000-0000-4000-8000-000000000009",
 treasury:"ca070000-0000-4000-8000-000000000010",
 sale1:"ca070000-0000-4000-8000-000000000011",
 sale2:"ca070000-0000-4000-8000-000000000012",
 sale3:"ca070000-0000-4000-8000-000000000013",
 sale4:"ca070000-0000-4000-8000-000000000014",
 sale5:"ca070000-0000-4000-8000-000000000015",
 purchase1:"ca070000-0000-4000-8000-000000000016"
};

function createPlanInput(key,sourceType,sourceId,counterpartyId,rows){
 return {idempotencyKey:key,idempotencyExpiresAt:exp,actorUserId:I.user,counterpartyId,sourceType,sourceId,installments:rows};
}
function settleInput(key,allocations){
 return {idempotencyKey:key,idempotencyExpiresAt:exp,actorUserId:I.user,treasuryId:I.treasury,occurredAt:new Date("2026-10-03T12:00:00Z"),allocations};
}

test("09.07 Installments are schedule-only, allocation-backed and concurrency-safe on PostgreSQL 17",{skip:url===undefined},async()=>{
 assert.ok(url);
 await cleanupDatabase(url);
 const pool=new Pool({connectionString:url,max:24,application_name:"erp-0907"});
 const db={transaction(w,o){return withTransaction(pool,w,o)}};
 const roles=new RoleCatalogService(db);
 const service=new InstallmentService(db);
 const cash=new CashDocumentPostingService(db);
 try{
  assert.deepEqual((await runMigrations({databaseUrl:url})).applied,MIGRATIONS);
  const role=(await roles.ensureDefaultRoles()).find(x=>x.roleKey==="ACCOUNTANT");assert.ok(role);

  await pool.query("INSERT INTO companies(id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at) VALUES($1,'0907','EGP','ar-EG','Africa/Cairo',true,now(),now())",[I.co]);
  await pool.query("INSERT INTO branches(id,company_id,name,code,is_active,created_at,updated_at) VALUES($1,$2,'A','A',true,now(),now())",[I.br,I.co]);
  await pool.query("INSERT INTO warehouses(id,branch_id,name,code,is_active,created_at,updated_at) VALUES($1,$2,'WH','WH',true,now(),now())",[I.wh,I.br]);
  await pool.query("INSERT INTO permissions(id,permission_key,module,description_key) VALUES($1,$2,'finance','permissions.finance.accounts.manage') ON CONFLICT(permission_key) DO NOTHING",[I.perm,TREASURY_PERMISSIONS.manage]);
  const p=await pool.query("SELECT id FROM permissions WHERE permission_key=$1",[TREASURY_PERMISSIONS.manage]);
  await pool.query("INSERT INTO role_permissions(role_id,permission_id,is_allowed) VALUES($1,$2,true) ON CONFLICT(role_id,permission_id) DO UPDATE SET is_allowed=true",[role.id,p.rows[0].id]);
  await pool.query("INSERT INTO users(id,name,username,email,password_hash,role_id,default_branch_id,branch_scope_mode,preferred_language,is_active,created_at,updated_at) VALUES($1,'U','installment-u','installment-u@example.test','x',$2,$3,'ALL','ar-EG',true,now(),now())",[I.user,role.id,I.br]);
  await pool.query("INSERT INTO counterparties(id,name,phone,normalized_phone,address,notes,is_active,created_at,updated_at) VALUES($1,'Customer',NULL,NULL,NULL,NULL,true,now(),now()),($2,'Supplier',NULL,NULL,NULL,NULL,true,now(),now()),($3,'Other Customer',NULL,NULL,NULL,NULL,true,now(),now())",[I.customer,I.supplier,I.otherCustomer]);
  await pool.query("INSERT INTO counterparty_roles(counterparty_id,role) VALUES($1,'CUSTOMER'),($2,'SUPPLIER'),($3,'CUSTOMER')",[I.customer,I.supplier,I.otherCustomer]);
  await pool.query("INSERT INTO price_lists(id,name,is_active,created_at,updated_at) VALUES($1,'Retail',true,now(),now())",[I.pl]);
  await pool.query("INSERT INTO treasuries(id,branch_id,name,is_active,notes,created_at) VALUES($1,$2,'Cash',true,NULL,now())",[I.treasury,I.br]);

  const salesSql="INSERT INTO sales_invoices(id,branch_id,document_number,document_date,document_version,counterparty_id,warehouse_id,price_list_id,source_sales_order_id,source_delivery_id,subtotal,discount_total,tax_total,grand_total,paid_total,due_total,payment_status,seller_user_id,customer_notes,internal_notes,posted_at,created_by,updated_at,deleted_at,deleted_by,delete_reason) VALUES($1,$2,$3,CURRENT_DATE,1,$4,$5,$6,NULL,NULL,$7,0,0,$7,0,$7,'UNPAID',$8,NULL,NULL,now(),$8,now(),NULL,NULL,NULL)";
  await pool.query(salesSql,[I.sale1,I.br,1,I.customer,I.wh,I.pl,100,I.user]);
  await pool.query(salesSql,[I.sale2,I.br,2,I.customer,I.wh,I.pl,50,I.user]);
  await pool.query(salesSql,[I.sale3,I.br,3,I.customer,I.wh,I.pl,30,I.user]);
  await pool.query(salesSql,[I.sale4,I.br,4,I.customer,I.wh,I.pl,25,I.user]);
  await pool.query(salesSql,[I.sale5,I.br,5,I.customer,I.wh,I.pl,20,I.user]);
  const purchaseSql="INSERT INTO purchase_invoices(id,branch_id,document_number,document_date,document_version,counterparty_id,warehouse_id,subtotal,discount_total,additional_cost,tax_total,grand_total,paid_total,due_total,payment_status,notes,posted_at,created_by,deleted_at,deleted_by,delete_reason) VALUES($1,$2,$3,CURRENT_DATE,1,$4,$5,$6,0,0,0,$6,0,$6,'UNPAID',NULL,now(),$7,NULL,NULL,NULL)";
  await pool.query(purchaseSql,[I.purchase1,I.br,1,I.supplier,I.wh,70,I.user]);

  const beforeSchedule=await pool.query("SELECT (SELECT count(*)::int FROM receipts) receipts,(SELECT count(*)::int FROM disbursements) disbursements,(SELECT count(*)::int FROM financial_movements) movements,(SELECT count(*)::int FROM financial_allocations) allocations,(SELECT count(*)::int FROM customer_ledger_entries) customer_ledger,(SELECT count(*)::int FROM supplier_ledger_entries) supplier_ledger,(SELECT count(*)::int FROM journal_entries) journals");
  const salePlan=await service.createPlan(createPlanInput("sale-plan","SALES_INVOICE",I.sale1,I.customer,[{dueDate:"2030-01-01",amount:"60"},{dueDate:"2030-02-01",amount:"40"}]));
  assert.equal(salePlan.state,"EXECUTED");assert.equal(salePlan.value.plan.totalAmount,"100.0000");assert.deepEqual(salePlan.value.installments.map(x=>x.status),["UPCOMING","UPCOMING"]);
  const afterSchedule=await pool.query("SELECT (SELECT count(*)::int FROM receipts) receipts,(SELECT count(*)::int FROM disbursements) disbursements,(SELECT count(*)::int FROM financial_movements) movements,(SELECT count(*)::int FROM financial_allocations) allocations,(SELECT count(*)::int FROM customer_ledger_entries) customer_ledger,(SELECT count(*)::int FROM supplier_ledger_entries) supplier_ledger,(SELECT count(*)::int FROM journal_entries) journals");
  assert.deepEqual(afterSchedule.rows[0],beforeSchedule.rows[0]);

  const replay=await service.createPlan(createPlanInput("sale-plan","SALES_INVOICE",I.sale1,I.customer,[{dueDate:"2030-01-01",amount:"60"},{dueDate:"2030-02-01",amount:"40"}]));assert.equal(replay.state,"REPLAYED");assert.equal(replay.resultReference,salePlan.value.plan.id);
  await assert.rejects(()=>service.createPlan(createPlanInput("sale-plan","SALES_INVOICE",I.sale1,I.customer,[{dueDate:"2030-01-01",amount:"100"}])),IdempotencyConflictError);
  await assert.rejects(()=>service.createPlan(createPlanInput("duplicate-plan","SALES_INVOICE",I.sale1,I.customer,[{dueDate:"2030-01-01",amount:"100"}])),e=>e instanceof InstallmentError&&e.reason==="PLAN_ALREADY_EXISTS");
  await assert.rejects(()=>service.createPlan(createPlanInput("bad-cp","SALES_INVOICE",I.sale2,I.otherCustomer,[{dueDate:"2030-01-01",amount:"50"}])),e=>e instanceof InstallmentError&&e.reason==="SOURCE_COUNTERPARTY_MISMATCH");
  await assert.rejects(()=>service.createPlan(createPlanInput("bad-total","SALES_INVOICE",I.sale2,I.customer,[{dueDate:"2030-01-01",amount:"49"}])),e=>e instanceof InstallmentError&&e.reason==="SCHEDULE_TOTAL_MISMATCH");

  const racePlanResults=await Promise.allSettled([
   service.createPlan(createPlanInput("race-plan-a","SALES_INVOICE",I.sale5,I.customer,[{dueDate:"2030-05-01",amount:"20"}])),
   service.createPlan(createPlanInput("race-plan-b","SALES_INVOICE",I.sale5,I.customer,[{dueDate:"2030-05-01",amount:"20"}]))
  ]);
  assert.equal(racePlanResults.filter(x=>x.status==="fulfilled").length,1);
  assert.equal(racePlanResults.filter(x=>x.status==="rejected"&&x.reason instanceof InstallmentError&&x.reason.reason==="PLAN_ALREADY_EXISTS").length,1);

  const purchasePlan=await service.createPlan(createPlanInput("purchase-plan","PURCHASE_INVOICE",I.purchase1,I.supplier,[{dueDate:"2030-03-01",amount:"30"},{dueDate:"2030-04-01",amount:"40"}]));assert.equal(purchasePlan.state,"EXECUTED");
  const racePlan=await service.createPlan(createPlanInput("race-source-plan","SALES_INVOICE",I.sale2,I.customer,[{dueDate:"2030-06-01",amount:"50"}]));assert.equal(racePlan.state,"EXECUTED");
  const overduePlan=await service.createPlan(createPlanInput("overdue-plan","SALES_INVOICE",I.sale3,I.customer,[{dueDate:"2020-01-01",amount:"30"}]));assert.equal(overduePlan.value.installments[0].status,"OVERDUE");
  const forcedPlan=await service.createPlan(createPlanInput("forced-plan","SALES_INVOICE",I.sale4,I.customer,[{dueDate:"2030-07-01",amount:"25"}]));assert.equal(forcedPlan.state,"EXECUTED");

  const saleA=salePlan.value.installments[0],saleB=salePlan.value.installments[1];
  const multi=await service.settle(settleInput("multi-settle",[{installmentId:saleA.id,amount:"10"},{installmentId:saleB.id,amount:"15"}]));
  assert.equal(multi.state,"EXECUTED");assert.equal(multi.value.cash.document.type,"RECEIPT");assert.equal(multi.value.cash.document.amount,"25.0000");assert.equal(multi.value.cash.financial.movement.direction,"IN");assert.equal(multi.value.allocations.length,2);
  const multiStatuses=new Map(multi.value.installments.map(x=>[x.id,x]));assert.equal(multiStatuses.get(saleA.id).paidAmountProjection,"10.0000");assert.equal(multiStatuses.get(saleA.id).status,"PARTIAL");assert.equal(multiStatuses.get(saleB.id).paidAmountProjection,"15.0000");assert.equal(multiStatuses.get(saleB.id).status,"PARTIAL");
  const multiReplay=await service.settle(settleInput("multi-settle",[{installmentId:saleA.id,amount:"10"},{installmentId:saleB.id,amount:"15"}]));assert.equal(multiReplay.state,"REPLAYED");assert.equal(multiReplay.resultReference,multi.value.cash.document.id);

  const finishA=await service.settle(settleInput("finish-a",[{installmentId:saleA.id,amount:"50"}]));assert.equal(finishA.value.installments[0].status,"PAID");assert.equal(finishA.value.installments[0].paidAmountProjection,"60.0000");

  const purchaseA=purchasePlan.value.installments[0],purchaseB=purchasePlan.value.installments[1];
  const supplierSettlement=await service.settle(settleInput("supplier-settle",[{installmentId:purchaseA.id,amount:"20"},{installmentId:purchaseB.id,amount:"10"}]));
  assert.equal(supplierSettlement.value.cash.document.type,"DISBURSEMENT");assert.equal(supplierSettlement.value.cash.financial.movement.direction,"OUT");assert.equal(supplierSettlement.value.cash.document.amount,"30.0000");

  const overdueSettlement=await service.settle(settleInput("overdue-partial",[{installmentId:overduePlan.value.installments[0].id,amount:"5"}]));
  assert.equal(overdueSettlement.value.installments[0].paidAmountProjection,"5.0000");assert.equal(overdueSettlement.value.installments[0].status,"OVERDUE");

  const raceInstallment=racePlan.value.installments[0];
  const settlementRace=await Promise.allSettled([
   service.settle(settleInput("race-settle-a",[{installmentId:raceInstallment.id,amount:"40"}])),
   service.settle(settleInput("race-settle-b",[{installmentId:raceInstallment.id,amount:"40"}]))
  ]);
  assert.equal(settlementRace.filter(x=>x.status==="fulfilled").length,1);
  assert.equal(settlementRace.filter(x=>x.status==="rejected"&&x.reason instanceof InstallmentError&&x.reason.reason==="INSTALLMENT_OVER_ALLOCATION").length,1);
  assert.equal((await pool.query("SELECT paid_amount_projection::text paid FROM installments WHERE id=$1",[raceInstallment.id])).rows[0].paid,"40.0000");

  await assert.rejects(()=>service.settle(settleInput("over-target",[{installmentId:saleB.id,amount:"26"}])),e=>e instanceof InstallmentError&&e.reason==="INSTALLMENT_OVER_ALLOCATION");

  const directReceipt=await cash.postReceipt({idempotencyKey:"direct-r",idempotencyExpiresAt:exp,actorUserId:I.user,branchId:I.br,treasuryId:I.treasury,counterpartyId:I.customer,amount:"5",occurredAt:new Date("2026-10-03T13:00:00Z")});
  await assert.rejects(()=>pool.query("INSERT INTO financial_allocations(id,financial_source_type,financial_source_id,target_type,target_id,amount,created_at) VALUES('ca070000-0000-4000-8000-000000000080','RECEIPT',$1,'INSTALLMENT',$2,6,now())",[directReceipt.value.document.id,saleB.id]),/cash source amount|exceeds cash source amount/);

  const wrongCash=await cash.postDisbursement({idempotencyKey:"wrong-d",idempotencyExpiresAt:exp,actorUserId:I.user,branchId:I.br,treasuryId:I.treasury,counterpartyId:I.customer,amount:"1",occurredAt:new Date("2026-10-03T13:10:00Z")});
  await assert.rejects(()=>pool.query("INSERT INTO financial_allocations(id,financial_source_type,financial_source_id,target_type,target_id,amount,created_at) VALUES('ca070000-0000-4000-8000-000000000081','DISBURSEMENT',$1,'INSTALLMENT',$2,1,now())",[wrongCash.value.document.id,saleB.id]),/cash direction/);

  const existingAllocation=multi.value.allocations[0];
  await assert.rejects(()=>pool.query("UPDATE financial_allocations SET amount=1 WHERE id=$1",[existingAllocation.id]),/immutable/);
  await assert.rejects(()=>pool.query("DELETE FROM financial_allocations WHERE id=$1",[existingAllocation.id]),/immutable/);
  await assert.rejects(()=>pool.query("UPDATE installment_plans SET total_amount=1 WHERE id=$1",[salePlan.value.plan.id]),/immutable/);
  await assert.rejects(()=>pool.query("UPDATE installments SET amount=1 WHERE id=$1",[saleB.id]),/immutable/);

  await pool.query("ALTER TABLE installments DISABLE TRIGGER bt_installments__guard");
  await pool.query("UPDATE installments SET paid_amount_projection=0,status='UPCOMING' WHERE id=$1",[saleB.id]);
  await pool.query("ALTER TABLE installments ENABLE TRIGGER bt_installments__guard");
  const rebuilt=await service.rebuildPlan({idempotencyKey:"rebuild-sale",idempotencyExpiresAt:exp,actorUserId:I.user,planId:salePlan.value.plan.id});
  assert.equal(rebuilt.state,"EXECUTED");
  const rebuiltB=rebuilt.value.installments.find(x=>x.id===saleB.id);assert.ok(rebuiltB);assert.equal(rebuiltB.paidAmountProjection,"15.0000");assert.equal(rebuiltB.status,"PARTIAL");

  const beforeForced=await pool.query("SELECT (SELECT count(*)::int FROM receipts) receipts,(SELECT count(*)::int FROM financial_movements) movements,(SELECT count(*)::int FROM financial_allocations) allocations,(SELECT current_balance::text FROM treasury_balance_positions WHERE treasury_id=$1) balance,(SELECT count(*)::int FROM audit_logs) audits,(SELECT count(*)::int FROM outbox_events) outbox",[I.treasury]);
  await pool.query("CREATE FUNCTION public.test_0907_fail_allocation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.target_type='INSTALLMENT' THEN RAISE EXCEPTION 'forced 09.07 allocation failure'; END IF; RETURN NEW; END; $$; CREATE TRIGGER test_0907_fail_allocation BEFORE INSERT ON financial_allocations FOR EACH ROW EXECUTE FUNCTION public.test_0907_fail_allocation();");
  await assert.rejects(()=>service.settle(settleInput("forced-settle",[{installmentId:forcedPlan.value.installments[0].id,amount:"10"}])),/forced 09.07 allocation failure/);
  await pool.query("DROP TRIGGER test_0907_fail_allocation ON financial_allocations");await pool.query("DROP FUNCTION public.test_0907_fail_allocation()");
  const afterForced=await pool.query("SELECT (SELECT count(*)::int FROM receipts) receipts,(SELECT count(*)::int FROM financial_movements) movements,(SELECT count(*)::int FROM financial_allocations) allocations,(SELECT current_balance::text FROM treasury_balance_positions WHERE treasury_id=$1) balance,(SELECT count(*)::int FROM audit_logs) audits,(SELECT count(*)::int FROM outbox_events) outbox",[I.treasury]);
  assert.deepEqual(afterForced.rows[0],beforeForced.rows[0]);assert.equal((await pool.query("SELECT paid_amount_projection::text paid FROM installments WHERE id=$1",[forcedPlan.value.installments[0].id])).rows[0].paid,"0.0000");

  const directBadPlan=await pool.query("SELECT count(*)::int c FROM installment_plans WHERE source_id=$1",[I.sale4]);assert.equal(directBadPlan.rows[0].c,1);
  await assert.rejects(()=>pool.query("INSERT INTO installment_plans(id,counterparty_id,source_type,source_id,total_amount,created_at) VALUES('ca070000-0000-4000-8000-000000000090',$1,'UNSUPPORTED',$2,25,now())",[I.customer,I.sale4]),/unsupported installment plan source type/);

  const indexesPlan=await pool.query("SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='installment_plans' AND indexname NOT LIKE '%pkey%' ORDER BY indexname");
  assert.deepEqual(indexesPlan.rows.map(x=>x.indexname),["ix_installment_plans__counterparty_id_source_type_source_id"]);
  const indexesInstallment=await pool.query("SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='installments' AND indexname NOT LIKE '%pkey%' ORDER BY indexname");
  assert.deepEqual(indexesInstallment.rows.map(x=>x.indexname),["ix_installments__plan_id_due_date","ix_installments__plan_id_due_date_id__where_status_in__28b32c13"]);

  const noPrematureAccounting=await pool.query("SELECT (SELECT count(*)::int FROM customer_ledger_entries) customer_ledger,(SELECT count(*)::int FROM supplier_ledger_entries) supplier_ledger,(SELECT count(*)::int FROM journal_entries) journals");
  assert.deepEqual(noPrematureAccounting.rows[0],{customer_ledger:0,supplier_ledger:0,journals:0});
  const shape=await pool.query("SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='installment_plans' AND column_name='branch_id') has_branch,EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='installment_plans' AND column_name='direction') has_direction");
  assert.deepEqual(shape.rows[0],{has_branch:false,has_direction:false});
  const verify=await runMigrations({databaseUrl:url,verifyOnly:true});assert.deepEqual(verify.applied,[]);assert.deepEqual(verify.skipped,MIGRATIONS);
 }finally{
  await pool.end().catch(()=>{});
  await cleanupDatabase(url).catch(()=>{});
 }
});
