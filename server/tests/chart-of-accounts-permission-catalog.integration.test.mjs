import assert from 'node:assert/strict'
import test from 'node:test'
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Pool } from 'pg'

import { DEFAULT_MIGRATIONS_DIR, runMigrations } from '../../scripts/database/migrations.mjs'
import { cleanupDatabase, MIGRATIONS } from './postgresql-schema-test-support.mjs'
import { withTransaction } from '../infrastructure/database/transaction.ts'
import { RoleCatalogService } from '../infrastructure/authorization/role-catalog-service.ts'
import { EffectivePermissionService, PermissionDeniedError } from '../infrastructure/authorization/effective-permission-service.ts'
import { GLAccountService } from '../infrastructure/accounting/gl-account-service.ts'

const databaseUrl=process.env.ERP_TEST_DATABASE_URL
const id=n=>'97036000-0000-4000-8000-'+String(n).padStart(12,'0')
const v={
  company:id(1), branch:id(2),
  admin:id(3), accountant:id(4), sales:id(5),
  denied:id(6), delegated:id(7), inactive:id(8), selected:id(9),
}
const chartKeys=[
  'accounting.chart.view','accounting.chart.manage',
  'accounting.mappings.view','accounting.mappings.manage',
]
const grants=[
  ['ACCOUNTANT','accounting.chart.view',true],
  ['ACCOUNTANT','accounting.mappings.view',true],
  ['SYSTEM_ADMIN','accounting.chart.manage',true],
  ['SYSTEM_ADMIN','accounting.chart.view',true],
  ['SYSTEM_ADMIN','accounting.mappings.manage',true],
  ['SYSTEM_ADMIN','accounting.mappings.view',true],
]
const db=pool=>({transaction:(work,options)=>withTransaction(pool,work,options)})
async function fresh(t,fn){
  if(!databaseUrl){t.skip('ERP_TEST_DATABASE_URL unavailable');return}
  await cleanupDatabase(databaseUrl)
  const pool=new Pool({connectionString:databaseUrl,max:14,application_name:'erp-0908-permissions'})
  try{
    const server=await pool.query('SHOW server_version_num')
    const version=Number(server.rows[0].server_version_num)
    assert.ok(version>=170000&&version<180000,'PostgreSQL 17 required')
    await fn(pool)
  }finally{
    await pool.end()
    await cleanupDatabase(databaseUrl)
  }
}
async function olderMigrationDirectory(){
  const dir=await mkdtemp(join(tmpdir(),'erp-0908-before-0036-'))
  try{
    const all=await readdir(DEFAULT_MIGRATIONS_DIR)
    const old=all.filter(f=>/^[0-9]{4}_[a-z0-9_]+\.(sql|meta\.json)$/.test(f)
      &&f.slice(0,4)<='0035')
    assert.equal(old.length,70)
    await Promise.all(old.map(f=>copyFile(join(DEFAULT_MIGRATIONS_DIR,f),join(dir,f))))
    return dir
  }catch(e){await rm(dir,{recursive:true,force:true});throw e}
}
async function permissionRows(pool){
  const result=await pool.query(
    "SELECT id,permission_key,module,description_key FROM permissions "+
    "WHERE permission_key = ANY($1::text[]) ORDER BY permission_key",
    [chartKeys],
  )
  return result.rows
}
async function assignedGrants(pool){
  const result=await pool.query(
    "SELECT r.role_key,p.permission_key,rp.is_allowed FROM role_permissions rp "+
    "JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id "+
    "WHERE p.permission_key = ANY($1::text[]) ORDER BY r.role_key,p.permission_key",
    [chartKeys],
  )
  return result.rows.map(row=>[row.role_key,row.permission_key,row.is_allowed])
}
async function setupUsers(pool,roles){
  const admin=roles.find(x=>x.roleKey==='SYSTEM_ADMIN')
  const accountant=roles.find(x=>x.roleKey==='ACCOUNTANT')
  const sales=roles.find(x=>x.roleKey==='SALES')
  assert.ok(admin);assert.ok(accountant);assert.ok(sales)
  await pool.query(
    "INSERT INTO companies (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at) "+
    "VALUES ($1,'ERP Chart Permissions Test','EGP','ar-EG','Africa/Cairo',true,now(),now())",
    [v.company],
  )
  await pool.query(
    "INSERT INTO branches (id,company_id,name,code,is_active,created_at,updated_at) "+
    "VALUES ($1,$2,'Main','MAIN',true,now(),now())",
    [v.branch,v.company],
  )
  await withTransaction(pool,async client=>{
    await client.query(
      "INSERT INTO users(id,name,username,email,password_hash,role_id,default_branch_id,branch_scope_mode,preferred_language,is_active,created_at,updated_at) VALUES "+
      "($1,'Admin','p0908-admin',NULL,'test',$8,$11,'ALL','ar-EG',true,now(),now()),"+
      "($2,'Accountant','p0908-accountant',NULL,'test',$9,$11,'ALL','ar-EG',true,now(),now()),"+
      "($3,'Sales','p0908-sales',NULL,'test',$10,$11,'ALL','ar-EG',true,now(),now()),"+
      "($4,'Denied','p0908-denied',NULL,'test',$8,$11,'ALL','ar-EG',true,now(),now()),"+
      "($5,'Delegated','p0908-delegated',NULL,'test',$9,$11,'ALL','ar-EG',true,now(),now()),"+
      "($6,'Inactive','p0908-inactive',NULL,'test',$8,$11,'ALL','ar-EG',false,now(),now()),"+
      "($7,'Selected','p0908-selected',NULL,'test',$8,$11,'SELECTED','ar-EG',true,now(),now())",
      [v.admin,v.accountant,v.sales,v.denied,v.delegated,v.inactive,v.selected,
       admin.id,accountant.id,sales.id,v.branch],
    )
    await client.query('INSERT INTO user_branch_access(user_id,branch_id) VALUES ($1,$2)',
      [v.selected,v.branch],
    )
  })
}
test('09.08-B fresh PG17 migration: four catalog keys, no fabricated roles, late canonical role grants and four-key authorization',async t=>fresh(t,async pool=>{
  const applied=await runMigrations({databaseUrl})
  assert.deepEqual(applied.applied,MIGRATIONS)
  assert.equal(MIGRATIONS.at(-1),'0036')
  const rows=await permissionRows(pool)
  assert.deepEqual(rows.map(row=>[row.permission_key,row.module,row.description_key]),[
    ['accounting.chart.manage','accounting','permissions.accounting.chart.manage'],
    ['accounting.chart.view','accounting','permissions.accounting.chart.view'],
    ['accounting.mappings.manage','accounting','permissions.accounting.mappings.manage'],
    ['accounting.mappings.view','accounting','permissions.accounting.mappings.view'],
  ])
  assert.deepEqual(rows.map(x=>x.id),[
    '09080000-0000-4000-8000-000000000102',
    '09080000-0000-4000-8000-000000000101',
    '09080000-0000-4000-8000-000000000104',
    '09080000-0000-4000-8000-000000000103',
  ])
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM roles')).rows[0].n,0)
  assert.deepEqual(await assignedGrants(pool),[])
  const roleCatalog=new RoleCatalogService(db(pool))
  const roles=await roleCatalog.ensureDefaultRoles()
  assert.deepEqual(await assignedGrants(pool),grants)
  const repeat=await Promise.all(Array.from({length:5},()=>roleCatalog.ensureDefaultRoles()))
  assert.ok(repeat.every(x=>x.length===7))
  assert.deepEqual(await assignedGrants(pool),grants)
  await setupUsers(pool,roles)
  const permissions=new EffectivePermissionService(db(pool))
  for(const key of chartKeys){
    const admin=await permissions.evaluate(v.admin,key)
    assert.equal(admin.allowed,true)
    assert.equal(admin.source,'ROLE_DEFAULT')
    const acc=await permissions.evaluate(v.accountant,key)
    assert.equal(acc.allowed,key.endsWith('.view'))
    const sale=await permissions.evaluate(v.sales,key)
    assert.equal(sale.allowed,false)
  }
  const permissionId=key=>rows.find(row=>row.permission_key===key).id
  await pool.query(
    "INSERT INTO user_permission_overrides(user_id,permission_id,effect,changed_by,changed_at) VALUES "+
    "($1,$5,'DENY',$1,now()),($2,$6,'ALLOW',$1,now()),($3,$7,'ALLOW',$1,now()),"+
    "($4,$5,'ALLOW',$1,now())",
    [v.admin,v.delegated,v.sales,v.inactive,
     permissionId('accounting.chart.manage'),
     permissionId('accounting.mappings.manage'),
     permissionId('accounting.mappings.view')],
  )
  assert.equal((await permissions.evaluate(v.admin,'accounting.chart.manage')).allowed,false)
  assert.equal((await permissions.evaluate(v.delegated,'accounting.mappings.manage')).allowed,true)
  assert.equal((await permissions.evaluate(v.sales,'accounting.mappings.view')).allowed,true)
  assert.equal((await permissions.evaluate(v.inactive,'accounting.chart.manage')).allowed,false)
  const denied=new GLAccountService(db(pool))
  await assert.rejects(denied.create({
    actorUserId:v.admin,companyId:v.company,idempotencyKey:'denied-key',code:'1000',
    name:'Cash',accountType:'ASSET',reason:'Role safety test',
  }),PermissionDeniedError)
  // Removing an override restores the authorized role default.
  await pool.query(
    'DELETE FROM user_permission_overrides WHERE user_id=$1 AND permission_id=$2',
    [v.admin,permissionId('accounting.chart.manage')],
  )
  const account=await denied.create({
    actorUserId:v.admin,companyId:v.company,idempotencyKey:'allowed-key',code:'1000',
    name:'Cash',accountType:'ASSET',reason:'Provisioned permission test',
  })
  assert.equal(account.account.code,'1000')
  assert.equal((await denied.list({actorUserId:v.accountant,companyId:v.company})).length,1)
  await assert.rejects(denied.list({actorUserId:v.selected,companyId:v.company}),PermissionDeniedError)
  assert.equal((await pool.query(
    "SELECT COUNT(*)::int AS n FROM audit_logs WHERE action='GL_ACCOUNT_CREATED'",
  )).rows[0].n,1)
  assert.deepEqual((await runMigrations({databaseUrl,verifyOnly:true})).skipped,MIGRATIONS)
  assert.deepEqual((await runMigrations({databaseUrl})).skipped,MIGRATIONS)
  assert.deepEqual(await assignedGrants(pool),grants)
  const indexes=await pool.query(
    "SELECT tablename,indexname FROM pg_indexes WHERE schemaname='public' AND tablename IN "+
    "('roles','permissions','role_permissions','user_permission_overrides') ORDER BY tablename,indexname",
  )
  assert.deepEqual(indexes.rows.map(x=>[x.tablename,x.indexname]),[
    ['permissions','pk_permissions'],['permissions','uq_permissions__permission_key'],
    ['role_permissions','pk_role_permissions'],
    ['roles','pk_roles'],['roles','uq_roles__role_key'],
    ['user_permission_overrides','pk_user_permission_overrides'],
  ])
}))

