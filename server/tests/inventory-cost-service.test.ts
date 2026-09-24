import { strict as assert } from 'node:assert'
import test from 'node:test'

import {
  InventoryCostError,
  InventoryCostService,
} from '../infrastructure/inventory/inventory-cost-service.js'
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

test('08.03 validates cost quantities and money before database access', async () => {
  const service = new InventoryCostService(neverDatabase)

  await assert.rejects(
    () =>
      service.applyInboundWithinTransaction(
        fakeClient as never,
        {
          actorUserId: 'actor',
          warehouseId: 'warehouse',
          variantId: 'variant',
          quantity: '0',
          unitCost: '10',
        },
      ),
    RangeError,
  )

  await assert.rejects(
    () =>
      service.applyInboundWithinTransaction(
        fakeClient as never,
        {
          actorUserId: 'actor',
          warehouseId: 'warehouse',
          variantId: 'variant',
          quantity: '1.0000001',
          unitCost: '10',
        },
      ),
    TypeError,
  )

  await assert.rejects(
    () =>
      service.applyInboundWithinTransaction(
        fakeClient as never,
        {
          actorUserId: 'actor',
          warehouseId: 'warehouse',
          variantId: 'variant',
          quantity: '1',
          unitCost: '10.00001',
        },
      ),
    TypeError,
  )

  await assert.rejects(
    () =>
      service.applyInboundWithinTransaction(
        fakeClient as never,
        {
          actorUserId: 'actor',
          warehouseId: 'warehouse',
          variantId: 'variant',
          quantity: '1',
          unitCost: '-1',
        },
      ),
    RangeError,
  )

  await assert.rejects(
    () =>
      service.applyOutboundWithinTransaction(
        fakeClient as never,
        {
          actorUserId: 'actor',
          warehouseId: 'warehouse',
          variantId: 'variant',
          quantity: '-1',
        },
      ),
    RangeError,
  )
})

test('08.03 Inventory Cost errors expose a stable safe contract', () => {
  const error = new InventoryCostError(
    'ZERO_QUANTITY_VALUE_RESIDUAL',
  )

  assert.deepEqual(toErrorContract(error), {
    errorCode:
      ERROR_CODES.INVENTORY_COST_OPERATION_REJECTED,
    params: {
      reason: 'ZERO_QUANTITY_VALUE_RESIDUAL',
    },
  })
  assert.equal(
    error.message,
    'Inventory cost operation rejected',
  )
})
