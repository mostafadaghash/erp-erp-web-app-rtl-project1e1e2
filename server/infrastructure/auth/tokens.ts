import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'

const ACCESS_TOKEN_VERSION = 'v1'
const SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface AccessTokenPayload {
  sessionId: string
  expiresAt: Date
}

export function createRefreshToken(): string {
  return randomBytes(32).toString('base64url')
}

export function isRefreshTokenShape(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value)
}

export function hashRefreshToken(refreshToken: string): string {
  return createHash('sha256').update(refreshToken, 'utf8').digest('hex')
}

function validateAccessTokenSecret(secret: string): void {
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new TypeError('Access token secret must contain at least 32 characters')
  }
}

function signatureFor(
  signingInput: string,
  refreshTokenHash: string,
  accessTokenSecret: string,
): string {
  validateAccessTokenSecret(accessTokenSecret)
  return createHmac('sha256', accessTokenSecret)
    .update(refreshTokenHash, 'utf8')
    .update('.', 'utf8')
    .update(signingInput, 'utf8')
    .digest('base64url')
}

export function readAccessTokenSessionId(token: string): string | null {
  const parts = token.split('.')
  if (parts.length !== 4) return null
  const [version, sessionId] = parts
  if (
    version !== ACCESS_TOKEN_VERSION ||
    !sessionId ||
    !SESSION_ID_PATTERN.test(sessionId)
  ) {
    return null
  }
  return sessionId
}

export function createAccessToken(
  sessionId: string,
  expiresAt: Date,
  refreshTokenHash: string,
  accessTokenSecret: string,
): string {
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw new TypeError('Access token sessionId must be a UUID v4')
  }
  if (
    !(expiresAt instanceof Date) ||
    !Number.isFinite(expiresAt.getTime())
  ) {
    throw new TypeError('Access token expiresAt must be a valid Date')
  }

  const expiresAtSeconds = Math.floor(expiresAt.getTime() / 1000)
  const signingInput =
    `${ACCESS_TOKEN_VERSION}.${sessionId}.${expiresAtSeconds}`
  return `${signingInput}.${signatureFor(
    signingInput,
    refreshTokenHash,
    accessTokenSecret,
  )}`
}

export function verifyAccessTokenSignature(
  token: string,
  refreshTokenHash: string,
  accessTokenSecret: string,
  now: Date = new Date(),
): AccessTokenPayload | null {
  const parts = token.split('.')
  if (parts.length !== 4) return null

  const [version, sessionId, expiresText, signature] = parts
  if (
    version !== ACCESS_TOKEN_VERSION ||
    !sessionId ||
    !SESSION_ID_PATTERN.test(sessionId) ||
    !expiresText ||
    !/^\d+$/.test(expiresText) ||
    !signature
  ) {
    return null
  }

  const expiresAtSeconds = Number(expiresText)
  if (!Number.isSafeInteger(expiresAtSeconds)) return null

  const expiresAt = new Date(expiresAtSeconds * 1000)
  if (expiresAt.getTime() <= now.getTime()) return null

  const signingInput = `${version}.${sessionId}.${expiresText}`
  const expected = signatureFor(
    signingInput,
    refreshTokenHash,
    accessTokenSecret,
  )

  const actualBuffer = Buffer.from(signature, 'utf8')
  const expectedBuffer = Buffer.from(expected, 'utf8')
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null
  }

  return { sessionId, expiresAt }
}
