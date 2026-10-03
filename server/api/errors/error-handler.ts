import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'

import {
  ApiError,
  CORE_API_ERROR_CODES,
  createErrorEnvelope,
} from './api-error.js'

function hasValidation(error: FastifyError): boolean {
  return Array.isArray(error.validation) && error.validation.length > 0
}

function sendError(
  reply: FastifyReply,
  statusCode: number,
  request: FastifyRequest,
  errorCode: string,
  errorParams: Record<string, string | number | boolean | null> = {},
): void {
  void reply.code(statusCode).send(
    createErrorEnvelope(errorCode, errorParams, request.id),
  )
}

export function handleNotFoundRequest(
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  sendError(
    reply,
    404,
    request,
    CORE_API_ERROR_CODES.ROUTE_NOT_FOUND,
  )
}

export function handleRequestError(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  if (error instanceof ApiError) {
    sendError(
      reply,
      error.statusCode,
      request,
      error.errorCode,
      error.errorParams,
    )
    return
  }

  if (hasValidation(error)) {
    sendError(
      reply,
      400,
      request,
      CORE_API_ERROR_CODES.REQUEST_VALIDATION_FAILED,
    )
    return
  }

  request.log.error({ err: error, requestId: request.id }, 'request failed')

  sendError(
    reply,
    500,
    request,
    CORE_API_ERROR_CODES.INTERNAL_ERROR,
  )
}
