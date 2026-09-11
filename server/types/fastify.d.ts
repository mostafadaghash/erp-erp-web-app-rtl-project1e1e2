import type { AppConfig } from '../infrastructure/config/config.js'
import type { DatabaseConnection } from '../infrastructure/database/database.js'

declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig
    database: DatabaseConnection
  }
}

export {}
