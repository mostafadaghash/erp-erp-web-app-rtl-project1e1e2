import assert from 'node:assert/strict'
import test from 'node:test'
import { Pool } from 'pg'
import { runMigrations } from '../../scripts/database/migrations.mjs'
import { cleanupDatabase, MIGRATIONS } from './postgresql-schema-test-support.mjs'
import { withTransaction } from '../infrastructure/database/transaction.ts'
import { InventoryProjectionRebuildService, InventoryRebuildError } from '../infrastructure/inventory/inventory-projection-rebuild-service.ts'

const url=process.env.ERP_TEST_DATABASE_URL
test('08.10 PostgreSQL 17: shared writer barrier, exclusive rebuild and rollback', {skip:!url},async()=>{
  assert.ok(url)
  await cleanupDatabase(url)
  const pool=new Pool({connectionString:url,max:4})
  const warehouse='89100000-0000-4000-8000-000000000003'
  const company='89100000-0000-4000-8000-000000000001'
  const branch='89100000-0000-4000-8000-000000000002'
  try {
    const applied=await runMigrations({databaseUrl:url})
    assert.deepEqual(applied.applied,MIGRATIONS)
    const version=Number((await pool.query('SHOW server_version_num')).rows[0].server_version_num)
    assert.ok(version>=170000&&version<180000)
    await pool.query(`INSERT INTO companies(id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at)
      VALUES($1,'Rebuild Co','EGP','ar-EG','Africa/Cairo',true,now(),now())`,[company])
    await pool.query(`INSERT INTO branches(id,company_id,name,code,is_active,created_at,updated_at)
      VALUES($1,$2,'Rebuild Branch','R1',true,now(),now())`,[branch,company])
    await pool.query(`INSERT INTO warehouses(id,branch_id,name,code,is_active,created_at,updated_at)
      VALUES($1,$2,'Rebuild Warehouse','R1',true,now(),now())`,[warehouse,branch])
    const service=new InventoryProjectionRebuildService({transaction:(work,options)=>withTransaction(pool,work,options)})
    assert.deepEqual(await service.run({warehouseId:warehouse,repair:false}),{
      warehouseId:warehouse,stockDifferences:0,batchDifferences:0,costDifferences:0,repaired:false,
    })
    assert.equal((await service.run({warehouseId:warehouse,repair:true})).repaired,true)
    const writer=await pool.connect(),maint=await pool.connect()
    try {
      await writer.query('BEGIN')
      // Statement trigger must acquire shared lock even with zero matching rows.
      await writer.query('UPDATE inventory_stock_positions SET updated_at=now() WHERE false')
      const held=await writer.query('SELECT pg_try_advisory_xact_lock(721017,810) AS acquired')
      assert.equal(held.rows[0].acquired,false)
      await maint.query('BEGIN')
      const blocked=await maint.query('SELECT pg_try_advisory_xact_lock(721017,810) AS acquired')
      assert.equal(blocked.rows[0].acquired,false)
      await writer.query('ROLLBACK')
      const acquired=await maint.query('SELECT pg_try_advisory_xact_lock(721017,810) AS acquired')
      assert.equal(acquired.rows[0].acquired,true)
      // A writer cannot cross an exclusive maintenance lock.
      const other=await pool.connect()
      try {
        await other.query('BEGIN')
        await other.query("SET LOCAL lock_timeout='100ms'")
        await assert.rejects(other.query('UPDATE inventory_stock_positions SET updated_at=now() WHERE false'),e=>e.code==='55P03')
        await other.query('ROLLBACK')
      } finally {other.release()}
      await maint.query('ROLLBACK')
    } finally {
      await writer.query('ROLLBACK').catch(()=>{})
      await maint.query('ROLLBACK').catch(()=>{})
      writer.release();maint.release()
    }
    await assert.rejects(service.run({warehouseId:'89100000-0000-4000-8000-000000000099',repair:true}),
      e=>e instanceof InventoryRebuildError&&e.reason==='WAREHOUSE_NOT_FOUND')
    assert.equal((await service.run({warehouseId:warehouse,repair:false})).stockDifferences,0)
  } finally {await pool.end()}
})
