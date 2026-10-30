import assert from "node:assert/strict";
import { mkdtemp, cp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import pg from "pg";

import { DEFAULT_MIGRATIONS_DIR, runMigrations } from "../../scripts/database/migrations.mjs";
import { cleanupDatabase, withClient } from "./postgresql-schema-test-support.mjs";

const { Client } = pg;
const databaseUrl = process.env.ERP_TEST_DATABASE_URL;
const id=(n)=>`78000000-0000-4000-8000-${String(n).padStart(12,"0")}`;

async function fixture(client) {
  const v={
    company:id(1), foreignCompany:id(2),
    branch:id(3), foreignBranch:id(4),
    treasury:id(5), treasury2:id(6), foreignTreasury:id(7),
    role:id(8), user:id(9), 
    account:id(10), otherAccount:id(11), foreignAccount:id(12),
    parent:id(13), child:id(14), spare:id(15),
  };
  await client.query(`INSERT INTO companies
    (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at)
    VALUES ($1,'Mapping Primary','EGP','ar-EG','Africa/Cairo',true,now(),now()),
           ($2,'Mapping Other','EGP','ar-EG','Africa/Cairo',true,now(),now())`,
    [v.company,v.foreignCompany]);
  await client.query(`INSERT INTO branches
    (id,company_id,name,code,is_active,created_at,updated_at)
    VALUES ($1,$3,'Main','MAIN',true,now(),now()),
           ($2,$4,'Other','OTHER',true,now(),now())`,
    [v.branch,v.foreignBranch,v.company,v.foreignCompany]);
  await client.query(`INSERT INTO treasuries
    (id,branch_id,name,is_active,notes,created_at)
    VALUES ($1,$4,'Cash',true,NULL,now()),
           ($2,$4,'Bank',true,NULL,now()),
           ($3,$5,'Other',true,NULL,now())`,
    [v.treasury,v.treasury2,v.foreignTreasury,v.branch,v.foreignBranch]);
  await client.query(`INSERT INTO roles (id,role_key,display_name_key,is_system)
    VALUES ($1,'GL_MAPPING_TEST','roles.mapping',true)`,[v.role]);
  await client.query(`INSERT INTO users
    (id,name,username,email,password_hash,role_id,default_branch_id,branch_scope_mode,
     preferred_language,is_active,created_at,updated_at)
    VALUES ($1,'Mapping Tester','mapping-tester',NULL,'hash',$2,$3,'ALL','ar-EG',true,now(),now())`,
    [v.user,v.role,v.branch]);
  await client.query(`INSERT INTO gl_accounts
    (id,company_id,code,name,account_type,parent_id,is_system,is_active)
    VALUES ($1,$6,'1001','Cash A','ASSET',NULL,true,true),
           ($2,$6,'1002','Cash B','ASSET',NULL,true,true),
           ($3,$7,'1003','Other Company Cash','ASSET',NULL,true,true),
           ($4,$6,'1010','Summary','ASSET',NULL,true,true),
           ($5,$6,'1011','Child','ASSET',$4,false,true)`,
    [v.account,v.otherAccount,v.foreignAccount,v.parent,v.child,
      v.company,v.foreignCompany]);
  await client.query(`INSERT INTO gl_accounts
    (id,company_id,code,name,account_type,parent_id,is_system,is_active)
    VALUES ($1,$2,'1012','Spare','ASSET',NULL,false,true)`,
    [v.spare,v.company]);
  return v;
}

function mapping(v,{scope="TREASURY",scopeId=v.treasury,role="TREASURY_ASSET",account=v.account,company=v.company}={}) {
  return {
    sql:`INSERT INTO system_account_mappings
     (company_id,scope_type,scope_id,role_key,gl_account_id,updated_by,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,'2000-01-01'::timestamptz)`,
    args:[company,scope,scopeId,role,account,v.user],
  };
}

async function insert(client,v,opts={}) {
  const x=mapping(v,opts);
  return client.query(x.sql,x.args);
}

async function expectError(promise,sqlstate,constraint){
  await assert.rejects(promise,(e)=>e?.code===sqlstate && (!constraint || e.constraint===constraint),
    `expected ${sqlstate} / ${constraint || "any"}`);
}

test("0034 relation, approved constraints and role/scoped mappings remain exact", async (t)=>{
  if(!databaseUrl)return t.skip("ERP_TEST_DATABASE_URL absent");
  await cleanupDatabase(databaseUrl);
  try {
    const applied=await runMigrations({databaseUrl});
    assert.equal(applied.applied.at(-1),"0034");
    await withClient(databaseUrl,async(client)=>{
      const defs=await client.query(`SELECT conname,contype
        FROM pg_constraint WHERE conrelid='public.system_account_mappings'::regclass
        ORDER BY conname`);
      assert.deepEqual(defs.rows.map(r=>r.conname),[
        "ck_system_account_mappings__role_format",
        "ck_system_account_mappings__scope",
        "fk_system_account_mappings__account",
        "fk_system_account_mappings__actor",
        "fk_system_account_mappings__company",
        "pk_system_account_mappings",
        "uq_system_account_mappings__role_target",
      ]);
      const cols=await client.query(`SELECT attname FROM pg_attribute
        WHERE attrelid='public.system_account_mappings'::regclass AND attnum>0
          AND NOT attisdropped ORDER BY attnum`);
      assert.deepEqual(cols.rows.map(r=>r.attname),[
        "company_id","scope_type","scope_id","role_key","gl_account_id","updated_by","updated_at"]);
      const independent=await client.query(`SELECT COUNT(*)::int AS count FROM pg_index i
        LEFT JOIN pg_constraint con ON con.conindid=i.indexrelid
        WHERE i.indrelid='public.system_account_mappings'::regclass AND con.oid IS NULL`);
      assert.equal(independent.rows[0].count,0);
      const v=await fixture(client);
      await insert(client,v);
      const original=await client.query(`SELECT updated_at FROM system_account_mappings
        WHERE company_id=$1 AND scope_type='TREASURY' AND scope_id=$2`,[v.company,v.treasury]);
      assert.ok(new Date(original.rows[0].updated_at).getUTCFullYear()>=2026);
      await insert(client,v,{scopeId:v.treasury2,account:v.otherAccount});
      await insert(client,v,{scope:"COMPANY",scopeId:v.company,role:"CUSTOMER_RECEIVABLE_CONTROL",account:v.child});
      await expectError(client.query(`UPDATE system_account_mappings SET gl_account_id=$1
        WHERE company_id=$2 AND scope_type='TREASURY' AND scope_id=$3 AND role_key='TREASURY_ASSET'`,
        [v.account,v.company,v.treasury2]),"23505","uq_system_account_mappings__role_target");
      await expectError(insert(client,v,{scopeId:v.treasury,account:v.account}),"23505","pk_system_account_mappings");
      await expectError(insert(client,v,{scopeId:v.foreignTreasury,account:v.spare}),"23514","ct_system_account_mappings__company");
      await expectError(insert(client,v,{company:v.foreignCompany,scopeId:v.treasury,account:v.foreignAccount}),"23514","ct_system_account_mappings__company");
      await expectError(insert(client,v,{scopeId:v.treasury,account:v.foreignAccount}),"23514","ct_system_account_mappings__account");
      await expectError(insert(client,v,{scope:"COMPANY",scopeId:v.branch,role:"SUPPLIER_PAYABLE_CONTROL",account:v.spare}),"23514","ct_system_account_mappings__scope");
      await expectError(insert(client,v,{scope:"COMPANY",scopeId:v.company,role:"TREASURY_ASSET",account:v.spare}),"23514","ct_system_account_mappings__scope");
      await expectError(insert(client,v,{scope:"TREASURY",scopeId:v.treasury,role:"SUPPLIER_PAYABLE_CONTROL",account:v.spare}),"23514","ct_system_account_mappings__scope");
      await expectError(insert(client,v,{scope:"COMPANY",scopeId:v.company,role:"BAD-role",account:v.spare}),"23514","ck_system_account_mappings__role_format");
      await expectError(insert(client,v,{scope:"COMPANY",scopeId:v.company,role:"CUSTOMER_ADVANCES_LIABILITY",account:v.parent}),"23514","ct_system_account_mappings__leaf");
      await expectError(client.query("UPDATE gl_accounts SET is_active=false WHERE id=$1",[v.account]),"23514","ct_gl_accounts__mapped_active");
      await expectError(client.query("UPDATE treasuries SET is_active=false WHERE id=$1",[v.treasury]),"23514","ct_treasuries__mapped_context");
      await expectError(client.query("DELETE FROM treasuries WHERE id=$1",[v.treasury]),"23514","ct_treasuries__mapped_context");
      await expectError(client.query("UPDATE branches SET company_id=$1 WHERE id=$2",[v.foreignCompany,v.branch]),"23514","ct_branches__company_immutable");
      await expectError(client.query("UPDATE gl_accounts SET company_id=$1 WHERE id=$2",[v.foreignCompany,v.account]),"23514","ct_gl_accounts__company_immutable");
      await expectError(client.query(`INSERT INTO gl_accounts
        (id,company_id,code,name,account_type,parent_id,is_system,is_active)
        VALUES ($1,$2,'9000','Wrong Parent','ASSET',$3,false,true)`,
        [id(80),v.foreignCompany,v.parent]),"23514","ct_gl_accounts__hierarchy");
      // This child is mapped, so unmap it before testing the independent cycle guard.
      await client.query(`DELETE FROM system_account_mappings WHERE company_id=$1
        AND scope_type='COMPANY' AND role_key='CUSTOMER_RECEIVABLE_CONTROL'`,[v.company]);
      await expectError(client.query("UPDATE gl_accounts SET parent_id=$1 WHERE id=$2",[v.child,v.parent]),"23514","ct_gl_accounts__hierarchy");
      await expectError(client.query(`INSERT INTO gl_accounts
        (id,company_id,code,name,account_type,parent_id,is_system,is_active)
        VALUES ($1,$2,'9001','Mapped Child','ASSET',$3,false,true)`,
        [id(81),v.company,v.account]),"23514","ct_gl_accounts__posting_leaf");
      await client.query(`UPDATE system_account_mappings SET gl_account_id=$1
        WHERE company_id=$2 AND scope_type='TREASURY' AND scope_id=$3 AND role_key='TREASURY_ASSET'`,
        [v.spare,v.company,v.treasury]);
      await client.query("UPDATE gl_accounts SET is_active=false WHERE id=$1",[v.account]);
    });
    const rerun=await runMigrations({databaseUrl,verifyOnly:true});
    assert.equal(rerun.skipped.at(-1),"0034");
  } finally {await cleanupDatabase(databaseUrl);}
});

test("0034 mapping writes and concurrent GL deactivation are serialized by row locks",async(t)=>{
  if(!databaseUrl)return t.skip("ERP_TEST_DATABASE_URL absent");
  await cleanupDatabase(databaseUrl);
  try {
    await runMigrations({databaseUrl});
    let v;
    await withClient(databaseUrl,async(c)=>{v=await fixture(c);});
    const c1=new Client({connectionString:databaseUrl});
    const c2=new Client({connectionString:databaseUrl});
    await c1.connect();await c2.connect();
    try{
      await c1.query("BEGIN");
      await insert(c1,v);
      await c2.query("BEGIN");
      await c2.query("SET LOCAL lock_timeout='250ms'");
      await expectError(c2.query("UPDATE gl_accounts SET is_active=false WHERE id=$1",[v.account]),"55P03");
      await c2.query("ROLLBACK");
      await c1.query("COMMIT");
      await expectError(c2.query("UPDATE gl_accounts SET is_active=false WHERE id=$1",[v.account]),"23514","ct_gl_accounts__mapped_active");

      await c1.query("BEGIN");
      await c1.query("UPDATE gl_accounts SET is_active=false WHERE id=$1",[v.otherAccount]);
      await c2.query("BEGIN");
      await c2.query("SET LOCAL lock_timeout='250ms'");
      await expectError(insert(c2,v,{scopeId:v.treasury2,account:v.otherAccount}),"55P03");
      await c2.query("ROLLBACK");
      await c1.query("COMMIT");
      await expectError(insert(c2,v,{scopeId:v.treasury2,account:v.otherAccount}),"23514","ct_system_account_mappings__account");

      await c1.query("BEGIN");
      await c1.query("UPDATE treasuries SET is_active=false WHERE id=$1",[v.treasury2]);
      await c2.query("BEGIN");
      await c2.query("SET LOCAL lock_timeout='250ms'");
      await expectError(insert(c2,v,{scopeId:v.treasury2,account:v.spare}),"55P03");
      await c2.query("ROLLBACK");
      await c1.query("COMMIT");
      await expectError(insert(c2,v,{scopeId:v.treasury2,account:v.spare}),"23514","ct_system_account_mappings__treasury");
    }finally{
      await c1.query("ROLLBACK").catch(()=>{});await c2.query("ROLLBACK").catch(()=>{});
      await c1.end();await c2.end();
    }
  }finally{await cleanupDatabase(databaseUrl);}
});

test("0034 migration precondition refuses dirty historical GL data without schema side effects",async(t)=>{
 if(!databaseUrl)return t.skip("ERP_TEST_DATABASE_URL absent");
 await cleanupDatabase(databaseUrl);
 const tmp=await mkdtemp(join(tmpdir(),"erp-0034-negative-"));
 try {
   const all=await readdir(DEFAULT_MIGRATIONS_DIR);
   for(const file of all.filter(name => /^00(0[1-9]|[12][0-9]|3[0-3])_/.test(name))) {
     await cp(join(DEFAULT_MIGRATIONS_DIR,file),join(tmp,file));
   }
   const baseline=await runMigrations({databaseUrl,migrationsDir:tmp});
   assert.equal(baseline.applied.at(-1),"0033");
   await withClient(databaseUrl,async(c)=>{
     await c.query(`INSERT INTO companies
       (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at)
       VALUES ($1,'Dirty GL A','EGP','ar-EG','Africa/Cairo',true,now(),now()),
              ($2,'Dirty GL B','EGP','ar-EG','Africa/Cairo',true,now(),now())`,
       [id(201),id(202)]);
     await c.query(`INSERT INTO gl_accounts
       (id,company_id,code,name,account_type,parent_id,is_system,is_active)
       VALUES ($1,$3,'1001','Foreign Parent','ASSET',NULL,true,true),
              ($2,$4,'1002','Cross Company Child','ASSET',$1,false,true)`,
       [id(203),id(204),id(201),id(202)]);
   });
   await assert.rejects(
     runMigrations({databaseUrl}),
     /0034_gl_system_account_mapping_integrity precondition failed/,
   );
   await withClient(databaseUrl,async(c)=>{
     const mappingRelation=await c.query("SELECT to_regclass('public.system_account_mappings') AS object");
     assert.equal(mappingRelation.rows[0].object,null);
     const history=await c.query("SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1");
     assert.equal(history.rows[0].version,"0033");
   });
 } finally {
   await cleanupDatabase(databaseUrl);
   await rm(tmp,{recursive:true,force:true});
 }
});
