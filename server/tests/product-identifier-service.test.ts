import { strict as assert } from 'node:assert'
import test from 'node:test'

import {
  ProductIdentifierError,
  ProductIdentifierService,
} from '../infrastructure/products/product-identifier-service.js'
import {
  ERROR_CODES,
  toErrorContract,
} from '../infrastructure/errors/error-mapper.js'

const neverDatabase = {
  async transaction() {
    throw new Error('database should not be reached')
  },
}

test('07.03 validates identifiers before database access', async () => {
  const service = new ProductIdentifierService(neverDatabase)

  await assert.rejects(
    () =>
      service.addBarcode({
        actorUserId: 'actor',
        variantId: 'variant',
        productUnitId: 'product-unit',
        barcode: '   ',
        isPrimary: false,
      }),
    TypeError,
  )

  await assert.rejects(
    () => service.findVariantBySku('   '),
    TypeError,
  )
})

test('07.03 Product Identifier errors expose a stable safe contract', () => {
  const error = new ProductIdentifierError(
    'BARCODE_ALREADY_EXISTS',
  )

  assert.deepEqual(toErrorContract(error), {
    errorCode:
      ERROR_CODES.PRODUCT_IDENTIFIER_OPERATION_REJECTED,
    params: { reason: 'BARCODE_ALREADY_EXISTS' },
  })
  assert.equal(
    error.message,
    'Product identifier operation rejected',
  )
})
