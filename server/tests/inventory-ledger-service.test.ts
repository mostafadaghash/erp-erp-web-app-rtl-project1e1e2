import { strict as assert } from 'node:assert'
import test from 'node:test'

import {
  INVENTORY_MOVEMENT_TYPES,
  InventoryLedgerError,
  InventoryLedgerService,
} from '../infrastructure/inventory/inventory-ledger-service.js'
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

test('08.01 freezes the v1.7 Inventory Movement vocabulary', () => {
  assert.deepEqual(INVENTORY_MOVEMENT_TYPES, [
    'OPENING',
    'PURCHASE',
    'SALE',
    'SALES_RETURN',
    'PURCHASE_RETURN',
    'TRANSFER_OUT',
    'TRANSFER_IN',
    'ADJUSTMENT',
  ])
})

test('08.01 validates movement lines and signed direction before database access', async () => {
  const service = new InventoryLedgerService(neverDatabase)

  await assert.rejects(
    () =>
      service.appendWithinTransaction(fakeClient as never, {
        actorUserId: 'actor',
        postingBatchId: 'batch',
        warehouseId: 'warehouse',
        movementType: 'SALE',
        lines: [],
      }),
    TypeError,
  )

  await assert.rejects(
    () =>
      service.appendWithinTransaction(fakeClient as never, {
        actorUserId: 'actor',
        postingBatchId: 'batch',
        warehouseId: 'warehouse',
        movementType: 'SALE',
        lines: [
          {
            variantId: 'variant',
            quantitySigned: '1',
            unitCost: '10',
            totalCost: '10',
          },
        ],
      }),
    (error) =>
      error instanceof InventoryLedgerError &&
      error.reason === 'INVALID_MOVEMENT_DIRECTION',
  )

  await assert.rejects(
    () =>
      service.appendWithinTransaction(fakeClient as never, {
        actorUserId: 'actor',
        postingBatchId: 'batch',
        warehouseId: 'warehouse',
        movementType: 'PURCHASE',
        lines: [
          {
            variantId: 'variant',
            quantitySigned: '-1',
            unitCost: '10',
            totalCost: '10',
          },
        ],
      }),
    (error) =>
      error instanceof InventoryLedgerError &&
      error.reason === 'INVALID_MOVEMENT_DIRECTION',
  )

  await assert.rejects(
    () =>
      service.appendWithinTransaction(fakeClient as never, {
        actorUserId: 'actor',
        postingBatchId: 'batch',
        warehouseId: 'warehouse',
        movementType: 'ADJUSTMENT',
        lines: [
          {
            variantId: 'variant',
            quantitySigned: '0',
            unitCost: '10',
            totalCost: '0',
          },
        ],
      }),
    RangeError,
  )

  await assert.rejects(
    () =>
      service.appendWithinTransaction(fakeClient as never, {
        actorUserId: 'actor',
        postingBatchId: 'batch',
        warehouseId: 'warehouse',
        movementType: 'OPENING',
        lines: [
          {
            variantId: 'variant',
            quantitySigned: '1.0000001',
            unitCost: '10',
            totalCost: '10',
          },
        ],
      }),
    TypeError,
  )
})

test('08.01 Inventory Ledger errors expose a stable safe contract', () => {
  const error = new InventoryLedgerError(
    'POSTING_BATCH_BRANCH_MISMATCH',
  )

  assert.deepEqual(toErrorContract(error), {
    errorCode:
      ERROR_CODES.INVENTORY_LEDGER_OPERATION_REJECTED,
    params: {
      reason: 'POSTING_BATCH_BRANCH_MISMATCH',
    },
  })
  assert.equal(
    error.message,
    'Inventory ledger operation rejected',
  )
})
