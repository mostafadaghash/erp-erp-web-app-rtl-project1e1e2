import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import { runMigrations } from "../../scripts/database/migrations.mjs";
import { RoleCatalogService } from "../infrastructure/authorization/role-catalog-service.ts";
import { withTransaction } from "../infrastructure/database/transaction.ts";
import { ChequeError, ChequeService } from "../infrastructure/finance/cheque-service.ts";
import { FinancialMovementService } from "../infrastructure/finance/financial-movement-service.ts";
import { TREASURY_PERMISSIONS } from "../infrastructure/finance/treasury-service.ts";
import { IdempotencyConflictError } from "../infrastructure/idempotency/idempotency-service.ts";
import { PostingBatchService } from "../infrastructure/posting/posting-batch-service.ts";
import { cleanupDatabase, MIGRATIONS } from "./postgresql-schema-test-support.mjs";

const url=process.env.ERP_TEST_DATABASE_URL;
const I={
 co:"ca060000-0000-4000-8000-000000000001",br:"ca060000-0000-4000-8000-000000000002",br2:"ca060000-0000-4000-8000-000000000003",
 user:"ca060000-0000-4000-8000-000000000004",perm:"ca060000-0000-4000-8000-000000000005",
 customer:"ca060000-0000-4000-8000-000000000006",supplier:"ca060000-0000-4000-8000-000000000007",wrong:"ca060000-0000-4000-8000-000000000008",
 trIn:"ca060000-0000-4000-8000-000000000009",trOut:"ca060000-0000-4000-8000-000000000010",trOff:"ca060000-0000-4000-8000-000000000011",trOther:"ca060000-0000-4000-8000-000000000012",
 src1:"ca060000-0000-4000-8000-000000000021",src2:"ca060000-0000-4000-8000-000000000022",src3:"ca060000-0000-4000-8000-000000000023",
 directBatchSource:"ca060000-0000-4000-8000-000000000024"
};
const exp=new Date("2030-01-01T00:00:00Z");
const pending=(key,direction,counterparty,sourceId,number="CHK-1",amount="100")=>({idempotencyKey:key,idempotencyExpiresAt:exp,actorUserId:I.user,branchId:I.br,counterpartyId:counterparty,direction,chequeNumber:number,bankName:"Test Bank",amount,dueDate:"2026-10-20",sourceType:direction==="RECEIVABLE"?"SALES_INVOICE":"PURCHASE_INVOICE",sourceId,notes:null});
const clear=(key,chequeId,treasuryId)=>({idempotencyKey:key,idempotencyExpiresAt:exp,actorUserId:I.user,chequeId,treasuryId,occurredAt:new Date("2026-10-03T10:00:00Z")});

