import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'

import {
  isRetryableTransactionError,
  type TransactionOptions,
  type TransactionWork,
} from '../database/transaction.js'

export const DEFAULT_OUTBOX_BATCH_SIZE = 50
export const MAX_OUTBOX_BATCH_SIZE = 500

export type OutboxJsonPrimitive = string | number | boolean | null
export type OutboxJsonValue =
  | OutboxJsonPrimitive
  | OutboxJsonValue[]
  | { [key: string]: OutboxJsonValue }

export interface EnqueueOutboxEventInput {
  eventType: string
  aggregateType: string
  aggregateId: string
  payload: OutboxJsonValue
}

export interface OutboxEvent {
  id: string
  eventType: string
  aggregateType: string
  aggregateId: string
  payload: OutboxJsonValue
  createdAt: Date
  processedAt: Date | null
  retryCount: number
}

export interface OutboxTransactionRunner {
  transaction<T>(
    work: TransactionWork<T>,
    options?: TransactionOptions,
  ): Promise<T>
}

export type OutboxConsumer = (
  client: PoolClient,
  event: OutboxEvent,
) => Promise<void>

export interface ProcessOutboxBatchOptions {
  batchSize?: number
  transactionOptions?: TransactionOptions
}

export interface FailedOutboxEvent {
  eventId: string
  retryCount: number
}

export interface ProcessOutboxBatchResult {
  claimedCount: number
  processedEventIds: string[]
  failed: FailedOutboxEvent[]
}

interface StoredOutboxEventRow {
  id: string
  event_type: string
  aggregate_type: string
  aggregate_id: string
  payload_json: OutboxJsonValue
  created_at: Date
  processed_at: Date | null
  retry_count: number
}

