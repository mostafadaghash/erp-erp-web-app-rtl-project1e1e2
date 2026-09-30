import { randomUUID } from 'node:crypto'
import type { PoolClient, QueryResultRow } from 'pg'

import { AuditService } from '../audit/audit-service.js'
import { BranchScopedAuthorizationService } from '../authorization/branch-scope-service.js'
import type { TransactionOptions, TransactionWork } from '../database/transaction.js'

export const TREASURY_PERMISSIONS = Object.freeze({
  view: 'finance.accounts.view',
  manage: 'finance.accounts.manage',
} as const)

export type TreasuryErrorReason =
  | 'TREASURY_NOT_FOUND'
  | 'TREASURY_NAME_CONFLICT'
  | 'BRANCH_INACTIVE'

export class TreasuryError extends Error {
  readonly reason: TreasuryErrorReason

  constructor(reason: TreasuryErrorReason) {
    super('Treasury operation rejected')
    this.name = 'TreasuryError'
    this.reason = reason
  }
}

export interface TreasuryTransactionRunner {
  transaction<T>(
    work: TransactionWork<T>,
    options?: TransactionOptions,
  ): Promise<T>
}

export interface TreasuryRecord {
  id: string
  branchId: string
  name: string
  isActive: boolean
  notes: string | null
  createdAt: Date
}

export interface CreateTreasuryInput {
  actorUserId: string
  branchId: string
  name: string
  notes?: string | null
}

export interface UpdateTreasuryInput {
  actorUserId: string
  treasuryId: string
  branchId: string
  name: string
  notes?: string | null
}

export interface SetTreasuryActiveInput {
  actorUserId: string
  treasuryId: string
  branchId: string
  isActive: boolean
}

interface TreasuryRow extends QueryResultRow {
  id: string
  branch_id: string
  name: string
  is_active: boolean
  notes: string | null
  created_at: Date
}

interface BranchRow extends QueryResultRow {
  id: string
  company_id: string
  is_active: boolean
}

interface PostgreSqlErrorShape {
  code?: unknown
  constraint?: unknown
}

