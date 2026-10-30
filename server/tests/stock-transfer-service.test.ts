import { strict as assert } from 'node:assert'
import test from 'node:test'

import {
  StockTransferError,
} from '../infrastructure/inventory/stock-transfer-service.js'
import {
  ERROR_CODES,
  toErrorContract,
} from '../infrastructure/errors/error-mapper.js'

test('08.07 Stock Transfer exposes a stable safe contract', () => {
  const error = new StockTransferError('INSUFFICIENT_AVAILABLE_STOCK')
  assert.deepEqual(toErrorContract(error), {
    errorCode: ERROR_CODES.STOCK_TRANSFER_OPERATION_REJECTED,
    params: { reason: 'INSUFFICIENT_AVAILABLE_STOCK' },
  })
  assert.equal(error.message, 'Stock transfer operation rejected')
})
