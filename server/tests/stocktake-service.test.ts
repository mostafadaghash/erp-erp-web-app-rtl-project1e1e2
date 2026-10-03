import { strict as assert } from 'node:assert'
import test from 'node:test'

import { StocktakeError } from '../infrastructure/inventory/stocktake-service.js'
import { ERROR_CODES, toErrorContract } from '../infrastructure/errors/error-mapper.js'

test('08.08 Stocktake exposes a stable safe error contract', () => {
  const error = new StocktakeError('POSITION_VERSION_CHANGED')
  assert.deepEqual(toErrorContract(error), {
    errorCode: ERROR_CODES.STOCKTAKE_OPERATION_REJECTED,
    params: { reason: 'POSITION_VERSION_CHANGED' },
  })
  assert.equal(error.message, 'Stocktake operation rejected')
})