function requireNonBlank(name: string, value: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`)
  }
}

function normalizeNotes(notes: string | null | undefined): string | null {
  if (notes === undefined || notes === null) return null
  const normalized = notes.trim()
  return normalized.length === 0 ? null : normalized
}

function mapTreasury(row: TreasuryRow): TreasuryRecord {
  return Object.freeze({
    id: row.id,
    branchId: row.branch_id,
    name: row.name,
    isActive: row.is_active,
    notes: row.notes,
    createdAt: row.created_at,
  })
}

function isTreasuryNameConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const pg = error as PostgreSqlErrorShape
  return (
    pg.code === '23505' &&
    pg.constraint === 'ux_treasuries__branch_id_lower_name'
  )
}

/**
 * Phase 09.01 Treasury master only.
 *
 * Financial movements, balances, opening balances, receipts, disbursements,
 * transfers and settlement modes deliberately remain outside this service.
 */
export class TreasuryService {
  private readonly audit = new AuditService()
  private readonly authorization: BranchScopedAuthorizationService

  constructor(private readonly database: TreasuryTransactionRunner) {
    this.authorization = new BranchScopedAuthorizationService(database)
  }

  async create(input: CreateTreasuryInput): Promise<TreasuryRecord> {
    requireNonBlank('actorUserId', input.actorUserId)
    requireNonBlank('branchId', input.branchId)
    requireNonBlank('treasury name', input.name)

    try {
      return await this.database.transaction(async (client) => {
        await this.authorization.requireWithinTransaction(
          client,
          input.actorUserId,
          TREASURY_PERMISSIONS.manage,
          input.branchId,
        )
        const branch = await this.requireActiveBranch(client, input.branchId)
        const treasuryId = randomUUID()
        const name = input.name.trim()
        const notes = normalizeNotes(input.notes)

        const result = await client.query<TreasuryRow>(
          `INSERT INTO treasuries
            (id,branch_id,name,is_active,notes,created_at)
           VALUES ($1,$2,$3,true,$4,clock_timestamp())
           RETURNING id,branch_id,name,is_active,notes,created_at`,
          [treasuryId, input.branchId, name, notes],
        )
        const row = result.rows[0]
        if (!row) throw new Error('Treasury insert invariant failed')

        await this.audit.record(client, {
          companyId: branch.company_id,
          branchId: input.branchId,
          userId: input.actorUserId,
          action: 'TREASURY_CREATED',
          entityType: 'TREASURY',
          entityId: treasuryId,
          after: { name, isActive: true, notes },
        })

        return mapTreasury(row)
      })
    } catch (error) {
      if (isTreasuryNameConflict(error)) {
        throw new TreasuryError('TREASURY_NAME_CONFLICT')
      }
      throw error
    }
  }

  async list(
    actorUserId: string,
    branchId: string,
  ): Promise<readonly TreasuryRecord[]> {
    requireNonBlank('actorUserId', actorUserId)
    requireNonBlank('branchId', branchId)

    return this.database.transaction(async (client) => {
      await this.authorization.requireWithinTransaction(
        client,
        actorUserId,
        TREASURY_PERMISSIONS.view,
        branchId,
      )
      await this.requireActiveBranch(client, branchId)

      const result = await client.query<TreasuryRow>(
        `SELECT id,branch_id,name,is_active,notes,created_at
           FROM treasuries
          WHERE branch_id=$1
          ORDER BY lower(name),id`,
        [branchId],
      )
      return Object.freeze(result.rows.map(mapTreasury))
    })
  }

  async update(input: UpdateTreasuryInput): Promise<TreasuryRecord> {
    requireNonBlank('actorUserId', input.actorUserId)
    requireNonBlank('treasuryId', input.treasuryId)
    requireNonBlank('branchId', input.branchId)
    requireNonBlank('treasury name', input.name)

    try {
      return await this.database.transaction(async (client) => {
        await this.authorization.requireWithinTransaction(
          client,
          input.actorUserId,
          TREASURY_PERMISSIONS.manage,
          input.branchId,
        )
        const branch = await this.requireActiveBranch(client, input.branchId)
        const before = await this.requireTreasury(
          client,
          input.treasuryId,
          input.branchId,
        )
        const name = input.name.trim()
        const notes = normalizeNotes(input.notes)

        const result = await client.query<TreasuryRow>(
          `UPDATE treasuries
              SET name=$3,notes=$4
            WHERE id=$1 AND branch_id=$2
            RETURNING id,branch_id,name,is_active,notes,created_at`,
          [input.treasuryId, input.branchId, name, notes],
        )
        const row = result.rows[0]
        if (!row) throw new Error('Treasury update invariant failed')

        if (before.name !== name || before.notes !== notes) {
          await this.audit.record(client, {
            companyId: branch.company_id,
            branchId: input.branchId,
            userId: input.actorUserId,
            action: 'TREASURY_UPDATED',
            entityType: 'TREASURY',
            entityId: input.treasuryId,
            before: { name: before.name, notes: before.notes },
            after: { name, notes },
          })
        }

        return mapTreasury(row)
      })
    } catch (error) {
      if (isTreasuryNameConflict(error)) {
        throw new TreasuryError('TREASURY_NAME_CONFLICT')
      }
      throw error
    }
  }

  async setActive(input: SetTreasuryActiveInput): Promise<TreasuryRecord> {
    requireNonBlank('actorUserId', input.actorUserId)
    requireNonBlank('treasuryId', input.treasuryId)
    requireNonBlank('branchId', input.branchId)

    return this.database.transaction(async (client) => {
      await this.authorization.requireWithinTransaction(
        client,
        input.actorUserId,
        TREASURY_PERMISSIONS.manage,
        input.branchId,
      )
      const branch = await this.requireActiveBranch(client, input.branchId)
      const before = await this.requireTreasury(
        client,
        input.treasuryId,
        input.branchId,
      )
      if (before.is_active === input.isActive) return mapTreasury(before)

      const result = await client.query<TreasuryRow>(
        `UPDATE treasuries
            SET is_active=$3
          WHERE id=$1 AND branch_id=$2
          RETURNING id,branch_id,name,is_active,notes,created_at`,
        [input.treasuryId, input.branchId, input.isActive],
      )
      const row = result.rows[0]
      if (!row) throw new Error('Treasury active-state invariant failed')

      await this.audit.record(client, {
        companyId: branch.company_id,
        branchId: input.branchId,
        userId: input.actorUserId,
        action: input.isActive ? 'TREASURY_ACTIVATED' : 'TREASURY_DEACTIVATED',
        entityType: 'TREASURY',
        entityId: input.treasuryId,
        before: { isActive: before.is_active },
        after: { isActive: input.isActive },
      })

      return mapTreasury(row)
    })
  }

  private async requireActiveBranch(
    client: PoolClient,
    branchId: string,
  ): Promise<BranchRow> {
    const result = await client.query<BranchRow>(
      `SELECT id,company_id,is_active
         FROM branches
        WHERE id=$1
        FOR KEY SHARE`,
      [branchId],
    )
    const row = result.rows[0]
    if (!row) throw new TreasuryError('BRANCH_INACTIVE')
    if (!row.is_active) throw new TreasuryError('BRANCH_INACTIVE')
    return row
  }

  private async requireTreasury(
    client: PoolClient,
    treasuryId: string,
    branchId: string,
  ): Promise<TreasuryRow> {
    const result = await client.query<TreasuryRow>(
      `SELECT id,branch_id,name,is_active,notes,created_at
         FROM treasuries
        WHERE id=$1 AND branch_id=$2
        FOR UPDATE`,
      [treasuryId, branchId],
    )
    const row = result.rows[0]
    if (!row) throw new TreasuryError('TREASURY_NOT_FOUND')
    return row
  }
}
