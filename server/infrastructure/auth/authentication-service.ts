import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'

import type {
  TransactionOptions,
  TransactionWork,
} from '../database/transaction.js'
import {
  consumePasswordVerificationCost,
  verifyPassword,
} from './password.js'
import { LoginRateLimiter } from './login-rate-limiter.js'
import {
  createAccessToken,
  createRefreshToken,
  hashRefreshToken,
  isRefreshTokenShape,
  readAccessTokenSessionId,
  verifyAccessTokenSignature,
} from './tokens.js'

export const AUTH_ERROR_CODES = {
  INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  RATE_LIMITED: 'AUTH_RATE_LIMITED',
  SESSION_INVALID: 'AUTH_SESSION_INVALID',
  SESSION_EXPIRED: 'AUTH_SESSION_EXPIRED',
  ACCOUNT_DISABLED: 'AUTH_ACCOUNT_DISABLED',
} as const

export type AuthenticationErrorCode =
  (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES]

export class AuthenticationError extends Error {
  constructor(
    readonly code: AuthenticationErrorCode,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(code)
    this.name = 'AuthenticationError'
  }
}

export interface AuthTransactionRunner {
  transaction<T>(
    work: TransactionWork<T>,
    options?: TransactionOptions,
  ): Promise<T>
}

export interface AuthenticationOptions {
  accessTokenSecret: string
  accessTokenTtlSeconds: number
  sessionTtlSeconds: number
  loginMaxAttempts: number
  loginWindowSeconds: number
}

export interface AuthenticatedUser {
  id: string
  name: string
  username: string
  email: string | null
  roleId: string
  defaultBranchId: string
  preferredLanguage: string
}

export interface LoginInput {
  identifier: string
  password: string
  deviceName?: string | null
  ipAddress: string
}

export interface AuthenticationResult {
  accessToken: string
  accessTokenExpiresAt: Date
  refreshToken: string
  refreshTokenExpiresAt: Date
  user: AuthenticatedUser
}

interface UserRow {
  id: string
  name: string
  username: string
  email: string | null
  password_hash: string
  role_id: string
  default_branch_id: string
  preferred_language: string
  is_active: boolean
}

interface SessionUserRow extends UserRow {
  session_id: string
  refresh_token_hash: string
  expires_at: Date
  revoked_at: Date | null
  server_now: Date
}

interface CreatedSessionRow {
  id: string
  created_at: Date
  expires_at: Date
}

function requirePositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`${name} must be a positive integer`)
  }
}

function normalizeIdentifier(identifier: string): string {
  if (
    typeof identifier !== 'string' ||
    identifier.trim().length === 0 ||
    identifier.length > 320
  ) {
    throw new TypeError('Login identifier is invalid')
  }
  return identifier.trim().toLowerCase()
}

function normalizeDeviceName(
  deviceName: string | null | undefined,
): string | null {
  if (deviceName === null || deviceName === undefined) return null
  const value = deviceName.trim()
  if (value.length === 0) return null
  if (value.length > 120) {
    throw new TypeError('Device name is too long')
  }
  return value
}

function userFromRow(row: UserRow): AuthenticatedUser {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    email: row.email,
    roleId: row.role_id,
    defaultBranchId: row.default_branch_id,
    preferredLanguage: row.preferred_language,
  }
}

function accessExpiry(
  createdAt: Date,
  sessionExpiresAt: Date,
  ttlSeconds: number,
): Date {
  const desired = createdAt.getTime() + ttlSeconds * 1000
  return new Date(Math.min(desired, sessionExpiresAt.getTime()))
}

function loginRateKey(identifier: string, ipAddress: string): string {
  return `${ipAddress}\n${identifier}`
}

export class AuthenticationService {
  private readonly limiter: LoginRateLimiter

  constructor(
    private readonly database: AuthTransactionRunner,
    private readonly options: AuthenticationOptions,
  ) {
    if (
      typeof options.accessTokenSecret !== 'string' ||
      options.accessTokenSecret.length < 32
    ) {
      throw new TypeError(
        'Authentication accessTokenSecret must contain at least 32 characters',
      )
    }
    requirePositiveInteger(
      'accessTokenTtlSeconds',
      options.accessTokenTtlSeconds,
    )
    requirePositiveInteger('sessionTtlSeconds', options.sessionTtlSeconds)
    requirePositiveInteger('loginMaxAttempts', options.loginMaxAttempts)
    requirePositiveInteger('loginWindowSeconds', options.loginWindowSeconds)

    this.limiter = new LoginRateLimiter({
      maxAttempts: options.loginMaxAttempts,
      windowMs: options.loginWindowSeconds * 1000,
    })
  }

