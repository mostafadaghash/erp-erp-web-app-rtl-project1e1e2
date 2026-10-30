export type NodeEnvironment = 'development' | 'test' | 'production'
export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent'
export type AuthTransportMode = 'local-http' | 'https'

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
  ERP_AUTH_TRANSPORT_MODE: AuthTransportMode
  ERP_AUTH_ACCESS_TOKEN_SECRET: string
  ERP_AUTH_ACCESS_TOKEN_TTL_SECONDS: number
  ERP_AUTH_SESSION_TTL_SECONDS: number
  ERP_AUTH_LOGIN_MAX_ATTEMPTS: number
  ERP_AUTH_LOGIN_WINDOW_SECONDS: number
}

export const appConfigSchema = {
  type: 'object',
  required: ['ERP_DATABASE_URL', 'ERP_AUTH_ACCESS_TOKEN_SECRET'],
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
    ERP_AUTH_TRANSPORT_MODE: {
      type: 'string',
      enum: ['local-http', 'https'],
      default: 'local-http',
    },
    ERP_AUTH_ACCESS_TOKEN_SECRET: {
      type: 'string',
      minLength: 32,
    },
    ERP_AUTH_ACCESS_TOKEN_TTL_SECONDS: {
      type: 'integer',
      minimum: 60,
      maximum: 3600,
      default: 900,
    },
    ERP_AUTH_SESSION_TTL_SECONDS: {
      type: 'integer',
      minimum: 900,
      maximum: 2592000,
      default: 604800,
    },
    ERP_AUTH_LOGIN_MAX_ATTEMPTS: {
      type: 'integer',
      minimum: 1,
      maximum: 20,
      default: 5,
    },
    ERP_AUTH_LOGIN_WINDOW_SECONDS: {
      type: 'integer',
      minimum: 60,
      maximum: 3600,
      default: 300,
    },
  },
} as const
