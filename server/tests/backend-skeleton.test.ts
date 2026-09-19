import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { ApiError, type ErrorParams } from '../api/errors/api-error.js'
import { buildServer } from '../app.js'
import type { AppConfig } from '../infrastructure/config/config.js'
import type { TransactionalDatabaseConnection } from '../infrastructure/database/database.js'

interface FakeDatabase extends TransactionalDatabaseConnection {
  queries: string[]
  closeCount: number
}

function createEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    ERP_LOG_LEVEL: 'silent',
    ERP_DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/test',
    ERP_AUTH_ACCESS_TOKEN_SECRET: ['test', 'only', 'auth', 'signing', 'key', '32', 'characters', 'minimum'].join('-'),
    ...overrides,
  }
}

function createFakeDatabase(options: { failProbe?: boolean } = {}): FakeDatabase {
  return {
    queries: [],
    closeCount: 0,
    async query(sql: string): Promise<void> {
      this.queries.push(sql)
      if (options.failProbe) throw new Error('database unavailable')
    },
    async transaction<T>(): Promise<T> {
      throw new Error('fake transaction is not configured for this test')
    },
    async close(): Promise<void> {
      this.closeCount += 1
    },
  }
}

test('configuration is validated before the backend becomes ready', async () => {
  const app = buildServer({
    env: {
      NODE_ENV: 'test',
      ERP_LOG_LEVEL: 'silent',
    },
    databaseFactory: () => createFakeDatabase(),
  })

  await assert.rejects(async () => {
    await app.ready()
  })
  await app.close().catch(() => undefined)
})

test('configuration defaults are typed and deterministic', async () => {
  const database = createFakeDatabase()
  let capturedConfig: AppConfig | undefined
  const app = buildServer({
    env: createEnv(),
    databaseFactory: (config) => {
      capturedConfig = config
      return database
    },
  })

  await app.ready()

  assert.ok(capturedConfig)
  assert.equal(capturedConfig.ERP_BACKEND_HOST, '127.0.0.1')
  assert.equal(capturedConfig.ERP_BACKEND_PORT, 8787)
  assert.equal(capturedConfig.ERP_DB_POOL_MAX, 10)
  assert.equal(capturedConfig.ERP_SHUTDOWN_TIMEOUT_MS, 10000)
  assert.equal(capturedConfig.ERP_AUTH_TRANSPORT_MODE, 'local-http')
  assert.equal(capturedConfig.ERP_AUTH_ACCESS_TOKEN_TTL_SECONDS, 900)
  assert.equal(capturedConfig.ERP_AUTH_SESSION_TTL_SECONDS, 604800)
  assert.equal(capturedConfig.ERP_AUTH_LOGIN_MAX_ATTEMPTS, 5)
  assert.equal(capturedConfig.ERP_AUTH_LOGIN_WINDOW_SECONDS, 300)

  await app.close()
})

test('health endpoint returns a server-generated correlation id', async () => {
  const database = createFakeDatabase()
  const app = buildServer({
    env: createEnv(),
    databaseFactory: () => database,
  })

  await app.ready()
  const response = await app.inject({ method: 'GET', url: '/health' })
  const body = response.json<{ status: string; service: string; requestId: string }>()

  assert.equal(response.statusCode, 200)
  assert.equal(body.status, 'ok')
  assert.equal(body.service, 'business-tech-erp-backend')
  assert.equal(body.requestId, response.headers['x-request-id'])
  assert.match(body.requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)

  await app.close()
  assert.equal(database.closeCount, 1)
})

test('client supplied request ids cannot override server correlation ids', async () => {
  const app = buildServer({
    env: createEnv(),
    databaseFactory: () => createFakeDatabase(),
  })

  await app.ready()
  const response = await app.inject({
    method: 'GET',
    url: '/health',
    headers: {
      'x-request-id': 'client-controlled-request-id',
    },
  })
  const body = response.json<{ requestId: string }>()

  assert.equal(body.requestId, response.headers['x-request-id'])
  assert.notEqual(body.requestId, 'client-controlled-request-id')
  assert.match(body.requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)

  await app.close()
})

test('readiness passes only when PostgreSQL probe succeeds', async () => {
  const database = createFakeDatabase()
  const app = buildServer({
    env: createEnv(),
    databaseFactory: () => database,
  })

  await app.ready()
  const response = await app.inject({ method: 'GET', url: '/ready' })
  const body = response.json<{
    status: string
    checks: { database: string }
    requestId: string
  }>()

  assert.equal(response.statusCode, 200)
  assert.equal(body.status, 'ready')
  assert.equal(body.checks.database, 'up')
  assert.deepEqual(database.queries, ['SELECT 1'])

  await app.close()
})

