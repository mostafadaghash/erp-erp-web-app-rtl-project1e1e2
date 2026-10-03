import { strict as assert } from 'node:assert'
import test from 'node:test'

import {
  DEFAULT_SYSTEM_ROLES,
  isDefaultSystemRoleKey,
} from '../infrastructure/authorization/role-catalog-service.js'

test('05.02 canonical default role catalog contains exactly seven stable system keys', () => {
  assert.deepEqual(
    DEFAULT_SYSTEM_ROLES.map((role) => role.roleKey),
    [
      'SYSTEM_ADMIN',
      'BRANCH_MANAGER',
      'ACCOUNTANT',
      'SALES',
      'CUSTOMER_SERVICE',
      'TECHNICIAN',
      'WAREHOUSE_KEEPER',
    ],
  )

  assert.equal(
    new Set(DEFAULT_SYSTEM_ROLES.map((role) => role.roleKey)).size,
    7,
  )
  assert.equal(
    new Set(DEFAULT_SYSTEM_ROLES.map((role) => role.displayNameKey)).size,
    7,
  )

  for (const role of DEFAULT_SYSTEM_ROLES) {
    assert.equal(isDefaultSystemRoleKey(role.roleKey), true)
    assert.match(role.displayNameKey, /^roles\.[A-Za-z][A-Za-z0-9]*$/)
  }

  assert.equal(isDefaultSystemRoleKey('ADMIN_SYSTEM'), false)
  assert.equal(isDefaultSystemRoleKey('CUSTOM_ROLE'), false)
})
