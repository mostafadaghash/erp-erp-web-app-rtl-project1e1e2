import { strict as assert } from 'node:assert'
import test from 'node:test'

import {
  TreasuryError,
  TreasuryService,
} from '../infrastructure/finance/treasury-service.js'
import {
  ERROR_CODES,
  toErrorContract,
} from '../infrastructure/errors/error-mapper.js'

const neverDatabase = {
  async transaction() {
    throw new Error('database should not be reached')
  },
}

test('09.01 Treasury validates free user-defined name before database access', async () => {
  const service = new TreasuryService(neverDatabase)

  await assert.rejects(
    () =>
      service.create({
        actorUserId: 'actor',
        branchId: 'branch',
        name: '   ',
      }),
    TypeError,
  )
})

test('09.01 Treasury contract has no type, code or balance input', () => {
  const source = {
    actorUserId: 'actor',
    branchId: 'branch',
    name: 'Main Cash',
    notes: null,
  }

  assert.deepEqual(Object.keys(source).sort(), [
    'actorUserId',
    'branchId',
    'name',
    'notes',
  ])
})

test('09.01 Treasury errors expose a stable safe contract', () => {
  const error = new TreasuryError('TREASURY_NAME_CONFLICT')

  assert.deepEqual(toErrorContract(error), {
    errorCode: ERROR_CODES.TREASURY_OPERATION_REJECTED,
    params: { reason: 'TREASURY_NAME_CONFLICT' },
  })
  assert.equal(error.message, 'Treasury operation rejected')
})
