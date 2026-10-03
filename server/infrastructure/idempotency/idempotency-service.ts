import { createHash, randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'

import type {
  TransactionOptions,
  TransactionWork,
} from '../database/transaction.js'

const CLAIM_LOOKUP_ATTEMPTS = 3
export const DEFAULT_IDEMPOTENCY_CLEANUP_BATCH_SIZE = 100
export const MAX_IDEMPOTENCY_CLEANUP_BATCH_SIZE = 1000

export type IdempotencyConflictReason =
  | 'USER_MISMATCH'
  | 'OPERATION_MISMATCH'
  | 'REQUEST_HASH_MISMATCH'

export class IdempotencyConflictError extends Error {
  readonly code = 'IDEMPOTENCY_KEY_CONFLICT'

  constructor(
    readonly key: string,
    readonly reason: IdempotencyConflictReason,
  ) {
    super(`Idempotency key conflict: ${reason}`)
    this.name = 'IdempotencyConflictError'
  }
}

export interface IdempotencyTransactionRunner {
  transaction<T>(
    work: TransactionWork<T>,
    options?: TransactionOptions,
  ): Promise<T>
}

export interface ExecuteIdempotentInput {
  key: string
  userId: string
  operationType: string
  payload: unknown
  expiresAt: Date
  transactionOptions?: TransactionOptions
}

export interface IdempotentWorkResult<T> {
  value: T
  resultReference: string | null
}

export type IdempotencyExecution<T> =
  | {
      state: 'EXECUTED'
      requestHash: string
      resultReference: string | null
      completedAt: Date
      value: T
    }
  | {
      state: 'REPLAYED'
      requestHash: string
      resultReference: string | null
      completedAt: Date
    }
  | {
      state: 'INCOMPLETE'
      requestHash: string
      resultReference: string | null
      completedAt: null
    }

export interface CleanupExpiredIdempotencyOptions {
  expiredBefore?: Date
  batchSize?: number
  transactionOptions?: TransactionOptions
}

export interface CleanupExpiredIdempotencyResult {
  deletedCount: number
}

interface StoredIdempotencyRow {
  id: string
  key: string
  user_id: string
  operation_type: string
  request_hash: string
  result_reference: string | null
  created_at: Date
  completed_at: Date | null
  expires_at: Date
}

interface ClaimedKey {
  isNew: boolean
  row: StoredIdempotencyRow
}

function requireNonBlankString(name: string, value: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`)
  }
}

function requireValidDate(name: string, value: Date): void {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new TypeError(`${name} must be a valid Date`)
  }
}

function canonicalizeJsonValue(
  value: unknown,
  path: string,
  ancestors: WeakSet<object>,
): string {
  if (value === null) return 'null'

  if (typeof value === 'string') {
    return JSON.stringify(value) as string
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`Idempotency payload contains a non-finite number at ${path}`)
    }
    return JSON.stringify(value) as string
  }

  if (typeof value !== 'object') {
    throw new TypeError(
      `Idempotency payload contains unsupported ${typeof value} at ${path}`,
    )
  }

  if (ancestors.has(value)) {
    throw new TypeError(`Idempotency payload contains a cycle at ${path}`)
  }

  const prototype = Object.getPrototypeOf(value)
  const isArray = Array.isArray(value)
  if (!isArray && prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(
      `Idempotency payload must contain only JSON-compatible plain objects at ${path}`,
    )
  }

  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new TypeError(
      `Idempotency payload cannot contain symbol keys at ${path}`,
    )
  }

  ancestors.add(value)
  try {
    if (isArray) {
      const parts: string[] = []
      for (let index = 0; index < value.length; index += 1) {
        if (!(index in value)) {
          throw new TypeError(
            `Idempotency payload cannot contain sparse arrays at ${path}[${index}]`,
          )
        }
        parts.push(
          canonicalizeJsonValue(value[index], `${path}[${index}]`, ancestors),
        )
      }
      return `[${parts.join(',')}]`
    }

    const record = value as Record<string, unknown>
    const keys = Object.keys(record).sort()
    const parts = keys.map((key) => {
      const encodedKey = JSON.stringify(key) as string
      const encodedValue = canonicalizeJsonValue(
        record[key],
        `${path}.${key}`,
        ancestors,
      )
      return `${encodedKey}:${encodedValue}`
    })
    return `{${parts.join(',')}}`
  } finally {
    ancestors.delete(value)
  }
}

export function canonicalizeIdempotencyRequest(payload: unknown): string {
  return canonicalizeJsonValue(payload, '$', new WeakSet<object>())
}

export function hashIdempotencyRequest(payload: unknown): string {
  return createHash('sha256')
    .update(canonicalizeIdempotencyRequest(payload), 'utf8')
    .digest('hex')
}

function validateExecuteInput(input: ExecuteIdempotentInput): void {
  requireNonBlankString('Idempotency key', input.key)
  requireNonBlankString('Idempotency userId', input.userId)
  requireNonBlankString('Idempotency operationType', input.operationType)
  requireValidDate('Idempotency expiresAt', input.expiresAt)
}

function validateCleanupOptions(
  options: CleanupExpiredIdempotencyOptions,
): { expiredBefore: Date; batchSize: number } {
  const expiredBefore = options.expiredBefore ?? new Date()
  requireValidDate('Idempotency expiredBefore', expiredBefore)

  const batchSize =
    options.batchSize ?? DEFAULT_IDEMPOTENCY_CLEANUP_BATCH_SIZE
  if (
    !Number.isInteger(batchSize) ||
    batchSize < 1 ||
    batchSize > MAX_IDEMPOTENCY_CLEANUP_BATCH_SIZE
  ) {
    throw new RangeError(
      `Idempotency cleanup batchSize must be an integer between 1 and ${MAX_IDEMPOTENCY_CLEANUP_BATCH_SIZE}`,
    )
  }

  return { expiredBefore, batchSize }
}

async function selectKeyForUpdate(
  client: PoolClient,
  key: string,
): Promise<StoredIdempotencyRow | undefined> {
  const existing = await client.query<StoredIdempotencyRow>(
    `SELECT
       id,
       key,
       user_id,
       operation_type,
       request_hash,
       result_reference,
       created_at,
       completed_at,
       expires_at
     FROM idempotency_keys
     WHERE key = $1
     FOR UPDATE`,
    [key],
  )
  return existing.rows[0]
}

async function claimKey(
  client: PoolClient,
  input: ExecuteIdempotentInput,
  requestHash: string,
): Promise<ClaimedKey> {
  for (let attempt = 1; attempt <= CLAIM_LOOKUP_ATTEMPTS; attempt += 1) {
    const id = randomUUID()
    const inserted = await client.query<StoredIdempotencyRow>(
      `INSERT INTO idempotency_keys
        (id,key,user_id,operation_type,request_hash,result_reference,created_at,completed_at,expires_at)
       VALUES ($1,$2,$3,$4,$5,NULL,clock_timestamp(),NULL,$6)
       ON CONFLICT ON CONSTRAINT uq_idempotency_keys__key DO NOTHING
       RETURNING
         id,
         key,
         user_id,
         operation_type,
         request_hash,
         result_reference,
         created_at,
         completed_at,
         expires_at`,
      [
        id,
        input.key,
        input.userId,
        input.operationType,
        requestHash,
        input.expiresAt,
      ],
    )

    const insertedRow = inserted.rows[0]
    if (insertedRow) {
      return { isNew: true, row: insertedRow }
    }

    const existingRow = await selectKeyForUpdate(client, input.key)
    if (existingRow) {
      return { isNew: false, row: existingRow }
    }
  }

  throw new Error(
    'Idempotency key could not be claimed after a concurrent cleanup race',
  )
}

function assertExistingClaimMatches(
  row: StoredIdempotencyRow,
  input: ExecuteIdempotentInput,
  requestHash: string,
): void {
  if (row.user_id !== input.userId) {
    throw new IdempotencyConflictError(input.key, 'USER_MISMATCH')
  }
  if (row.operation_type !== input.operationType) {
    throw new IdempotencyConflictError(input.key, 'OPERATION_MISMATCH')
  }
  if (row.request_hash !== requestHash) {
    throw new IdempotencyConflictError(input.key, 'REQUEST_HASH_MISMATCH')
  }
}

export class IdempotencyService {
  constructor(private readonly database: IdempotencyTransactionRunner) {}

  async execute<T>(
    input: ExecuteIdempotentInput,
    work: (client: PoolClient) => Promise<IdempotentWorkResult<T>>,
  ): Promise<IdempotencyExecution<T>> {
    validateExecuteInput(input)
    const requestHash = hashIdempotencyRequest(input.payload)

    return this.database.transaction(
      async (client) => {
        const claim = await claimKey(client, input, requestHash)

        if (!claim.isNew) {
          assertExistingClaimMatches(claim.row, input, requestHash)

          if (claim.row.completed_at) {
            return {
              state: 'REPLAYED',
              requestHash,
              resultReference: claim.row.result_reference,
              completedAt: claim.row.completed_at,
            }
          }

          return {
            state: 'INCOMPLETE',
            requestHash,
            resultReference: claim.row.result_reference,
            completedAt: null,
          }
        }

        const workResult = await work(client)
        const completed = await client.query<{ completed_at: Date }>(
          `UPDATE idempotency_keys
              SET result_reference = $2,
                  completed_at = clock_timestamp()
            WHERE id = $1
              AND completed_at IS NULL
          RETURNING completed_at`,
          [claim.row.id, workResult.resultReference],
        )

        const completedAt = completed.rows[0]?.completed_at
        if (!completedAt) {
          throw new Error(
            'Idempotency completion invariant failed; claimed key was not completed',
          )
        }

        return {
          state: 'EXECUTED',
          requestHash,
          resultReference: workResult.resultReference,
          completedAt,
          value: workResult.value,
        }
      },
      input.transactionOptions,
    )
  }

  async cleanupExpired(
    options: CleanupExpiredIdempotencyOptions = {},
  ): Promise<CleanupExpiredIdempotencyResult> {
    const { expiredBefore, batchSize } = validateCleanupOptions(options)

    return this.database.transaction(
      async (client) => {
        const deleted = await client.query<{ id: string }>(
          `WITH expired AS (
             SELECT id
               FROM idempotency_keys
              WHERE expires_at <= $1
              ORDER BY expires_at
              FOR UPDATE SKIP LOCKED
              LIMIT $2
           )
           DELETE FROM idempotency_keys AS keys
           USING expired
           WHERE keys.id = expired.id
           RETURNING keys.id`,
          [expiredBefore, batchSize],
        )

        return { deletedCount: deleted.rowCount ?? 0 }
      },
      options.transactionOptions,
    )
  }
}
