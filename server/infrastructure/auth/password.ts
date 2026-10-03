import {
  randomBytes,
  scrypt as nodeScrypt,
  timingSafeEqual,
} from 'node:crypto'

const SCRYPT_VERSION = 1
const SCRYPT_N = 16_384
const SCRYPT_R = 8
const SCRYPT_P = 1
const SALT_BYTES = 16
const KEY_BYTES = 64
const MAX_PASSWORD_LENGTH = 512

function scryptAsync(
  password: string,
  salt: Buffer,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(
      password,
      salt,
      KEY_BYTES,
      {
        N: SCRYPT_N,
        r: SCRYPT_R,
        p: SCRYPT_P,
        maxmem: 64 * 1024 * 1024,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error)
          return
        }
        resolve(derivedKey)
      },
    )
  })
}

function validatePasswordInput(password: string): void {
  if (
    typeof password !== 'string' ||
    password.length === 0 ||
    password.length > MAX_PASSWORD_LENGTH
  ) {
    throw new TypeError(
      `Password must contain between 1 and ${MAX_PASSWORD_LENGTH} characters`,
    )
  }
}

export async function hashPassword(password: string): Promise<string> {
  validatePasswordInput(password)
  const salt = randomBytes(SALT_BYTES)
  const derivedKey = await scryptAsync(password, salt)

  return [
    'scrypt',
    `v=${SCRYPT_VERSION}`,
    `N=${SCRYPT_N},r=${SCRYPT_R},p=${SCRYPT_P}`,
    salt.toString('base64url'),
    derivedKey.toString('base64url'),
  ].join('$')
}

interface ParsedPasswordHash {
  salt: Buffer
  digest: Buffer
}

function parsePasswordHash(storedHash: string): ParsedPasswordHash | null {
  const parts = storedHash.split('$')
  if (parts.length !== 5) return null

  const [algorithm, version, parameters, saltText, digestText] = parts
  if (
    algorithm !== 'scrypt' ||
    version !== `v=${SCRYPT_VERSION}` ||
    parameters !== `N=${SCRYPT_N},r=${SCRYPT_R},p=${SCRYPT_P}` ||
    !saltText ||
    !digestText
  ) {
    return null
  }

  try {
    const salt = Buffer.from(saltText, 'base64url')
    const digest = Buffer.from(digestText, 'base64url')
    if (salt.length !== SALT_BYTES || digest.length !== KEY_BYTES) {
      return null
    }
    return { salt, digest }
  } catch {
    return null
  }
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  try {
    validatePasswordInput(password)
  } catch {
    return false
  }

  const parsed = parsePasswordHash(storedHash)
  if (!parsed) return false

  const candidate = await scryptAsync(password, parsed.salt)
  return timingSafeEqual(candidate, parsed.digest)
}

export async function consumePasswordVerificationCost(
  password: string,
): Promise<void> {
  const bounded =
    typeof password === 'string' && password.length <= MAX_PASSWORD_LENGTH
      ? password
      : ''
  await scryptAsync(
    bounded,
    Buffer.from('business-tech-erp', 'utf8').subarray(0, SALT_BYTES),
  )
}
