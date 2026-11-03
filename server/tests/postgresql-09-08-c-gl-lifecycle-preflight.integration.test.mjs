/**
 * ADR-0029 / Phase 09.08-C: isolated PostgreSQL 17 DISCOVERY PREFLIGHT.
 * Passing diagnostics classify current guards and blockers; they do NOT
 * certify ADR-0029 lifecycle safety or a deployed PostgreSQL runtime login.
 * No Business writer, SQL migration, role or GRANT is persisted by this test.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { Client } from 'pg'
import { runMigrations } from '../../scripts/database/migrations.mjs'
import { cleanupDatabase, MIGRATIONS } from './postgresql-schema-test-support.mjs'

const url=process.env.ERP_TEST_DATABASE_URL
const id=n=>'98080000-0000-4000-8000-'+String(n).padStart(12,'0')
const v={
  company:id(1),branch:id(2),role:id(3),user:id(4),source:id(5),
  debit:id(6),credit:id(7),mapped:id(8),parent:id(9),
  categoryAccount:id(10),category:id(11),child:id(12),
  batch:id(13),entry:id(14),line1:id(15),line2:id(16),
}

async function fixture(c) {
  await c.query("INSERT INTO companies (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at) VALUES ($1,'09-C Company','EGP','ar-EG','Africa/Cairo',true,now(),now())",[v.company])
  await c.query("INSERT INTO branches (id,company_id,name,code,is_active,created_at,updated_at) VALUES ($1,$2,'09-C Branch','G09C',true,now(),now())",[v.branch,v.company])
  await c.query("INSERT INTO roles (id,role_key,display_name_key,is_system) VALUES ($1,'GL_C_PREFLIGHT','roles.glCPreflight',true)",[v.role])
  await c.query("INSERT INTO users (id,name,username,email,password_hash,role_id,default_branch_id,branch_scope_mode,preferred_language,is_active,created_at,updated_at) VALUES ($1,'GL Safety Probe','gl-c-preflight',NULL,'hash',$2,$3,'ALL','ar-EG',true,now(),now())",[v.user,v.role,v.branch])
  await c.query("INSERT INTO gl_accounts (id,company_id,code,name,account_type,parent_id,is_system,is_active) VALUES ($1,$6,'1000','Posted debit','ASSET',NULL,false,true),($2,$6,'4000','Posted credit','INCOME',NULL,false,true),($3,$6,'1100','Mapped GL','ASSET',NULL,false,true),($4,$6,'1200','Inactive parent','ASSET',NULL,false,false),($5,$6,'1300','Finance category GL','ASSET',NULL,false,true)",[v.debit,v.credit,v.mapped,v.parent,v.categoryAccount,v.company])
  await c.query("INSERT INTO system_account_mappings (company_id,scope_type,scope_id,role_key,gl_account_id,updated_by,updated_at) VALUES ($1,'COMPANY',$1,'CUSTOMER_RECEIVABLE_CONTROL',$2,$3,now())",[v.company,v.mapped,v.user])
  await c.query("INSERT INTO finance_categories (id,name,category_type,gl_account_id,is_active) VALUES ($1,'09-C Category','INCOME',$2,true)",[v.category,v.categoryAccount])
  await c.query('BEGIN ISOLATION LEVEL READ COMMITTED')
  try {
    await c.query("INSERT INTO posting_batches (id,branch_id,source_type,source_id,operation_type,document_version,reverses_posting_batch_id,posted_at,created_by) VALUES ($1,$2,'GL_C_PREFLIGHT',$3,'POST',1,NULL,clock_timestamp(),$4)",[v.batch,v.branch,v.source,v.user])
    await c.query("INSERT INTO journal_entries (id,branch_id,source_type,source_id,posting_batch_id,reversal_of_entry_id,posted_at,created_by,description) SELECT $1,branch_id,source_type,source_id,id,NULL,posted_at,created_by,'09.08-C preflight' FROM posting_batches WHERE id=$2",[v.entry,v.batch])
    await c.query("INSERT INTO journal_lines (id,journal_entry_id,gl_account_id,debit,credit,counterparty_id) VALUES ($1,$3,$4,10.0000,0.0000,NULL),($2,$3,$5,0.0000,10.0000,NULL)",[v.line1,v.line2,v.entry,v.debit,v.credit])
    await c.query('COMMIT')
  } catch(e) { await c.query('ROLLBACK').catch(()=>{});throw e }
  const seal=await c.query('SELECT line_count FROM journal_entry_seals WHERE entry_id=$1',[v.entry])
  assert.equal(seal.rows[0]?.line_count,2,'real sealed balanced historical Journal required')
}

async function connect(){
  const c=new Client({connectionString:url})
  await c.connect()
  return c
}

test('09.08-C diagnostic: simulated non-owner runtime SQL grants and history/parent/category/mapping guards',async t=>{
  if(!url)return t.skip('ERP_TEST_DATABASE_URL missing')
  await cleanupDatabase(url)
  const c=await connect()
  try {
    assert.deepEqual((await runMigrations({databaseUrl:url})).applied,MIGRATIONS)
    const owner=await c.query("SELECT current_user AS name,(SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS superuser,current_setting('server_version_num') AS version")
    assert.ok(Number(owner.rows[0].version)>=170000&&Number(owner.rows[0].version)<180000,'PostgreSQL 17 required')
    assert.equal(owner.rows[0].superuser,true,'isolated privileged test DB needed to create rollback-only role')
    await fixture(c)
    await c.query('BEGIN')
    try {
      await c.query('CREATE ROLE erp_0908_c_probe NOLOGIN')
      await c.query('GRANT USAGE ON SCHEMA public TO erp_0908_c_probe')
      await c.query('GRANT SELECT,INSERT,UPDATE ON gl_accounts TO erp_0908_c_probe')
      await c.query('GRANT SELECT ON system_account_mappings TO erp_0908_c_probe')
      await c.query('GRANT SELECT ON journal_lines TO erp_0908_c_probe')
      await c.query('SET LOCAL ROLE erp_0908_c_probe')
      const role=await c.query("SELECT current_user AS name,(SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS superuser,has_table_privilege(current_user,'public.gl_accounts','UPDATE') AS can_change_gl,has_table_privilege(current_user,'public.journal_lines','UPDATE') AS can_change_posted_line")
      assert.deepEqual(role.rows[0],{name:'erp_0908_c_probe',superuser:false,can_change_gl:true,can_change_posted_line:false})

      await c.query('SAVEPOINT mapped')
      await assert.rejects(c.query('UPDATE gl_accounts SET is_active=false WHERE id=$1',[v.mapped]),
        e=>e?.code==='23514'&&e?.constraint==='ct_gl_accounts__mapped_active')
      await c.query('ROLLBACK TO SAVEPOINT mapped')

      // Discover whether current physical SQL guard alone protects posted GL.
      // An observed unsafe transition is a BLOCKER, not a green security gate.
      const posted=await c.query('UPDATE gl_accounts SET is_active=false WHERE id=$1 RETURNING is_active',[v.debit])
      assert.equal(posted.rows[0]?.is_active,false,'observed historical-GL SQL gap changed: reassess classification')
      t.diagnostic('BLOCKER: modeled non-owner GL UPDATE permission permits posted-but-unmapped account deactivation; ADR-0029 and future reversal require rejection')

      const category=await c.query('UPDATE gl_accounts SET is_active=false WHERE id=$1 RETURNING is_active',[v.categoryAccount])
      assert.equal(category.rows[0]?.is_active,false,'observed active-category SQL gap changed: reassess classification')
      t.diagnostic('BLOCKER: active Finance Category GL account deactivation permitted by FK-only path')

      const child=await c.query("INSERT INTO gl_accounts (id,company_id,code,name,account_type,parent_id,is_system,is_active) VALUES ($1,$2,'1201','Active child','ASSET',$3,false,true) RETURNING is_active",[v.child,v.company,v.parent])
      assert.equal(child.rows[0]?.is_active,true,'observed inactive-parent SQL gap changed: reassess classification')
      t.diagnostic('BLOCKER: active child insertion under inactive GL parent permitted by physical guard')
    } finally {
      await c.query('ROLLBACK') // remove temporary role/grants and all diagnostic DML
    }
    const unchanged=await c.query("SELECT (SELECT is_active FROM gl_accounts WHERE id=$1) AS posted_active,(SELECT is_active FROM gl_accounts WHERE id=$2) AS category_active,(SELECT count(*)::int FROM gl_accounts WHERE id=$3) AS diagnostic_child,(SELECT count(*)::int FROM pg_roles WHERE rolname='erp_0908_c_probe') AS role_count",[v.debit,v.categoryAccount,v.child])
    assert.deepEqual(unchanged.rows[0],{posted_active:true,category_active:true,diagnostic_child:0,role_count:0})
    t.diagnostic('UNVERIFIED: CI owner is postgres/SUPERUSER, and no separately configured deployed ERP_DATABASE_URL runtime login/GRANT contract is available; simulated role is NOT production evidence')
  } finally {await c.end();await cleanupDatabase(url)}
})

test('09.08-C diagnostic: FOR SHARE locks block GL update but do not enforce post-commit historical eligibility',async t=>{
  if(!url)return t.skip('ERP_TEST_DATABASE_URL missing')
  await cleanupDatabase(url)
  const writer=await connect(),mutator=await connect()
  try {
    await runMigrations({databaseUrl:url})
    await fixture(writer)
    await writer.query('BEGIN ISOLATION LEVEL READ COMMITTED')
    try {
      assert.equal((await writer.query('SELECT id FROM gl_accounts WHERE id=$1 FOR SHARE',[v.debit])).rowCount,1)
      await mutator.query('BEGIN ISOLATION LEVEL READ COMMITTED')
      try {
        await mutator.query("SET LOCAL lock_timeout='300ms'")
        await assert.rejects(mutator.query('UPDATE gl_accounts SET is_active=false WHERE id=$1',[v.debit]),
          e=>e?.code==='55P03')
      } finally {await mutator.query('ROLLBACK')}
    } finally {await writer.query('COMMIT')}
    const updated=await mutator.query('UPDATE gl_accounts SET is_active=false WHERE id=$1 RETURNING is_active',[v.debit])
    assert.equal(updated.rows[0]?.is_active,false)
    assert.equal((await mutator.query('SELECT line_count FROM journal_entry_seals WHERE entry_id=$1',[v.entry])).rows[0]?.line_count,2)
    t.diagnostic('BLOCKER: writer FOR SHARE prevents concurrent non-key mutation while held; after release a separate UPDATE can deactivate historical GL without recheck')
  } finally {await writer.end();await mutator.end();await cleanupDatabase(url)}
})
