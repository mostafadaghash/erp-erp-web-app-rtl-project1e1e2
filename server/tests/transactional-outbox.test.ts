import { strict as assert } from 'node:assert'
import test from 'node:test'

import {
  MAX_OUTBOX_BATCH_SIZE,
  OutboxWorker,
  TransactionalOutboxService,
  serializeOutboxPayload,
} from '../infrastructure/outbox/transactional-outbox.js'

test('TransactionalOutboxService validates event metadata before SQL', async () => {
  const service = new TransactionalOutboxService()
  const neverClient = {
    query: async () => {
      throw new Error('query must not run for invalid input')
    },
  }

  await assert.rejects(
    service.enqueue(neverClient as never, {
      eventType: '',
      aggregateType: 'SALES_INVOICE',
      aggregateId: 'aggregate',
      payload: {},
    }),
    /eventType must be a non-empty string/,
  )
})

test('Outbox payload accepts JSON-compatible values and rejects ambiguous runtime values', () => {
  assert.equal(
    serializeOutboxPayload({
      documentId: 'doc-1',
      total: 125.5,
      flags: [true, false],
      nested: { value: null },
    }),
    '{"documentId":"doc-1","total":125.5,"flags":[true,false],"nested":{"value":null}}',
  )

  assert.throws(
    () => serializeOutboxPayload({ amount: Number.NaN }),
    /non-finite number/,
  )
  assert.throws(
    () => serializeOutboxPayload({ value: undefined } as never),
    /unsupported undefined/,
  )
  assert.throws(
    () => serializeOutboxPayload({ value: 1n } as never),
    /unsupported bigint/,
  )

  const cyclic: Record<string, unknown> = {}
  cyclic.self = cyclic
  assert.throws(
    () => serializeOutboxPayload(cyclic as never),
    /contains a cycle/,
  )
})

test('OutboxWorker rejects unsafe batch sizes before opening a transaction', async () => {
  const worker = new OutboxWorker({
    transaction: async () => {
      throw new Error('transaction must not start')
    },
  })

  await assert.rejects(
    worker.processBatch(async () => {}, { batchSize: 0 }),
    /batchSize must be an integer/,
  )
  await assert.rejects(
    worker.processBatch(async () => {}, {
      batchSize: MAX_OUTBOX_BATCH_SIZE + 1,
    }),
    /batchSize must be an integer/,
  )
})
