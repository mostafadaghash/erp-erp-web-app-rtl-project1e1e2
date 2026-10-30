export type ErrorParamValue = string | number | boolean | null
export type ErrorParams = Readonly<Record<string, ErrorParamValue>>

export interface ErrorEnvelope {
  errorCode: string
  errorParams: ErrorParams
  requestId: string
}

export const CORE_API_ERROR_CODES = {
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  REQUEST_VALIDATION_FAILED: 'REQUEST_VALIDATION_FAILED',
  ROUTE_NOT_FOUND: 'ROUTE_NOT_FOUND',
} as const

const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/
const ERROR_PARAM_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/

function validateErrorCode(errorCode: string): void {
  if (!ERROR_CODE_PATTERN.test(errorCode)) {
    throw new TypeError(`API error code must be stable UPPER_SNAKE_CASE: ${errorCode}`)
  }
}

function copySafeErrorParams(errorParams: ErrorParams = {}): ErrorParams {
  const copy: Record<string, ErrorParamValue> = {}

  for (const [key, value] of Object.entries(errorParams)) {
    if (!ERROR_PARAM_KEY_PATTERN.test(key)) {
      throw new TypeError(`API error param key is invalid: ${key}`)
    }

    if (
      value !== null &&
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'boolean'
    ) {
      throw new TypeError(`API error param must be a safe primitive: ${key}`)
    }

    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new TypeError(`API error numeric param must be finite: ${key}`)
    }

    copy[key] = value
  }

  return Object.freeze(copy)
}

export interface ApiErrorOptions {
  errorCode: string
  statusCode: number
  errorParams?: ErrorParams
}

export class ApiError extends Error {
  readonly errorCode: string
  readonly errorParams: ErrorParams
  readonly statusCode: number

  constructor(options: ApiErrorOptions) {
    validateErrorCode(options.errorCode)

    if (
      !Number.isInteger(options.statusCode) ||
      options.statusCode < 400 ||
      options.statusCode > 499
    ) {
      throw new TypeError('ApiError statusCode must be an HTTP 4xx status')
    }

    super(options.errorCode)
    this.name = 'ApiError'
    this.errorCode = options.errorCode
    this.statusCode = options.statusCode
    this.errorParams = copySafeErrorParams(options.errorParams)
  }
}

export function createErrorEnvelope(
  errorCode: string,
  errorParams: ErrorParams,
  requestId: string,
): ErrorEnvelope {
  validateErrorCode(errorCode)

  return Object.freeze({
    errorCode,
    errorParams: copySafeErrorParams(errorParams),
    requestId,
  })
}