test('readiness returns 503 when PostgreSQL probe fails', async () => {
  const database = createFakeDatabase({ failProbe: true })
  const app = buildServer({
    env: createEnv(),
    databaseFactory: () => database,
  })

  await app.ready()
  const response = await app.inject({ method: 'GET', url: '/ready' })
  const body = response.json<{
    status: string
    checks: { database: string }
    requestId: string
  }>()

  assert.equal(response.statusCode, 503)
  assert.equal(body.status, 'not_ready')
  assert.equal(body.checks.database, 'down')
  assert.equal(body.requestId, response.headers['x-request-id'])

  await app.close()
})

test('expected API failures return stable code, safe params, and request id only', async () => {
  const app = buildServer({
    env: createEnv(),
    databaseFactory: () => createFakeDatabase(),
  })

  app.get('/__test-api-error', async () => {
    throw new ApiError({
      errorCode: 'TEST_RULE_REJECTED',
      statusCode: 409,
      errorParams: {
        availableQty: 3,
        requestedQty: 5,
      },
    })
  })

  await app.ready()
  const response = await app.inject({ method: 'GET', url: '/__test-api-error' })
  const body = response.json<{
    errorCode: string
    errorParams: Record<string, unknown>
    requestId: string
    message?: string
    stack?: string
    statusCode?: number
  }>()

  assert.equal(response.statusCode, 409)
  assert.equal(body.errorCode, 'TEST_RULE_REJECTED')
  assert.deepEqual(body.errorParams, { availableQty: 3, requestedQty: 5 })
  assert.equal(body.requestId, response.headers['x-request-id'])
  assert.equal('message' in body, false)
  assert.equal('stack' in body, false)
  assert.equal('statusCode' in body, false)

  await app.close()
})

test('request validation failures use the shared error contract without leaking validator text', async () => {
  const app = buildServer({
    env: createEnv(),
    databaseFactory: () => createFakeDatabase(),
  })

  app.post(
    '/__test-validation',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['quantity'],
          properties: {
            quantity: { type: 'integer', minimum: 1 },
          },
        },
      },
    },
    async () => ({ ok: true }),
  )

  await app.ready()
  const response = await app.inject({
    method: 'POST',
    url: '/__test-validation',
    payload: { quantity: 0 },
  })
  const body = response.json<{
    errorCode: string
    errorParams: Record<string, unknown>
    requestId: string
  }>()

  assert.equal(response.statusCode, 400)
  assert.equal(body.errorCode, 'REQUEST_VALIDATION_FAILED')
  assert.deepEqual(body.errorParams, {})
  assert.equal(body.requestId, response.headers['x-request-id'])
  assert.equal(response.body.includes('must be >= 1'), false)
  assert.equal(response.body.includes('validation'), false)

  await app.close()
})

test('unknown routes use the same structured API error contract', async () => {
  const app = buildServer({
    env: createEnv(),
    databaseFactory: () => createFakeDatabase(),
  })

  await app.ready()
  const response = await app.inject({ method: 'GET', url: '/does-not-exist' })
  const body = response.json<{
    errorCode: string
    errorParams: Record<string, unknown>
    requestId: string
  }>()

  assert.equal(response.statusCode, 404)
  assert.equal(body.errorCode, 'ROUTE_NOT_FOUND')
  assert.deepEqual(body.errorParams, {})
  assert.equal(body.requestId, response.headers['x-request-id'])
  assert.equal(response.body.includes('/does-not-exist'), false)

  await app.close()
})

test('ApiError rejects unstable codes and unsafe nested parameters', () => {
  assert.throws(
    () =>
      new ApiError({
        errorCode: 'not-stable',
        statusCode: 400,
      }),
    /stable UPPER_SNAKE_CASE/,
  )

  assert.throws(
    () =>
      new ApiError({
        errorCode: 'TEST_UNSAFE_PARAMS',
        statusCode: 400,
        errorParams: {
          nested: { secret: true },
        } as unknown as ErrorParams,
      }),
    /safe primitive/,
  )
})

test('unhandled failures return the minimal structured error envelope', async () => {
  const app = buildServer({
    env: createEnv(),
    databaseFactory: () => createFakeDatabase(),
  })

  app.get('/__test-error', async () => {
    throw new Error('sensitive internal details')
  })

  await app.ready()
  const response = await app.inject({ method: 'GET', url: '/__test-error' })
  const body = response.json<{
    errorCode: string
    errorParams: Record<string, unknown>
    requestId: string
    message?: string
    stack?: string
  }>()

  assert.equal(response.statusCode, 500)
  assert.equal(body.errorCode, 'INTERNAL_ERROR')
  assert.deepEqual(body.errorParams, {})
  assert.equal(body.requestId, response.headers['x-request-id'])
  assert.equal(response.body.includes('sensitive internal details'), false)
  assert.equal('message' in body, false)
  assert.equal('stack' in body, false)

  await app.close()
})
