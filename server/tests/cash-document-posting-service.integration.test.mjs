import assert from "node:assert/strict";
import test from "node:test";
import {Pool} from "pg";
import {runMigrations} from "../../scripts/database/migrations.mjs";
import {RoleCatalogService} from "../infrastructure/authorization/role-catalog-service.ts";
import {withTransaction} from "../infrastructure/database/transaction.ts";
import {CashDocumentPostingService} from "../infrastructure/finance/cash-document-posting-service.ts";
import {IdempotencyConflictError} from "../infrastructure/idempotency/idempotency-service.ts";
import {cleanupDatabase,MIGRATIONS} from "./postgresql-schema-test-support.mjs";
const url=process.env.ERP_TEST_DATABASE_URL;
const I={co:"c9030000-0000-4000-8000-000000000001",a:"c9030000-0000-4000-8000-000000000002",b:"c9030000-0000-4000-8000-000000000003",u:"c9030000-0000-4000-8000-000000000004",t:"c9030000-0000-4000-8000-000000000005",tb:"c9030000-0000-4000-8000-000000000006"};
test("09.03 Receipt/Disbursement posting is idempotent, atomic, numbered and cash-ledger exact on PostgreSQL 17",{skip:url===undefined},async()=>{
 assert.ok(url);await cleanupDatabase(url);const pool=new Pool({connectionString:url,max:16,application_name:"erp-0903"});const db={transaction(w,o){return withTransaction(pool,w,o)}};const roles=new RoleCatalogService(db),svc=new CashDocumentPostingService(db);
 const base=(key,amount,treasuryId=I.t)=>({idempotencyKey:key,idempotencyExpiresAt:new Date("2030-01-01"),actorUserId:I.u,branchId:I.a,treasuryId,amount,occurredAt:new Date("2026-01-01T10:00:00Z")});
 try{
  assert.deepEqual((await runMigrations({databaseUrl:url})).applied,MIGRATIONS);
  const role=(await roles.ensureDefaultRoles()).find(x=>x.roleKey==="ACCOUNTANT");assert.ok(role);
  await pool.query("INSERT INTO companies(id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at) VALUES($1,'0903','EGP','ar-EG','Africa/Cairo',true,now(),now())",[I.co]);
  await pool.query("INSERT INTO branches(id,company_id,name,code,is_active,created_at,updated_at) VALUES($1,$3,'A','A',true,now(),now()),($2,$3,'B','B',true,now(),now())",[I.a,I.b,I.co]);
  await pool.query("INSERT INTO users(id,name,username,email,password_hash,role_id,default_branch_id,branch_scope_mode,preferred_language,is_active,created_at,updated_at) VALUES($1,'U','cash-u','cash-u@example.test','x',$2,$3,'ALL','ar-EG',true,now(),now())",[I.u,role.id,I.a]);
  await pool.query("INSERT INTO treasuries(id,branch_id,name,is_active,notes,created_at) VALUES($1,$3,'A Cash',true,NULL,now()),($2,$4,'B Cash',true,NULL,now())",[I.t,I.tb,I.a,I.b]);

  const receipt=await svc.postReceipt(base("r-1","100"));assert.equal(receipt.state,"EXECUTED");assert.equal(receipt.value.document.documentNumber,"1");assert.equal(receipt.value.financial.movement.direction,"IN");assert.equal(receipt.value.financial.position.currentBalance,"100.0000");
  const replay=await svc.postReceipt(base("r-1","100"));assert.equal(replay.state,"REPLAYED");assert.equal(replay.resultReference,receipt.resultReference);
  await assert.rejects(()=>svc.postReceipt(base("r-1","101")),IdempotencyConflictError);
  const pay=await svc.postDisbursement(base("d-1","30"));assert.equal(pay.state,"EXECUTED");assert.equal(pay.value.document.documentNumber,"1");assert.equal(pay.value.financial.movement.direction,"OUT");assert.equal(pay.value.financial.position.currentBalance,"70.0000");

  const rs=await Promise.all(Array.from({length:6},(_,n)=>svc.postReceipt(base(`r-c-${n}`,"1"))));const nums=rs.map(x=>Number(x.value.document.documentNumber));assert.equal(new Set(nums).size,6);
  const count=await pool.query("SELECT count(*)::int c FROM financial_movements WHERE source_type='RECEIPT'");assert.equal(count.rows[0].c,7);
  const pos=await pool.query("SELECT current_balance::text b FROM treasury_balance_positions WHERE treasury_id=$1",[I.t]);assert.equal(pos.rows[0].b,"76.0000");

  await assert.rejects(()=>pool.query("UPDATE receipts SET amount=2 WHERE id=$1",[receipt.resultReference]),/immutable/);
  await assert.rejects(()=>pool.query("DELETE FROM disbursements WHERE id=$1",[pay.resultReference]),/immutable/);
  await assert.rejects(()=>pool.query(`INSERT INTO financial_movements(id,treasury_id,branch_id,direction,amount,source_type,source_id,posting_batch_id,counterparty_id,occurred_at,created_by)
    SELECT 'c9030000-0000-4000-8000-000000000099',r.treasury_id,r.branch_id,'IN',r.amount,'RECEIPT',r.id,fm.posting_batch_id,NULL,r.occurred_at,r.created_by FROM receipts r JOIN financial_movements fm ON fm.source_id=r.id AND fm.source_type='RECEIPT' WHERE r.id=$1`,[receipt.resultReference]),/already has a financial movement/);

  const forbidden=await pool.query(`SELECT
   (SELECT count(*)::int FROM financial_allocations) allocations,
   (SELECT count(*)::int FROM customer_ledger_entries) customer_ledger,
   (SELECT count(*)::int FROM supplier_ledger_entries) supplier_ledger,
   (SELECT count(*)::int FROM treasury_transfers) transfers,
   (SELECT count(*)::int FROM cheques) cheques,
   (SELECT count(*)::int FROM installments) installments,
   (SELECT count(*)::int FROM customer_advances) advances,
   (SELECT count(*)::int FROM journal_entries) journals`);
  assert.deepEqual(forbidden.rows[0],{allocations:0,customer_ledger:0,supplier_ledger:0,transfers:0,cheques:0,installments:0,advances:0,journals:0});
  const audit=await pool.query("SELECT count(*)::int c FROM audit_logs WHERE entity_type IN ('RECEIPT','DISBURSEMENT')");assert.equal(audit.rows[0].c,8);
  const outbox=await pool.query("SELECT count(*)::int c FROM outbox_events WHERE aggregate_type IN ('RECEIPT','DISBURSEMENT')");assert.equal(outbox.rows[0].c,8);
  assert.deepEqual((await runMigrations({databaseUrl:url,verifyOnly:true})).skipped,MIGRATIONS);
 }finally{await pool.end().catch(()=>{});await cleanupDatabase(url).catch(()=>{})}
});
