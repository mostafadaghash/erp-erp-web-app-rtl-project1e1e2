/** ADR-0030: isolated CI role-evidence smoke; does not prove deployed ERP login. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { Client } from 'pg'
import { auditRuntimeRoleReadOnly } from '../../scripts/database/phase-09-08-c-runtime-role-readonly-audit.mjs'

const url=process.env.ERP_TEST_DATABASE_URL

test('09.08-C: PostgreSQL 17 read-only role metadata, superuser CI distinguished from deployed principal', async t=>{
  if(!url) return t.skip('ERP_TEST_DATABASE_URL missing')
  const c=new Client({connectionString:url})
  await c.connect()
  try {
    const x=await auditRuntimeRoleReadOnly(c)
    assert.equal(x.kind,'PG17_METADATA_ONLY')
    assert.equal(x.identity.transaction_read_only,true)
    assert.equal(x.identity.current_user,'postgres')
    assert.equal(x.identity.session_user,'postgres')
    assert.equal(x.role.rolsuper,true,'only the isolated CI owner is verified here')
    assert.equal(x.data_rows_read,false)
    assert.ok(x.evidence_limit.includes('Must independently prove Fastify'))
    assert.equal(x.scope.nspname,'public')
    assert.ok(x.tables.some(t=>t.name==='gl_accounts'))
    assert.ok(x.columns.some(t=>t.table_name==='gl_accounts'&&t.column_name==='is_active'))
    assert.ok(x.functions.some(f=>f.name==='fn_gl_account_hierarchy_guard'))
    assert.ok(Array.isArray(x.triggers))
    assert.ok(Array.isArray(x.defaultAcl))
    assert.equal((await c.query("SELECT current_setting('transaction_read_only') AS value")).rows[0].value,'off')
  } finally {
    await c.end()
  }
})

test('09.08-C: read-only failure rolls back without leaving transaction open',async()=>{
  const calls=[]
  const stub={async query(q){
    calls.push(q)
    if(q.startsWith('SELECT current_database()')) throw new Error('diagnostic SELECT failure')
    return {rows:[]}
  }}
  await assert.rejects(auditRuntimeRoleReadOnly(stub),/diagnostic SELECT failure/)
  assert.equal(calls.length,3)
  assert.equal(calls[0],'BEGIN TRANSACTION READ ONLY')
  assert.ok(calls[1].startsWith('SELECT current_database()'))
  assert.equal(calls[2],'ROLLBACK')
})
