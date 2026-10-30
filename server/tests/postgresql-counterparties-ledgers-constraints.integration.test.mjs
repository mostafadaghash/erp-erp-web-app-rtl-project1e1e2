import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";
import { cleanupDatabase, MIGRATIONS } from "./postgresql-schema-test-support.mjs";

const { Client } = pg;
const databaseUrl = process.env.ERP_TEST_DATABASE_URL;

const TARGET_TABLES = ["counterparties","counterparty_roles","customer_profiles","supplier_profiles","customer_ledger_entries","supplier_ledger_entries"];
const EXPECTED_0013_CONSTRAINTS = [
  "pk_counterparties","pk_counterparty_roles","pk_customer_profiles","pk_supplier_profiles","pk_customer_ledger_entries","pk_supplier_ledger_entries",
  "ck_counterparty_roles__role","ck_customer_profiles__credit_limit_nonnegative","ck_customer_ledger_entries__amount_nonnegative","ck_supplier_ledger_entries__amount_nonnegative",
  "fk_counterparty_roles__counterparty","fk_customer_profiles__counterparty","fk_supplier_profiles__counterparty",
  "fk_customer_ledger_entries__counterparty","fk_customer_ledger_entries__branch","fk_customer_ledger_entries__posting_batch","fk_customer_ledger_entries__created_by",
  "fk_supplier_ledger_entries__counterparty","fk_supplier_ledger_entries__branch","fk_supplier_ledger_entries__posting_batch","fk_supplier_ledger_entries__created_by",
];

async function withClient(fn){const client=new Client({connectionString:databaseUrl});await client.connect();try{return await fn(client);}finally{await client.end();}}

async function seedFixture(client){
  const ids={company:"20000000-0000-4000-8000-000000000001",branch:"20000000-0000-4000-8000-000000000002",role:"20000000-0000-4000-8000-000000000003",postingUser:"20000000-0000-4000-8000-000000000004",ledgerUser:"20000000-0000-4000-8000-000000000005",postingBatch:"20000000-0000-4000-8000-000000000006",source:"20000000-0000-4000-8000-000000000007",counterparty:"20000000-0000-4000-8000-000000000008",childOnlyCounterparty:"20000000-0000-4000-8000-000000000009",duplicatePhoneCounterparty:"20000000-0000-4000-8000-000000000010",customerLedger:"20000000-0000-4000-8000-000000000011",supplierLedger:"20000000-0000-4000-8000-000000000012"};
  await client.query(`INSERT INTO companies (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at) VALUES ($1,'Business Tech','EGP','ar','Africa/Cairo',true,now(),now())`,[ids.company]);
  await client.query(`INSERT INTO branches (id,company_id,name,code,is_active,created_at,updated_at) VALUES ($1,$2,'Main','MAIN',true,now(),now())`,[ids.branch,ids.company]);
  await client.query(`INSERT INTO roles (id,role_key,display_name_key,is_system) VALUES ($1,'SYSTEM_ACCOUNTING','roles.accounting',true)`,[ids.role]);
  await client.query(`INSERT INTO users (id,name,username,password_hash,role_id,default_branch_id,branch_scope_mode,preferred_language,is_active,created_at,updated_at) VALUES ($1,'Posting User','posting-user','hash',$3,$4,'ALL','ar',true,now(),now()),($2,'Ledger User','ledger-user','hash',$3,$4,'ALL','ar',true,now(),now())`,[ids.postingUser,ids.ledgerUser,ids.role,ids.branch]);
  await client.query(`INSERT INTO posting_batches (id,branch_id,source_type,source_id,operation_type,document_version,reverses_posting_batch_id,posted_at,created_by) VALUES ($1,$2,'TEST',$3,'POST',1,NULL,now(),$4)`,[ids.postingBatch,ids.branch,ids.source,ids.postingUser]);
  await client.query(`INSERT INTO counterparties (id,name,phone,normalized_phone,address,notes,is_active,created_at,updated_at) VALUES ($1,'Shared Account','0100 000 0000','201000000000',NULL,NULL,true,now(),now()),($2,'Child Only','0100 000 0000','201000000000',NULL,NULL,true,now(),now()),($3,'Duplicate Phone Allowed','0100 000 0000','201000000000',NULL,NULL,true,now(),now())`,[ids.counterparty,ids.childOnlyCounterparty,ids.duplicatePhoneCounterparty]);
  return ids;
}

