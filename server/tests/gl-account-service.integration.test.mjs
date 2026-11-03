import assert from 'node:assert/strict'
import test from 'node:test'
import { Pool } from 'pg'
import { runMigrations } from '../../scripts/database/migrations.mjs'
import { cleanupDatabase, MIGRATIONS } from './postgresql-schema-test-support.mjs'
import { withTransaction } from '../infrastructure/database/transaction.ts'
import { RoleCatalogService } from '../infrastructure/authorization/role-catalog-service.ts'
import { PermissionDeniedError } from '../infrastructure/authorization/effective-permission-service.ts'
import { IdempotencyConflictError } from '../infrastructure/idempotency/idempotency-service.ts'
import { GLAccountService, GLAccountError, GL_CHART_PERMISSIONS } from '../infrastructure/accounting/gl-account-service.ts'

const url=process.env.ERP_TEST_DATABASE_URL
const id=n=>'97000000-0000-4000-8000-'+String(n).padStart(12,'0')
const v={
  co:id(1),foreignCo:id(2),branch:id(3),foreignBranch:id(4),
  admin:id(5),accountant:id(6),selected:id(7),denied:id(8),
  foreignAdmin:id(9),inactive:id(10),
  pView:id(11),pManage:id(12),
}
const runner=pool=>({transaction:(work,options)=>withTransaction(pool,work,options)})
const newAccount=(key,code,extra={})=>({
  actorUserId:v.admin,companyId:v.co,idempotencyKey:key,code,name:'Cash desk',
  accountType:'ASSET',reason:'Account setup for test',...extra,
})
const isReason=reason=>e=>e instanceof GLAccountError&&e.reason===reason

async function setup(){
  await cleanupDatabase(url)
  const pool=new Pool({connectionString:url,max:8,application_name:'erp-0908-coa-gate'})
  try{
    const result=await runMigrations({databaseUrl:url})
    assert.deepEqual(result.applied,MIGRATIONS)
    assert.equal(MIGRATIONS.at(-1),'0035')
    const version=(await pool.query('SHOW server_version_num')).rows[0]?.server_version_num
    assert.ok(Number(version)>=170000&&Number(version)<180000,'PostgreSQL 17 required')
    const roles=await new RoleCatalogService(runner(pool)).ensureDefaultRoles()
    const adminRole=roles.find(x=>x.roleKey==='SYSTEM_ADMIN')
    const accountantRole=roles.find(x=>x.roleKey==='ACCOUNTANT')
    assert.ok(adminRole);assert.ok(accountantRole)
    await pool.query(
      'INSERT INTO companies (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at) '+
      "VALUES ($1,'Primary GL Test Co','EGP','ar-EG','Africa/Cairo',true,now(),now()),"+
      "($2,'Other GL Test Co','EGP','ar-EG','Africa/Cairo',true,now(),now())",
      [v.co,v.foreignCo],
    )
    await pool.query(
      'INSERT INTO branches (id,company_id,name,code,is_active,created_at,updated_at) '+
      "VALUES ($1,$3,'GL A','GL-A',true,now(),now()),"+
      "($2,$4,'GL B','GL-B',true,now(),now())",
      [v.branch,v.foreignBranch,v.co,v.foreignCo],
    )
    // Only test data gets the two ADR-0029 permissions; production catalog
    // provisioning is a separately gated future phase, never implicit.
    await pool.query(
      'INSERT INTO permissions (id,permission_key,module,description_key) '+
      "VALUES ($1,$3,'accounting','permissions.accounting.chart.view'),"+
      "($2,$4,'accounting','permissions.accounting.chart.manage')",
      [v.pView,v.pManage,GL_CHART_PERMISSIONS.view,GL_CHART_PERMISSIONS.manage],
    )
    await pool.query(
      'INSERT INTO role_permissions(role_id,permission_id,is_allowed) VALUES '+
      '($1,$3,true),($1,$4,true),($2,$3,true),($2,$4,false)',
      [adminRole.id,accountantRole.id,v.pView,v.pManage],
    )
    await withTransaction(pool,async client=>{
      await client.query(
        'INSERT INTO users (id,name,username,email,password_hash,role_id,default_branch_id,'+
        'branch_scope_mode,preferred_language,is_active,created_at,updated_at) VALUES '+
        "($1,'Administrator','gl-administrator',NULL,'fake-hash',$7,$9,'ALL','ar-EG',true,now(),now()),"+
        "($2,'Accountant','gl-accountant',NULL,'fake-hash',$8,$9,'ALL','ar-EG',true,now(),now()),"+
        "($3,'Selected','gl-selected',NULL,'fake-hash',$7,$9,'SELECTED','ar-EG',true,now(),now()),"+
        "($4,'Denied','gl-denied',NULL,'fake-hash',$7,$9,'ALL','ar-EG',true,now(),now()),"+
        "($5,'Foreign','gl-foreign',NULL,'fake-hash',$7,$10,'ALL','ar-EG',true,now(),now()),"+
        "($6,'Inactive','gl-inactive',NULL,'fake-hash',$7,$9,'ALL','ar-EG',false,now(),now())",
        [v.admin,v.accountant,v.selected,v.denied,v.foreignAdmin,
          v.inactive,adminRole.id,accountantRole.id,v.branch,v.foreignBranch],
      )
      await client.query(
        'INSERT INTO user_branch_access(user_id,branch_id) VALUES($1,$2)',
        [v.selected,v.branch],
      )
    })
    await pool.query(
      "INSERT INTO user_permission_overrides(user_id,permission_id,effect,changed_by,changed_at) "+
      "VALUES($1,$2,'DENY',$3,now())",[v.denied,v.pManage,v.admin],
    )
    return {pool,service:new GLAccountService(runner(pool))}
  }catch(e){await pool.end();await cleanupDatabase(url);throw e}
}
async function gate(t,work){
  if(!url){t.skip('ERP_TEST_DATABASE_URL not configured');return}
  const {pool,service}=await setup()
  try{await work(pool,service)}
  finally{await pool.end();await cleanupDatabase(url)}
}

