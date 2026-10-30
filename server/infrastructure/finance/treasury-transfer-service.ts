import { randomUUID } from 'node:crypto'
import type { PoolClient, QueryResultRow } from 'pg'

import { AuditService } from '../audit/audit-service.js'
import {
  BranchScopedAuthorizationService,
  type AuthorizationQueryClient,
} from '../authorization/branch-scope-service.js'
import type { TransactionOptions, TransactionWork } from '../database/transaction.js'
import {
  FinancialMovementService,
  type FinancialMovementAppendResult,
} from './financial-movement-service.js'
import {
  IdempotencyService,
  type IdempotencyExecution,
} from '../idempotency/idempotency-service.js'
import { TransactionalOutboxService } from '../outbox/transactional-outbox.js'
import { PostingBatchService } from '../posting/posting-batch-service.js'
import { DocumentSequenceService } from '../sequences/document-sequence-service.js'
import { TREASURY_PERMISSIONS } from './treasury-service.js'

const MONEY_SCALE = 4
const MONEY_FACTOR = 10_000n
const MAX_NUMERIC_18_4_SCALED = 999_999_999_999_999_999n

export type TreasuryTransferErrorReason =
  | 'TREASURY_NOT_FOUND'
  | 'TREASURY_INACTIVE'
  | 'BRANCH_INACTIVE'
  | 'SAME_TREASURY'
  | 'ISSUING_BRANCH_MISMATCH'

export class TreasuryTransferError extends Error {
  readonly reason: TreasuryTransferErrorReason
  constructor(reason: TreasuryTransferErrorReason) {
    super('Treasury transfer operation rejected')
    this.name = 'TreasuryTransferError'
    this.reason = reason
  }
}

export interface TreasuryTransferTransactionRunner {
  transaction<T>(work: TransactionWork<T>, options?: TransactionOptions): Promise<T>
}

export interface PostTreasuryTransferInput {
  idempotencyKey: string
  idempotencyExpiresAt: Date
  actorUserId: string
  issuingBranchId: string
  fromTreasuryId: string
  toTreasuryId: string
  amount: string
  occurredAt: Date
  reference?: string | null
  notes?: string | null
}

export interface TreasuryTransferRecord {
  id: string
  issuingBranchId: string
  documentNumber: string
  fromTreasuryId: string
  toTreasuryId: string
  amount: string
  reference: string | null
  notes: string | null
  occurredAt: Date
  postedAt: Date
  createdBy: string
}

export interface PostedTreasuryTransfer {
  transfer: TreasuryTransferRecord
  out: FinancialMovementAppendResult
  incoming: FinancialMovementAppendResult
}

interface TreasuryContextRow extends QueryResultRow {
  id: string
  branch_id: string
  is_active: boolean
  branch_active: boolean
  company_id: string
}
interface TransferRow extends QueryResultRow {
  id: string
  issuing_branch_id: string
  document_number: string
  from_treasury_id: string
  to_treasury_id: string
  amount: string
  reference: string | null
  notes: string | null
  occurred_at: Date
  posted_at: Date
  created_by: string
}

