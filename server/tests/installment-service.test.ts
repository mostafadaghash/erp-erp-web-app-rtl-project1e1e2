import assert from 'node:assert/strict'
import test from 'node:test'
import { InstallmentService } from '../infrastructure/finance/installment-service.js'

const never={async transaction(){throw new Error('database should not be reached')}}
test('09.07 validates installment inputs before database access',async()=>{
 const service=new InstallmentService(never)
 const base={idempotencyKey:'k',idempotencyExpiresAt:new Date('2030-01-01T00:00:00Z'),actorUserId:'u',counterpartyId:'c',sourceType:'SALES_INVOICE' as const,sourceId:'s',installments:[{dueDate:'2030-01-01',amount:'10'}]}
 await assert.rejects(()=>service.createPlan({...base,installments:[]}),/at least one/)
 await assert.rejects(()=>service.createPlan({...base,installments:[{dueDate:'2030-02-30',amount:'10'}]}),/real calendar date/)
 await assert.rejects(()=>service.createPlan({...base,sourceType:'OTHER' as any}),/sourceType/)
 await assert.rejects(()=>service.settle({idempotencyKey:'s',idempotencyExpiresAt:new Date('2030-01-01T00:00:00Z'),actorUserId:'u',treasuryId:'t',occurredAt:new Date(),allocations:[{installmentId:'i',amount:'1'},{installmentId:'i',amount:'2'}]}),/unique installmentId/)
})
