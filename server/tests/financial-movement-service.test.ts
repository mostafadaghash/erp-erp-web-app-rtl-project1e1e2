import assert from 'node:assert/strict'
import test from 'node:test'

import { FinancialMovementService } from '../infrastructure/finance/financial-movement-service.js'

const neverDatabase = {
  async transaction() {
    throw new Error('database should not be reached')
  },
}

test('09.02 rejects zero/negative or over-scale money before database access', async () => {
  const service = new FinancialMovementService(neverDatabase)
  const base = {actorUserId:'actor',postingBatchId:'batch',treasuryId:'treasury',direction:'IN',occurredAt:new Date()} as const
  const fakeClient = { query: async () => { throw new Error('database should not be reached') } } as never
  await assert.rejects(() => service.appendWithinTransaction(fakeClient,{...base,amount:'0'}),/greater than zero/)
  await assert.rejects(() => service.appendWithinTransaction(fakeClient,{...base,amount:'1.00001'}),/numeric\(18,4\)/)
})

test('09.02 rejects unsupported direction and invalid occurredAt before database access', async () => {
  const service = new FinancialMovementService(neverDatabase)
  const fakeClient = { query: async () => { throw new Error('database should not be reached') } } as never
  await assert.rejects(() => service.appendWithinTransaction(fakeClient,{actorUserId:'actor',postingBatchId:'batch',treasuryId:'treasury',direction:'SIDEWAYS' as never,amount:'1',occurredAt:new Date()}),/direction/)
  await assert.rejects(() => service.appendWithinTransaction(fakeClient,{actorUserId:'actor',postingBatchId:'batch',treasuryId:'treasury',direction:'IN',amount:'1',occurredAt:new Date(Number.NaN)}),/occurredAt/)
})
