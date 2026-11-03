import assert from 'node:assert/strict'
import test from 'node:test'
import { JournalWriterService, JournalWriterError, SystemAccountResolver } from '../infrastructure/accounting/journal-writer-service.js'

const database = {async transaction() {throw new Error('Unexpected SQL')}}
const client = {async query() {throw new Error('Unexpected SQL')}} as never
const writer = new JournalWriterService(database)
const resolver = new SystemAccountResolver(database)
const base = {actorUserId:'actor',postingBatchId:'batch'}

test('09.08 reject invalid decimal, unbalanced, dual-sided and empty Journal before SQL',async()=>{
  await assert.rejects(writer.postWithinTransaction(client,{...base,lines:[{glAccountId:'a',debit:'0.00001',credit:'0'}]}),/numeric\(18,4\)/)
  await assert.rejects(writer.postWithinTransaction(client,{...base,lines:[{glAccountId:'a',debit:'1.0000',credit:'0'}, {glAccountId:'b',debit:'0',credit:'0.9999'}]}),(e:unknown)=>e instanceof JournalWriterError && e.reason==='UNBALANCED')
  await assert.rejects(writer.postWithinTransaction(client,{...base,lines:[]}),(e:unknown)=>e instanceof JournalWriterError && e.reason==='LINES_REQUIRED')
  await assert.rejects(writer.postWithinTransaction(client,{...base,lines:[{glAccountId:'a',debit:'1',credit:'1'}]}),/both debit and credit positive/)
  await assert.rejects(writer.postWithinTransaction(client,{...base,lines:[{glAccountId:'a',debit:1 as never,credit:'0'}]}),/decimal text/)
})
test('09.08 resolver rejects non-ADR roles and invalid scopes before SQL',async()=>{
  await assert.rejects(resolver.resolveWithinTransaction(client,{...base,scopeId:'c',roleKey:'INVENTORY_ASSET',scopeType:'COMPANY'}),(e:unknown)=>e instanceof JournalWriterError && e.reason==='SYSTEM_ROLE_UNSUPPORTED')
  await assert.rejects(resolver.resolveWithinTransaction(client,{...base,scopeId:'c',roleKey:'TREASURY_ASSET',scopeType:'COMPANY'}),(e:unknown)=>e instanceof JournalWriterError && e.reason==='SYSTEM_ROLE_UNSUPPORTED')
})
