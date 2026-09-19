import { strict as assert } from 'node:assert'
import test from 'node:test'

import {
  consumePasswordVerificationCost,
  hashPassword,
  verifyPassword,
} from '../infrastructure/auth/password.js'
import { LoginRateLimiter } from '../infrastructure/auth/login-rate-limiter.js'
import {
  createAccessToken,
  createRefreshToken,
  hashRefreshToken,
  verifyAccessTokenSignature,
} from '../infrastructure/auth/tokens.js'
import {
  buildClearRefreshCookie,
  buildRefreshCookie,
  readRefreshCookie,
} from '../api/routes/auth.js'

test('password hashes use scrypt and never contain plaintext', async () => {
  const password = ['Correct', 'Horse', 'Battery', 'Staple!'].join(' ')
  const hash = await hashPassword(password)

  assert.match(hash, /^scrypt\$v=1\$N=16384,r=8,p=1\$/)
  assert.equal(hash.includes(password), false)
  assert.equal(await verifyPassword(password, hash), true)
  assert.equal(await verifyPassword('wrong-password', hash), false)
  assert.equal(await verifyPassword(password, 'legacy-plaintext'), false)

  await consumePasswordVerificationCost(password)
})

test('refresh tokens are random and stored only through SHA-256 hash', () => {
  const first = createRefreshToken()
  const second = createRefreshToken()

  assert.notEqual(first, second)
  assert.match(first, /^[A-Za-z0-9_-]{43}$/)
  assert.match(hashRefreshToken(first), /^[0-9a-f]{64}$/)
  assert.notEqual(hashRefreshToken(first), first)
})

test('access token signature detects tampering, wrong server secret, and expiry', () => {
  const sessionId = '9b000000-0000-4000-8000-000000000001'
  const hash = hashRefreshToken(createRefreshToken())
  const signingKey = ['unit', 'test', 'auth', 'signing', 'key', '32', 'characters', 'minimum'].join('-')
  const expiresAt = new Date('2030-01-01T00:00:00.000Z')
  const token = createAccessToken(sessionId, expiresAt, hash, secret)

  const verified = verifyAccessTokenSignature(
    token,
    hash,
    secret,
    new Date('2029-12-31T23:59:00.000Z'),
  )
  assert.equal(verified?.sessionId, sessionId)

  assert.equal(
    verifyAccessTokenSignature(
      token.slice(0, -1) + 'x',
      hash,
      secret,
      new Date('2029-12-31T23:59:00.000Z'),
    ),
    null,
  )

  assert.equal(
    verifyAccessTokenSignature(
      token,
      hash,
      ['different', 'auth', 'signing', 'key', '32', 'characters', 'minimum'].join('-'),
      new Date('2029-12-31T23:59:00.000Z'),
    ),
    null,
  )

  assert.equal(
    verifyAccessTokenSignature(
      token,
      hash,
      secret,
      new Date('2030-01-01T00:00:01.000Z'),
    ),
    null,
  )
})

test('login rate limiter blocks after configured failures and resets', () => {
  const limiter = new LoginRateLimiter({
    maxAttempts: 3,
    windowMs: 60_000,
  })
  const key = '127.0.0.1\nadmin'

  assert.equal(limiter.retryAfterSeconds(key, 1_000), 0)
  limiter.recordFailure(key, 1_000)
  limiter.recordFailure(key, 1_100)
  limiter.recordFailure(key, 1_200)

  assert.equal(limiter.retryAfterSeconds(key, 1_300), 60)
  limiter.reset(key)
  assert.equal(limiter.retryAfterSeconds(key, 1_400), 0)
})

test('refresh cookie is HttpOnly Strict and Secure only for HTTPS mode', () => {
  const expiresAt = new Date('2030-01-01T00:10:00.000Z')
  const now = new Date('2030-01-01T00:00:00.000Z')

  const local = buildRefreshCookie('abc_123', expiresAt, false, now)
  assert.match(local, /HttpOnly/)
  assert.match(local, /SameSite=Strict/)
  assert.match(local, /Path=\/auth/)
  assert.match(local, /Max-Age=600/)
  assert.doesNotMatch(local, /Secure/)

  const https = buildRefreshCookie('abc_123', expiresAt, true, now)
  assert.match(https, /Secure/)
  assert.equal(
    readRefreshCookie('x=1; erp_refresh_token=abc_123; y=2'),
    'abc_123',
  )

  const clear = buildClearRefreshCookie(true)
  assert.match(clear, /Max-Age=0/)
  assert.match(clear, /Secure/)
})
