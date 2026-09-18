import { strict as assert } from 'node:assert'
import test from 'node:test'

import {
  PostingBatchReferenceError,
  PostingBatchService,
} from '../infrastructure/posting/posting-batch-service.js'

const baseInput = {
  branchId: 'branch',
  sourceType: 'SALES_INVOICE',
  sourceId: 'source',
  documentVersion: 1,
  createdBy: 'user',
} as const

test('PostingBatchService validates operation/reference contracts before SQL', async () => {
  const service = new PostingBatchService()
  const neverClient = {
    query: async () => {
      throw new Error('query must not run for invalid input')
    },
  }

  await assert.rejects(
    service.create(neverClient as never, {
      ...baseInput,
      operationType: 'REVERSAL',
    }),
    (error) =>
      error instanceof PostingBatchReferenceError &&
      error.reason === 'REFERENCE_REQUIRED',
  )

  await assert.rejects(
    service.create(neverClient as never, {
      ...baseInput,
      operationType: 'DELETE_REVERSAL',
    }),
    (error) =>
      error instanceof PostingBatchReferenceError &&
      error.reason === 'REFERENCE_REQUIRED',
  )

  await assert.rejects(
    service.create(neverClient as never, {
      ...baseInput,
      operationType: 'POST',
      reversesPostingBatchId: 'old-batch',
    }),
    (error) =>
      error instanceof PostingBatchReferenceError &&
      error.reason === 'POST_CANNOT_REFERENCE_REVERSAL',
  )

  await assert.rejects(
    service.create(neverClient as never, {
      ...baseInput,
      operationType: 'POST',
      documentVersion: 0,
    }),
    /documentVersion must be a positive integer/,
  )
})
