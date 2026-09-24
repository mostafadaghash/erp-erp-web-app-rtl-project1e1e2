import { strict as assert } from 'node:assert'
import test from 'node:test'

import {
  AuditService,
  serializeAuditSnapshot,
} from '../infrastructure/audit/audit-service.js'

test('AuditService rejects invalid metadata before SQL', async () => {
  const service = new AuditService()
  const neverClient = {
    query: async () => {
      throw new Error('query must not run for invalid input')
    },
  }

  await assert.rejects(
    service.record(neverClient as never, {
      companyId: '',
      action: 'UPDATE',
      entityType: 'SALES_INVOICE',
      entityId: 'entity',
    }),
    /companyId must be a non-empty string/,
  )

  await assert.rejects(
    service.record(neverClient as never, {
      companyId: 'company',
      action: '   ',
      entityType: 'SALES_INVOICE',
      entityId: 'entity',
    }),
    /action must be a non-empty string/,
  )
})

test('Audit snapshots accept JSON-compatible values and reject ambiguous payloads', () => {
  assert.equal(
    serializeAuditSnapshot({
      status: 'POSTED',
      amount: 125.5,
      flags: [true, false],
      nested: { value: null },
    }),
    '{"status":"POSTED","amount":125.5,"flags":[true,false],"nested":{"value":null}}',
  )

  assert.equal(serializeAuditSnapshot(null), null)
  assert.equal(serializeAuditSnapshot(undefined), null)

  assert.throws(
    () => serializeAuditSnapshot({ amount: Number.NaN }),
    /non-finite number/,
  )

  assert.throws(
    () =>
      serializeAuditSnapshot(
        { value: undefined } as never,
      ),
    /unsupported undefined/,
  )

  assert.throws(
    () =>
      serializeAuditSnapshot(
        { value: 1n } as never,
      ),
    /unsupported bigint/,
  )

  assert.throws(
    () => serializeAuditSnapshot(new Date() as never),
    /JSON-compatible plain objects/,
  )

  const cyclic: Record<string, unknown> = {}
  cyclic.self = cyclic
  assert.throws(
    () => serializeAuditSnapshot(cyclic as never),
    /contains a cycle/,
  )
})