function requireNonBlank(name: string, value: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`)
  }
}

function validateJsonValue(
  value: unknown,
  path: string,
  ancestors: WeakSet<object>,
): asserts value is OutboxJsonValue {
  if (value === null) return

  if (typeof value === 'string' || typeof value === 'boolean') return

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(
        `Outbox payload contains a non-finite number at ${path}`,
      )
    }
    return
  }

  if (typeof value !== 'object') {
    throw new TypeError(
      `Outbox payload contains unsupported ${typeof value} at ${path}`,
    )
  }

  if (ancestors.has(value)) {
    throw new TypeError(`Outbox payload contains a cycle at ${path}`)
  }

  const isArray = Array.isArray(value)
  const prototype = Object.getPrototypeOf(value)
  if (!isArray && prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(
      `Outbox payload must contain only JSON-compatible plain objects at ${path}`,
    )
  }

  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new TypeError(
      `Outbox payload cannot contain symbol keys at ${path}`,
    )
  }

  ancestors.add(value)
  try {
    if (isArray) {
      for (let index = 0; index < value.length; index += 1) {
        if (!(index in value)) {
          throw new TypeError(
            `Outbox payload cannot contain sparse arrays at ${path}[${index}]`,
          )
        }

        validateJsonValue(
          value[index],
          `${path}[${index}]`,
          ancestors,
        )
      }
      return
    }

    for (const [key, child] of Object.entries(
      value as Record<string, unknown>,
    )) {
      validateJsonValue(child, `${path}.${key}`, ancestors)
    }
  } finally {
    ancestors.delete(value)
  }
}

export function serializeOutboxPayload(payload: OutboxJsonValue): string {
  validateJsonValue(payload, '$', new WeakSet<object>())
  return JSON.stringify(payload)
}

function mapEvent(row: StoredOutboxEventRow): OutboxEvent {
  return {
    id: row.id,
    eventType: row.event_type,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    payload: row.payload_json,
    createdAt: row.created_at,
    processedAt: row.processed_at,
    retryCount: row.retry_count,
  }
}

function validateEnqueueInput(input: EnqueueOutboxEventInput): void {
  requireNonBlank('Outbox eventType', input.eventType)
  requireNonBlank('Outbox aggregateType', input.aggregateType)
  requireNonBlank('Outbox aggregateId', input.aggregateId)
}

function validateBatchSize(value: number): void {
  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_OUTBOX_BATCH_SIZE
  ) {
    throw new RangeError(
      `Outbox batchSize must be an integer between 1 and ${MAX_OUTBOX_BATCH_SIZE}`,
    )
  }
}

/**
 * Appends a Domain Event inside the already-open source transaction.
 *
 * The event becomes visible to workers only if the source transaction commits.
 */
export class TransactionalOutboxService {
  async enqueue(
    client: PoolClient,
    input: EnqueueOutboxEventInput,
  ): Promise<OutboxEvent> {
    validateEnqueueInput(input)
    const payloadJson = serializeOutboxPayload(input.payload)
    const id = randomUUID()

    const result = await client.query<StoredOutboxEventRow>(
      `INSERT INTO outbox_events
        (id,event_type,aggregate_type,aggregate_id,payload_json,created_at,
         processed_at,retry_count)
       VALUES ($1,$2,$3,$4,$5::jsonb,clock_timestamp(),NULL,0)
       RETURNING
         id,
         event_type,
         aggregate_type,
         aggregate_id,
         payload_json,
         created_at,
         processed_at,
         retry_count`,
      [
        id,
        input.eventType,
        input.aggregateType,
        input.aggregateId,
        payloadJson,
      ],
    )

    const row = result.rows[0]
    if (!row) {
      throw new Error('Outbox enqueue invariant failed: no row returned')
    }

    return mapEvent(row)
  }
}

/**
 * Claims pending events using FOR UPDATE SKIP LOCKED and processes the claimed
 * rows inside one READ COMMITTED transaction.
 *
 * Consumers receive the stable event.id and must use it as their idempotency
 * identity when their logical side effect can outlive/retry the DB transaction.
 * DB-backed consumer effects should use the supplied PoolClient so their effect
 * and processed_at commit atomically.
 */
export class OutboxWorker {
  constructor(private readonly database: OutboxTransactionRunner) {}

  async processBatch(
    consumer: OutboxConsumer,
    options: ProcessOutboxBatchOptions = {},
  ): Promise<ProcessOutboxBatchResult> {
    const batchSize = options.batchSize ?? DEFAULT_OUTBOX_BATCH_SIZE
    validateBatchSize(batchSize)

    return this.database.transaction(
      async (client) => {
        const claimed = await client.query<StoredOutboxEventRow>(
          `SELECT
             id,
             event_type,
             aggregate_type,
             aggregate_id,
             payload_json,
             created_at,
             processed_at,
             retry_count
           FROM outbox_events
           WHERE processed_at IS NULL
           ORDER BY created_at, id
           FOR UPDATE SKIP LOCKED
           LIMIT $1`,
          [batchSize],
        )

        const processedEventIds: string[] = []
        const failed: FailedOutboxEvent[] = []

        for (const row of claimed.rows) {
          const event = mapEvent(row)
          await client.query('SAVEPOINT outbox_consumer_attempt')

          try {
            await consumer(client, event)
          } catch (error) {
            if (isRetryableTransactionError(error)) {
              throw error
            }

            await client.query(
              'ROLLBACK TO SAVEPOINT outbox_consumer_attempt',
            )
            await client.query('RELEASE SAVEPOINT outbox_consumer_attempt')

            const retried = await client.query<{ retry_count: number }>(
              `UPDATE outbox_events
                  SET retry_count = retry_count + 1
                WHERE id = $1
                  AND processed_at IS NULL
              RETURNING retry_count`,
              [event.id],
            )

            const retryCount = retried.rows[0]?.retry_count
            if (retryCount === undefined) {
              throw new Error(
                'Outbox retry invariant failed: claimed event was not updated',
              )
            }

            failed.push({ eventId: event.id, retryCount })
            continue
          }

          await client.query('RELEASE SAVEPOINT outbox_consumer_attempt')

          const processed = await client.query<{ processed_at: Date }>(
            `UPDATE outbox_events
                SET processed_at = clock_timestamp()
              WHERE id = $1
                AND processed_at IS NULL
            RETURNING processed_at`,
            [event.id],
          )

          if (!processed.rows[0]?.processed_at) {
            throw new Error(
              'Outbox processing invariant failed: claimed event was not marked processed',
            )
          }

          processedEventIds.push(event.id)
        }

        return {
          claimedCount: claimed.rowCount ?? 0,
          processedEventIds,
          failed,
        }
      },
      options.transactionOptions,
    )
  }
}
