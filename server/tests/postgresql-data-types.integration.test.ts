import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { Pool } from 'pg'

const databaseUrl = process.env.ERP_TEST_DATABASE_URL

test(
  'PostgreSQL 17 supports the canonical money, quantity, time, and JSON physical types',
  { skip: databaseUrl === undefined },
  async () => {
    assert.ok(databaseUrl)

    const pool = new Pool({
      connectionString: databaseUrl,
      max: 1,
      application_name: 'business-tech-erp-data-types-test',
    })

    const client = await pool.connect()

    try {
      await client.query('BEGIN')
      await client.query(`
        CREATE TEMP TABLE phase03_data_type_probe (
          money_value numeric(18,4) NOT NULL,
          quantity_value numeric(18,6) NOT NULL,
          happened_at timestamptz NOT NULL,
          settings_payload jsonb NOT NULL
        ) ON COMMIT DROP
      `)

      const typeRows = await client.query<{
        column_name: string
        formatted_type: string
      }>(`
        SELECT
          a.attname AS column_name,
          format_type(a.atttypid, a.atttypmod) AS formatted_type
        FROM pg_attribute AS a
        WHERE a.attrelid = 'pg_temp.phase03_data_type_probe'::regclass
          AND a.attnum > 0
          AND NOT a.attisdropped
        ORDER BY a.attnum
      `)

      assert.deepEqual(typeRows.rows, [
        { column_name: 'money_value', formatted_type: 'numeric(18,4)' },
        { column_name: 'quantity_value', formatted_type: 'numeric(18,6)' },
        { column_name: 'happened_at', formatted_type: 'timestamp with time zone' },
        { column_name: 'settings_payload', formatted_type: 'jsonb' },
      ])

      const money = '12345678901234.5678'
      const quantity = '123456789012.123456'

      await client.query(
        `
          INSERT INTO phase03_data_type_probe (
            money_value,
            quantity_value,
            happened_at,
            settings_payload
          ) VALUES ($1, $2, $3, $4::jsonb)
        `,
        [
          money,
          quantity,
          '2026-09-11T18:30:00+03:00',
          JSON.stringify({ probe: true, scope: 'configuration' }),
        ],
      )

      const values = await client.query<{
        money_text: string
        quantity_text: string
        money_plus_minimum_unit: string
        quantity_plus_minimum_unit: string
        same_instant: boolean
        json_kind: string | null
      }>(`
        SELECT
          money_value::text AS money_text,
          quantity_value::text AS quantity_text,
          (money_value + numeric '0.0001')::text AS money_plus_minimum_unit,
          (quantity_value + numeric '0.000001')::text AS quantity_plus_minimum_unit,
          happened_at = timestamptz '2026-09-11 15:30:00+00' AS same_instant,
          jsonb_typeof(settings_payload) AS json_kind
        FROM phase03_data_type_probe
      `)

      assert.deepEqual(values.rows, [
        {
          money_text: money,
          quantity_text: quantity,
          money_plus_minimum_unit: '12345678901234.5679',
          quantity_plus_minimum_unit: '123456789012.123457',
          same_instant: true,
          json_kind: 'object',
        },
      ])

      await client.query('COMMIT')

      const cleanup = await client.query<{ relation: string | null }>(
        "SELECT to_regclass('pg_temp.phase03_data_type_probe')::text AS relation",
      )
      assert.equal(cleanup.rows[0]?.relation, null)
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
      await pool.end()
    }
  },
)
