import { strict as assert } from 'node:assert'
import test from 'node:test'

import {
  BranchAccessDeniedError,
  resolveBranchScope,
} from '../infrastructure/authorization/branch-scope-service.js'
import {
  ERROR_CODES,
  toErrorContract,
} from '../infrastructure/errors/error-mapper.js'

const userId = '95000000-0000-4000-8000-000000000001'
const defaultBranchId = '95000000-0000-4000-8000-000000000002'
const branchId = '95000000-0000-4000-8000-000000000003'

function input(
  overrides: Partial<Parameters<typeof resolveBranchScope>[0]> = {},
): Parameters<typeof resolveBranchScope>[0] {
  return {
    userId,
    branchId,
    found: true,
    userActive: true,
    branchExists: true,
    scopeMode: 'SELECTED',
    defaultBranchId,
    selectedAccess: true,
    ...overrides,
  }
}

test('05.04 ALL grants every existing branch without user_branch_access rows', () => {
  const result = resolveBranchScope(
    input({
      scopeMode: 'ALL',
      selectedAccess: false,
    }),
  )

  assert.equal(result.allowed, true)
  assert.equal(result.source, 'ALL')
  assert.equal(result.defaultBranchId, defaultBranchId)
})

test('05.04 SELECTED grants only explicit user_branch_access rows', () => {
  const allowed = resolveBranchScope(input({ selectedAccess: true }))
  assert.equal(allowed.allowed, true)
  assert.equal(allowed.source, 'SELECTED')

  const denied = resolveBranchScope(input({ selectedAccess: false }))
  assert.equal(denied.allowed, false)
  assert.equal(denied.source, 'SELECTED')
})

test('05.04 missing user, inactive user, missing branch, and invalid scope fail closed', () => {
  assert.equal(
    resolveBranchScope(
      input({
        found: false,
        userActive: false,
        branchExists: false,
        scopeMode: null,
      }),
    ).source,
    'NOT_FOUND',
  )

  assert.equal(
    resolveBranchScope(input({ userActive: false })).source,
    'USER_INACTIVE',
  )
  assert.equal(
    resolveBranchScope(input({ branchExists: false })).source,
    'BRANCH_NOT_FOUND',
  )
  assert.equal(
    resolveBranchScope(input({ scopeMode: null })).source,
    'INVALID_SCOPE',
  )

  assert.equal(
    resolveBranchScope(input({ userActive: false })).allowed,
    false,
  )
  assert.equal(
    resolveBranchScope(input({ branchExists: false })).allowed,
    false,
  )
  assert.equal(
    resolveBranchScope(input({ scopeMode: null })).allowed,
    false,
  )
})

test('05.04 BranchAccessDeniedError uses a stable public contract', () => {
  const denied = new BranchAccessDeniedError(branchId)

  assert.deepEqual(toErrorContract(denied), {
    errorCode: ERROR_CODES.BRANCH_ACCESS_DENIED,
    params: { branchId },
  })
  assert.equal(denied.message, 'Branch access denied')
})
