import type { FastifyInstance } from 'fastify'

const healthResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'service', 'requestId'],
  properties: {
    status: { type: 'string', const: 'ok' },
    service: { type: 'string', const: 'business-tech-erp-backend' },
    requestId: { type: 'string' },
  },
} as const

const readinessResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'checks', 'requestId'],
  properties: {
    status: { type: 'string', enum: ['ready', 'not_ready'] },
    checks: {
      type: 'object',
      additionalProperties: false,
      required: ['database'],
      properties: {
        database: { type: 'string', enum: ['up', 'down'] },
      },
    },
    requestId: { type: 'string' },
  },
} as const

export async function registerOperationalRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/health',
    {
      schema: {
        response: {
          200: healthResponseSchema,
        },
      },
    },
    async (request) => ({
      status: 'ok' as const,
      service: 'business-tech-erp-backend' as const,
      requestId: request.id,
    }),
  )

  app.get(
    '/ready',
    {
      schema: {
        response: {
          200: readinessResponseSchema,
          503: readinessResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        await app.database.query('SELECT 1')
        return {
          status: 'ready' as const,
          checks: { database: 'up' as const },
          requestId: request.id,
        }
      } catch (error) {
        request.log.warn({ err: error }, 'readiness database probe failed')
        return reply.code(503).send({
          status: 'not_ready' as const,
          checks: { database: 'down' as const },
          requestId: request.id,
        })
      }
    },
  )
}