  private async findUser(identifier: string): Promise<UserRow | null> {
    return this.database.transaction(async (client) => {
      const byEmail = identifier.includes('@')
      const result = await client.query<UserRow>(
        byEmail
          ? `SELECT
               id,name,username,email,password_hash,role_id,
               default_branch_id,preferred_language,is_active
             FROM users
             WHERE lower(email)=lower($1)
             LIMIT 1`
          : `SELECT
               id,name,username,email,password_hash,role_id,
               default_branch_id,preferred_language,is_active
             FROM users
             WHERE lower(username)=lower($1)
             LIMIT 1`,
        [identifier],
      )
      return result.rows[0] ?? null
    })
  }

  async login(input: LoginInput): Promise<AuthenticationResult> {
    const identifier = normalizeIdentifier(input.identifier)
    const deviceName = normalizeDeviceName(input.deviceName)
    const key = loginRateKey(identifier, input.ipAddress)
    const retryAfterSeconds = this.limiter.retryAfterSeconds(key)

    if (retryAfterSeconds > 0) {
      throw new AuthenticationError(
        AUTH_ERROR_CODES.RATE_LIMITED,
        retryAfterSeconds,
      )
    }

    const user = await this.findUser(identifier)
    if (!user) {
      await consumePasswordVerificationCost(input.password)
      this.limiter.recordFailure(key)
      throw new AuthenticationError(AUTH_ERROR_CODES.INVALID_CREDENTIALS)
    }

    const passwordMatches = await verifyPassword(
      input.password,
      user.password_hash,
    )
    if (!passwordMatches || !user.is_active) {
      this.limiter.recordFailure(key)
      throw new AuthenticationError(AUTH_ERROR_CODES.INVALID_CREDENTIALS)
    }

    const refreshToken = createRefreshToken()
    const refreshTokenHash = hashRefreshToken(refreshToken)
    const sessionId = randomUUID()

    const created = await this.database.transaction(async (client) => {
      const locked = await client.query<UserRow>(
        `SELECT
           id,name,username,email,password_hash,role_id,
           default_branch_id,preferred_language,is_active
         FROM users
         WHERE id=$1
         FOR UPDATE`,
        [user.id],
      )
      const current = locked.rows[0]
      if (
        !current ||
        !current.is_active ||
        current.password_hash !== user.password_hash
      ) {
        return null
      }

      const session = await client.query<CreatedSessionRow>(
        `INSERT INTO auth_sessions
          (id,user_id,refresh_token_hash,device_name,ip_address,
           expires_at,revoked_at,created_at)
         VALUES (
           $1,$2,$3,$4,$5,
           clock_timestamp() + ($6::integer * interval '1 second'),
           NULL,clock_timestamp()
         )
         RETURNING id,created_at,expires_at`,
        [
          sessionId,
          current.id,
          refreshTokenHash,
          deviceName,
          input.ipAddress,
          this.options.sessionTtlSeconds,
        ],
      )

      await client.query(
        `UPDATE users
            SET last_login_at=clock_timestamp(),
                updated_at=clock_timestamp()
          WHERE id=$1`,
        [current.id],
      )

      const sessionRow = session.rows[0]
      if (!sessionRow) {
        throw new Error('Authentication session insert returned no row')
      }
      return { user: current, session: sessionRow }
    })

    if (!created) {
      this.limiter.recordFailure(key)
      throw new AuthenticationError(AUTH_ERROR_CODES.INVALID_CREDENTIALS)
    }

    this.limiter.reset(key)
    const accessTokenExpiresAt = accessExpiry(
      created.session.created_at,
      created.session.expires_at,
      this.options.accessTokenTtlSeconds,
    )

    return {
      accessToken: createAccessToken(
        created.session.id,
        accessTokenExpiresAt,
        refreshTokenHash,
        this.options.accessTokenSecret,
      ),
      accessTokenExpiresAt,
      refreshToken,
      refreshTokenExpiresAt: created.session.expires_at,
      user: userFromRow(created.user),
    }
  }

