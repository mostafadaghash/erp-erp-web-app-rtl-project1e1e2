import { strict as assert } from 'node:assert'
import test from 'node:test'

import {
  ProductAttributeError,
  ProductAttributeService,
} from '../infrastructure/products/product-attribute-service.js'
import {
  ERROR_CODES,
  toErrorContract,
} from '../infrastructure/errors/error-mapper.js'

const neverDatabase = {
  async transaction() {
    throw new Error('database should not be reached')
  },
}

test('07.04 validates Attribute usage and Variant composition input before database access', async () => {
  const service = new ProductAttributeService(neverDatabase)

  await assert.rejects(
    () =>
      service.createAttribute({
        actorUserId: 'actor',
        name: 'Color',
        attributeType: 'TEXT',
        usageType: 'BROKEN' as never,
      }),
    TypeError,
  )

  await assert.rejects(
    () =>
      service.createVariantFromAttributes({
        actorUserId: 'actor',
        productId: 'product',
        name: 'Red',
        attributeValueIds: [],
      }),
    TypeError,
  )

  await assert.rejects(
    () =>
      service.createVariantFromAttributes({
        actorUserId: 'actor',
        productId: 'product',
        name: 'Red',
        attributeValueIds: ['value-1', 'value-1'],
      }),
    (error) =>
      error instanceof ProductAttributeError &&
      error.reason === 'DUPLICATE_ATTRIBUTE_SELECTION',
  )
})

test('07.04 Product Attribute errors expose a stable safe contract', () => {
  const error = new ProductAttributeError(
    'VARIANT_COMBINATION_ALREADY_EXISTS',
  )

  assert.deepEqual(toErrorContract(error), {
    errorCode:
      ERROR_CODES.PRODUCT_ATTRIBUTE_OPERATION_REJECTED,
    params: {
      reason: 'VARIANT_COMBINATION_ALREADY_EXISTS',
    },
  })
  assert.equal(
    error.message,
    'Product attribute operation rejected',
  )
})
