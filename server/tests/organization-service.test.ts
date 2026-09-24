import { strict as assert } from 'node:assert'
import test from 'node:test'

import {
  OrganizationError,
  OrganizationService,
} from '../infrastructure/organization/organization-service.js'
import {
  ERROR_CODES,
  toErrorContract,
} from '../infrastructure/errors/error-mapper.js'

const neverDatabase = {
  async transaction() {
    throw new Error('database should not be reached')
  },
}

test('05.05 Organization validation rejects blank identifiers before database access', async () => {
  const service = new OrganizationService(neverDatabase)

  await assert.rejects(
    () =>
      service.createBranch({
        companyId: '',
        actorUserId: 'actor',
        name: 'Branch',
        code: 'B1',
        defaultWarehouseName: 'Main Warehouse',
        defaultWarehouseCode: 'B1-WH',
      }),
    TypeError,
  )

  await assert.rejects(
    () =>
      service.setDefaultWarehouse({
        branchId: 'branch',
        warehouseId: '',
        actorUserId: 'actor',
      }),
    TypeError,
  )
})

test('05.05 Company Settings must remain a JSON object', async () => {
  const service = new OrganizationService(neverDatabase)

  await assert.rejects(
    () =>
      service.updateCompanySettings({
        companyId: 'company',
        actorUserId: 'actor',
        settings: [] as never,
      }),
    TypeError,
  )
})

test('05.05 OrganizationError exposes only stable safe reason', () => {
  const error = new OrganizationError('WAREHOUSE_HAS_MOVEMENTS')

  assert.deepEqual(toErrorContract(error), {
    errorCode: ERROR_CODES.ORGANIZATION_OPERATION_REJECTED,
    params: { reason: 'WAREHOUSE_HAS_MOVEMENTS' },
  })
  assert.equal(error.message, 'Organization operation rejected')
})
