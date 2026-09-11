export type NodeEnvironment = 'development' | 'test' | 'production'
export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent'

export interface AppConfig {
  NODE_ENV: NodeEnvironment
  ERP_BACKEND_HOST: string
  ERP_BACKEND_PORT: number
  ERP_DATABASE_URL: string
  ERP_LOG_LEVEL: LogLevel
  ERP_DB_POOL_MAX: number
  ERP_DB_IDLE_TIMEOUT_MS: number
  ERP_DB_CONNECTION_TIMEOUT_MS: number
  ERP_SHUTDOWN_TIMEOUT_MS: number
}

export const appConfigSchema = {
  type: 'object',
  required: ['ERP_DATABASE_URL'],
  properties: {
    NODE_ENV: {
      type: 'string',
      enum: ['development', 'test', 'production'],
      default: 'development',
    },
    ERP_BACKEND_HOST: {
      type: 'string',
      minLength: 1,
      default: '127.0.0.1',
    },
    ERP_BACKEND_PORT: {
      type: 'integer',
      minimum: 1,
      maximum: 65535,
      default: 8787,
    },
    ERP_DATABASE_URL: {
      type: 'string',
      minLength: 1,
    },
    ERP_LOG_LEVEL: {
      type: 'string',
      enum: ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'],
      default: 'info',
    },
    ERP_DB_POOL_MAX: {
      type: 'integer',
      minimum: 1,
      maximum: 50,
      default: 10,
    },
    ERP_DB_IDLE_TIMEOUT_MS: {
      type: 'integer',
      minimum: 1000,
      maximum: 300000,
      default: 30000,
    },
    ERP_DB_CONNECTION_TIMEOUT_MS: {
      type: 'integer',
      minimum: 100,
      maximum: 60000,
      default: 5000,
    },
    ERP_SHUTDOWN_TIMEOUT_MS: {
      type: 'integer',
      minimum: 1000,
      maximum: 60000,
      default: 10000,
    },
  },
} as const
