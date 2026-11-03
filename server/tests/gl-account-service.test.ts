import assert from 'node:assert/strict'
import test from 'node:test'
import { GLAccountService } from '../infrastructure/accounting/gl-account-service.js'
const db={ async transaction(){throw new Error('Unexpected DB access for rejected payload')} }
const service=new GLAccountService(db)
test('09.08-A Chart create rejects invalid code, name, reason, type and system flag before SQL',async()=>{
  const base={
    actorUserId:'actor',companyId:'company',idempotencyKey:'key',
    code:'1000',name:'Cash',accountType:'ASSET',reason:'new setup',
  }
  await assert.rejects(service.create({...base,code:'bad code'}),/Account code/)
  await assert.rejects(service.create({...base,name:'\u0000foo'}),/Account name/)
  await assert.rejects(service.create({...base,accountType:''}),/Account type/)
  await assert.rejects(service.create({...base,reason:' '}),/Audit reason/)
  await assert.rejects(service.create({...base,idempotencyKey:'x'.repeat(130)}),/Idempotency key/)
  await assert.rejects(service.create({...base,isSystem:true} as never),/System accounts/)
})
test('09.08-A Chart list rejects non-boolean options before SQL',async()=>{
  await assert.rejects(service.list({actorUserId:'actor',companyId:'company',includeInactive:'yes' as never}),/includeInactive/)
})
