import { strict as assert } from 'node:assert'
import test from 'node:test'

import {
  StockPositionError,
  StockPositionService,
} from '../infrastructure/inventory/stock-position-service.js'
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

test('08.02 validates Stock Position deltas before database access', async () => {
  const service = new StockPositionService(neverDatabase)

  await assert.rejects(
    () =>
      service.applyDeltasWithinTransaction(
        fakeClient as never,
        {
          actorUserId: 'actor',
          deltas: [],
        },
      ),
    TypeError,
  )

  await assert.rejects(
    () =>
      service.applyDeltaWithinTransaction(
        fakeClient as never,
        {
          actorUserId: 'actor',
          warehouseId: 'warehouse',
          variantId: 'variant',
          onHandDelta: '1.0000001',
          reservedDelta: '0',
        },
      ),
    TypeError,
  )

  await assert.rejects(
    () =>
      service.applyDeltaWithinTransaction(
        fakeClient as never,
        {
          actorUserId: 'actor',
          warehouseId: 'warehouse',
          variantId: 'variant',
          onHandDelta: '0',
          reservedDelta: '0',
        },
      ),
    RangeError,
  )

  await assert.rejects(
    () =>
      service.lockManyWithinTransaction(
        fakeClient as never,
        {
          actorUserId: 'actor',
          positions: [],
        },
      ),
    TypeError,
  )
})

test('08.02 Stock Position errors expose a stable safe contract', () => {
  const error = new StockPositionError(
    'RESERVED_WOULD_BE_NEGATIVE',
  )

  assert.deepEqual(toErrorContract(error), {
    errorCode:
      ERROR_CODES.STOCK_POSITION_OPERATION_REJECTED,
    params: {
      reason: 'RESERVED_WOULD_BE_NEGATIVE',
    },
  })
  assert.equal(
    error.message,
    'Stock position operation rejected',
  )
})
