import type { AppConfig } from '../infrastructure/config/config.js'
import type { TransactionalDatabaseConnection } from '../infrastructure/database/database.js'

declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig
    database: TransactionalDatabaseConnection
  }
}

export {}
