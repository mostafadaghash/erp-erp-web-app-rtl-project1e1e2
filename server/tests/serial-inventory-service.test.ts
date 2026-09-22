import { strict as assert } from 'node:assert'
import test from 'node:test'

import {
  SerialInventoryError,
  SerialInventoryService,
} from '../infrastructure/inventory/serial-inventory-service.js'
import {
  ERROR_CODES,
  toErrorContract,
} from '../infrastructure/errors/error-mapper.js'

const neverDatabase = {
  async transaction() {
    throw new Error('database should not be reached')
  },
}

const fakeClient = {
  async query() {
    throw new Error('database should not be reached')
  },
}

test('08.05 validates serial input before database access', async () => {
  const service = new SerialInventoryService(neverDatabase)

  await assert.rejects(
    () =>
      service.receiveWithinTransaction(fakeClient as never, {
        actorUserId: 'actor',
        movementLineId: 'line',
        serialNumbers: ['SER-1', 'SER-1'],
      }),
    (error) =>
      error instanceof SerialInventoryError &&
      error.reason === 'DUPLICATE_SERIAL_INPUT',
  )
})

test('08.05 Serial errors expose a stable safe contract', () => {
  const error = new SerialInventoryError('SERIAL_NOT_AVAILABLE')
  assert.deepEqual(toErrorContract(error), {
    errorCode: ERROR_CODES.SERIAL_INVENTORY_OPERATION_REJECTED,
    params: { reason: 'SERIAL_NOT_AVAILABLE' },
  })
  assert.equal(error.message, 'Serial inventory operation rejected')
})
