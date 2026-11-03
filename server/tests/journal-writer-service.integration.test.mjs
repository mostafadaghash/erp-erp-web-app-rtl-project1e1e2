import assert from 'node:assert/strict'
import test from 'node:test'
import { Pool } from 'pg'

import { runMigrations } from '../../scripts/database/migrations.mjs'
import { cleanupDatabase, MIGRATIONS } from './postgresql-schema-test-support.mjs'
import { withTransaction } from '../infrastructure/database/transaction.ts'
import { PostingBatchService } from '../infrastructure/posting/posting-batch-service.ts'
import { BranchAccessDeniedError } from '../infrastructure/authorization/branch-scope-service.ts'
import {
  JournalWriterService, JournalWriterError, SystemAccountResolver,
} from '../infrastructure/accounting/journal-writer-service.ts'

const url=process.env.ERP_TEST_DATABASE_URL
const id=(n)=>'95000000-0000-4000-8000-'+String(n).padStart(12,'0')
const v={
  company:id(1), otherCompany:id(2), branch:id(3), otherBranch:id(4),
  role:id(5), actor:id(6), deniedActor:id(7), source:id(8),
  cash:id(10), receivable:id(11), foreignAccount:id(12),
  summary:id(13), child:id(14), counterparty:id(15),treasury:id(16),
}
const db=(pool)=>({transaction:(work,options)=>withTransaction(pool,work,options)})
const posting=new PostingBatchService()
const entries=(amount='12.3456')=>[
  {glAccountId:v.cash,debit:amount,credit:'0.0000'},
  {glAccountId:v.receivable,debit:'0',credit:amount,counterpartyId:v.counterparty},
  {glAccountId:v.cash,debit:'0',credit:'0'},
]
async function seed(pool) {
  await pool.query(
    "INSERT INTO companies (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at) "+
    "VALUES ($1,'Journal Co','EGP','ar-EG','Africa/Cairo',true,now(),now()), "+
    "($2,'Foreign Co','EGP','ar-EG','Africa/Cairo',true,now(),now())",
    [v.company,v.otherCompany],
  )
  await pool.query(
    "INSERT INTO branches (id,company_id,name,code,is_active,created_at,updated_at) "+
    "VALUES ($1,$3,'A','A',true,now(),now()),($2,$4,'B','B',true,now(),now())",
    [v.branch,v.otherBranch,v.company,v.otherCompany],
  )
  await pool.query(
    "INSERT INTO roles(id,role_key,display_name_key,is_system) VALUES ($1,'JOURNAL_WRITER_TEST','test.journal',false)",
    [v.role],
  )
  await withTransaction(pool,async client=>{
    await client.query(
      "INSERT INTO users (id,name,username,email,password_hash,role_id,default_branch_id,branch_scope_mode,preferred_language,is_active,created_at,updated_at) "+
      "VALUES ($1,'GL Writer','gl-writer',NULL,'test-hash',$3,$4,'ALL','ar-EG',true,now(),now()),"+
      "($2,'Denied GL Writer','gl-denied',NULL,'test-hash',$3,$5,'SELECTED','ar-EG',true,now(),now())",
      [v.actor,v.deniedActor,v.role,v.branch,v.otherBranch],
    )
    // A SELECTED user must have access to their own default Branch at COMMIT,
    // but not to the Journal source Branch under test.
    await client.query(
      'INSERT INTO user_branch_access(user_id,branch_id) VALUES ($1,$2)',
      [v.deniedActor,v.otherBranch],
    )
  })
  await pool.query(
    "INSERT INTO gl_accounts(id,company_id,code,name,account_type,parent_id,is_system,is_active) "+
    "VALUES ($1,$6,'1000','Cash','ASSET',NULL,true,true),"+
    "($2,$6,'1100','Receivables','ASSET',NULL,true,true),"+
    "($3,$7,'1200','Foreign','ASSET',NULL,true,true),"+
    "($4,$6,'1900','Summary','ASSET',NULL,false,true),"+
    "($5,$6,'1901','Child','ASSET',$4,false,true)",
    [v.cash,v.receivable,v.foreignAccount,v.summary,v.child,v.company,v.otherCompany],
  )
  await pool.query(
    "INSERT INTO counterparties(id,name,phone,normalized_phone,address,notes,is_active,created_at,updated_at) "+
    "VALUES ($1,'GL Counterparty',NULL,NULL,NULL,NULL,true,now(),now())",
    [v.counterparty],
  )
  await pool.query(
    "INSERT INTO treasuries(id,branch_id,name,is_active,notes,created_at) "+
    "VALUES ($1,$2,'Cash',true,NULL,now())",[v.treasury,v.branch],
  )
  await pool.query(
    "INSERT INTO system_account_mappings(company_id,scope_type,scope_id,role_key,gl_account_id,updated_by,updated_at) "+
    "VALUES ($1,'COMPANY',$1,'CUSTOMER_RECEIVABLE_CONTROL',$2,$3,now()),"+
    "($1,'TREASURY',$4,'TREASURY_ASSET',$5,$3,now())",
    [v.company,v.receivable,v.actor,v.treasury,v.cash],
  )
}
const sourceBatch=(overrides={})=>({
  branchId:v.branch,sourceType:'JOURNAL_WRITER_TEST',sourceId:v.source,
  operationType:'POST',documentVersion:1,createdBy:v.actor,...overrides,
})
async function makeBatch(pool,overrides={}) {
  return withTransaction(pool,client=>posting.create(client,sourceBatch(overrides)))
}
async function setup(t) {
  if (!url) {t.skip('ERP_TEST_DATABASE_URL absent');return null}
  await cleanupDatabase(url)
  const pool=new Pool({connectionString:url,max:8})
  try {
    const migrated=await runMigrations({databaseUrl:url})
    assert.deepEqual(migrated.applied,MIGRATIONS)
    assert.equal(MIGRATIONS.at(-1),'0036')
    const version=await pool.query('SHOW server_version_num')
    const major=Number(version.rows[0].server_version_num)
    assert.ok(major>=170000 && major<180000,'PostgreSQL 17 required')
    await seed(pool)
    return pool
  } catch(e) {await pool.end();await cleanupDatabase(url);throw e}
}
async function teardown(pool) {await pool.end();await cleanupDatabase(url)}
function isReason(reason) {
  return e=>e instanceof JournalWriterError && e.reason===reason
}

