import { strict as assert } from 'node:assert'
import test from 'node:test'

import {
  SystemAdminProtectionError,
  SystemAdminProtectionService,
} from '../infrastructure/authorization/system-admin-protection-service.js'
import {
  ERROR_CODES,
  toErrorContract,
} from '../infrastructure/errors/error-mapper.js'

const neverDatabase = {
  async transaction() {
    throw new Error('database should not be reached')
  },
}

test('Gate 05 validates protected user administration inputs before database access', async () => {
  const service = new SystemAdminProtectionService(neverDatabase)

  await assert.rejects(
    () =>
      service.setUserActive({
        userId: '',
        isActive: false,
        actorUserId: 'actor',
      }),
    TypeError,
  )

  await assert.rejects(
    () =>
      service.changeUserRole({
        userId: 'user',
        roleId: '',
        actorUserId: 'actor',
      }),
    TypeError,
  )
})

test('Gate 05 exposes a stable safe error contract for last System Admin protection', () => {
  const error = new SystemAdminProtectionError(
    'LAST_ACTIVE_SYSTEM_ADMIN',
  )

  assert.deepEqual(toErrorContract(error), {
    errorCode: ERROR_CODES.SYSTEM_ADMIN_PROTECTION_REJECTED,
    params: { reason: 'LAST_ACTIVE_SYSTEM_ADMIN' },
  })
  assert.equal(
    error.message,
    'System administrator protection rejected the operation',
  )
})
