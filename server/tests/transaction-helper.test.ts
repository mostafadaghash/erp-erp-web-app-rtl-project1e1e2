import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import type { Pool, PoolClient } from 'pg'

import {
  MAX_TRANSACTION_ATTEMPTS,
  POSTGRES_DEADLOCK_CODE,
  POSTGRES_SERIALIZATION_FAILURE_CODE,
  isRetryableTransactionError,
  withTransaction,
} from '../infrastructure/database/transaction.js'

interface Statement {
  sql: string
  values: unknown[] | undefined
}

interface FakeClient {
  statements: Statement[]
  releaseArguments: Array<Error | boolean | undefined>
  failRollback: boolean
  query(sql: string, values?: unknown[]): Promise<{ rows: never[] }>
  release(error?: Error | boolean): void
}

interface FakePool {
  connectCount: number
  asPool(): Pick<Pool, 'connect'>
}

function createFakeClient(options: { failRollback?: boolean } = {}): FakeClient {
  return {
    statements: [],
    releaseArguments: [],
    failRollback: options.failRollback ?? false,
    async query(sql: string, values?: unknown[]): Promise<{ rows: never[] }> {
      this.statements.push({ sql, values })
      if (sql === 'ROLLBACK' && this.failRollback) {
        throw new Error('rollback failed')
      }
      return { rows: [] }
    },
    release(error?: Error | boolean): void {
      this.releaseArguments.push(error)
    },
  }
}

function createFakePool(clients: FakeClient[]): FakePool {
  let cursor = 0
  const state = {
    connectCount: 0,
    asPool(): Pick<Pool, 'connect'> {
      return {
        connect: async (): Promise<PoolClient> => {
          state.connectCount += 1
          const client = clients[cursor]
          cursor += 1
          assert.ok(client, 'unexpected extra transaction attempt')
          return client as unknown as PoolClient
        },
      } as Pick<Pool, 'connect'>
    },
  }

  return state
}

function postgresError(code: string): Error & { code: string } {
  const error = new Error(`postgres ${code}`) as Error & { code: string }
  error.code = code
  return error
}

test('transaction uses READ COMMITTED, local context, COMMIT, and one leased client', async () => {
  const client = createFakeClient()
  const pool = createFakePool([client])

  const result = await withTransaction(
    pool.asPool(),
    async (transactionClient) => {
      await transactionClient.query('SELECT 42')
      return 'committed'
    },
    {
      context: {
        requestId: 'request-123',
        userId: 'user-456',
      },
    },
  )

  assert.equal(result, 'committed')
  assert.equal(pool.connectCount, 1)
  assert.deepEqual(client.statements, [
    { sql: 'BEGIN ISOLATION LEVEL READ COMMITTED', values: undefined },
    {
      sql: "SELECT set_config('app.request_id', $1, true)",
      values: ['request-123'],
    },
    {
      sql: "SELECT set_config('app.user_id', $1, true)",
      values: ['user-456'],
    },
    { sql: 'SELECT 42', values: undefined },
    { sql: 'COMMIT', values: undefined },
  ])
  assert.deepEqual(client.releaseArguments, [false])
})

test('business failures roll back and are never retried automatically', async () => {
  const client = createFakeClient()
  const pool = createFakePool([client])
  const businessError = new Error('business validation failed')

  await assert.rejects(
    withTransaction(pool.asPool(), async () => {
      throw businessError
    }),
    (error: unknown) => error === businessError,
  )

  assert.equal(pool.connectCount, 1)
  assert.deepEqual(
    client.statements.map((statement) => statement.sql),
    ['BEGIN ISOLATION LEVEL READ COMMITTED', 'ROLLBACK'],
  )
  assert.deepEqual(client.releaseArguments, [false])
})

test('deadlock retries with a fresh client and commits the next successful attempt', async () => {
  const firstClient = createFakeClient()
  const secondClient = createFakeClient()
  const pool = createFakePool([firstClient, secondClient])
  let workAttempts = 0

  const result = await withTransaction(pool.asPool(), async () => {
    workAttempts += 1
    if (workAttempts === 1) throw postgresError(POSTGRES_DEADLOCK_CODE)
    return 'ok'
  })

  assert.equal(result, 'ok')
  assert.equal(workAttempts, 2)
  assert.equal(pool.connectCount, 2)
  assert.deepEqual(
    firstClient.statements.map((statement) => statement.sql),
    ['BEGIN ISOLATION LEVEL READ COMMITTED', 'ROLLBACK'],
  )
  assert.deepEqual(
    secondClient.statements.map((statement) => statement.sql),
    ['BEGIN ISOLATION LEVEL READ COMMITTED', 'COMMIT'],
  )
})

test('serialization failure stops after the bounded maximum of three attempts', async () => {
  const clients = Array.from({ length: MAX_TRANSACTION_ATTEMPTS }, () =>
    createFakeClient(),
  )
  const pool = createFakePool(clients)
  let workAttempts = 0

  await assert.rejects(
    withTransaction(pool.asPool(), async () => {
      workAttempts += 1
      throw postgresError(POSTGRES_SERIALIZATION_FAILURE_CODE)
    }),
    (error: unknown) =>
      error instanceof Error &&
      'code' in error &&
      error.code === POSTGRES_SERIALIZATION_FAILURE_CODE,
  )

  assert.equal(workAttempts, MAX_TRANSACTION_ATTEMPTS)
  assert.equal(pool.connectCount, MAX_TRANSACTION_ATTEMPTS)
  for (const client of clients) {
    assert.deepEqual(
      client.statements.map((statement) => statement.sql),
      ['BEGIN ISOLATION LEVEL READ COMMITTED', 'ROLLBACK'],
    )
  }
})

test('retry limit is validated before acquiring a PostgreSQL client', async () => {
  const pool = createFakePool([])

  await assert.rejects(
    withTransaction(pool.asPool(), async () => undefined, { maxAttempts: 0 }),
    /between 1 and 3/,
  )
  await assert.rejects(
    withTransaction(pool.asPool(), async () => undefined, { maxAttempts: 4 }),
    /between 1 and 3/,
  )

  assert.equal(pool.connectCount, 0)
})

test('empty transaction-local context is rejected before acquiring a client', async () => {
  const pool = createFakePool([])

  await assert.rejects(
    withTransaction(pool.asPool(), async () => undefined, {
      context: { requestId: '' },
    }),
    /requestId cannot be empty/,
  )

  assert.equal(pool.connectCount, 0)
})

test('rollback failure destroys the leased client and disables automatic retry', async () => {
  const client = createFakeClient({ failRollback: true })
  const pool = createFakePool([client])
  const deadlock = postgresError(POSTGRES_DEADLOCK_CODE)

  await assert.rejects(
    withTransaction(pool.asPool(), async () => {
      throw deadlock
    }),
    (error: unknown) => error === deadlock,
  )

  assert.equal(pool.connectCount, 1)
  assert.deepEqual(client.releaseArguments, [true])
})

test('only PostgreSQL deadlock and serialization SQLSTATEs are retryable', () => {
  assert.equal(isRetryableTransactionError(postgresError('40P01')), true)
  assert.equal(isRetryableTransactionError(postgresError('40001')), true)
  assert.equal(isRetryableTransactionError(postgresError('23505')), false)
  assert.equal(isRetryableTransactionError(new Error('business validation')), false)
})