test('09.08 writer posts exact decimal lines using the caller transaction, batch context and seal',async(t)=>{
  const pool=await setup(t);if(!pool)return
  const writer=new JournalWriterService(db(pool))
  const resolver=new SystemAccountResolver(db(pool))
  try{
    const result=await withTransaction(pool,async(client)=>{
      const batch=await posting.create(client,sourceBatch())
      const ar=await resolver.resolveWithinTransaction(client,{
        actorUserId:v.actor,postingBatchId:batch.id,
        roleKey:'CUSTOMER_RECEIVABLE_CONTROL',scopeType:'COMPANY',scopeId:v.company,
      })
      const treasuryAsset=await resolver.resolveWithinTransaction(client,{
        actorUserId:v.actor,postingBatchId:batch.id,
        roleKey:'TREASURY_ASSET',scopeType:'TREASURY',scopeId:v.treasury,
      })
      assert.equal(ar,v.receivable)
      assert.equal(treasuryAsset,v.cash)
      const journal=await writer.postWithinTransaction(client,{
        actorUserId:v.actor,postingBatchId:batch.id,lines:entries(),description:'Journal generated internally',
      })
      assert.equal(journal.postedAt.getTime(),batch.postedAt.getTime())
      assert.equal(journal.branchId,batch.branchId)
      assert.equal(journal.sourceId,batch.sourceId)
      assert.equal(journal.lines[0].debit,'12.3456')
      assert.equal(journal.lines[1].credit,'12.3456')
      assert.equal(journal.lines[2].debit,'0.0000')
      return {batch,journal}
    })
    const timeMatch=await pool.query(
      'SELECT je.posted_at=pb.posted_at AS exact_match FROM journal_entries je '+
      'JOIN posting_batches pb ON pb.id=je.posting_batch_id WHERE je.id=$1',
      [result.journal.id],
    )
    assert.equal(timeMatch.rows[0].exact_match,true)
    const stored=await pool.query(
      'SELECT debit::text,credit::text,gl_account_id,counterparty_id '+
      'FROM journal_lines WHERE journal_entry_id=$1 ORDER BY id',[result.journal.id],
    )
    assert.equal(stored.rowCount,3)
    const seal=await pool.query(
      'SELECT line_count,line_snapshot FROM journal_entry_seals WHERE entry_id=$1',
      [result.journal.id],
    )
    assert.equal(seal.rows[0].line_count,3)
    assert.equal(seal.rows[0].line_snapshot.length,3)
    assert.equal(seal.rows[0].line_snapshot.some(row=>row[2]==='12.3456'),true)
    await assert.rejects(pool.query(
      'UPDATE journal_lines SET debit=0 WHERE journal_entry_id=$1',[result.journal.id],
    ),error=>error?.code==='23514')
    assert.equal((await pool.query("SELECT COUNT(*)::int AS count FROM audit_logs WHERE entity_type='JOURNAL_ENTRY'")).rows[0].count,0)
    const checked=await runMigrations({databaseUrl:url,verifyOnly:true})
    assert.deepEqual(checked.skipped,MIGRATIONS)
  } finally{await teardown(pool)}
})