test('09.08-B PG17 upgrade: role defaults from pre-existing canonical roles without rewriting roles or overrides',async t=>fresh(t,async pool=>{
  const dir=await olderMigrationDirectory()
  try{
    const old=await runMigrations({databaseUrl,migrationsDir:dir})
    assert.equal(old.applied.at(-1),'0035')
    const catalog=new RoleCatalogService(db(pool))
    const before=await catalog.ensureDefaultRoles()
    assert.equal(before.length,7)
    assert.deepEqual(await assignedGrants(pool),[])
    const admin=before.find(x=>x.roleKey==='SYSTEM_ADMIN')
    assert.ok(admin)
    const oldPermission=id(300)
    await pool.query(
      "INSERT INTO permissions(id,permission_key,module,description_key) "+
      "VALUES($1,'phase05.retain', 'phase05','permissions.phase05.retain')",
      [oldPermission],
    )
    await pool.query(
      "INSERT INTO role_permissions(role_id,permission_id,is_allowed) VALUES($1,$2,false)",
      [admin.id,oldPermission],
    )
    const upgraded=await runMigrations({databaseUrl})
    assert.deepEqual(upgraded.applied,['0036'])
    assert.deepEqual(upgraded.skipped,MIGRATIONS.slice(0,-1))
    assert.deepEqual(await assignedGrants(pool),grants)
    const after=await catalog.ensureDefaultRoles()
    assert.deepEqual(after.map(x=>x.id),before.map(x=>x.id))
    const legacy=await pool.query(
      'SELECT is_allowed FROM role_permissions WHERE role_id=$1 AND permission_id=$2',
      [admin.id,oldPermission],
    )
    assert.equal(legacy.rows[0].is_allowed,false)
    assert.deepEqual((await runMigrations({databaseUrl,verifyOnly:true})).skipped,MIGRATIONS)
  }finally{await rm(dir,{recursive:true,force:true})}
}))

