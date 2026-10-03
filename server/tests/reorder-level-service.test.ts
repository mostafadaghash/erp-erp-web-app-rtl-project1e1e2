import { strict as assert } from 'node:assert'
import test from 'node:test'

import {
  ReorderLevelError,
  ReorderLevelService,
} from '../infrastructure/products/reorder-level-service.js'
import {
  ERROR_CODES,
  toErrorContract,
} from '../infrastructure/errors/error-mapper.js'

const neverDatabase = {
  async transaction() {
    throw new Error('database should not be reached')
  },
}

test('07.06 validates Reorder Level quantity and identifiers before database access', async () => {
  const service = new ReorderLevelService(neverDatabase)

  await assert.rejects(
    () =>
      service.setReorderLevel({
        actorUserId: 'actor',
        warehouseId: 'warehouse',
        variantId: 'variant',
        minimumQuantity: '-1',
      }),
    TypeError,
  )

  await assert.rejects(
    () =>
      service.setReorderLevel({
        actorUserId: 'actor',
        warehouseId: 'warehouse',
        variantId: 'variant',
        minimumQuantity: '1.0000001',
      }),
    TypeError,
  )

  await assert.rejects(
    () =>
      service.listLowStockAlerts({
        actorUserId: '   ',
      }),
    TypeError,
  )
})

test('07.06 Reorder Level errors expose a stable safe contract', () => {
  const error = new ReorderLevelError('WAREHOUSE_NOT_FOUND')

  assert.deepEqual(toErrorContract(error), {
    errorCode:
      ERROR_CODES.REORDER_LEVEL_OPERATION_REJECTED,
    params: { reason: 'WAREHOUSE_NOT_FOUND' },
  })
  assert.equal(
    error.message,
    'Reorder level operation rejected',
  )
})
