import { strict as assert } from 'node:assert'
import test from 'node:test'

import {
  STOCK_RESERVATION_STATUSES,
  StockReservationError,
  StockReservationService,
} from '../infrastructure/inventory/stock-reservation-service.js'
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

test('08.04 freezes the v1.7 reservation status vocabulary', () => {
  assert.deepEqual(STOCK_RESERVATION_STATUSES, [
    'ACTIVE',
    'PARTIALLY_CONSUMED',
    'RELEASED',
    'CONSUMED',
  ])
})

test('08.04 validates reservation quantities before database access', async () => {
  const service = new StockReservationService(neverDatabase)

  await assert.rejects(
    () =>
      service.setLineReservationWithinTransaction(
        fakeClient as never,
        {
          actorUserId: 'actor',
          salesOrderId: 'order',
          salesOrderLineId: 'line',
          warehouseId: 'warehouse',
          variantId: 'variant',
          desiredQuantity: '0',
        },
      ),
    RangeError,
  )

  await assert.rejects(
    () =>
      service.consumeWithinTransaction(
        fakeClient as never,
        {
          actorUserId: 'actor',
          salesOrderId: 'order',
          salesOrderLineId: 'line',
          quantity: '1.0000001',
        },
      ),
    TypeError,
  )
})

test('08.04 Stock Reservation errors expose a stable safe contract', () => {
  const error = new StockReservationError(
    'INSUFFICIENT_AVAILABLE',
  )

  assert.deepEqual(toErrorContract(error), {
    errorCode:
      ERROR_CODES.STOCK_RESERVATION_OPERATION_REJECTED,
    params: {
      reason: 'INSUFFICIENT_AVAILABLE',
    },
  })
  assert.equal(
    error.message,
    'Stock reservation operation rejected',
  )
})
