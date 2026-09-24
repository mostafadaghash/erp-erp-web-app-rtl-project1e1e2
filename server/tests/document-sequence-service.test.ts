import { strict as assert } from 'node:assert'
import test from 'node:test'

import { DocumentSequenceService } from '../infrastructure/sequences/document-sequence-service.js'

test('DocumentSequenceService rejects invalid allocation scope before touching PostgreSQL', async () => {
  const service = new DocumentSequenceService()
  const neverClient = {
    query: async () => {
      throw new Error('query must not run for invalid input')
    },
  }

  await assert.rejects(
    service.allocate(neverClient as never, {
      branchId: '',
      documentType: 'SALES_INVOICE',
    }),
    /branchId must be a non-empty string/,
  )

  await assert.rejects(
    service.allocate(neverClient as never, {
      branchId: 'branch',
      documentType: '   ',
    }),
    /documentType must be a non-empty string/,
  )
})
