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

import { fixture, v } from './gl-lifecycle-fixture.mjs'

const url=process.env.ERP_TEST_DATABASE_URL

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
