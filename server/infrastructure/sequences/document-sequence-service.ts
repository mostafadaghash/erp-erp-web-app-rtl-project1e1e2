import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'

export interface AllocateDocumentNumberInput {
  branchId: string
  documentType: string
}

export interface DocumentNumberAllocation {
  documentNumber: bigint
  allocatedAt: Date
}

interface DocumentSequenceRow {
  last_number: string
  updated_at: Date
}

function requireNonBlank(name: string, value: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`)
  }
}

function parseDocumentNumber(value: string): bigint {
  const parsed = BigInt(value)
  if (parsed < 1n) {
    throw new Error(
      `Document sequence invariant failed: allocated number must be positive, received ${value}`,
    )
  }
  return parsed
}

/**
 * Allocates visible document numbers inside an already-open business transaction.
 *
 * The caller owns transaction timing and must invoke this after the command's
 * validation and required business/dependent/position locks. This keeps the
 * Sequence Row at the end of the approved lock order and guarantees that a
 * rollback also rolls back the number allocation.
 */
export class DocumentSequenceService {
  async allocate(
    client: PoolClient,
    input: AllocateDocumentNumberInput,
  ): Promise<DocumentNumberAllocation> {
    requireNonBlank('Document sequence branchId', input.branchId)
    requireNonBlank('Document sequence documentType', input.documentType)

    const sequenceId = randomUUID()
    const result = await client.query<DocumentSequenceRow>(
      `INSERT INTO document_sequences
        (id,branch_id,document_type,last_number,updated_at)
       VALUES ($1,$2,$3,1,clock_timestamp())
       ON CONFLICT ON CONSTRAINT uq_document_sequences__branch_document_type
       DO UPDATE
          SET last_number = document_sequences.last_number + 1,
              updated_at = clock_timestamp()
       RETURNING last_number::text AS last_number, updated_at`,
      [sequenceId, input.branchId, input.documentType],
    )

    const row = result.rows[0]
    if (!row) {
      throw new Error(
        'Document sequence allocation invariant failed: no row returned',
      )
    }

    return {
      documentNumber: parseDocumentNumber(row.last_number),
      allocatedAt: row.updated_at,
    }
  }
}