  async refresh(refreshToken: string): Promise<AuthenticationResult> {
    if (!isRefreshTokenShape(refreshToken)) {
      throw new AuthenticationError(AUTH_ERROR_CODES.SESSION_INVALID)
    }

    const currentHash = hashRefreshToken(refreshToken)
    const nextRefreshToken = createRefreshToken()
    const nextHash = hashRefreshToken(nextRefreshToken)

    const refreshed = await this.database.transaction(async (client) => {
      const result = await client.query<SessionUserRow>(
        `SELECT
           s.id AS session_id,
           s.refresh_token_hash,
           s.expires_at,
           s.revoked_at,
           clock_timestamp() AS server_now,
           u.id,u.name,u.username,u.email,u.password_hash,u.role_id,
           u.default_branch_id,u.preferred_language,u.is_active
         FROM auth_sessions s
         JOIN users u ON u.id=s.user_id
         WHERE s.refresh_token_hash=$1
         FOR UPDATE OF s,u`,
        [currentHash],
      )
      const row = result.rows[0]
      if (!row || row.revoked_at) {
        return { state: 'INVALID' as const }
      }

      if (row.expires_at.getTime() <= row.server_now.getTime()) {
        await client.query(
          `UPDATE auth_sessions
              SET revoked_at=COALESCE(revoked_at,clock_timestamp())
            WHERE id=$1`,
          [row.session_id],
        )
        return { state: 'EXPIRED' as const }
      }

      if (!row.is_active) {
        await client.query(
          `UPDATE auth_sessions
              SET revoked_at=COALESCE(revoked_at,clock_timestamp())
            WHERE id=$1`,
          [row.session_id],
        )
        return { state: 'DISABLED' as const }
      }

      await client.query(
        `UPDATE auth_sessions
            SET refresh_token_hash=$2
          WHERE id=$1`,
        [row.session_id, nextHash],
      )

      return { state: 'OK' as const, row }
    })

    if (refreshed.state === 'INVALID') {
      throw new AuthenticationError(AUTH_ERROR_CODES.SESSION_INVALID)
    }
    if (refreshed.state === 'EXPIRED') {
      throw new AuthenticationError(AUTH_ERROR_CODES.SESSION_EXPIRED)
    }
    if (refreshed.state === 'DISABLED') {
      throw new AuthenticationError(AUTH_ERROR_CODES.ACCOUNT_DISABLED)
    }

    const accessTokenExpiresAt = accessExpiry(
      refreshed.row.server_now,
      refreshed.row.expires_at,
      this.options.accessTokenTtlSeconds,
    )

    return {
      accessToken: createAccessToken(
        refreshed.row.session_id,
        accessTokenExpiresAt,
        nextHash,
        this.options.accessTokenSecret,
      ),
      accessTokenExpiresAt,
      refreshToken: nextRefreshToken,
      refreshTokenExpiresAt: refreshed.row.expires_at,
      user: userFromRow(refreshed.row),
    }
  }

  async authenticateAccessToken(
    accessToken: string,
  ): Promise<AuthenticatedUser> {
    const sessionId = readAccessTokenSessionId(accessToken)
    if (!sessionId) {
      throw new AuthenticationError(AUTH_ERROR_CODES.SESSION_INVALID)
    }

    const state = await this.database.transaction(async (client) => {
      const result = await client.query<SessionUserRow>(
        `SELECT
           s.id AS session_id,
           s.refresh_token_hash,
           s.expires_at,
           s.revoked_at,
           clock_timestamp() AS server_now,
           u.id,u.name,u.username,u.email,u.password_hash,u.role_id,
           u.default_branch_id,u.preferred_language,u.is_active
         FROM auth_sessions s
         JOIN users u ON u.id=s.user_id
         WHERE s.id=$1
         FOR UPDATE OF s,u`,
        [sessionId],
      )
      const row = result.rows[0]
      if (!row || row.revoked_at) {
        return { state: 'INVALID' as const }
      }

      if (row.expires_at.getTime() <= row.server_now.getTime()) {
        await client.query(
          `UPDATE auth_sessions
              SET revoked_at=COALESCE(revoked_at,clock_timestamp())
            WHERE id=$1`,
          [row.session_id],
        )
        return { state: 'EXPIRED' as const }
      }

      if (!row.is_active) {
        await client.query(
          `UPDATE auth_sessions
              SET revoked_at=COALESCE(revoked_at,clock_timestamp())
            WHERE id=$1`,
          [row.session_id],
        )
        return { state: 'DISABLED' as const }
      }

      const payload = verifyAccessTokenSignature(
        accessToken,
        row.refresh_token_hash,
        this.options.accessTokenSecret,
        row.server_now,
      )
      if (
        !payload ||
        payload.sessionId !== row.session_id ||
        payload.expiresAt.getTime() > row.expires_at.getTime()
      ) {
        return { state: 'INVALID' as const }
      }

      return { state: 'OK' as const, row }
    })

    if (state.state === 'INVALID') {
      throw new AuthenticationError(AUTH_ERROR_CODES.SESSION_INVALID)
    }
    if (state.state === 'EXPIRED') {
      throw new AuthenticationError(AUTH_ERROR_CODES.SESSION_EXPIRED)
    }
    if (state.state === 'DISABLED') {
      throw new AuthenticationError(AUTH_ERROR_CODES.ACCOUNT_DISABLED)
    }

    return userFromRow(state.row)
  }

  async logout(refreshToken: string | null): Promise<void> {
    if (!refreshToken || !isRefreshTokenShape(refreshToken)) return
    const hash = hashRefreshToken(refreshToken)

    await this.database.transaction(async (client) => {
      await client.query(
        `UPDATE auth_sessions
            SET revoked_at=COALESCE(revoked_at,clock_timestamp())
          WHERE refresh_token_hash=$1`,
        [hash],
      )
    })
  }
}