test("03.06 Counterparties + Customer/Supplier Ledgers constraints remain enforced after later slices",async(t)=>{
  if(!databaseUrl)return t.skip("ERP_TEST_DATABASE_URL is not configured");
  await cleanupDatabase(databaseUrl);
  try{
    const first=await runMigrations({databaseUrl});assert.deepEqual(first.applied,MIGRATIONS);assert.deepEqual(first.skipped,[]);
    await withClient(async(client)=>{
      const constraints=await client.query(`SELECT con.conname FROM pg_catalog.pg_constraint con JOIN pg_catalog.pg_class c ON c.oid=con.conrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND con.conname <> 'fk_customer_profiles__default_price_list' ORDER BY con.conname`,[TARGET_TABLES]);
      assert.deepEqual(constraints.rows.map(r=>r.conname),[...EXPECTED_0013_CONSTRAINTS].sort(),"0013-owned Counterparty/Ledger constraints must remain intact");
      const productOwnedDefaultFk=await client.query(`SELECT confdeltype FROM pg_catalog.pg_constraint WHERE conname='fk_customer_profiles__default_price_list' AND contype='f'`);assert.equal(productOwnedDefaultFk.rowCount,1);assert.equal(productOwnedDefaultFk.rows[0].confdeltype,'n');
      const nonConstraintIndexes=await client.query(`SELECT idx.relname AS index_name FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class tbl ON tbl.oid=i.indrelid JOIN pg_catalog.pg_namespace n ON n.oid=tbl.relnamespace JOIN pg_catalog.pg_class idx ON idx.oid=i.indexrelid LEFT JOIN pg_catalog.pg_constraint con ON con.conindid=i.indexrelid WHERE n.nspname='public' AND tbl.relname=ANY($1::text[]) AND con.oid IS NULL ORDER BY idx.relname`,[TARGET_TABLES]);assert.ok(nonConstraintIndexes.rows.length>0,"03.07 approved Counterparty/Ledger indexes must exist after migration 0022");
      const ids=await seedFixture(client);
      const duplicatePhones=await client.query("SELECT count(*)::int AS count FROM counterparties WHERE normalized_phone='201000000000'");assert.equal(duplicatePhones.rows[0].count,3);
      await client.query("INSERT INTO counterparty_roles (counterparty_id,role) VALUES ($1,'CUSTOMER'),($1,'SUPPLIER')",[ids.counterparty]);
      await assert.rejects(client.query("INSERT INTO counterparty_roles (counterparty_id,role) VALUES ($1,'CUSTOMER')",[ids.counterparty]),/pk_counterparty_roles/);
      await assert.rejects(client.query("INSERT INTO counterparty_roles (counterparty_id,role) VALUES ($1,'INVALID')",[ids.counterparty]),/ck_counterparty_roles__role/);
      await client.query("INSERT INTO customer_profiles (counterparty_id,default_price_list_id,credit_limit) VALUES ($1,NULL,0.0000)",[ids.counterparty]);
      await client.query("INSERT INTO supplier_profiles (counterparty_id,notes) VALUES ($1,'dual-role supplier')",[ids.counterparty]);
      await assert.rejects(client.query("INSERT INTO customer_profiles (counterparty_id,default_price_list_id,credit_limit) VALUES ($1,NULL,-0.0001)",[ids.childOnlyCounterparty]),/ck_customer_profiles__credit_limit_nonnegative/);
      await client.query("INSERT INTO counterparty_roles (counterparty_id,role) VALUES ($1,'OTHER')",[ids.childOnlyCounterparty]);
      await client.query("INSERT INTO supplier_profiles (counterparty_id,notes) VALUES ($1,'temporary config child')",[ids.childOnlyCounterparty]);
      await client.query("DELETE FROM counterparties WHERE id=$1",[ids.childOnlyCounterparty]);
      const cascaded=await client.query(`SELECT (SELECT count(*)::int FROM counterparty_roles WHERE counterparty_id=$1) AS roles,(SELECT count(*)::int FROM supplier_profiles WHERE counterparty_id=$1) AS supplier_profiles`,[ids.childOnlyCounterparty]);assert.deepEqual(cascaded.rows[0],{roles:0,supplier_profiles:0});
      await assert.rejects(client.query(`INSERT INTO customer_ledger_entries (id,counterparty_id,branch_id,entry_type,amount,source_type,source_id,posting_batch_id,occurred_at,created_by) VALUES ('20000000-0000-4000-8000-000000000101',$1,$2,'TEST',-0.0001,'TEST',$3,$4,now(),$5)`,[ids.counterparty,ids.branch,ids.source,ids.postingBatch,ids.ledgerUser]),/ck_customer_ledger_entries__amount_nonnegative/);
      await assert.rejects(client.query(`INSERT INTO supplier_ledger_entries (id,counterparty_id,branch_id,entry_type,amount,source_type,source_id,posting_batch_id,occurred_at,created_by) VALUES ('20000000-0000-4000-8000-000000000102',$1,$2,'TEST',-0.0001,'TEST',$3,$4,now(),$5)`,[ids.counterparty,ids.branch,ids.source,ids.postingBatch,ids.ledgerUser]),/ck_supplier_ledger_entries__amount_nonnegative/);
      await assert.rejects(client.query(`INSERT INTO customer_ledger_entries (id,counterparty_id,branch_id,entry_type,amount,source_type,source_id,posting_batch_id,occurred_at,created_by) VALUES ('20000000-0000-4000-8000-000000000103',$1,'ffffffff-ffff-4fff-8fff-ffffffffffff','TEST',1.0000,'TEST',$2,$3,now(),$4)`,[ids.counterparty,ids.source,ids.postingBatch,ids.ledgerUser]),/fk_customer_ledger_entries__branch/);
      await assert.rejects(client.query(`INSERT INTO supplier_ledger_entries (id,counterparty_id,branch_id,entry_type,amount,source_type,source_id,posting_batch_id,occurred_at,created_by) VALUES ('20000000-0000-4000-8000-000000000104',$1,$2,'TEST',1.0000,'TEST',$3,'ffffffff-ffff-4fff-8fff-ffffffffffff',now(),$4)`,[ids.counterparty,ids.branch,ids.source,ids.ledgerUser]),/fk_supplier_ledger_entries__posting_batch/);
      await client.query(`INSERT INTO customer_ledger_entries (id,counterparty_id,branch_id,entry_type,amount,source_type,source_id,posting_batch_id,occurred_at,created_by) VALUES ($1,$2,$3,'TEST_CUSTOMER',125.5000,'TEST',$4,$5,now(),$6)`,[ids.customerLedger,ids.counterparty,ids.branch,ids.source,ids.postingBatch,ids.ledgerUser]);
      await client.query(`INSERT INTO supplier_ledger_entries (id,counterparty_id,branch_id,entry_type,amount,source_type,source_id,posting_batch_id,occurred_at,created_by) VALUES ($1,$2,$3,'TEST_SUPPLIER',75.2500,'TEST',$4,$5,now(),$6)`,[ids.supplierLedger,ids.counterparty,ids.branch,ids.source,ids.postingBatch,ids.ledgerUser]);
      const separated=await client.query(`SELECT (SELECT amount::text FROM customer_ledger_entries WHERE id=$1) AS customer_amount,(SELECT amount::text FROM supplier_ledger_entries WHERE id=$2) AS supplier_amount`,[ids.customerLedger,ids.supplierLedger]);assert.deepEqual(separated.rows[0],{customer_amount:"125.5000",supplier_amount:"75.2500"});
      await assert.rejects(client.query("DELETE FROM counterparties WHERE id=$1",[ids.counterparty]),/fk_(customer|supplier)_ledger_entries__counterparty/);
      await assert.rejects(client.query("DELETE FROM posting_batches WHERE id=$1",[ids.postingBatch]),/fk_(customer|supplier)_ledger_entries__posting_batch/);
      await assert.rejects(client.query("DELETE FROM users WHERE id=$1",[ids.ledgerUser]),/fk_(customer|supplier)_ledger_entries__created_by/);
      const history=await client.query("SELECT version,name,checksum FROM schema_migrations ORDER BY version");assert.equal(history.rowCount,MIGRATIONS.length);const slice=history.rows.find(r=>r.version==='0013');assert.equal(slice?.name,'counterparties_ledgers_constraints');assert.match(slice?.checksum??'',/^[0-9a-f]{64}$/);
    });
    const second=await runMigrations({databaseUrl});assert.deepEqual(second.applied,[]);assert.deepEqual(second.skipped,MIGRATIONS);const verification=await runMigrations({databaseUrl,verifyOnly:true});assert.deepEqual(verification.applied,[]);assert.deepEqual(verification.skipped,MIGRATIONS);
  }finally{await cleanupDatabase(databaseUrl);}
});
