import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { buildServer } from '../app.js'
import type { AppConfig } from '../infrastructure/config/config.js'
import type { DatabaseConnection } from '../infrastructure/database/database.js'

interface FakeDatabase extends DatabaseConnection {
  queries: string[]
  closeCount: number
}

function createEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    ERP_LOG_LEVEL: 'silent',
    ERP_DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/test',
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

  await assert.rejects(app.ready())
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
  }>()

  assert.equal(response.statusCode, 500)
  assert.equal(body.errorCode, 'INTERNAL_ERROR')
  assert.deepEqual(body.errorParams, {})
  assert.equal(body.requestId, response.headers['x-request-id'])
  assert.equal(response.body.includes('sensitive internal details'), false)

  await app.close()
})
