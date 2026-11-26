import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { Client } from 'pg'
import { runMigrations } from '../../scripts/database/migrations.mjs'
import { fixture, v } from './gl-lifecycle-fixture.mjs'

async function connect(url) {
  const client = new Client({ connectionString: url.toString() })
  await client.connect()
  return client
}

test('0037 lab upgrade, limited login, historical and concurrent accounting guards', async t => {
  if (!process.env.ERP_TEST_DATABASE_URL) return t.skip('isolated PostgreSQL 17 required')
  const url = new URL(process.env.ERP_TEST_DATABASE_URL)
  const admin = await connect(url)
  t.after(() => admin.end())
  const suffix = randomBytes(8).toString('hex')
  const database = 'lab_gl_' + suffix
  const role = 'runtime_gl_' + suffix
  const password = randomBytes(24).toString('hex')
  const scratch = await mkdtemp(join(tmpdir(), 'gl-candidate-'))
  const clients = []
  let databaseCreated = false
  let roleCreated = false
  try {
    await admin.query('CREATE DATABASE ' + database)
    databaseCreated = true
    url.pathname = '/' + database
    const databaseUrl = url.toString()
    const owner = await connect(url)
    clients.push(owner)
    const peer = await connect(url)
    clients.push(peer)
    await runMigrations({ databaseUrl })
    await fixture(owner)
    await cp('database/migrations', scratch, { recursive: true })
    await cp('database/lab/09-08-c', scratch, { recursive: true })
    const options = { databaseUrl, migrationsDir: scratch }
    assert.deepEqual((await runMigrations(options)).applied, ['0037'])
    assert.equal((await runMigrations({ ...options, verifyOnly: true })).total, 37)

    await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'`)
    roleCreated = true
    await owner.query('GRANT SELECT ON public.gl_accounts TO ' + role)
    url.username = role
    url.password = password
    const app = await connect(url)
    clients.push(app)
    assert.equal((await app.query('SELECT session_user')).rows[0].session_user, role)
    assert.equal((await app.query('SELECT id FROM gl_accounts WHERE id=$1', [v.debit])).rowCount, 1)
    for (const privilege of ['UPDATE', 'DELETE', 'TRUNCATE']) {
      const check = await app.query("SELECT has_table_privilege('public.gl_accounts', $1) AS allowed", [privilege])
      assert.equal(check.rows[0].allowed, false)
    }
    await assert.rejects(app.query('UPDATE gl_accounts SET is_active=false WHERE id=$1', [v.debit]), { code: '42501' })

    const deactivate = 'UPDATE gl_accounts SET is_active=false WHERE id=$1'
    for (const account of [v.debit, v.categoryAccount, v.mapped]) {
      await assert.rejects(owner.query(deactivate, [account]), { code: '23514' })
    }
    await assert.rejects(owner.query("UPDATE gl_accounts SET code='changed' WHERE id=$1", [v.debit]), { constraint: 'ct_gl_protected_use' })
    await owner.query("UPDATE gl_accounts SET name='Corrected label' WHERE id=$1", [v.debit])
    const insertChild = "INSERT INTO gl_accounts (id,company_id,code,name,account_type,parent_id,is_system,is_active) VALUES ($1,$2,'1201','Child','ASSET',$3,false,true)"
    await assert.rejects(owner.query(insertChild, [v.child,v.company,v.parent]), { constraint: 'ct_gl_active_parent' })
    await assert.rejects(owner.query('UPDATE finance_categories SET gl_account_id=$1 WHERE id=$2', [v.parent,v.category]), { constraint: 'ct_category_active_gl' })
    await owner.query('UPDATE gl_accounts SET is_active=true WHERE id=$1', [v.parent])

    await peer.query("SET statement_timeout='10s'")
    async function rejectConcurrentDeactivation(account, write) {
      await owner.query('BEGIN')
      try {
        await write()
        const result = peer.query(deactivate, [account]).then(() => null, error => error)
        let blocked = false
        for (let i = 0; i < 100 && !blocked; i++) {
          const wait = await owner.query('SELECT pg_backend_pid() = ANY(pg_blocking_pids($1)) AS blocked', [peer.processID])
          blocked = wait.rows[0].blocked
          if (!blocked) await new Promise(resolve => setTimeout(resolve, 10))
        }
        assert.ok(blocked, 'deactivation must wait for the writer')
        await owner.query('COMMIT')
        assert.equal((await result)?.constraint, 'ct_gl_protected_use')
      } catch (error) {
        await owner.query('ROLLBACK')
        throw error
      }
    }

    await rejectConcurrentDeactivation(v.parent, () => owner.query(insertChild, [v.child,v.company,v.parent]))
    await rejectConcurrentDeactivation(v.child, () => owner.query(
      'UPDATE finance_categories SET gl_account_id=$1 WHERE id=$2', [v.child,v.category]))
    await owner.query('UPDATE finance_categories SET gl_account_id=$1 WHERE id=$2', [v.categoryAccount,v.category])
    await rejectConcurrentDeactivation(v.child, async () => {
      const batch = randomUUID()
      const entry = randomUUID()
      await owner.query(`INSERT INTO posting_batches
        (id,branch_id,source_type,source_id,operation_type,document_version,posted_at,created_by)
        VALUES ($1,$2,'LAB_GL',$3,'POST',1,clock_timestamp(),$4)`, [batch,v.branch,randomUUID(),v.user])
      await owner.query(`INSERT INTO journal_entries
        (id,branch_id,source_type,source_id,posting_batch_id,posted_at,created_by,description)
        SELECT $1,branch_id,source_type,source_id,id,posted_at,created_by,'GL lab' FROM posting_batches WHERE id=$2`, [entry,batch])
      await owner.query(`INSERT INTO journal_lines (id,journal_entry_id,gl_account_id,debit,credit)
        VALUES ($1,$3,$4,10,0),($2,$3,$5,0,10)`, [randomUUID(),randomUUID(),entry,v.child,v.credit])
    })
    const entry = await owner.query('SELECT sum(debit-credit) AS net FROM journal_lines WHERE journal_entry_id=$1', [v.entry])
    assert.equal(Number(entry.rows[0].net), 0)
  } finally {
    await Promise.all(clients.map(client => client.end()))
    if (databaseCreated) await admin.query('DROP DATABASE ' + database)
    if (roleCreated) await admin.query('DROP ROLE ' + role)
    await rm(scratch, { recursive: true, force: true })
  }
})
