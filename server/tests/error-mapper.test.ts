import { strict as assert } from 'node:assert'
import test from 'node:test'

import { IdempotencyConflictError } from '../infrastructure/idempotency/idempotency-service.js'
import { PostingBatchReferenceError } from '../infrastructure/posting/posting-batch-service.js'
import {
  ERROR_CODES,
  toErrorContract,
} from '../infrastructure/errors/error-mapper.js'

test('Error Mapper exposes only safe business params', () => {
  const idempotency = toErrorContract(
    new IdempotencyConflictError(
      'secret-idempotency-key',
      'REQUEST_HASH_MISMATCH',
    ),
  )
  assert.deepEqual(idempotency, {
    errorCode: ERROR_CODES.IDEMPOTENCY_KEY_CONFLICT,
    params: { reason: 'REQUEST_HASH_MISMATCH' },
  })
  assert.doesNotMatch(JSON.stringify(idempotency), /secret-idempotency-key/)

  const posting = toErrorContract(
    new PostingBatchReferenceError(
      'REFERENCE_SCOPE_MISMATCH',
      '99000000-0000-4000-8000-secret-reference',
    ),
  )
  assert.deepEqual(posting, {
    errorCode: ERROR_CODES.POSTING_BATCH_REFERENCE_ERROR,
    params: { reason: 'REFERENCE_SCOPE_MISMATCH' },
  })
  assert.doesNotMatch(JSON.stringify(posting), /secret-reference/)
})

test('Error Mapper hides validation messages and unknown internals', () => {
  const validation = toErrorContract(
    new TypeError('password=super-secret; invalid argument'),
  )
  assert.deepEqual(validation, {
    errorCode: ERROR_CODES.INVALID_ARGUMENT,
    params: {},
  })

  const unknown = toErrorContract({
    code: '99999',
    message: 'password=secret',
    detail: 'internal row detail',
    query: 'SELECT secret FROM credentials',
    constraint: 'internal_constraint_name',
    stack: 'internal stack trace',
  })
  assert.deepEqual(unknown, {
    errorCode: ERROR_CODES.INTERNAL_ERROR,
    params: {},
  })

  const publicJson = JSON.stringify({ validation, unknown })
  assert.doesNotMatch(
    publicJson,
    /secret|SELECT|credentials|constraint|stack|password/i,
  )
})

test('Error Mapper maps concurrency conflicts to stable codes', () => {
  assert.deepEqual(toErrorContract({ code: '40P01' }), {
    errorCode: ERROR_CODES.CONCURRENCY_DEADLOCK,
    params: {},
  })
  assert.deepEqual(toErrorContract({ code: '40001' }), {
    errorCode: ERROR_CODES.CONCURRENCY_SERIALIZATION,
    params: {},
  })
})
