import type { LoggerOptions } from 'pino'

import type { LogLevel } from '../config/config.js'

const allowedLevels = new Set<LogLevel>([
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
])

export function createLoggerOptions(env: NodeJS.ProcessEnv): LoggerOptions {
  const requestedLevel = env.ERP_LOG_LEVEL as LogLevel | undefined
  const level = requestedLevel && allowedLevels.has(requestedLevel) ? requestedLevel : 'info'

  return {
    level,
    base: {
      service: 'business-tech-erp-backend',
    },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers.set-cookie',
        'config.ERP_DATABASE_URL',
        'ERP_DATABASE_URL',
      ],
      censor: '[REDACTED]',
    },
  }
}
