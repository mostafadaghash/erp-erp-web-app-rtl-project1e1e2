import assert from 'node:assert/strict'
import test from 'node:test'
import { CashDocumentPostingService } from '../infrastructure/finance/cash-document-posting-service.js'
const never={async transaction(){throw new Error('database should not be reached')}}
test('09.03 validates cash document money and dates before database access',async()=>{
 const s=new CashDocumentPostingService(never)
 const base={idempotencyKey:'k',idempotencyExpiresAt:new Date(Date.now()+10000),actorUserId:'u',branchId:'b',treasuryId:'t',occurredAt:new Date()}
 await assert.rejects(()=>s.postReceipt({...base,amount:'0'}),/greater than zero/)
 await assert.rejects(()=>s.postDisbursement({...base,amount:'1.00001'}),/numeric\(18,4\)/)
 await assert.rejects(()=>s.postReceipt({...base,amount:'1',occurredAt:new Date(NaN)}),/occurredAt/)
})
