import { randomUUID } from 'node:crypto'

import fastifyEnv from '@fastify/env'
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify'

import {
  handleNotFoundRequest,
  handleRequestError,
} from './api/errors/error-handler.js'
import { registerAuthenticationRoutes } from './api/routes/auth.js'
import { registerOperationalRoutes } from './api/routes/health.js'
import { appConfigSchema, type AppConfig } from './infrastructure/config/config.js'
import {
  createPostgresDatabase,
  type TransactionalDatabaseConnection,
} from './infrastructure/database/database.js'
import { createLoggerOptions } from './infrastructure/logging/logger.js'

export interface BuildServerOptions {
  env?: NodeJS.ProcessEnv
  databaseFactory?: (
    config: AppConfig,
    logger: FastifyBaseLogger,
  ) => TransactionalDatabaseConnection
}

export function buildServer(options: BuildServerOptions = {}): FastifyInstance {
  const env = options.env ?? process.env
  const app = Fastify({
    logger: createLoggerOptions(env),
    genReqId: () => randomUUID(),
    trustProxy: false,
  })

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id)
  })

  app.setErrorHandler(handleRequestError)
  app.setNotFoundHandler(handleNotFoundRequest)

  app.register(fastifyEnv, {
    confKey: 'config',
    schema: appConfigSchema,
    data: env,
    dotenv: false,
  })

  app.register(async (instance) => {
    const database =
      options.databaseFactory?.(instance.config, instance.log) ??
      createPostgresDatabase(instance.config, instance.log)

    instance.decorate('database', database)

    instance.addHook('onClose', async () => {
      await database.close()
    })

    await registerOperationalRoutes(instance)
    await registerAuthenticationRoutes(instance)
  })

  return app
}
