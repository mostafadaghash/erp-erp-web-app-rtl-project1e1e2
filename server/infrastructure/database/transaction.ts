import type { Pool, PoolClient } from 'pg'

export const POSTGRES_DEADLOCK_CODE = '40P01'
export const POSTGRES_SERIALIZATION_FAILURE_CODE = '40001'
export const DEFAULT_TRANSACTION_MAX_ATTEMPTS = 3
export const MAX_TRANSACTION_ATTEMPTS = 3

const RETRYABLE_TRANSACTION_CODES = new Set([
  POSTGRES_DEADLOCK_CODE,
  POSTGRES_SERIALIZATION_FAILURE_CODE,
])

export interface TransactionContext {
  requestId?: string
  userId?: string
}

export interface TransactionOptions {
  context?: TransactionContext
  maxAttempts?: number
}

export type TransactionWork<T> = (client: PoolClient) => Promise<T>

type TransactionPool = Pick<Pool, 'connect'>

function validateMaxAttempts(maxAttempts: number): void {
  if (
    !Number.isInteger(maxAttempts) ||
    maxAttempts < 1 ||
    maxAttempts > MAX_TRANSACTION_ATTEMPTS
  ) {
    throw new RangeError(
      `Transaction maxAttempts must be an integer between 1 and ${MAX_TRANSACTION_ATTEMPTS}`,
    )
  }
}

function validateContextValue(name: string, value: string | undefined): void {
  if (value !== undefined && value.length === 0) {
    throw new TypeError(`Transaction context ${name} cannot be empty`)
  }
}

function postgresErrorCode(error: unknown): string | undefined {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code
  }

  return undefined
}

export function isRetryableTransactionError(error: unknown): boolean {
  const code = postgresErrorCode(error)
  return code !== undefined && RETRYABLE_TRANSACTION_CODES.has(code)
}

async function applyTransactionContext(
  client: PoolClient,
  context: TransactionContext | undefined,
): Promise<void> {
  if (!context) return

  validateContextValue('requestId', context.requestId)
  validateContextValue('userId', context.userId)

  if (context.requestId !== undefined) {
    await client.query(
      "SELECT set_config('app.request_id', $1, true)",
      [context.requestId],
    )
  }

  if (context.userId !== undefined) {
    await client.query(
      "SELECT set_config('app.user_id', $1, true)",
      [context.userId],
    )
  }
}

export async function withTransaction<T>(
  pool: TransactionPool,
  work: TransactionWork<T>,
  options: TransactionOptions = {},
): Promise<T> {
  const maxAttempts =
    options.maxAttempts ?? DEFAULT_TRANSACTION_MAX_ATTEMPTS

  validateMaxAttempts(maxAttempts)
  validateContextValue('requestId', options.context?.requestId)
  validateContextValue('userId', options.context?.userId)

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const client = await pool.connect()
    let destroyClient = false
    let shouldRetry = false
    let failure: unknown

    try {
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED')
      await applyTransactionContext(client, options.context)

      const result = await work(client)

      await client.query('COMMIT')
      return result
    } catch (error) {
      failure = error

      try {
        await client.query('ROLLBACK')
      } catch {
        destroyClient = true
      }

      shouldRetry =
        !destroyClient &&
        attempt < maxAttempts &&
        isRetryableTransactionError(error)
    } finally {
      client.release(destroyClient)
    }

    if (shouldRetry) continue
    throw failure
  }

  throw new Error('Transaction retry loop exhausted unexpectedly')
}
