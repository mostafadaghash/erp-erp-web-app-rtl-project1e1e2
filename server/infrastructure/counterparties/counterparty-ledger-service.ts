import { randomUUID } from 'node:crypto'
import type { PoolClient, QueryResultRow } from 'pg'

import {
  BranchScopeService,
  type AuthorizationQueryClient,
} from '../authorization/branch-scope-service.js'
import type {
  TransactionOptions,
  TransactionWork,
} from '../database/transaction.js'

export const COUNTERPARTY_LEDGER_KINDS = [
  'CUSTOMER',
  'SUPPLIER',
] as const

export type CounterpartyLedgerKind =
  (typeof COUNTERPARTY_LEDGER_KINDS)[number]

export type CounterpartyLedgerErrorReason =
  | 'COUNTERPARTY_NOT_FOUND'
  | 'ROLE_MISMATCH'
  | 'POSTING_BATCH_NOT_FOUND'
  | 'POSTING_BATCH_SCOPE_MISMATCH'
  | 'INVALID_AMOUNT'

export class CounterpartyLedgerError extends Error {
  readonly reason: CounterpartyLedgerErrorReason

  constructor(reason: CounterpartyLedgerErrorReason) {
    super('Counterparty ledger operation rejected')
    this.name = 'CounterpartyLedgerError'
    this.reason = reason
  }
}

export interface CounterpartyLedgerTransactionRunner {
  transaction<T>(
    work: TransactionWork<T>,
    options?: TransactionOptions,
  ): Promise<T>
}

export interface AppendCounterpartyLedgerEntryInput {
  actorUserId: string
  counterpartyId: string
  branchId: string
  entryType: string
  amount: string
  sourceType: string
  sourceId: string
  postingBatchId: string
  occurredAt: Date
}

export interface CounterpartyLedgerStatementInput {
  actorUserId: string
  counterpartyId: string
  branchId: string
}

export interface CounterpartyLedgerEntry {
  id: string
  counterpartyId: string
  branchId: string
  entryType: string
  amount: string
  sourceType: string
  sourceId: string
  postingBatchId: string
  occurredAt: Date
  createdBy: string
}

interface CounterpartyRoleRow extends QueryResultRow {
  counterparty_id: string
}

interface PostingBatchRow extends QueryResultRow {
  id: string
  branch_id: string
  source_type: string
  source_id: string
}

interface LedgerEntryRow extends QueryResultRow {
  id: string
  counterparty_id: string
  branch_id: string
  entry_type: string
  amount: string
  source_type: string
  source_id: string
  posting_batch_id: string
  occurred_at: Date
  created_by: string
}

