import { randomUUID } from 'node:crypto'
import type { PoolClient, QueryResultRow } from 'pg'

import {
  BranchScopeService,
  type AuthorizationQueryClient,
} from '../authorization/branch-scope-service.js'
import type { TransactionOptions, TransactionWork } from '../database/transaction.js'

const MONEY_SCALE = 4
const MONEY_FACTOR = 10_000n
const MAX_NUMERIC_18_4_SCALED = 999_999_999_999_999_999n

export const FINANCIAL_DIRECTIONS = Object.freeze(['IN', 'OUT'] as const)
export type FinancialDirection = (typeof FINANCIAL_DIRECTIONS)[number]

export type FinancialMovementErrorReason =
  | 'POSTING_BATCH_NOT_FOUND'
  | 'POSTING_BATCH_ACTOR_MISMATCH'
  | 'TREASURY_NOT_FOUND'
  | 'TREASURY_INACTIVE'
  | 'TREASURY_BRANCH_MISMATCH'
  | 'MOVEMENT_NOT_FOUND'

export class FinancialMovementError extends Error {
  readonly reason: FinancialMovementErrorReason
  constructor(reason: FinancialMovementErrorReason) {
    super('Financial movement operation rejected')
    this.name = 'FinancialMovementError'
    this.reason = reason
  }
}

export interface FinancialMovementTransactionRunner {
  transaction<T>(work: TransactionWork<T>, options?: TransactionOptions): Promise<T>
}

export interface AppendFinancialMovementInput {
  actorUserId: string
  postingBatchId: string
  treasuryId: string
  direction: FinancialDirection
  amount: string
  occurredAt: Date
  counterpartyId?: string | null
}

export interface FinancialMovementRecord {
  id: string
  treasuryId: string
  branchId: string
  direction: FinancialDirection
  amount: string
  sourceType: string
  sourceId: string
  postingBatchId: string
  counterpartyId: string | null
  occurredAt: Date
  createdBy: string
}

export interface TreasuryBalancePositionRecord {
  treasuryId: string
  currentBalance: string
  version: number
  updatedAt: Date
}

export interface FinancialMovementAppendResult {
  movement: FinancialMovementRecord
  position: TreasuryBalancePositionRecord
}

interface BatchRow extends QueryResultRow {
  id: string
  branch_id: string
  source_type: string
  source_id: string
  operation_type: 'POST' | 'CORRECTION' | 'REVERSAL' | 'DELETE_REVERSAL'
  created_by: string
}
interface TreasuryRow extends QueryResultRow {
  id: string
  branch_id: string
  is_active: boolean
}
interface MovementRow extends QueryResultRow {
  id: string
  treasury_id: string
  branch_id: string
  direction: FinancialDirection
  amount: string
  source_type: string
  source_id: string
  posting_batch_id: string
  counterparty_id: string | null
  occurred_at: Date
  created_by: string
}
interface PositionRow extends QueryResultRow {
  treasury_id: string
  current_balance: string
  version: number
  updated_at: Date
}

function requireNonBlank(name: string, value: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new TypeError(`${name} must be a non-empty string`)
  return value.trim()
}

function parsePositiveMoney(value: string): string {
  requireNonBlank('amount', value)
  const match = /^(\d{1,14})(?:\.(\d{1,4}))?$/.exec(value.trim())
  if (!match) throw new TypeError('amount must be a positive decimal representable as numeric(18,4)')
  const scaled = BigInt(match[1] ?? '0') * MONEY_FACTOR + BigInt((match[2] ?? '').padEnd(MONEY_SCALE, '0') || '0')
  if (scaled <= 0n) throw new RangeError('amount must be greater than zero')
  if (scaled > MAX_NUMERIC_18_4_SCALED) throw new RangeError('amount exceeds numeric(18,4)')
  const whole = scaled / MONEY_FACTOR
  const fraction = (scaled % MONEY_FACTOR).toString().padStart(MONEY_SCALE, '0')
  return `${whole}.${fraction}`
}

function validateDirection(direction: FinancialDirection): void {
  if (!FINANCIAL_DIRECTIONS.includes(direction)) throw new TypeError('direction must be IN or OUT')
}

function mapMovement(row: MovementRow): FinancialMovementRecord {
  return Object.freeze({
    id: row.id, treasuryId: row.treasury_id, branchId: row.branch_id,
    direction: row.direction, amount: row.amount, sourceType: row.source_type,
    sourceId: row.source_id, postingBatchId: row.posting_batch_id,
    counterpartyId: row.counterparty_id, occurredAt: row.occurred_at, createdBy: row.created_by,
  })
}
function mapPosition(row: PositionRow): TreasuryBalancePositionRecord {
  return Object.freeze({
    treasuryId: row.treasury_id, currentBalance: row.current_balance,
    version: row.version, updatedAt: row.updated_at,
  })
}

export class FinancialMovementService {
  private readonly branchScope: BranchScopeService
  constructor(private readonly database: FinancialMovementTransactionRunner) {
    this.branchScope = new BranchScopeService(database)
  }

