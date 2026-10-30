import { strict as assert } from 'node:assert'
import test from 'node:test'

import {
  CounterpartyError,
  CounterpartyService,
} from '../infrastructure/counterparties/counterparty-service.js'
import {
  ERROR_CODES,
  toErrorContract,
} from '../infrastructure/errors/error-mapper.js'

const neverDatabase = {
  async transaction() {
    throw new Error('database should not be reached')
  },
}

test('06.01 rejects empty roles and duplicate role input before database access', async () => {
  const service = new CounterpartyService(neverDatabase)

  await assert.rejects(
    () =>
      service.create({
        actorUserId: 'actor',
        name: 'Account',
        roles: [],
      }),
    TypeError,
  )

  await assert.rejects(
    () =>
      service.create({
        actorUserId: 'actor',
        name: 'Account',
        roles: ['CUSTOMER', 'CUSTOMER'],
      }),
    (error) =>
      error instanceof CounterpartyError &&
      error.reason === 'DUPLICATE_INPUT_ROLE',
  )
})

test('06.01 profile inputs require their matching role', async () => {
  const service = new CounterpartyService(neverDatabase)

  await assert.rejects(
    () =>
      service.create({
        actorUserId: 'actor',
        name: 'Supplier only',
        roles: ['SUPPLIER'],
        customerProfile: { creditLimit: '10.0000' },
      }),
    (error) =>
      error instanceof CounterpartyError &&
      error.reason === 'CUSTOMER_PROFILE_REQUIRES_CUSTOMER_ROLE',
  )

  await assert.rejects(
    () =>
      service.create({
        actorUserId: 'actor',
        name: 'Customer only',
        roles: ['CUSTOMER'],
        supplierProfile: { notes: 'x' },
      }),
    (error) =>
      error instanceof CounterpartyError &&
      error.reason === 'SUPPLIER_PROFILE_REQUIRES_SUPPLIER_ROLE',
  )
})

test('06.01 validates credit_limit precision at service boundary', async () => {
  const service = new CounterpartyService(neverDatabase)

  await assert.rejects(
    () =>
      service.create({
        actorUserId: 'actor',
        name: 'Account',
        roles: ['CUSTOMER'],
        customerProfile: { creditLimit: '-1' },
      }),
    TypeError,
  )

  await assert.rejects(
    () =>
      service.create({
        actorUserId: 'actor',
        name: 'Account',
        roles: ['CUSTOMER'],
        customerProfile: { creditLimit: '1.00001' },
      }),
    TypeError,
  )
})

test('06.01 CounterpartyError exposes a stable safe contract', () => {
  const error = new CounterpartyError('COUNTERPARTY_NOT_FOUND')

  assert.deepEqual(toErrorContract(error), {
    errorCode: ERROR_CODES.COUNTERPARTY_OPERATION_REJECTED,
    params: { reason: 'COUNTERPARTY_NOT_FOUND' },
  })
  assert.equal(error.message, 'Counterparty operation rejected')
})
