import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";
import { RoleCatalogService } from "../infrastructure/authorization/role-catalog-service.ts";
import { BranchAccessDeniedError } from "../infrastructure/authorization/branch-scope-service.ts";
import { withTransaction } from "../infrastructure/database/transaction.ts";
import { PostingBatchService } from "../infrastructure/posting/posting-batch-service.ts";
import { FinancialMovementError, FinancialMovementService } from "../infrastructure/finance/financial-movement-service.ts";
import { cleanupDatabase, MIGRATIONS } from "./postgresql-schema-test-support.mjs";

const databaseUrl = process.env.ERP_TEST_DATABASE_URL;
const I=Object.freeze({
 company:"d9020000-0000-4000-8000-000000000001", branchA:"d9020000-0000-4000-8000-000000000002",
 branchB:"d9020000-0000-4000-8000-000000000003", admin:"d9020000-0000-4000-8000-000000000004",
 selected:"d9020000-0000-4000-8000-000000000005", treasury:"d9020000-0000-4000-8000-000000000006",
 inactiveTreasury:"d9020000-0000-4000-8000-000000000007",
});

test("09.02 Financial Movements are immutable and update Treasury positions atomically under concurrency", {skip:databaseUrl===undefined}, async()=>{
 assert.ok(databaseUrl); await cleanupDatabase(databaseUrl);
 const pool=new Pool({connectionString:databaseUrl,max:12,application_name:"business-tech-erp-financial-movement-0902-test"});
 const database={transaction(work,options){return withTransaction(pool,work,options)}};
 const roles=new RoleCatalogService(database); const batches=new PostingBatchService(); const finance=new FinancialMovementService(database);
 try {
  const applied=await runMigrations({databaseUrl}); assert.deepEqual(applied.applied,MIGRATIONS);
  const role=(await roles.ensureDefaultRoles()).find(r=>r.roleKey==="ACCOUNTANT"); assert.ok(role);
  await pool.query(`INSERT INTO companies(id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at)
    VALUES ($1,'Phase 09.02 Co','EGP','ar-EG','Africa/Cairo',true,now(),now())`,[I.company]);
  await pool.query(`INSERT INTO branches(id,company_id,name,code,is_active,created_at,updated_at) VALUES
    ($1,$3,'A','A',true,now(),now()),($2,$3,'B','B',true,now(),now())`,[I.branchA,I.branchB,I.company]);
  await withTransaction(pool,async client=>{
   await client.query(`INSERT INTO users(id,name,username,email,password_hash,role_id,default_branch_id,branch_scope_mode,preferred_language,is_active,created_at,updated_at)
    VALUES ($1,'Admin','fm-admin','fm-admin@example.test','x',$3,$4,'ALL','ar-EG',true,now(),now()),
           ($2,'Selected','fm-selected','fm-selected@example.test','x',$3,$4,'SELECTED','ar-EG',true,now(),now())`,
    [I.admin,I.selected,role.id,I.branchA]);
   await client.query("INSERT INTO user_branch_access(user_id,branch_id) VALUES ($1,$2)",[I.selected,I.branchA]);
  });
  await pool.query(`INSERT INTO treasuries(id,branch_id,name,is_active,notes,created_at) VALUES
    ($1,$3,'Main',true,NULL,now()),($2,$3,'Inactive',false,NULL,now())`,[I.treasury,I.inactiveTreasury,I.branchA]);

  async function post(sourceId,direction,amount,treasuryId=I.treasury,actor=I.admin,operationType="POST"){
   return withTransaction(pool,async client=>{
    const batch=await batches.create(client,{branchId:I.branchA,sourceType:"PHASE_09_02_TEST",sourceId,operationType,documentVersion:1,createdBy:actor,
      ...(operationType==="REVERSAL"?{reversesPostingBatchId:sourceId}: {})});
    return finance.appendWithinTransaction(client,{actorUserId:actor,postingBatchId:batch.id,treasuryId,direction,amount,occurredAt:new Date("2026-01-01T00:00:00Z")});
   });
  }

  const first=await post("d9021000-0000-4000-8000-000000000001","IN","100.0000");
  assert.equal(first.position.currentBalance,"100.0000"); assert.equal(first.position.version,1);
  assert.equal(first.movement.sourceType,"PHASE_09_02_TEST");
  const second=await post("d9021000-0000-4000-8000-000000000002","OUT","30");
  assert.equal(second.position.currentBalance,"70.0000"); assert.equal(second.position.version,2);

  const concurrent=await Promise.all(Array.from({length:6},(_,n)=>post(
    `d9022000-0000-4000-8000-${String(n+1).padStart(12,"0")}`,"IN","5.0000")));
  assert.equal(concurrent.length,6);
  const position=await finance.getPosition(I.admin,I.treasury);
  assert.equal(position.currentBalance,"100.0000"); assert.equal(position.version,8);

  const sum=await pool.query(`SELECT COALESCE(SUM(CASE WHEN direction='IN' THEN amount ELSE -amount END),0)::text AS balance FROM financial_movements WHERE treasury_id=$1`,[I.treasury]);
  assert.equal(sum.rows[0].balance,"100.0000");

  const otherTreasury="d9020000-0000-4000-8000-000000000008";
  await pool.query("INSERT INTO treasuries(id,branch_id,name,is_active,notes,created_at) VALUES ($1,$2,'Other',true,NULL,now())",[otherTreasury,I.branchB]);
  await assert.rejects(()=>finance.getPosition(I.selected,otherTreasury),BranchAccessDeniedError);

  await assert.rejects(()=>post("d9023000-0000-4000-8000-000000000001","IN","1",I.inactiveTreasury),
    e=>e instanceof FinancialMovementError&&e.reason==="TREASURY_INACTIVE");

  const beforeRollback=await finance.getPosition(I.admin,I.treasury);
  await assert.rejects(()=>withTransaction(pool,async client=>{
   const batch=await batches.create(client,{branchId:I.branchA,sourceType:"ROLLBACK_TEST",sourceId:"d9024000-0000-4000-8000-000000000001",operationType:"POST",documentVersion:1,createdBy:I.admin});
   await finance.appendWithinTransaction(client,{actorUserId:I.admin,postingBatchId:batch.id,treasuryId:I.treasury,direction:"IN",amount:"999",occurredAt:new Date()});
   throw new Error("force rollback");
  }),/force rollback/);
  const afterRollback=await finance.getPosition(I.admin,I.treasury);
  assert.equal(afterRollback.currentBalance,beforeRollback.currentBalance); assert.equal(afterRollback.version,beforeRollback.version);

  const movementId=first.movement.id;
  await assert.rejects(()=>pool.query("UPDATE financial_movements SET amount=101 WHERE id=$1",[movementId]),/immutable/);
  await assert.rejects(()=>pool.query("DELETE FROM financial_movements WHERE id=$1",[movementId]),/immutable/);

  const badBatch="d9025000-0000-4000-8000-000000000001";
  await pool.query(`INSERT INTO posting_batches(id,branch_id,source_type,source_id,operation_type,document_version,reverses_posting_batch_id,posted_at,created_by)
    VALUES ($1,$2,'CTX','d9025000-0000-4000-8000-000000000002','POST',1,NULL,now(),$3)`,[badBatch,I.branchA,I.admin]);
  await assert.rejects(()=>pool.query(`INSERT INTO financial_movements(id,treasury_id,branch_id,direction,amount,source_type,source_id,posting_batch_id,counterparty_id,occurred_at,created_by)
    VALUES ('d9025000-0000-4000-8000-000000000003',$1,$2,'IN',1,'WRONG','d9025000-0000-4000-8000-000000000002',$3,NULL,now(),$4)`,[I.treasury,I.branchA,badBatch,I.admin]),/posting context/);

  const counts=await pool.query(`SELECT (SELECT count(*)::int FROM receipts) receipts,(SELECT count(*)::int FROM disbursements) disbursements,(SELECT count(*)::int FROM treasury_transfers) transfers`);
  assert.deepEqual(counts.rows[0],{receipts:0,disbursements:0,transfers:0});

  const verify=await runMigrations({databaseUrl,verifyOnly:true}); assert.deepEqual(verify.applied,[]); assert.deepEqual(verify.skipped,MIGRATIONS);
 } finally { await pool.end().catch(()=>{}); await cleanupDatabase(databaseUrl).catch(()=>{}); }
});
