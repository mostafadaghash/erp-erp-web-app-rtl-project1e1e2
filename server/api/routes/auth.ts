import type { FastifyInstance, FastifyRequest } from 'fastify'

import { ApiError } from '../errors/api-error.js'
import {
  AUTH_ERROR_CODES,
  AuthenticationError,
  AuthenticationService,
} from '../../infrastructure/auth/authentication-service.js'

export const REFRESH_COOKIE_NAME = 'erp_refresh_token'

const userSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'name',
    'username',
    'email',
    'roleId',
    'defaultBranchId',
    'preferredLanguage',
  ],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    username: { type: 'string' },
    email: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    roleId: { type: 'string' },
    defaultBranchId: { type: 'string' },
    preferredLanguage: { type: 'string' },
  },
} as const

const authResultSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['accessToken', 'accessTokenExpiresAt', 'user'],
  properties: {
    accessToken: { type: 'string' },
    accessTokenExpiresAt: { type: 'string' },
    user: userSchema,
  },
} as const

function cookieSecure(app: FastifyInstance): boolean {
  return app.config.ERP_AUTH_TRANSPORT_MODE === 'https'
}

export function buildRefreshCookie(
  refreshToken: string,
  expiresAt: Date,
  secure: boolean,
  now: Date = new Date(),
): string {
  const maxAge = Math.max(
    0,
    Math.floor((expiresAt.getTime() - now.getTime()) / 1000),
  )
  const attributes = [
    `${REFRESH_COOKIE_NAME}=${encodeURIComponent(refreshToken)}`,
    'Path=/auth',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAge}`,
    `Expires=${expiresAt.toUTCString()}`,
  ]
  if (secure) attributes.push('Secure')
  return attributes.join('; ')
}

export function buildClearRefreshCookie(secure: boolean): string {
  const attributes = [
    `${REFRESH_COOKIE_NAME}=`,
    'Path=/auth',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ]
  if (secure) attributes.push('Secure')
  return attributes.join('; ')
}

export function readRefreshCookie(
  cookieHeader: string | undefined,
): string | null {
  if (!cookieHeader) return null

  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim()
    const separator = trimmed.indexOf('=')
    if (separator <= 0) continue

    const name = trimmed.slice(0, separator)
    if (name !== REFRESH_COOKIE_NAME) continue

    const rawValue = trimmed.slice(separator + 1)
    try {
      return decodeURIComponent(rawValue)
    } catch {
      return null
    }
  }

  return null
}

function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization
  if (!header) return null

  const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(header)
  return match?.[1] ?? null
}

function authenticationApiError(error: AuthenticationError): ApiError {
  switch (error.code) {
    case AUTH_ERROR_CODES.INVALID_CREDENTIALS:
      return new ApiError({
        errorCode: error.code,
        statusCode: 401,
      })
    case AUTH_ERROR_CODES.RATE_LIMITED:
      return new ApiError({
        errorCode: error.code,
        statusCode: 429,
        errorParams: {
          retryAfterSeconds: error.retryAfterSeconds ?? 1,
        },
      })
    case AUTH_ERROR_CODES.SESSION_INVALID:
    case AUTH_ERROR_CODES.SESSION_EXPIRED:
      return new ApiError({
        errorCode: error.code,
        statusCode: 401,
      })
    case AUTH_ERROR_CODES.ACCOUNT_DISABLED:
      return new ApiError({
        errorCode: error.code,
        statusCode: 403,
      })
  }
}

async function translateAuthError<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw authenticationApiError(error)
    }
    throw error
  }
}

export async function registerAuthenticationRoutes(
  app: FastifyInstance,
): Promise<void> {
  const service = new AuthenticationService(app.database, {
    accessTokenSecret: app.config.ERP_AUTH_ACCESS_TOKEN_SECRET,
    accessTokenTtlSeconds: app.config.ERP_AUTH_ACCESS_TOKEN_TTL_SECONDS,
    sessionTtlSeconds: app.config.ERP_AUTH_SESSION_TTL_SECONDS,
    loginMaxAttempts: app.config.ERP_AUTH_LOGIN_MAX_ATTEMPTS,
    loginWindowSeconds: app.config.ERP_AUTH_LOGIN_WINDOW_SECONDS,
  })

  app.post(
    '/auth/login',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['identifier', 'password'],
          properties: {
            identifier: { type: 'string', minLength: 1, maxLength: 320 },
            password: { type: 'string', minLength: 1, maxLength: 512 },
            deviceName: {
              anyOf: [
                { type: 'string', maxLength: 120 },
                { type: 'null' },
              ],
            },
          },
        },
        response: {
          200: authResultSchema,
        },
      },
    },
    async (request, reply) => {
      const body = request.body as {
        identifier: string
        password: string
        deviceName?: string | null
      }

      const result = await translateAuthError(() =>
        service.login({
          identifier: body.identifier,
          password: body.password,
          deviceName: body.deviceName,
          ipAddress: request.ip,
        }),
      )

      reply
        .header('cache-control', 'no-store')
        .header('pragma', 'no-cache')
        .header(
          'set-cookie',
          buildRefreshCookie(
            result.refreshToken,
            result.refreshTokenExpiresAt,
            cookieSecure(app),
          ),
        )

      return {
        accessToken: result.accessToken,
        accessTokenExpiresAt: result.accessTokenExpiresAt.toISOString(),
        user: result.user,
      }
    },
  )

  app.post(
    '/auth/refresh',
    {
      schema: {
        response: {
          200: authResultSchema,
        },
      },
    },
    async (request, reply) => {
      const refreshToken = readRefreshCookie(request.headers.cookie)
      if (!refreshToken) {
        throw new ApiError({
          errorCode: AUTH_ERROR_CODES.SESSION_INVALID,
          statusCode: 401,
        })
      }

      const result = await translateAuthError(() =>
        service.refresh(refreshToken),
      )

      reply
        .header('cache-control', 'no-store')
        .header('pragma', 'no-cache')
        .header(
          'set-cookie',
          buildRefreshCookie(
            result.refreshToken,
            result.refreshTokenExpiresAt,
            cookieSecure(app),
          ),
        )

      return {
        accessToken: result.accessToken,
        accessTokenExpiresAt: result.accessTokenExpiresAt.toISOString(),
        user: result.user,
      }
    },
  )

  app.post('/auth/logout', async (request, reply) => {
    const refreshToken = readRefreshCookie(request.headers.cookie)
    await service.logout(refreshToken)

    reply
      .header('cache-control', 'no-store')
      .header('set-cookie', buildClearRefreshCookie(cookieSecure(app)))

    return { ok: true }
  })

  app.get(
    '/auth/me',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['user'],
            properties: { user: userSchema },
          },
        },
      },
    },
    async (request, reply) => {
      const accessToken = bearerToken(request)
      if (!accessToken) {
        throw new ApiError({
          errorCode: AUTH_ERROR_CODES.SESSION_INVALID,
          statusCode: 401,
        })
      }

      const user = await translateAuthError(() =>
        service.authenticateAccessToken(accessToken),
      )

      reply
        .header('cache-control', 'no-store')
        .header('pragma', 'no-cache')

      return { user }
    },
  )
}