function requireNonBlank(name: string, value: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`)
  }
}

function normalizeAmount(value: string): string {
  requireNonBlank('amount', value)
  if (!/^\d{1,14}(?:\.\d{1,4})?$/.test(value)) {
    throw new CounterpartyLedgerError('INVALID_AMOUNT')
  }
  return value
}

function validateAppendInput(
  kind: CounterpartyLedgerKind,
  input: AppendCounterpartyLedgerEntryInput,
): string {
  validateKind(kind)
  requireNonBlank('actorUserId', input.actorUserId)
  requireNonBlank('counterpartyId', input.counterpartyId)
  requireNonBlank('branchId', input.branchId)
  requireNonBlank('entryType', input.entryType)
  requireNonBlank('sourceType', input.sourceType)
  requireNonBlank('sourceId', input.sourceId)
  requireNonBlank('postingBatchId', input.postingBatchId)

  if (
    !(input.occurredAt instanceof Date) ||
    Number.isNaN(input.occurredAt.getTime())
  ) {
    throw new TypeError('occurredAt must be a valid Date')
  }

  return normalizeAmount(input.amount)
}

function validateKind(kind: CounterpartyLedgerKind): void {
  if (!COUNTERPARTY_LEDGER_KINDS.includes(kind)) {
    throw new TypeError('Unsupported counterparty ledger kind')
  }
}

function tableFor(kind: CounterpartyLedgerKind): string {
  validateKind(kind)
  return kind === 'CUSTOMER'
    ? 'customer_ledger_entries'
    : 'supplier_ledger_entries'
}

function roleFor(kind: CounterpartyLedgerKind): string {
  return kind
}

function mapEntry(row: LedgerEntryRow): CounterpartyLedgerEntry {
  return Object.freeze({
    id: row.id,
    counterpartyId: row.counterparty_id,
    branchId: row.branch_id,
    entryType: row.entry_type,
    amount: row.amount,
    sourceType: row.source_type,
    sourceId: row.source_id,
    postingBatchId: row.posting_batch_id,
    occurredAt: row.occurred_at,
    createdBy: row.created_by,
  })
}

async function requireCounterpartyRole(
  client: PoolClient,
  counterpartyId: string,
  kind: CounterpartyLedgerKind,
): Promise<void> {
  const counterparty = await client.query(
    `SELECT 1
       FROM counterparties
      WHERE id=$1`,
    [counterpartyId],
  )
  if (counterparty.rowCount !== 1) {
    throw new CounterpartyLedgerError('COUNTERPARTY_NOT_FOUND')
  }

  const role = await client.query<CounterpartyRoleRow>(
    `SELECT counterparty_id
       FROM counterparty_roles
      WHERE counterparty_id=$1
        AND role=$2`,
    [counterpartyId, roleFor(kind)],
  )
  if (role.rowCount !== 1) {
    throw new CounterpartyLedgerError('ROLE_MISMATCH')
  }
}

async function requirePostingBatchScope(
  client: PoolClient,
  input: AppendCounterpartyLedgerEntryInput,
): Promise<void> {
  const result = await client.query<PostingBatchRow>(
    `SELECT id,branch_id,source_type,source_id
       FROM posting_batches
      WHERE id=$1
      FOR SHARE`,
    [input.postingBatchId],
  )

  const batch = result.rows[0]
  if (!batch) {
    throw new CounterpartyLedgerError(
      'POSTING_BATCH_NOT_FOUND',
    )
  }

  if (
    batch.branch_id !== input.branchId ||
    batch.source_type !== input.sourceType ||
    batch.source_id !== input.sourceId
  ) {
    throw new CounterpartyLedgerError(
      'POSTING_BATCH_SCOPE_MISMATCH',
    )
  }
}

/**
 * Append-only Customer/Supplier Ledger primitive.
 *
 * No update/delete/balance mutation API is exposed. Historical corrections
 * are represented by new rows tied to CORRECTION/REVERSAL posting batches.
 * Entry-type vocabulary stays owned by the posting use case because Baseline
 * v1.7 does not freeze a global ledger entry_type enum in 06.03.
 */
export class CounterpartyLedgerService {
  private readonly branchScope: BranchScopeService

  constructor(
    private readonly database: CounterpartyLedgerTransactionRunner,
  ) {
    this.branchScope = new BranchScopeService(database)
  }

  async append(
    kind: CounterpartyLedgerKind,
    input: AppendCounterpartyLedgerEntryInput,
  ): Promise<CounterpartyLedgerEntry> {
    validateAppendInput(kind, input)
    return this.database.transaction((client) =>
      this.appendWithinTransaction(client, kind, input),
    )
  }

  async appendWithinTransaction(
    client: PoolClient,
    kind: CounterpartyLedgerKind,
    input: AppendCounterpartyLedgerEntryInput,
  ): Promise<CounterpartyLedgerEntry> {
    const amount = validateAppendInput(kind, input)

    await this.branchScope.requireWithinTransaction(
      client as AuthorizationQueryClient,
      input.actorUserId,
      input.branchId,
    )
    await requireCounterpartyRole(
      client,
      input.counterpartyId,
      kind,
    )
    await requirePostingBatchScope(client, input)

    const table = tableFor(kind)
    const result = await client.query<LedgerEntryRow>(
      `INSERT INTO ${table}
        (id,counterparty_id,branch_id,entry_type,amount,source_type,
         source_id,posting_batch_id,occurred_at,created_by)
       VALUES ($1,$2,$3,$4,$5::numeric,$6,$7,$8,$9,$10)
       RETURNING
         id,
         counterparty_id,
         branch_id,
         entry_type,
         amount::text AS amount,
         source_type,
         source_id,
         posting_batch_id,
         occurred_at,
         created_by`,
      [
        randomUUID(),
        input.counterpartyId,
        input.branchId,
        input.entryType.trim(),
        amount,
        input.sourceType.trim(),
        input.sourceId,
        input.postingBatchId,
        input.occurredAt,
        input.actorUserId,
      ],
    )

    const row = result.rows[0]
    if (!row) {
      throw new Error(
        'Counterparty ledger insert invariant failed: no row returned',
      )
    }
    return mapEntry(row)
  }

  async statement(
    kind: CounterpartyLedgerKind,
    input: CounterpartyLedgerStatementInput,
  ): Promise<readonly CounterpartyLedgerEntry[]> {
    validateKind(kind)
    requireNonBlank('actorUserId', input.actorUserId)
    requireNonBlank('counterpartyId', input.counterpartyId)
    requireNonBlank('branchId', input.branchId)

    return this.database.transaction(async (client) => {
      await this.branchScope.requireWithinTransaction(
        client as AuthorizationQueryClient,
        input.actorUserId,
        input.branchId,
      )
      await requireCounterpartyRole(
        client,
        input.counterpartyId,
        kind,
      )

      const table = tableFor(kind)
      const result = await client.query<LedgerEntryRow>(
        `SELECT
           id,
           counterparty_id,
           branch_id,
           entry_type,
           amount::text AS amount,
           source_type,
           source_id,
           posting_batch_id,
           occurred_at,
           created_by
         FROM ${table}
        WHERE counterparty_id=$1
          AND branch_id=$2
        ORDER BY occurred_at DESC,id DESC`,
        [input.counterpartyId, input.branchId],
      )

      return Object.freeze(result.rows.map(mapEntry))
    })
  }
}
