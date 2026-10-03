import { strict as assert } from 'node:assert'
import test from 'node:test'

import {
  PRICE_LIST_PERMISSIONS,
  PriceListError,
  PriceListService,
} from '../infrastructure/products/price-list-service.js'
import {
  ERROR_CODES,
  toErrorContract,
} from '../infrastructure/errors/error-mapper.js'

const neverDatabase = {
  async transaction() {
    throw new Error('database should not be reached')
  },
}

test('07.05 validates Price List monetary and source inputs before database access', async () => {
  const service = new PriceListService(neverDatabase)

  await assert.rejects(
    () =>
      service.setPriceListItem({
        actorUserId: 'actor',
        priceListId: 'price-list',
        variantId: 'variant',
        productUnitId: 'product-unit',
        price: '-1',
      }),
    TypeError,
  )

  await assert.rejects(
    () =>
      service.setMinimumSellingPrice({
        actorUserId: 'actor',
        variantId: 'variant',
        minimumSellingPrice: '1.00001',
      }),
    TypeError,
  )

  await assert.rejects(
    () =>
      service.authorizeEffectiveSalePrice({
        actorUserId: 'actor',
        branchId: 'branch',
        variantId: 'variant',
        productUnitId: 'product-unit',
        effectiveUnitPrice: '10',
        priceSource: 'BROKEN' as never,
      }),
    TypeError,
  )
})

test('07.05 Price List permissions have stable independent technical keys', () => {
  assert.deepEqual(PRICE_LIST_PERMISSIONS, {
    MANUAL_EDIT: 'sales.price.manual_edit',
    BELOW_MINIMUM: 'sales.price.below_minimum',
  })
  assert.notEqual(
    PRICE_LIST_PERMISSIONS.MANUAL_EDIT,
    PRICE_LIST_PERMISSIONS.BELOW_MINIMUM,
  )
})

test('07.05 Price List errors expose a stable safe contract', () => {
  const error = new PriceListError('PRICE_LIST_INACTIVE')

  assert.deepEqual(toErrorContract(error), {
    errorCode:
      ERROR_CODES.PRICE_LIST_OPERATION_REJECTED,
    params: { reason: 'PRICE_LIST_INACTIVE' },
  })
  assert.equal(error.message, 'Price list operation rejected')
})