  async appendWithinTransaction(client: PoolClient, input: AppendFinancialMovementInput): Promise<FinancialMovementAppendResult> {
    requireNonBlank('actorUserId', input.actorUserId)
    requireNonBlank('postingBatchId', input.postingBatchId)
    requireNonBlank('treasuryId', input.treasuryId)
    validateDirection(input.direction)
    const amount = parsePositiveMoney(input.amount)
    if (!(input.occurredAt instanceof Date) || Number.isNaN(input.occurredAt.getTime())) throw new TypeError('occurredAt must be a valid Date')

    const batchResult = await client.query<BatchRow>(
      `SELECT id,branch_id,source_type,source_id,operation_type,created_by
         FROM posting_batches WHERE id=$1 FOR SHARE`, [input.postingBatchId])
    const batch = batchResult.rows[0]
    if (!batch) throw new FinancialMovementError('POSTING_BATCH_NOT_FOUND')
    if (batch.created_by !== input.actorUserId) throw new FinancialMovementError('POSTING_BATCH_ACTOR_MISMATCH')

    await this.branchScope.requireWithinTransaction(client as AuthorizationQueryClient, input.actorUserId, batch.branch_id)

    const treasuryResult = await client.query<TreasuryRow>(
      `SELECT id,branch_id,is_active FROM treasuries WHERE id=$1 FOR UPDATE`, [input.treasuryId])
    const treasury = treasuryResult.rows[0]
    if (!treasury) throw new FinancialMovementError('TREASURY_NOT_FOUND')
    const crossBranchTransfer = batch.source_type === 'TREASURY_TRANSFER'
    if (!crossBranchTransfer && treasury.branch_id !== batch.branch_id) {
      throw new FinancialMovementError('TREASURY_BRANCH_MISMATCH')
    }
    if (crossBranchTransfer && treasury.branch_id !== batch.branch_id) {
      await this.branchScope.requireWithinTransaction(
        client as AuthorizationQueryClient,
        input.actorUserId,
        treasury.branch_id,
      )
    }
    if (!treasury.is_active && batch.operation_type !== 'REVERSAL' && batch.operation_type !== 'DELETE_REVERSAL') {
      throw new FinancialMovementError('TREASURY_INACTIVE')
    }

    if (input.counterpartyId != null) requireNonBlank('counterpartyId', input.counterpartyId)

    await client.query(
      `INSERT INTO treasury_balance_positions(treasury_id,current_balance,version,updated_at)
       VALUES ($1,0,0,clock_timestamp()) ON CONFLICT (treasury_id) DO NOTHING`, [input.treasuryId])
    const locked = await client.query<PositionRow>(
      `SELECT treasury_id,current_balance::text AS current_balance,version,updated_at
         FROM treasury_balance_positions WHERE treasury_id=$1 FOR UPDATE`, [input.treasuryId])
    if (!locked.rows[0]) throw new Error('Treasury balance position lock invariant failed')

    const movementId = randomUUID()
    const inserted = await client.query<MovementRow>(
      `INSERT INTO financial_movements
        (id,treasury_id,branch_id,direction,amount,source_type,source_id,posting_batch_id,counterparty_id,occurred_at,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id,treasury_id,branch_id,direction,amount::text AS amount,source_type,source_id,posting_batch_id,counterparty_id,occurred_at,created_by`,
      [movementId,input.treasuryId,treasury.branch_id,input.direction,amount,batch.source_type,batch.source_id,batch.id,input.counterpartyId ?? null,input.occurredAt,input.actorUserId])
    const movement = inserted.rows[0]
    if (!movement) throw new Error('Financial movement insert invariant failed')

    const positionResult = await client.query<PositionRow>(
      `UPDATE treasury_balance_positions
          SET current_balance=current_balance + CASE WHEN $2='IN' THEN $3::numeric ELSE -$3::numeric END,
              version=version+1,
              updated_at=clock_timestamp()
        WHERE treasury_id=$1
        RETURNING treasury_id,current_balance::text AS current_balance,version,updated_at`,
      [input.treasuryId,input.direction,amount])
    const position = positionResult.rows[0]
    if (!position) throw new Error('Treasury balance position update invariant failed')

    return Object.freeze({movement: mapMovement(movement), position: mapPosition(position)})
  }

  async getMovement(actorUserId: string, movementId: string): Promise<FinancialMovementRecord> {
    requireNonBlank('actorUserId', actorUserId)
    requireNonBlank('movementId', movementId)
    return this.database.transaction(async (client) => {
      const result = await client.query<MovementRow>(
        `SELECT id,treasury_id,branch_id,direction,amount::text AS amount,source_type,source_id,posting_batch_id,counterparty_id,occurred_at,created_by
           FROM financial_movements WHERE id=$1`, [movementId])
      const row = result.rows[0]
      if (!row) throw new FinancialMovementError('MOVEMENT_NOT_FOUND')
      await this.branchScope.requireWithinTransaction(client as AuthorizationQueryClient, actorUserId, row.branch_id)
      return mapMovement(row)
    })
  }

  async getPosition(actorUserId: string, treasuryId: string): Promise<TreasuryBalancePositionRecord> {
    requireNonBlank('actorUserId', actorUserId)
    requireNonBlank('treasuryId', treasuryId)
    return this.database.transaction(async (client) => {
      const treasuryResult = await client.query<TreasuryRow>(
        `SELECT id,branch_id,is_active FROM treasuries WHERE id=$1 FOR KEY SHARE`, [treasuryId])
      const treasury = treasuryResult.rows[0]
      if (!treasury) throw new FinancialMovementError('TREASURY_NOT_FOUND')
      await this.branchScope.requireWithinTransaction(client as AuthorizationQueryClient, actorUserId, treasury.branch_id)
      const result = await client.query<PositionRow>(
        `SELECT treasury_id,current_balance::text AS current_balance,version,updated_at
           FROM treasury_balance_positions WHERE treasury_id=$1`, [treasuryId])
      return result.rows[0] ? mapPosition(result.rows[0]) : Object.freeze({
        treasuryId, currentBalance: '0.0000', version: 0, updatedAt: new Date(0),
      })
    })
  }
}
