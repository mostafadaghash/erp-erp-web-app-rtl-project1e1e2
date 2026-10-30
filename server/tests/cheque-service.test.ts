import assert from 'node:assert/strict'
import test from 'node:test'
import { ChequeService } from '../infrastructure/finance/cheque-service.js'

const never={async transaction(){throw new Error('database should not be reached')}}
test('09.06 validates cheque input before database access',async()=>{
 const service=new ChequeService(never)
 const base={idempotencyKey:'k',idempotencyExpiresAt:new Date(Date.now()+10000),actorUserId:'u',branchId:'b',counterpartyId:'c',direction:'RECEIVABLE' as const,chequeNumber:'1',bankName:'Bank',amount:'1',dueDate:'2026-10-10',sourceType:'SALES_INVOICE',sourceId:'s'}
 await assert.rejects(()=>service.registerPending({...base,amount:'0'}),/greater than zero/)
 await assert.rejects(()=>service.registerPending({...base,dueDate:'2026-02-30'}),/real calendar date/)
 await assert.rejects(()=>service.registerPending({...base,direction:'SIDEWAYS' as any}),/direction/)
 await assert.rejects(()=>service.clear({idempotencyKey:'c',idempotencyExpiresAt:new Date(Date.now()+10000),actorUserId:'u',chequeId:'x',treasuryId:'t',occurredAt:new Date(NaN)}),/occurredAt/)
})
