import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { Pool } from 'pg'

import { withTransaction } from '../infrastructure/database/transaction.js'

const databaseUrl = process.env.ERP_TEST_DATABASE_URL

test(
  'real PostgreSQL transaction enforces READ COMMITTED, local context, and rollback',
  { skip: databaseUrl === undefined },
  async () => {
    assert.ok(databaseUrl)

    const pool = new Pool({
      connectionString: databaseUrl,
      max: 1,
      application_name: 'business-tech-erp-transaction-test',
    })

    try {
      const observed = await withTransaction(
        pool,
        async (client) => {
          const isolation = await client.query<{ transaction_isolation: string }>(
            'SHOW transaction_isolation',
          )
          const context = await client.query<{
            request_id: string | null
            user_id: string | null
          }>(
            "SELECT current_setting('app.request_id', true) AS request_id, current_setting('app.user_id', true) AS user_id",
          )

          return {
            isolation: isolation.rows[0]?.transaction_isolation,
            requestId: context.rows[0]?.request_id,
            userId: context.rows[0]?.user_id,
          }
        },
        {
          context: {
            requestId: 'integration-request',
            userId: 'integration-user',
          },
        },
      )

      assert.equal(observed.isolation, 'read committed')
      assert.equal(observed.requestId, 'integration-request')
      assert.equal(observed.userId, 'integration-user')

      const expectedFailure = new Error('force rollback')
      await assert.rejects(
        withTransaction(pool, async (client) => {
          await client.query(
            'CREATE TEMP TABLE phase02_tx_rollback_probe (value integer)',
          )
          await client.query(
            'INSERT INTO phase02_tx_rollback_probe(value) VALUES (1)',
          )
          throw expectedFailure
        }),
        (error: unknown) => error === expectedFailure,
      )

      const verificationClient = await pool.connect()
      try {
        const rollbackProbe = await verificationClient.query<{ relation: string | null }>(
          "SELECT to_regclass('pg_temp.phase02_tx_rollback_probe')::text AS relation",
        )
        assert.equal(rollbackProbe.rows[0]?.relation, null)

        const clearedContext = await verificationClient.query<{
          request_id: string | null
          user_id: string | null
        }>(
          "SELECT current_setting('app.request_id', true) AS request_id, current_setting('app.user_id', true) AS user_id",
        )
        assert.notEqual(clearedContext.rows[0]?.request_id, 'integration-request')
        assert.notEqual(clearedContext.rows[0]?.user_id, 'integration-user')
      } finally {
        verificationClient.release()
      }
    } finally {
      await pool.end()
    }
  },
)
