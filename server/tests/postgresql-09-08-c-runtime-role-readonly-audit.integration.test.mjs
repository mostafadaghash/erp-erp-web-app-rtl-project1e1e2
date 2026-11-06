/** ADR-0030: isolated CI role-evidence smoke; does not prove deployed ERP login. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { Client } from 'pg'
import { randomUUID } from 'node:crypto'
import { auditRuntimeRoleReadOnly, summarizeRuntimeRoleRisk } from '../../scripts/database/phase-09-08-c-runtime-role-readonly-audit.mjs'
import { runMigrations } from '../../scripts/database/migrations.mjs'
import { cleanupDatabase } from './postgresql-schema-test-support.mjs'

const url=process.env.ERP_TEST_DATABASE_URL

test('09.08-C: PostgreSQL 17 read-only role metadata, superuser CI distinguished from deployed principal', async t=>{
  if(!url) return t.skip('ERP_TEST_DATABASE_URL missing')
  const verifySchema=process.env.ERP_ROLE_AUDIT_EXPECT_MIGRATED_SCHEMA==='1'
  // Only the ephemeral PostgreSQL 17 CI database may be prepared with migrations.
  // The audited connection itself remains BEGIN TRANSACTION READ ONLY.
  if(verifySchema){
    await cleanupDatabase(url)
    await runMigrations({databaseUrl:url})
  }
  const c=new Client({connectionString:url})
  await c.connect()
  try {
    const x=await auditRuntimeRoleReadOnly(c)
    assert.equal(x.kind,'PG17_METADATA_ONLY')
    assert.equal(x.identity.transaction_read_only,true)
    assert.equal(x.identity.current_user,'postgres')
    assert.equal(x.identity.session_user,'postgres')
    assert.equal(x.role.rolsuper,true,'only the isolated CI owner is verified here')
    assert.equal(x.sessionRole.rolsuper,true,'CI login is not a least-privilege runtime')
    assert.equal(x.sessionRole.rolname,'postgres')
    assert.ok(x.reachableRoles.some(r=>r.rolname==='postgres'&&r.session_can_set===true))
    assert.ok(Array.isArray(x.membershipEdges))
    assert.ok(x.risk.reasons.includes('SESSION_LOGIN_HAS_ELEVATED_ROLE_FLAGS'))
    assert.ok(x.risk.reasons.includes('CURRENT_ROLE_HAS_ELEVATED_ROLE_FLAGS'))
    assert.equal(x.risk.runtime_principal_attested,false)
    const gl=x.tables.find(t=>t.name==='gl_accounts')
    assert.ok(gl,'even without migrations the audit reports a missing table explicitly')
    assert.equal(typeof gl.exists_in_public,'boolean')
    assert.ok(Object.hasOwn(gl,'session_can_assume_owner'))
    if(process.env.ERP_ROLE_AUDIT_EXPECT_MIGRATED_SCHEMA==='1'){
      assert.equal(gl.exists_in_public,true,'expected prior migrations and real GL table')
      assert.equal(gl.session_can_assume_owner,true,'CI superuser must be able to assume table owner')
      assert.ok(x.triggers.some(t=>t.table_name==='gl_accounts'&&t.tgname==='bt_gl_accounts__hierarchy_guard'))
      assert.ok(x.functions.some(fn=>fn.name==='fn_gl_account_hierarchy_guard'&&fn.exists_in_public))
    }
    assert.ok(x.functions.every(f=>!('function_settings' in f)),'return only selected safe function settings')
    assert.equal(x.data_rows_read,false)
    assert.ok(x.evidence_limit.includes('does NOT attest the actual Fastify login'))
    assert.equal(x.scope.nspname,'public')
    assert.ok(x.tables.some(t=>t.name==='gl_accounts'))
    assert.ok(x.columns.some(t=>t.table_name==='gl_accounts'&&t.column_name==='is_active'))
    assert.ok(x.functions.some(f=>f.name==='fn_gl_account_hierarchy_guard'))
    assert.ok(Array.isArray(x.triggers))
    assert.ok(Array.isArray(x.defaultAcl))
    assert.equal((await c.query("SELECT current_setting('transaction_read_only') AS value")).rows[0].value,'off')
  } finally {
    await c.end()
    if(verifySchema) await cleanupDatabase(url)
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

test('09.08-C: risk summary flags privileged session even if current role looks restricted',()=>{
  const result=summarizeRuntimeRoleRisk({
    identity:{session_user:'privileged_login',current_user:'erp_limited'},
    role:{rolsuper:false,rolcreaterole:false},
    sessionRole:{rolsuper:true},
    reachableRoles:[
      {rolname:'erp_limited',session_can_set:true,rolsuper:false},
      {rolname:'dangerous_owner',session_can_set:true,rolsuper:false,rolcreaterole:true},
    ],
    membershipEdges:[{member_role:'privileged_login',granted_role:'dangerous_owner',admin_option:true}],
    scope:{session_can_assume_owner:true},
    tables:[{name:'gl_accounts',session_can_assume_owner:true}],
  })
  assert.equal(result.runtime_principal_attested,false)
  assert.deepEqual(result.reasons,[
    'CURRENT_ROLE_DIFFERS_FROM_SESSION_LOGIN',
    'SESSION_LOGIN_HAS_ELEVATED_ROLE_FLAGS',
    'SESSION_CAN_SET_ELEVATED_ROLE',
    'SESSION_CAN_ASSUME_PUBLIC_SCHEMA_OWNER',
    'SESSION_CAN_ASSUME_AUDITED_TABLE_OWNER',
    'ROLE_ADMIN_OPTION_REQUIRES_REVIEW',
  ])
  assert.deepEqual(result.assumable_privileged_roles,['dangerous_owner'])
})

test('09.08-C: no observed privilege red flags does NOT itself attest Fastify deployment',()=>{
  const result=summarizeRuntimeRoleRisk({
    identity:{session_user:'erp_runtime',current_user:'erp_runtime'},
    role:{rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolbypassrls:false},
    sessionRole:{rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolbypassrls:false},
    reachableRoles:[],membershipEdges:[],
    scope:{session_can_assume_owner:false},tables:[],
  })
  assert.deepEqual(result.reasons,[])
  assert.equal(result.runtime_principal_attested,false)
  assert.equal(result.verdict,'RUNTIME_FASTIFY_LOGIN_NOT_ATTESTED_BY_CATALOG_ALONE')
})

test('09.08-C: PostgreSQL 17 session role SET/INHERIT memberships verified with rollback-only test fixture',async t=>{
  if(!url)return t.skip('ERP_TEST_DATABASE_URL missing')
  const c=new Client({connectionString:url})
  await c.connect()
  const stamp=randomUUID().replaceAll('-','').slice(0,12)
  const limited='erp_audit_limited_'+stamp
  const inherited='erp_audit_inherit_'+stamp
  const assumable='erp_audit_set_'+stamp
  let opened=false
  try {
    const me=(await c.query("SELECT current_user::text AS role,(SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=current_user) AS superuser")).rows[0]
    assert.equal(me.superuser,true,'isolated CI postgres role required for rollback-only role fixture')
    await c.query('BEGIN')
    opened=true
    for(const role of [limited,inherited,assumable])await c.query('CREATE ROLE '+role+' NOLOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB')
    await c.query('GRANT '+inherited+' TO '+limited+' WITH SET FALSE, INHERIT TRUE, ADMIN FALSE')
    await c.query('GRANT '+assumable+' TO '+limited+' WITH SET TRUE, INHERIT FALSE, ADMIN FALSE')
    const result=await c.query(
      "SELECT pg_catalog.pg_has_role($1::name,$2::name,'SET') AS inherited_can_set,"+
      "pg_catalog.pg_has_role($1::name,$2::name,'USAGE') AS inherited_can_use,"+
      "pg_catalog.pg_has_role($1::name,$3::name,'SET') AS other_can_set,"+
      "pg_catalog.pg_has_role($1::name,$3::name,'USAGE') AS other_can_use,"+
      "pg_catalog.pg_has_role($1::name,$3::name,'MEMBER WITH ADMIN OPTION') AS other_can_admin",
      [limited,inherited,assumable],
    )
    assert.deepEqual(result.rows[0],{
      inherited_can_set:false,inherited_can_use:true,
      other_can_set:true,other_can_use:false,other_can_admin:false,
    })
    const edges=await c.query(
      "SELECT m.inherit_option,m.set_option,m.admin_option FROM pg_catalog.pg_auth_members m "+
      "JOIN pg_catalog.pg_roles member ON member.oid=m.member "+
      "JOIN pg_catalog.pg_roles granted ON granted.oid=m.roleid "+
      "WHERE member.rolname=$1 AND granted.rolname=$2",
      [limited,assumable],
    )
    assert.deepEqual(edges.rows[0],{inherit_option:false,set_option:true,admin_option:false})
    await c.query('SET LOCAL ROLE '+limited)
    const switched=(await c.query('SELECT session_user::text AS session_user,current_user::text AS current_user')).rows[0]
    assert.equal(switched.session_user,'postgres')
    assert.equal(switched.current_user,limited)
  } finally {
    if(opened)await c.query('ROLLBACK').catch(()=>{})
    await c.end()
  }
})
