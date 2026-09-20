import { IdempotencyConflictError } from '../idempotency/idempotency-service.js'
import { PostingBatchReferenceError } from '../posting/posting-batch-service.js'
import { PermissionDeniedError } from '../authorization/effective-permission-service.js'
import { BranchAccessDeniedError } from '../authorization/branch-scope-service.js'
import { OrganizationError } from '../organization/organization-service.js'
import { SystemAdminProtectionError } from '../authorization/system-admin-protection-service.js'
import { CounterpartyError } from '../counterparties/counterparty-service.js'
import { CounterpartyLedgerError } from '../counterparties/counterparty-ledger-service.js'
import { ProductModelError } from '../products/product-model-service.js'
import { ProductUnitError } from '../products/product-unit-service.js'
import { ProductIdentifierError } from '../products/product-identifier-service.js'

export type SafeErrorParam = string | number | boolean | null
export type SafeErrorParams = Readonly<Record<string, SafeErrorParam>>

export interface ErrorContract {
  errorCode: string
  params: SafeErrorParams
}

export const ERROR_CODES = {
  IDEMPOTENCY_KEY_CONFLICT: 'IDEMPOTENCY_KEY_CONFLICT',
  POSTING_BATCH_REFERENCE_ERROR: 'POSTING_BATCH_REFERENCE_ERROR',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  BRANCH_ACCESS_DENIED: 'BRANCH_ACCESS_DENIED',
  ORGANIZATION_OPERATION_REJECTED: 'ORGANIZATION_OPERATION_REJECTED',
  SYSTEM_ADMIN_PROTECTION_REJECTED: 'SYSTEM_ADMIN_PROTECTION_REJECTED',
  COUNTERPARTY_OPERATION_REJECTED: 'COUNTERPARTY_OPERATION_REJECTED',
  COUNTERPARTY_LEDGER_OPERATION_REJECTED: 'COUNTERPARTY_LEDGER_OPERATION_REJECTED',
  PRODUCT_MODEL_OPERATION_REJECTED: 'PRODUCT_MODEL_OPERATION_REJECTED',
  PRODUCT_UNIT_OPERATION_REJECTED: 'PRODUCT_UNIT_OPERATION_REJECTED',
  PRODUCT_IDENTIFIER_OPERATION_REJECTED: 'PRODUCT_IDENTIFIER_OPERATION_REJECTED',
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  DB_UNIQUE_CONFLICT: 'DB_UNIQUE_CONFLICT',
  DB_REFERENCE_CONFLICT: 'DB_REFERENCE_CONFLICT',
  DB_CHECK_VIOLATION: 'DB_CHECK_VIOLATION',
  DB_REQUIRED_VALUE_MISSING: 'DB_REQUIRED_VALUE_MISSING',
  DB_INVALID_INPUT: 'DB_INVALID_INPUT',
  CONCURRENCY_DEADLOCK: 'CONCURRENCY_DEADLOCK',
  CONCURRENCY_SERIALIZATION: 'CONCURRENCY_SERIALIZATION',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const

export type StableErrorCode =
  (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

interface PostgreSqlErrorShape {
  code?: unknown
}

function contract(
  errorCode: StableErrorCode,
  params: SafeErrorParams = {},
): ErrorContract {
  return { errorCode, params: Object.freeze({ ...params }) }
}

function postgresCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const code = (error as PostgreSqlErrorShape).code
  return typeof code === 'string' ? code : undefined
}

function mapPostgres(code: string): ErrorContract | undefined {
  switch (code) {
    case '23505':
      return contract(ERROR_CODES.DB_UNIQUE_CONFLICT)
    case '23503':
      return contract(ERROR_CODES.DB_REFERENCE_CONFLICT)
    case '23514':
      return contract(ERROR_CODES.DB_CHECK_VIOLATION)
    case '23502':
      return contract(ERROR_CODES.DB_REQUIRED_VALUE_MISSING)
    case '22P02':
    case '22001':
    case '22003':
      return contract(ERROR_CODES.DB_INVALID_INPUT)
    case '40P01':
      return contract(ERROR_CODES.CONCURRENCY_DEADLOCK)
    case '40001':
      return contract(ERROR_CODES.CONCURRENCY_SERIALIZATION)
    default:
      return undefined
  }
}

/**
 * Public boundary for Business/PostgreSQL failures.
 * Never copy message/stack/detail/hint/query/table/column/constraint or secrets.
 */
export function toErrorContract(error: unknown): ErrorContract {
  if (error instanceof IdempotencyConflictError) {
    return contract(ERROR_CODES.IDEMPOTENCY_KEY_CONFLICT, {
      reason: error.reason,
    })
  }

  if (error instanceof PostingBatchReferenceError) {
    return contract(ERROR_CODES.POSTING_BATCH_REFERENCE_ERROR, {
      reason: error.reason,
    })
  }

  if (error instanceof BranchAccessDeniedError) {
    return contract(ERROR_CODES.BRANCH_ACCESS_DENIED, {
      branchId: error.branchId,
    })
  }

  if (error instanceof PermissionDeniedError) {
    return contract(ERROR_CODES.PERMISSION_DENIED, {
      permission: error.permissionKey,
    })
  }

  if (error instanceof OrganizationError) {
    return contract(ERROR_CODES.ORGANIZATION_OPERATION_REJECTED, {
      reason: error.reason,
    })
  }

  if (error instanceof SystemAdminProtectionError) {
    return contract(ERROR_CODES.SYSTEM_ADMIN_PROTECTION_REJECTED, {
      reason: error.reason,
    })
  }

  if (error instanceof CounterpartyError) {
    return contract(ERROR_CODES.COUNTERPARTY_OPERATION_REJECTED, {
      reason: error.reason,
    })
  }

  if (error instanceof CounterpartyLedgerError) {
    return contract(ERROR_CODES.COUNTERPARTY_LEDGER_OPERATION_REJECTED, {
      reason: error.reason,
    })
  }

  if (error instanceof ProductModelError) {
    return contract(ERROR_CODES.PRODUCT_MODEL_OPERATION_REJECTED, {
      reason: error.reason,
    })
  }

  if (error instanceof ProductUnitError) {
    return contract(ERROR_CODES.PRODUCT_UNIT_OPERATION_REJECTED, {
      reason: error.reason,
    })
  }

  if (error instanceof ProductIdentifierError) {
    return contract(ERROR_CODES.PRODUCT_IDENTIFIER_OPERATION_REJECTED, {
      reason: error.reason,
    })
  }

  const pgCode = postgresCode(error)
  if (pgCode !== undefined) {
    return mapPostgres(pgCode) ?? contract(ERROR_CODES.INTERNAL_ERROR)
  }

  if (error instanceof TypeError || error instanceof RangeError) {
    return contract(ERROR_CODES.INVALID_ARGUMENT)
  }

  return contract(ERROR_CODES.INTERNAL_ERROR)
}