test("09.06 Cheques are pending-without-cash, single-settlement and concurrency-safe on PostgreSQL 17",{skip:url===undefined},async()=>{
 assert.ok(url);await cleanupDatabase(url);const pool=new Pool({connectionString:url,max:20,application_name:"erp-0906"});
 const db={transaction(w,o){return withTransaction(pool,w,o)}};const roles=new RoleCatalogService(db),service=new ChequeService(db),posting=new PostingBatchService(),financial=new FinancialMovementService(db);
 try{
  assert.deepEqual((await runMigrations({databaseUrl:url})).applied,MIGRATIONS);
  const role=(await roles.ensureDefaultRoles()).find(x=>x.roleKey==="ACCOUNTANT");assert.ok(role);
  await pool.query("INSERT INTO companies(id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at) VALUES($1,'0906','EGP','ar-EG','Africa/Cairo',true,now(),now())",[I.co]);
  await pool.query("INSERT INTO branches(id,company_id,name,code,is_active,created_at,updated_at) VALUES($1,$3,'A','A',true,now(),now()),($2,$3,'B','B',true,now(),now())",[I.br,I.br2,I.co]);
  await pool.query("INSERT INTO permissions(id,permission_key,module,description_key) VALUES($1,$2,'finance','permissions.finance.accounts.manage') ON CONFLICT(permission_key) DO NOTHING",[I.perm,TREASURY_PERMISSIONS.manage]);
  const p=await pool.query("SELECT id FROM permissions WHERE permission_key=$1",[TREASURY_PERMISSIONS.manage]);await pool.query("INSERT INTO role_permissions(role_id,permission_id,is_allowed) VALUES($1,$2,true) ON CONFLICT(role_id,permission_id) DO UPDATE SET is_allowed=true",[role.id,p.rows[0].id]);
  await pool.query("INSERT INTO users(id,name,username,email,password_hash,role_id,default_branch_id,branch_scope_mode,preferred_language,is_active,created_at,updated_at) VALUES($1,'U','cheque-u','cheque-u@example.test','x',$2,$3,'ALL','ar-EG',true,now(),now())",[I.user,role.id,I.br]);
  await pool.query("INSERT INTO counterparties(id,name,phone,normalized_phone,address,notes,is_active,created_at,updated_at) VALUES($1,'Customer',NULL,NULL,NULL,NULL,true,now(),now()),($2,'Supplier',NULL,NULL,NULL,NULL,true,now(),now()),($3,'Wrong',NULL,NULL,NULL,NULL,true,now(),now())",[I.customer,I.supplier,I.wrong]);
  await pool.query("INSERT INTO counterparty_roles(counterparty_id,role) VALUES($1,'CUSTOMER'),($2,'SUPPLIER'),($3,'SUPPLIER')",[I.customer,I.supplier,I.wrong]);
  await pool.query("INSERT INTO treasuries(id,branch_id,name,is_active,notes,created_at) VALUES($1,$5,'In',true,NULL,now()),($2,$5,'Out',true,NULL,now()),($3,$5,'Off',false,NULL,now()),($4,$6,'Other',true,NULL,now())",[I.trIn,I.trOut,I.trOff,I.trOther,I.br,I.br2]);

  const receivable=await service.registerPending(pending("p-r","RECEIVABLE",I.customer,I.src1,"DUP-100","100"));assert.equal(receivable.state,"EXECUTED");assert.equal(receivable.value.status,"PENDING");
  const payable=await service.registerPending(pending("p-p","PAYABLE",I.supplier,I.src2,"DUP-100","70"));assert.equal(payable.value.status,"PENDING");
  assert.equal((await pool.query("SELECT count(*)::int c FROM financial_movements")).rows[0].c,0);
  assert.equal((await pool.query("SELECT count(*)::int c FROM treasury_balance_positions")).rows[0].c,0);
  assert.equal((await pool.query("SELECT count(*)::int c FROM cheques WHERE cheque_number='DUP-100'")).rows[0].c,2);
  await assert.rejects(()=>service.registerPending(pending("bad-role","RECEIVABLE",I.wrong,I.src3,"BAD","5")),(e)=>e instanceof ChequeError&&e.reason==="COUNTERPARTY_ROLE_MISMATCH");

  const replay=await service.registerPending(pending("p-r","RECEIVABLE",I.customer,I.src1,"DUP-100","100"));assert.equal(replay.state,"REPLAYED");assert.equal(replay.resultReference,receivable.value.id);
  await assert.rejects(()=>service.registerPending(pending("p-r","RECEIVABLE",I.customer,I.src1,"DUP-100","101")),IdempotencyConflictError);

  const clearedR=await service.clear(clear("clear-r",receivable.value.id,I.trIn));assert.equal(clearedR.value.cheque.status,"CLEARED");assert.equal(clearedR.value.financial.movement.direction,"IN");assert.equal(clearedR.value.financial.movement.amount,"100.0000");assert.equal(clearedR.value.financial.movement.sourceType,"CHEQUE");assert.equal(clearedR.value.financial.movement.sourceId,receivable.value.id);assert.equal(clearedR.value.financial.movement.counterpartyId,I.customer);
  assert.equal((await pool.query("SELECT current_balance::text b FROM treasury_balance_positions WHERE treasury_id=$1",[I.trIn])).rows[0].b,"100.0000");
  const replayClear=await service.clear(clear("clear-r",receivable.value.id,I.trIn));assert.equal(replayClear.state,"REPLAYED");assert.equal(replayClear.value.financial.movement.id,clearedR.value.financial.movement.id);
  await assert.rejects(()=>service.clear({...clear("clear-r",receivable.value.id,I.trIn),occurredAt:new Date("2026-10-03T11:00:00Z")}),IdempotencyConflictError);

  const clearedP=await service.clear(clear("clear-p",payable.value.id,I.trOut));assert.equal(clearedP.value.financial.movement.direction,"OUT");assert.equal(clearedP.value.financial.movement.amount,"70.0000");assert.equal((await pool.query("SELECT current_balance::text b FROM treasury_balance_positions WHERE treasury_id=$1",[I.trOut])).rows[0].b,"-70.0000");

  const wrongTreasury=await service.registerPending(pending("wrong-tr","RECEIVABLE",I.customer,"ca060000-0000-4000-8000-000000000031","WTR","9"));
  await assert.rejects(()=>service.clear(clear("wrong-tr-clear",wrongTreasury.value.id,I.trOther)),(e)=>e instanceof ChequeError&&e.reason==="TREASURY_INVALID");
  await assert.rejects(()=>service.clear(clear("off-tr-clear",wrongTreasury.value.id,I.trOff)),(e)=>e instanceof ChequeError&&e.reason==="TREASURY_INVALID");
  assert.equal((await pool.query("SELECT status FROM cheques WHERE id=$1",[wrongTreasury.value.id])).rows[0].status,"PENDING");

  const raceCheque=await service.registerPending(pending("race-p","RECEIVABLE",I.customer,"ca060000-0000-4000-8000-000000000032","RACE","15"));
  const race=await Promise.allSettled([service.clear(clear("race-a",raceCheque.value.id,I.trIn)),service.clear(clear("race-b",raceCheque.value.id,I.trIn))]);
  assert.equal(race.filter(x=>x.status==="fulfilled").length,1);assert.equal(race.filter(x=>x.status==="rejected"&&x.reason instanceof ChequeError&&x.reason.reason==="CHEQUE_NOT_PENDING").length,1);
  assert.equal((await pool.query("SELECT count(*)::int c FROM financial_movements WHERE source_type='CHEQUE' AND source_id=$1",[raceCheque.value.id])).rows[0].c,1);

  const bounced=await service.registerPending(pending("bounce-p","RECEIVABLE",I.customer,"ca060000-0000-4000-8000-000000000033","BOUNCE","11"));
  const movementBeforeTerminal=(await pool.query("SELECT count(*)::int c FROM financial_movements")).rows[0].c;
  const b=await service.bounce({idempotencyKey:"bounce",idempotencyExpiresAt:exp,actorUserId:I.user,chequeId:bounced.value.id,reason:"returned"});assert.equal(b.value.status,"BOUNCED");
  assert.equal((await pool.query("SELECT count(*)::int c FROM financial_movements")).rows[0].c,movementBeforeTerminal);
  await assert.rejects(()=>service.clear(clear("bounce-clear",bounced.value.id,I.trIn)),(e)=>e instanceof ChequeError&&e.reason==="CHEQUE_NOT_PENDING");

  const cancelled=await service.registerPending(pending("cancel-p","PAYABLE",I.supplier,"ca060000-0000-4000-8000-000000000034","CANCEL","12"));
  const ca=await service.cancel({idempotencyKey:"cancel",idempotencyExpiresAt:exp,actorUserId:I.user,chequeId:cancelled.value.id,reason:"void"});assert.equal(ca.value.status,"CANCELLED");
  await assert.rejects(()=>service.clear(clear("cancel-clear",cancelled.value.id,I.trOut)),(e)=>e instanceof ChequeError&&e.reason==="CHEQUE_NOT_PENDING");
  await assert.rejects(()=>service.cancel({idempotencyKey:"cancel-after-clear",idempotencyExpiresAt:exp,actorUserId:I.user,chequeId:receivable.value.id}),(e)=>e instanceof ChequeError&&e.reason==="CHEQUE_NOT_PENDING");

  const forced=await service.registerPending(pending("forced-p","RECEIVABLE",I.customer,"ca060000-0000-4000-8000-000000000035","FORCED","13"));
  const beforeForced={movements:Number((await pool.query("SELECT count(*) c FROM financial_movements")).rows[0].c),positions:Number((await pool.query("SELECT count(*) c FROM treasury_balance_positions")).rows[0].c),audit:Number((await pool.query("SELECT count(*) c FROM audit_logs")).rows[0].c),outbox:Number((await pool.query("SELECT count(*) c FROM outbox_events")).rows[0].c),balance:(await pool.query("SELECT current_balance::text b FROM treasury_balance_positions WHERE treasury_id=$1",[I.trIn])).rows[0].b};
  await pool.query("CREATE FUNCTION public.test_0906_fail_clear() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='CLEARED' THEN RAISE EXCEPTION 'forced 09.06 clear failure'; END IF; RETURN NEW; END; $$; CREATE TRIGGER test_0906_fail_clear BEFORE UPDATE ON cheques FOR EACH ROW EXECUTE FUNCTION public.test_0906_fail_clear();");
  await assert.rejects(()=>service.clear(clear("forced-clear",forced.value.id,I.trIn)),/forced 09.06 clear failure/);
  await pool.query("DROP TRIGGER test_0906_fail_clear ON cheques");await pool.query("DROP FUNCTION public.test_0906_fail_clear()");
  assert.equal((await pool.query("SELECT status FROM cheques WHERE id=$1",[forced.value.id])).rows[0].status,"PENDING");
  assert.equal(Number((await pool.query("SELECT count(*) c FROM financial_movements")).rows[0].c),beforeForced.movements);assert.equal(Number((await pool.query("SELECT count(*) c FROM treasury_balance_positions")).rows[0].c),beforeForced.positions);assert.equal(Number((await pool.query("SELECT count(*) c FROM audit_logs")).rows[0].c),beforeForced.audit);assert.equal(Number((await pool.query("SELECT count(*) c FROM outbox_events")).rows[0].c),beforeForced.outbox);assert.equal((await pool.query("SELECT current_balance::text b FROM treasury_balance_positions WHERE treasury_id=$1",[I.trIn])).rows[0].b,beforeForced.balance);

  await assert.rejects(()=>pool.query("UPDATE cheques SET status='CANCELLED' WHERE id=$1",[clearedR.value.cheque.id]),/terminal cheque state is immutable/);
  await assert.rejects(()=>pool.query("DELETE FROM cheques WHERE id=$1",[clearedR.value.cheque.id]),/immutable/);
  await assert.rejects(()=>pool.query("UPDATE cheques SET bank_name='Changed' WHERE id=$1",[wrongTreasury.value.id]),/immutable/);
  await assert.rejects(()=>pool.query("UPDATE cheques SET status='CLEARED' WHERE id=$1",[wrongTreasury.value.id]),/requires settlement/);

  const direct=await service.registerPending(pending("direct-p","RECEIVABLE",I.customer,"ca060000-0000-4000-8000-000000000036","DIRECT","20"));
  await assert.rejects(()=>withTransaction(pool,async client=>{const batch=await posting.create(client,{branchId:I.br,sourceType:"CHEQUE",sourceId:direct.value.id,operationType:"POST",documentVersion:1,createdBy:I.user});await financial.appendWithinTransaction(client,{actorUserId:I.user,postingBatchId:batch.id,treasuryId:I.trIn,direction:"OUT",amount:"20",occurredAt:new Date("2026-10-03T12:00:00Z"),counterpartyId:I.customer})}),(e)=>e?.code==="23514");
  assert.equal((await pool.query("SELECT count(*)::int c FROM financial_movements WHERE source_type='CHEQUE' AND source_id=$1",[direct.value.id])).rows[0].c,0);

  await assert.rejects(()=>withTransaction(pool,async client=>{const batch=await posting.create(client,{branchId:I.br,sourceType:"CHEQUE",sourceId:receivable.value.id,operationType:"POST",documentVersion:2,createdBy:I.user});await financial.appendWithinTransaction(client,{actorUserId:I.user,postingBatchId:batch.id,treasuryId:I.trIn,direction:"IN",amount:"100",occurredAt:new Date("2026-10-03T13:00:00Z"),counterpartyId:I.customer})}),(e)=>e?.code==="23514");
  assert.equal((await pool.query("SELECT count(*)::int c FROM financial_movements WHERE source_type='CHEQUE' AND source_id=$1",[receivable.value.id])).rows[0].c,1);

  const noAccounting=await pool.query("SELECT (SELECT count(*)::int FROM customer_ledger_entries) customer_ledger,(SELECT count(*)::int FROM supplier_ledger_entries) supplier_ledger,(SELECT count(*)::int FROM journal_entries) journals");
  assert.deepEqual(noAccounting.rows[0],{customer_ledger:0,supplier_ledger:0,journals:0});

  const indexes=await pool.query("SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='cheques' AND indexname NOT LIKE '%pkey%' ORDER BY indexname");
  assert.equal(indexes.rowCount,5);
  const verify=await runMigrations({databaseUrl:url,verifyOnly:true});assert.deepEqual(verify.applied,[]);assert.deepEqual(verify.skipped,MIGRATIONS);
 }finally{await pool.end().catch(()=>{});await cleanupDatabase(url).catch(()=>{})}
});