test('09.08 writer/resolver fail closed for cross-company, missing mapping, inactive/summary GL and Branch Scope',async(t)=>{
  const pool=await setup(t);if(!pool)return
  const writer=new JournalWriterService(db(pool))
  const resolver=new SystemAccountResolver(db(pool))
  try{
    const batch=await makeBatch(pool)
    await assert.rejects(withTransaction(pool,client=>resolver.resolveWithinTransaction(client,{
      actorUserId:v.actor,postingBatchId:batch.id,roleKey:'SUPPLIER_PAYABLE_CONTROL',
      scopeType:'COMPANY',scopeId:v.company,
    })),isReason('SYSTEM_MAPPING_MISSING'))
    await assert.rejects(withTransaction(pool,client=>resolver.resolveWithinTransaction(client,{
      actorUserId:v.actor,postingBatchId:batch.id,roleKey:'TREASURY_ASSET',
      scopeType:'TREASURY',scopeId:v.otherBranch,
    })),isReason('SYSTEM_SCOPE_MISMATCH'))
    await assert.rejects(withTransaction(pool,client=>writer.postWithinTransaction(client,{
      actorUserId:v.actor,postingBatchId:batch.id,
      lines:[{glAccountId:v.cash,debit:'1',credit:'0'}, {glAccountId:v.foreignAccount,debit:'0',credit:'1'}],
    })),isReason('ACCOUNT_COMPANY_MISMATCH'))
    await assert.rejects(withTransaction(pool,client=>writer.postWithinTransaction(client,{
      actorUserId:v.actor,postingBatchId:batch.id,
      lines:[{glAccountId:v.summary,debit:'1',credit:'0'}, {glAccountId:v.receivable,debit:'0',credit:'1'}],
    })),isReason('ACCOUNT_NOT_LEAF'))
    await pool.query('UPDATE gl_accounts SET is_active=false WHERE id=$1',[v.child])
    await assert.rejects(withTransaction(pool,client=>writer.postWithinTransaction(client,{
      actorUserId:v.actor,postingBatchId:batch.id,
      lines:[{glAccountId:v.child,debit:'1',credit:'0'}, {glAccountId:v.receivable,debit:'0',credit:'1'}],
    })),isReason('ACCOUNT_INACTIVE'))
    await assert.rejects(withTransaction(pool,client=>writer.postWithinTransaction(client,{
      actorUserId:v.deniedActor,postingBatchId:batch.id,lines:entries(),
    })),isReason('ACTOR_MISMATCH'))
    const restricted=await makeBatch(pool,{createdBy:v.deniedActor})
    await assert.rejects(withTransaction(pool,client=>writer.postWithinTransaction(client,{
      actorUserId:v.deniedActor,postingBatchId:restricted.id,lines:entries(),
    })),error=>error instanceof BranchAccessDeniedError)
    assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM journal_entries')).rows[0].count,0)
  }finally{await teardown(pool)}
})

