import { Pool } from 'pg'
import type { FastifyBaseLogger } from 'fastify'

import type { AppConfig } from '../config/config.js'

export interface DatabaseConnection {
  query(sql: string): Promise<void>
  close(): Promise<void>
}

export function createPostgresDatabase(
  config: AppConfig,
  logger: FastifyBaseLogger,
): DatabaseConnection {
  const pool = new Pool({
    connectionString: config.ERP_DATABASE_URL,
    max: config.ERP_DB_POOL_MAX,
    idleTimeoutMillis: config.ERP_DB_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: config.ERP_DB_CONNECTION_TIMEOUT_MS,
    application_name: 'business-tech-erp-backend',
  })

  pool.on('error', (error) => {
    logger.error({ err: error }, 'unexpected idle PostgreSQL client error')
  })

  return {
    async query(sql: string): Promise<void> {
      await pool.query(sql)
    },
    async close(): Promise<void> {
      await pool.end()
    },
  }
}
