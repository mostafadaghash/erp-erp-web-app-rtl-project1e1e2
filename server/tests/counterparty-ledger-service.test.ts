import { strict as assert } from 'node:assert'
import test from 'node:test'

import {
  CounterpartyLedgerError,
  CounterpartyLedgerService,
} from '../infrastructure/counterparties/counterparty-ledger-service.js'
import {
  ERROR_CODES,
  toErrorContract,
} from '../infrastructure/errors/error-mapper.js'

const neverDatabase = {
  async transaction() {
    throw new Error('database should not be reached')
  },
}

test('06.03 validates ledger kind and amount before database access', async () => {
  const service = new CounterpartyLedgerService(neverDatabase)
  const base = {
    actorUserId: 'actor',
    counterpartyId: 'counterparty',
    branchId: 'branch',
    entryType: 'TEST',
    amount: '10.0000',
    sourceType: 'TEST',
    sourceId: 'source',
    postingBatchId: 'batch',
    occurredAt: new Date(),
  }

  await assert.rejects(
    () => service.append('CUSTOMER', { ...base, amount: '-1' }),
    (error) =>
      error instanceof CounterpartyLedgerError &&
      error.reason === 'INVALID_AMOUNT',
  )

  await assert.rejects(
    () =>
      service.append(
        'BROKEN' as never,
        base,
      ),
    TypeError,
  )
})

test('06.03 ledger errors expose a stable safe contract', () => {
  const error = new CounterpartyLedgerError('ROLE_MISMATCH')

  assert.deepEqual(toErrorContract(error), {
    errorCode:
      ERROR_CODES.COUNTERPARTY_LEDGER_OPERATION_REJECTED,
    params: { reason: 'ROLE_MISMATCH' },
  })
  assert.equal(
    error.message,
    'Counterparty ledger operation rejected',
  )
})
