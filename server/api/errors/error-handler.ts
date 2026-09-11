import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'

interface ErrorEnvelope {
  errorCode: string
  errorParams: Record<string, unknown>
  requestId: string
}

function hasValidation(error: FastifyError): boolean {
  return Array.isArray(error.validation) && error.validation.length > 0
}

export function handleRequestError(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  if (hasValidation(error)) {
    const payload: ErrorEnvelope = {
      errorCode: 'REQUEST_VALIDATION_FAILED',
      errorParams: {},
      requestId: request.id,
    }

    void reply.code(400).send(payload)
    return
  }

  request.log.error({ err: error }, 'request failed')

  const payload: ErrorEnvelope = {
    errorCode: 'INTERNAL_ERROR',
    errorParams: {},
    requestId: request.id,
  }

  void reply.code(500).send(payload)
}