test('09.08 writer reversal copies the exact flipped multiset and rejects duplicate reversal',async(t)=>{
  const pool=await setup(t);if(!pool)return
  const writer=new JournalWriterService(db(pool))
  try{
    const original=await withTransaction(pool,async client=>{
      const batch=await posting.create(client,sourceBatch())
      const journal=await writer.postWithinTransaction(client,{
        actorUserId:v.actor,postingBatchId:batch.id,
        lines:[...entries(),{glAccountId:v.cash,debit:'0',credit:'0'}],
      })
      return {batch,journal}
    })
    const reversalBatch=await makeBatch(pool,{
      operationType:'REVERSAL',documentVersion:2,
      reversesPostingBatchId:original.batch.id,
    })
    const reverse=await withTransaction(pool,client=>writer.reverseWithinTransaction(client,{
      actorUserId:v.actor,postingBatchId:reversalBatch.id,originalEntryId:original.journal.id,
    }))
    assert.equal(reverse.reversalOfEntryId,original.journal.id)
    assert.equal(reverse.postingBatchId,reversalBatch.id)
    assert.equal(reverse.lines.length,4)
    const originalLines=original.journal.lines.map(l=>[l.glAccountId,l.credit,l.debit,l.counterpartyId].join('|')).sort()
    const reversedLines=reverse.lines.map(l=>[l.glAccountId,l.debit,l.credit,l.counterpartyId].join('|')).sort()
    assert.deepEqual(reversedLines,originalLines)
    const anotherBatch=await makeBatch(pool,{
      operationType:'DELETE_REVERSAL',documentVersion:3,
      reversesPostingBatchId:original.batch.id,
    })
    await assert.rejects(withTransaction(pool,client=>writer.reverseWithinTransaction(client,{
      actorUserId:v.actor,postingBatchId:anotherBatch.id,originalEntryId:original.journal.id,
    })),isReason('ORIGINAL_ALREADY_REVERSED'))
    assert.equal((await pool.query(
      'SELECT COUNT(*)::int AS count FROM journal_entries WHERE reversal_of_entry_id=$1',
      [original.journal.id],
    )).rows[0].count,1)
  } finally{await teardown(pool)}
})

test('09.08 caller transaction rollback leaves no batch, Journal, lines or seal; racing reversals serialize',async(t)=>{
  const pool=await setup(t);if(!pool)return
  const writer=new JournalWriterService(db(pool))
  try{
    const rolledSource=id(90)
    await assert.rejects(withTransaction(pool,async client=>{
      const batch=await posting.create(client,sourceBatch({sourceId:rolledSource}))
      await writer.postWithinTransaction(client,{
        actorUserId:v.actor,postingBatchId:batch.id,lines:entries(),
      })
      throw new Error('forced rollback')
    }),/forced rollback/)
    assert.equal((await pool.query(
      'SELECT COUNT(*)::int AS count FROM posting_batches WHERE source_id=$1',
      [rolledSource],
    )).rows[0].count,0)
    assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM journal_entries')).rows[0].count,0)
    assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM journal_entry_seals')).rows[0].count,0)
    const original=await withTransaction(pool,async client=>{
      const batch=await posting.create(client,sourceBatch())
      const journal=await writer.postWithinTransaction(client,{
        actorUserId:v.actor,postingBatchId:batch.id,lines:entries(),
      })
      return {batch,journal}
    })
    const a=await makeBatch(pool,{operationType:'REVERSAL',documentVersion:2,reversesPostingBatchId:original.batch.id})
    const b=await makeBatch(pool,{operationType:'REVERSAL',documentVersion:3,reversesPostingBatchId:original.batch.id})
    const results=await Promise.allSettled([a,b].map(batch=>
      withTransaction(pool,client=>writer.reverseWithinTransaction(client,{
        actorUserId:v.actor,postingBatchId:batch.id,originalEntryId:original.journal.id,
      }))
    ))
    assert.equal(results.filter(x=>x.status==='fulfilled').length,1)
    assert.equal(results.filter(x=>x.status==='rejected').length,1)
    assert.equal((await pool.query(
      'SELECT COUNT(*)::int AS count FROM journal_entries WHERE reversal_of_entry_id=$1',
      [original.journal.id],
    )).rows[0].count,1)
  }finally{await teardown(pool)}
})
