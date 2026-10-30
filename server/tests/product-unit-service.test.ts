import { strict as assert } from 'node:assert'
import test from 'node:test'

import {
  ProductUnitError,
  ProductUnitService,
} from '../infrastructure/products/product-unit-service.js'
import {
  ERROR_CODES,
  toErrorContract,
} from '../infrastructure/errors/error-mapper.js'

const neverDatabase = {
  async transaction() {
    throw new Error('database should not be reached')
  },
}

test('07.02 rejects invalid conversion precision before database access', async () => {
  const service = new ProductUnitService(neverDatabase)

  await assert.rejects(
    () =>
      service.addProductUnit({
        actorUserId: 'actor',
        productId: 'product',
        unitId: 'unit',
        conversionToBase: '1.1234567',
        isSellable: true,
        isPurchasable: true,
      }),
    TypeError,
  )

  await assert.rejects(
    () =>
      service.addProductUnit({
        actorUserId: 'actor',
        productId: 'product',
        unitId: 'unit',
        conversionToBase: '0',
        isSellable: true,
        isPurchasable: true,
      }),
    RangeError,
  )
})

test('07.02 rejects unsupported ProductUnit usage before database access', async () => {
  const service = new ProductUnitService(neverDatabase)

  await assert.rejects(
    () =>
      service.validateAndConvertQuantity({
        variantId: 'variant',
        productUnitId: 'product-unit',
        quantity: '1',
        usage: 'TRANSFER' as never,
      }),
    TypeError,
  )
})

test('07.02 ProductUnit errors expose a stable safe contract', () => {
  const error = new ProductUnitError('FRACTION_NOT_ALLOWED')

  assert.deepEqual(toErrorContract(error), {
    errorCode: ERROR_CODES.PRODUCT_UNIT_OPERATION_REJECTED,
    params: { reason: 'FRACTION_NOT_ALLOWED' },
  })
  assert.equal(
    error.message,
    'Product unit operation rejected',
  )
})
