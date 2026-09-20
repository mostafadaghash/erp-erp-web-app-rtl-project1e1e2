import { strict as assert } from 'node:assert'
import test from 'node:test'

import {
  ProductModelError,
  ProductModelService,
} from '../infrastructure/products/product-model-service.js'
import {
  ERROR_CODES,
  toErrorContract,
} from '../infrastructure/errors/error-mapper.js'

const neverDatabase = {
  async transaction() {
    throw new Error('database should not be reached')
  },
}

test('07.01 validates Product type before database access', async () => {
  const service = new ProductModelService(neverDatabase)

  await assert.rejects(
    () =>
      service.createSimpleProduct({
        actorUserId: 'actor',
        name: 'Product',
        categoryId: 'category',
        productType: 'BROKEN' as never,
        baseUnitId: 'unit',
      }),
    TypeError,
  )
})

test('07.01 validates tracking policy before database access', async () => {
  const service = new ProductModelService(neverDatabase)

  await assert.rejects(
    () =>
      service.createSimpleProduct({
        actorUserId: 'actor',
        name: 'Product',
        categoryId: 'category',
        productType: 'STOCK',
        baseUnitId: 'unit',
        trackingSerial: true,
        trackingBatch: true,
      }),
    TypeError,
  )

  await assert.rejects(
    () =>
      service.createSimpleProduct({
        actorUserId: 'actor',
        name: 'Product',
        categoryId: 'category',
        productType: 'STOCK',
        baseUnitId: 'unit',
        trackingExpiry: true,
      }),
    TypeError,
  )
})

test('07.01 Product Model errors expose a stable safe contract', () => {
  const error = new ProductModelError('CATEGORY_NOT_FOUND')

  assert.deepEqual(toErrorContract(error), {
    errorCode: ERROR_CODES.PRODUCT_MODEL_OPERATION_REJECTED,
    params: { reason: 'CATEGORY_NOT_FOUND' },
  })
  assert.equal(
    error.message,
    'Product model operation rejected',
  )
})