test('09.08-B PG17 collision preflight fails closed without partial catalog grants or advancing history',async t=>fresh(t,async pool=>{
  const dir=await olderMigrationDirectory()
  try{
    const old=await runMigrations({databaseUrl,migrationsDir:dir})
    assert.equal(old.applied.at(-1),'0035')
    await pool.query(
      "INSERT INTO permissions(id,permission_key,module,description_key) "+
      "VALUES ($1,'accounting.chart.view','other','unapproved.key')",
      [id(500)],
    )
    await assert.rejects(runMigrations({databaseUrl}),/0036_chart_of_accounts_permissions precondition/)
    assert.equal((await pool.query(
      "SELECT MAX(version) AS version FROM schema_migrations",
    )).rows[0].version,'0035')
    const collision=await permissionRows(pool)
    assert.equal(collision.length,1)
    assert.equal(collision[0].module,'other')
    assert.deepEqual(await assignedGrants(pool),[])
    await pool.query("DELETE FROM permissions WHERE permission_key='accounting.chart.view'")
    const retried=await runMigrations({databaseUrl})
    assert.deepEqual(retried.applied,['0036'])
    assert.deepEqual((await runMigrations({databaseUrl,verifyOnly:true})).skipped,MIGRATIONS)
    await pool.query(
      "UPDATE permissions SET module='tampered' WHERE permission_key='accounting.chart.view'",
    )
    await assert.rejects(runMigrations({databaseUrl,verifyOnly:true}),/0036_chart_of_accounts_permissions verification/)
  }finally{await rm(dir,{recursive:true,force:true})}
}))