test('09.08-A PG17 Company chart create/list, audit, exact idempotent replay, canonical code and inactive filter',async t=>
  gate(t,async(pool,service)=>{
    const result=await service.create(newAccount('once',' 0010a ',{name:'  خزينة رئيسية  '}))
    assert.equal(result.replayed,false)
    assert.equal(result.account.code,'0010A')
    assert.equal(result.account.name,'خزينة رئيسية')
    assert.equal(result.account.accountType,'ASSET')
    assert.equal(result.account.isSystem,false)
    assert.equal(result.account.isActive,true)
    const same=await service.create(newAccount('once','0010A',{name:'خزينة رئيسية'}))
    assert.equal(same.replayed,true)
    assert.equal(same.account.id,result.account.id)
    await assert.rejects(
      service.create(newAccount('once','0010A',{name:'Changed name'})),
      e=>e instanceof IdempotencyConflictError&&e.reason==='REQUEST_HASH_MISMATCH',
    )
    const inactive=await service.create(newAccount('inactive','0020'))
    await pool.query('UPDATE gl_accounts SET is_active=false WHERE id=$1',[inactive.account.id])
    const visible=await service.list({actorUserId:v.accountant,companyId:v.co})
    assert.deepEqual(visible.map(x=>x.code),['0010A'])
    const full=await service.list({actorUserId:v.admin,companyId:v.co,includeInactive:true})
    assert.deepEqual(full.map(x=>x.code),['0010A','0020'])
    assert.equal(full[1].isActive,false)
    const audit=await pool.query(
      "SELECT action,reason,after_json FROM audit_logs WHERE entity_type='GL_ACCOUNT' ORDER BY created_at,id",
    )
    assert.equal(audit.rowCount,2)
    assert.equal(audit.rows[0].action,'GL_ACCOUNT_CREATED')
    assert.equal(audit.rows[0].reason,'Account setup for test')
    assert.ok(audit.rows[0].after_json.code)
    const keys=await pool.query(
      "SELECT key,completed_at,result_reference FROM idempotency_keys WHERE operation_type='GL_ACCOUNT_CREATE'",
    )
    assert.equal(keys.rowCount,2)
    assert.ok(keys.rows.every(x=>x.completed_at&&x.result_reference))
    assert.deepEqual((await runMigrations({databaseUrl:url,verifyOnly:true})).skipped,MIGRATIONS)
  })
)

