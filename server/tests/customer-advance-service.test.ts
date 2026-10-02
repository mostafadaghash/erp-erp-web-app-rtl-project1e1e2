import assert from 'node:assert/strict'
import test from 'node:test'
import { CustomerAdvanceService } from '../infrastructure/finance/customer-advance-service.js'
const never={async transaction(){throw new Error('database should not be reached')}}
test('09.05 validates Customer Advance money and dates before database access',async()=>{
 const service=new CustomerAdvanceService(never)
 const base={idempotencyKey:'k',idempotencyExpiresAt:new Date(Date.now()+10000),actorUserId:'u',branchId:'b',treasuryId:'t',salesOrderId:'o',occurredAt:new Date()}
 await assert.rejects(()=>service.create({...base,amount:'0'}),/greater than zero/)
 await assert.rejects(()=>service.create({...base,amount:'1.00001'}),/numeric\(18,4\)/)
 await assert.rejects(()=>service.create({...base,amount:'1',occurredAt:new Date(NaN)}),/occurredAt/)
 await assert.rejects(()=>service.apply({idempotencyKey:'a',idempotencyExpiresAt:new Date(Date.now()+10000),actorUserId:'u',advanceId:'x',salesInvoiceId:'i',amount:'0'}),/greater than zero/)
})
