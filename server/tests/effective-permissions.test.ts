import { strict as assert } from 'node:assert'
import test from 'node:test'

import {
  PermissionDeniedError,
  resolveEffectivePermission,
} from '../infrastructure/authorization/effective-permission-service.js'
import {
  ERROR_CODES,
  toErrorContract,
} from '../infrastructure/errors/error-mapper.js'

const permissionKey = 'phase05.permission'

function input(
  overrides: Partial<Parameters<typeof resolveEffectivePermission>[0]> = {},
): Parameters<typeof resolveEffectivePermission>[0] {
  return {
    permissionKey,
    found: true,
    userActive: true,
    roleDefaultAllowed: false,
    overrideEffect: null,
    ...overrides,
  }
}

test('05.03 Role Default is used when no user override exists', () => {
  assert.deepEqual(
    resolveEffectivePermission(input({ roleDefaultAllowed: true })),
    {
      permissionKey,
      allowed: true,
      source: 'ROLE_DEFAULT',
      roleDefaultAllowed: true,
      overrideEffect: null,
    },
  )

  assert.equal(
    resolveEffectivePermission(input({ roleDefaultAllowed: false })).allowed,
    false,
  )
})

test('05.03 ALLOW and DENY user overrides take precedence over Role Default', () => {
  const allow = resolveEffectivePermission(
    input({
      roleDefaultAllowed: false,
      overrideEffect: 'ALLOW',
    }),
  )
  assert.equal(allow.allowed, true)
  assert.equal(allow.source, 'USER_OVERRIDE')

  const deny = resolveEffectivePermission(
    input({
      roleDefaultAllowed: true,
      overrideEffect: 'DENY',
    }),
  )
  assert.equal(deny.allowed, false)
  assert.equal(deny.source, 'USER_OVERRIDE')
})

test('05.03 missing subjects and inactive users fail closed', () => {
  const missing = resolveEffectivePermission(
    input({
      found: false,
      userActive: false,
      roleDefaultAllowed: true,
      overrideEffect: 'ALLOW',
    }),
  )
  assert.deepEqual(missing, {
    permissionKey,
    allowed: false,
    source: 'NOT_FOUND',
    roleDefaultAllowed: false,
    overrideEffect: null,
  })

  const inactive = resolveEffectivePermission(
    input({
      userActive: false,
      roleDefaultAllowed: true,
      overrideEffect: 'ALLOW',
    }),
  )
  assert.equal(inactive.allowed, false)
  assert.equal(inactive.source, 'USER_INACTIVE')
})

test('05.03 PermissionDeniedError uses a stable PERMISSION_DENIED contract', () => {
  const denied = new PermissionDeniedError('sales.invoice.edit')
  assert.deepEqual(toErrorContract(denied), {
    errorCode: ERROR_CODES.PERMISSION_DENIED,
    params: { permission: 'sales.invoice.edit' },
  })
  assert.equal(denied.message, 'Permission denied')
})