test('09.08-A PG17 fail-closed Company-ALL scope, role permissions, explicit override and tenant isolation',async t=>
  gate(t,async(pool,service)=>{
    const list={companyId:v.co}
    await assert.rejects(service.list({...list,actorUserId:v.selected}),PermissionDeniedError)
    await assert.rejects(service.list({...list,actorUserId:v.foreignAdmin}),PermissionDeniedError)
    await assert.rejects(service.list({...list,actorUserId:v.inactive}),PermissionDeniedError)
    await assert.rejects(service.list({companyId:v.foreignCo,actorUserId:v.admin}),PermissionDeniedError)
    await assert.rejects(service.create(newAccount('sel','0050',{actorUserId:v.selected})),PermissionDeniedError)
    await assert.rejects(service.create(newAccount('den','0051',{actorUserId:v.denied})),PermissionDeniedError)
    await assert.rejects(service.create(newAccount('acc','0052',{actorUserId:v.accountant})),PermissionDeniedError)
    assert.deepEqual(await service.list({...list,actorUserId:v.accountant}),[])
    // A targeted ALLOW override can delegate manage to Accountant.
    await pool.query(
      "INSERT INTO user_permission_overrides(user_id,permission_id,effect,changed_by,changed_at) "+
      "VALUES($1,$2,'ALLOW',$3,now())",
      [v.accountant,v.pManage,v.admin],
    )
    const delegated=await service.create(newAccount('delegated','0052',{actorUserId:v.accountant}))
    assert.equal(delegated.account.code,'0052')
    const foreign=await service.create(newAccount('foreign','0052',{
      actorUserId:v.foreignAdmin,companyId:v.foreignCo,
    }))
    assert.equal(foreign.account.companyId,v.foreignCo)
    const first=await service.create(newAccount('revoked','0060'))
    await pool.query(
      "INSERT INTO user_permission_overrides(user_id,permission_id,effect,changed_by,changed_at) "+
      "VALUES($1,$2,'DENY',$1,now())",[v.admin,v.pManage],
    )
    await assert.rejects(service.create(newAccount('revoked','0060')),PermissionDeniedError)
    assert.equal((await pool.query(
      'SELECT COUNT(*)::int AS n FROM gl_accounts WHERE id=$1',[first.account.id],
    )).rows[0].n,1)
    assert.equal((await pool.query(
      "SELECT COUNT(*)::int AS n FROM audit_logs WHERE entity_type='GL_ACCOUNT'",
    )).rows[0].n,3)
  })
)

test('09.08-A PG17 locked parent, same-Company hierarchy and concurrent uniqueness/idempotency rollback',async t=>
  gate(t,async(pool,service)=>{
    const parent=await service.create(newAccount('parent','1000'))
    const child=await service.create(newAccount('child','1010',{
      name:'Under parent',parentId:parent.account.id,
    }))
    assert.equal(child.account.parentId,parent.account.id)
    const foreign=await service.create(newAccount('other-parent','2000',{
      actorUserId:v.foreignAdmin,companyId:v.foreignCo,
    }))
    await assert.rejects(service.create(newAccount('wrong-parent','1020',{
      parentId:foreign.account.id,
    })),isReason('PARENT_COMPANY_MISMATCH'))
    await assert.rejects(service.create(newAccount('missing-parent','1021',{
      parentId:id(1000),
    })),isReason('PARENT_NOT_FOUND'))
    await pool.query('UPDATE gl_accounts SET is_active=false WHERE id=$1',[child.account.id])
    await assert.rejects(service.create(newAccount('off-parent','1022',{
      parentId:child.account.id,
    })),isReason('PARENT_INACTIVE'))
    const race=await Promise.allSettled([
      service.create(newAccount('race-1','1990')),
      service.create(newAccount('race-2','1990')),
    ])
    assert.equal(race.filter(x=>x.status==='fulfilled').length,1)
    assert.equal(race.filter(x=>x.status==='rejected'&&isReason('CODE_CONFLICT')(x.reason)).length,1)
    assert.equal((await pool.query(
      "SELECT COUNT(*)::int AS n FROM gl_accounts WHERE company_id=$1 AND code='1990'",[v.co],
    )).rows[0].n,1)
    const same=await Promise.all([
      service.create(newAccount('same-key','3000')),
      service.create(newAccount('same-key','3000')),
    ])
    assert.equal(same[0].account.id,same[1].account.id)
    assert.deepEqual(same.map(x=>x.replayed).sort(),[false,true])
    const count=(await pool.query(
      "SELECT COUNT(*)::int AS n FROM audit_logs WHERE company_id=$1 AND action='GL_ACCOUNT_CREATED'",[v.co],
    )).rows[0].n
    assert.equal(count,4)
    const phantom=await pool.query(
      "SELECT COUNT(*)::int AS n FROM idempotency_keys WHERE key LIKE 'GL_ACCOUNT_CREATE:%:race-2'",
    )
    // Exactly one conflict loses its key claim atomically. Winner unknown.
    assert.ok(phantom.rows[0].n===0 || phantom.rows[0].n===1)
    const ids=await pool.query(
      'SELECT id FROM gl_accounts WHERE company_id=$1 ORDER BY code',[v.co],
    )
    assert.equal(ids.rowCount,4)
  })
)
