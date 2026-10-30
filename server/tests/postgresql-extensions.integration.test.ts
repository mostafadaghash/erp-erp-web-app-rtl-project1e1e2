import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { Pool } from 'pg'

const databaseUrl = process.env.ERP_TEST_DATABASE_URL

test(
  'PostgreSQL 17 exposes pg_trgm and idempotent enablement is safe',
  { skip: databaseUrl === undefined },
  async () => {
    assert.ok(databaseUrl)

    const pool = new Pool({
      connectionString: databaseUrl,
      max: 1,
      application_name: 'business-tech-erp-extension-test',
    })

    let wasInstalled = false

    try {
      const available = await pool.query<{
        name: string
        default_version: string
      }>(
        `SELECT name, default_version
         FROM pg_available_extensions
         WHERE name = 'pg_trgm'`,
      )

      assert.equal(available.rowCount, 1)
      assert.equal(available.rows[0]?.name, 'pg_trgm')
      assert.ok(available.rows[0]?.default_version)

      const before = await pool.query<{ installed: boolean }>(
        `SELECT EXISTS (
           SELECT 1
           FROM pg_extension
           WHERE extname = 'pg_trgm'
         ) AS installed`,
      )
      wasInstalled = before.rows[0]?.installed === true

      await pool.query('CREATE EXTENSION IF NOT EXISTS pg_trgm')
      await pool.query('CREATE EXTENSION IF NOT EXISTS pg_trgm')

      const installed = await pool.query<{
        count: string
        extversion: string
      }>(
        `SELECT count(*)::text AS count, min(extversion)::text AS extversion
         FROM pg_extension
         WHERE extname = 'pg_trgm'`,
      )

      assert.equal(installed.rows[0]?.count, '1')
      assert.ok(installed.rows[0]?.extversion)

      const capability = await pool.query<{ similarity_score: number }>(
        `SELECT similarity('business tech erp', 'business tech erp')::float8 AS similarity_score`,
      )
      assert.equal(capability.rows[0]?.similarity_score, 1)
    } finally {
      if (!wasInstalled) {
        await pool.query('DROP EXTENSION IF EXISTS pg_trgm')
      }
      await pool.end()
    }
  },
)
