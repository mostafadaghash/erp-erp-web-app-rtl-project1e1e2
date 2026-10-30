import { strict as assert } from 'node:assert'
import test from 'node:test'

import {
  BatchInventoryError,
  SELL_EXPIRED_BATCH_PERMISSION,
} from '../infrastructure/inventory/batch-inventory-service.js'
import {
  ERROR_CODES,
  toErrorContract,
} from '../infrastructure/errors/error-mapper.js'

test('08.06 freezes the expired-Batch override permission key', () => {
  assert.equal(
    SELL_EXPIRED_BATCH_PERMISSION,
    'inventory.sell_expired_batch',
  )
})

test('08.06 Batch errors expose a stable safe contract', () => {
  const error = new BatchInventoryError('EXPIRED_BATCH_BLOCKED')
  assert.deepEqual(toErrorContract(error), {
    errorCode: ERROR_CODES.BATCH_INVENTORY_OPERATION_REJECTED,
    params: { reason: 'EXPIRED_BATCH_BLOCKED' },
  })
  assert.equal(error.message, 'Batch inventory operation rejected')
})
