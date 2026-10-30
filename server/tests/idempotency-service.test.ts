import { strict as assert } from 'node:assert'
import test from 'node:test'

import {
  canonicalizeIdempotencyRequest,
  hashIdempotencyRequest,
} from '../infrastructure/idempotency/idempotency-service.js'

test('canonical idempotency request hashing is deterministic for JSON payloads', () => {
  const left = {
    nested: { z: 3, a: true },
    items: [{ b: 2, a: 1 }, 'x'],
    amount: 12.5,
    nullable: null,
  }
  const right = {
    nullable: null,
    amount: 12.5,
    items: [{ a: 1, b: 2 }, 'x'],
    nested: { a: true, z: 3 },
  }

  assert.equal(
    canonicalizeIdempotencyRequest({ b: 2, a: 1 }),
    '{"a":1,"b":2}',
  )
  assert.equal(hashIdempotencyRequest(left), hashIdempotencyRequest(right))
  assert.match(hashIdempotencyRequest(left), /^[0-9a-f]{64}$/)
  assert.notEqual(
    hashIdempotencyRequest({ items: [1, 2] }),
    hashIdempotencyRequest({ items: [2, 1] }),
  )
})

test('canonical idempotency hashing rejects non-JSON or ambiguous payloads', () => {
  assert.throws(
    () => hashIdempotencyRequest({ amount: Number.NaN }),
    /non-finite number/,
  )
  assert.throws(
    () => hashIdempotencyRequest({ unsupported: undefined }),
    /unsupported undefined/,
  )
  assert.throws(
    () => hashIdempotencyRequest(new Date()),
    /JSON-compatible plain objects/,
  )

  const sparse: unknown[] = []
  sparse.length = 1
  assert.throws(
    () => hashIdempotencyRequest(sparse),
    /sparse arrays/,
  )

  const cyclic: Record<string, unknown> = {}
  cyclic.self = cyclic
  assert.throws(
    () => hashIdempotencyRequest(cyclic),
    /contains a cycle/,
  )
})