function requireNonBlank(name: string, value: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`)
  }
  return value.trim()
}

function normalizeOptional(name: string, value: string | null | undefined): string | null {
  if (value == null) return null
  const normalized = value.trim()
  if (normalized.length === 0) return null
  return requireNonBlank(name, normalized)
}

function parsePositiveMoney(value: string): string {
  requireNonBlank('amount', value)
  const match = /^(\d{1,14})(?:\.(\d{1,4}))?$/.exec(value.trim())
  if (!match) throw new TypeError('amount must be a positive decimal representable as numeric(18,4)')
  const scaled = BigInt(match[1] ?? '0') * MONEY_FACTOR + BigInt((match[2] ?? '').padEnd(MONEY_SCALE, '0') || '0')
  if (scaled <= 0n) throw new RangeError('amount must be greater than zero')
  if (scaled > MAX_NUMERIC_18_4_SCALED) throw new RangeError('amount exceeds numeric(18,4)')
  return `${scaled / MONEY_FACTOR}.${(scaled % MONEY_FACTOR).toString().padStart(MONEY_SCALE, '0')}`
}

function mapTransfer(row: TransferRow): TreasuryTransferRecord {
  return Object.freeze({
    id: row.id,
    issuingBranchId: row.issuing_branch_id,
    documentNumber: row.document_number,
    fromTreasuryId: row.from_treasury_id,
    toTreasuryId: row.to_treasury_id,
    amount: row.amount,
    reference: row.reference,
    notes: row.notes,
    occurredAt: row.occurred_at,
    postedAt: row.posted_at,
    createdBy: row.created_by,
  })
}

function contextsById(rows: readonly TreasuryContextRow[]): Map<string, TreasuryContextRow> {
  return new Map(rows.map((row) => [row.id, row]))
}

export class TreasuryTransferService {
  private readonly authorization: BranchScopedAuthorizationService
  private readonly idempotency: IdempotencyService
  private readonly sequence = new DocumentSequenceService()
  private readonly posting = new PostingBatchService()
  private readonly financial: FinancialMovementService
  private readonly audit = new AuditService()
  private readonly outbox = new TransactionalOutboxService()

  constructor(private readonly database: TreasuryTransferTransactionRunner) {
    this.authorization = new BranchScopedAuthorizationService(database)
    this.idempotency = new IdempotencyService(database)
    this.financial = new FinancialMovementService(database)
  }

  async post(input: PostTreasuryTransferInput): Promise<IdempotencyExecution<PostedTreasuryTransfer>> {
    requireNonBlank('idempotencyKey', input.idempotencyKey)
    requireNonBlank('actorUserId', input.actorUserId)
    requireNonBlank('issuingBranchId', input.issuingBranchId)
    requireNonBlank('fromTreasuryId', input.fromTreasuryId)
    requireNonBlank('toTreasuryId', input.toTreasuryId)
    if (input.fromTreasuryId === input.toTreasuryId) throw new TreasuryTransferError('SAME_TREASURY')
    const amount = parsePositiveMoney(input.amount)
    if (!(input.occurredAt instanceof Date) || !Number.isFinite(input.occurredAt.getTime())) {
      throw new TypeError('occurredAt must be a valid Date')
    }
    const reference = normalizeOptional('reference', input.reference)
    const notes = normalizeOptional('notes', input.notes)
    const payload = {
      issuingBranchId: input.issuingBranchId,
      fromTreasuryId: input.fromTreasuryId,
      toTreasuryId: input.toTreasuryId,
      amount,
      occurredAt: input.occurredAt.toISOString(),
      reference,
      notes,
    }

    return this.idempotency.execute({
      key: input.idempotencyKey,
      userId: input.actorUserId,
      operationType: 'POST_TREASURY_TRANSFER',
      payload,
      expiresAt: input.idempotencyExpiresAt,
    }, async (client) => {
      const treasuryIds = [input.fromTreasuryId, input.toTreasuryId].sort()
      const discovered = await client.query<TreasuryContextRow>(
        `SELECT t.id,t.branch_id,t.is_active,b.is_active AS branch_active,b.company_id
           FROM treasuries t
           JOIN branches b ON b.id=t.branch_id
          WHERE t.id = ANY($1::uuid[])`,
        [treasuryIds],
      )
      const discoveredById = contextsById(discovered.rows)
      const discoveredSource = discoveredById.get(input.fromTreasuryId)
      const discoveredTarget = discoveredById.get(input.toTreasuryId)
      if (!discoveredSource || !discoveredTarget) throw new TreasuryTransferError('TREASURY_NOT_FOUND')
      if (discoveredSource.branch_id !== input.issuingBranchId) {
        throw new TreasuryTransferError('ISSUING_BRANCH_MISMATCH')
      }

      await this.authorization.requireWithinTransaction(
        client as AuthorizationQueryClient,
        input.actorUserId,
        TREASURY_PERMISSIONS.manage,
        discoveredSource.branch_id,
      )
      if (discoveredTarget.branch_id !== discoveredSource.branch_id) {
        await this.authorization.requireWithinTransaction(
          client as AuthorizationQueryClient,
          input.actorUserId,
          TREASURY_PERMISSIONS.manage,
          discoveredTarget.branch_id,
        )
      }

      const locked = await client.query<TreasuryContextRow>(
        `SELECT t.id,t.branch_id,t.is_active,b.is_active AS branch_active,b.company_id
           FROM treasuries t
           JOIN branches b ON b.id=t.branch_id
          WHERE t.id = ANY($1::uuid[])
          ORDER BY t.id
          FOR UPDATE OF t`,
        [treasuryIds],
      )
      const lockedById = contextsById(locked.rows)
      const source = lockedById.get(input.fromTreasuryId)
      const target = lockedById.get(input.toTreasuryId)
      if (!source || !target) throw new TreasuryTransferError('TREASURY_NOT_FOUND')
      if (source.branch_id !== input.issuingBranchId) {
        throw new TreasuryTransferError('ISSUING_BRANCH_MISMATCH')
      }
      if (!source.branch_active || !target.branch_active) throw new TreasuryTransferError('BRANCH_INACTIVE')
      if (!source.is_active || !target.is_active) throw new TreasuryTransferError('TREASURY_INACTIVE')

      for (const treasuryId of treasuryIds) {
        await client.query(
          `INSERT INTO treasury_balance_positions(treasury_id,current_balance,version,updated_at)
           VALUES($1,0,0,clock_timestamp())
           ON CONFLICT(treasury_id) DO NOTHING`,
          [treasuryId],
        )
      }
      const lockedPositions = await client.query(
        `SELECT treasury_id,current_balance,version
           FROM treasury_balance_positions
          WHERE treasury_id = ANY($1::uuid[])
          ORDER BY treasury_id
          FOR UPDATE`,
        [treasuryIds],
      )
      if (lockedPositions.rowCount !== 2) {
        throw new Error('Treasury transfer position lock invariant failed')
      }

      const transferId = randomUUID()
      const number = await this.sequence.allocate(client, {
        branchId: input.issuingBranchId,
        documentType: 'TREASURY_TRANSFER',
      })
      const inserted = await client.query<TransferRow>(
        `INSERT INTO treasury_transfers
          (id,issuing_branch_id,document_number,from_treasury_id,to_treasury_id,amount,reference,notes,occurred_at,posted_at,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,clock_timestamp(),$10)
         RETURNING id,issuing_branch_id,document_number::text AS document_number,
                   from_treasury_id,to_treasury_id,amount::text AS amount,reference,notes,
                   occurred_at,posted_at,created_by`,
        [
          transferId,
          input.issuingBranchId,
          number.documentNumber.toString(),
          input.fromTreasuryId,
          input.toTreasuryId,
          amount,
          reference,
          notes,
          input.occurredAt,
          input.actorUserId,
        ],
      )
      const transferRow = inserted.rows[0]
      if (!transferRow) throw new Error('Treasury transfer insert invariant failed')
      const transfer = mapTransfer(transferRow)

      const batch = await this.posting.create(client, {
        branchId: input.issuingBranchId,
        sourceType: 'TREASURY_TRANSFER',
        sourceId: transferId,
        operationType: 'POST',
        documentVersion: 1,
        createdBy: input.actorUserId,
      })
      const out = await this.financial.appendWithinTransaction(client, {
        actorUserId: input.actorUserId,
        postingBatchId: batch.id,
        treasuryId: input.fromTreasuryId,
        direction: 'OUT',
        amount,
        occurredAt: input.occurredAt,
      })
      const incoming = await this.financial.appendWithinTransaction(client, {
        actorUserId: input.actorUserId,
        postingBatchId: batch.id,
        treasuryId: input.toTreasuryId,
        direction: 'IN',
        amount,
        occurredAt: input.occurredAt,
      })

      await this.audit.record(client, {
        companyId: source.company_id,
        branchId: input.issuingBranchId,
        userId: input.actorUserId,
        action: 'TREASURY_TRANSFER_POSTED',
        entityType: 'TREASURY_TRANSFER',
        entityId: transferId,
        after: {
          documentNumber: transfer.documentNumber,
          fromTreasuryId: input.fromTreasuryId,
          toTreasuryId: input.toTreasuryId,
          targetBranchId: target.branch_id,
          amount,
          outMovementId: out.movement.id,
          inMovementId: incoming.movement.id,
        },
      })
      await this.outbox.enqueue(client, {
        eventType: 'TREASURY_TRANSFER_POSTED',
        aggregateType: 'TREASURY_TRANSFER',
        aggregateId: transferId,
        payload: {
          issuingBranchId: input.issuingBranchId,
          targetBranchId: target.branch_id,
          documentNumber: transfer.documentNumber,
          outMovementId: out.movement.id,
          inMovementId: incoming.movement.id,
        },
      })

      return {
        value: Object.freeze({ transfer, out, incoming }),
        resultReference: transferId,
      }
    })
  }
}
