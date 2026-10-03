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

const QUANTITY_SCALE = 6
const QUANTITY_SCALE_FACTOR = 1_000_000n
const MAX_NUMERIC_18_6_SCALED = 999_999_999_999_999_999n

const MONEY_SCALE = 4
const MONEY_SCALE_FACTOR = 10_000n
const MAX_NUMERIC_18_4_SCALED = 999_999_999_999_999_999n

export const INVENTORY_MOVEMENT_TYPES = Object.freeze([
  'OPENING',
  'PURCHASE',
  'SALE',
  'SALES_RETURN',
  'PURCHASE_RETURN',
  'TRANSFER_OUT',
  'TRANSFER_IN',
  'ADJUSTMENT',
] as const)

export type InventoryMovementType =
  (typeof INVENTORY_MOVEMENT_TYPES)[number]

const MOVEMENT_TYPE_SET = new Set<string>(
  INVENTORY_MOVEMENT_TYPES,
)

const INBOUND_MOVEMENT_TYPES = new Set<InventoryMovementType>([
  'OPENING',
  'PURCHASE',
  'SALES_RETURN',
  'TRANSFER_IN',
])

const OUTBOUND_MOVEMENT_TYPES = new Set<InventoryMovementType>([
  'SALE',
  'PURCHASE_RETURN',
  'TRANSFER_OUT',
])

export type InventoryLedgerErrorReason =
  | 'POSTING_BATCH_NOT_FOUND'
  | 'POSTING_BATCH_ACTOR_MISMATCH'
  | 'POSTING_BATCH_BRANCH_MISMATCH'
  | 'WAREHOUSE_NOT_FOUND'
  | 'WAREHOUSE_INACTIVE'
  | 'VARIANT_NOT_FOUND'
  | 'MOVEMENT_NOT_FOUND'
  | 'INVALID_MOVEMENT_DIRECTION'

export class InventoryLedgerError extends Error {
  readonly reason: InventoryLedgerErrorReason

  constructor(reason: InventoryLedgerErrorReason) {
    super('Inventory ledger operation rejected')
    this.name = 'InventoryLedgerError'
    this.reason = reason
  }
}

export interface InventoryLedgerTransactionRunner {
  transaction<T>(
    work: TransactionWork<T>,
    options?: TransactionOptions,
  ): Promise<T>
}

export interface InventoryMovementLineInput {
  variantId: string
  quantitySigned: string
  unitCost: string
  totalCost: string
}

export interface AppendInventoryMovementInput {
  actorUserId: string
  postingBatchId: string
  warehouseId: string
  movementType: InventoryMovementType
  reasonCode?: string | null
  notes?: string | null
  lines: readonly InventoryMovementLineInput[]
}

export interface InventoryMovementLineRecord {
  id: string
  movementId: string
  variantId: string
  quantitySigned: string
  unitCost: string
  totalCost: string
}

export interface InventoryMovementRecord {
  id: string
  branchId: string
  warehouseId: string
  movementType: InventoryMovementType
  sourceType: string
  sourceId: string
  postingBatchId: string
  occurredAt: Date
  createdBy: string
  reasonCode: string | null
  notes: string | null
  lines: readonly InventoryMovementLineRecord[]
}

export interface GetInventoryMovementInput {
  actorUserId: string
  movementId: string
}

interface DecimalValue {
  normalized: string
  scaled: bigint
}

interface PostingBatchRow extends QueryResultRow {
  id: string
  branch_id: string
  source_type: string
  source_id: string
  operation_type: 'POST' | 'CORRECTION' | 'REVERSAL' | 'DELETE_REVERSAL'
  posted_at: Date
  created_by: string
}

interface WarehouseRow extends QueryResultRow {
  id: string
  branch_id: string
  is_active: boolean
}

interface MovementRow extends QueryResultRow {
  id: string
  branch_id: string
  warehouse_id: string
  movement_type: InventoryMovementType
  source_type: string
  source_id: string
  posting_batch_id: string
  occurred_at: Date
  created_by: string
  reason_code: string | null
  notes: string | null
}

interface MovementLineRow extends QueryResultRow {
  id: string
  movement_id: string
  variant_id: string
  quantity_signed: string
  unit_cost: string
  total_cost: string
}

interface ValidatedLine {
  variantId: string
  quantitySigned: string
  quantityScaled: bigint
  unitCost: string
  totalCost: string
}

function requireNonBlank(name: string, value: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`)
  }
  return value.trim()
}

function normalizeNullableText(
  name: string,
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) return null
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new TypeError(`${name} cannot be blank`)
  }
  return trimmed
}

function formatScaled(
  scaled: bigint,
  scale: number,
): string {
  const factor = 10n ** BigInt(scale)
  const negative = scaled < 0n
  const absolute = negative ? -scaled : scaled
  const integerPart = absolute / factor
  const fractionalPart = (absolute % factor)
    .toString()
    .padStart(scale, '0')

  return `${negative ? '-' : ''}${integerPart.toString()}.${fractionalPart}`
}

function parseSignedQuantity(
  name: string,
  value: string,
): DecimalValue {
  requireNonBlank(name, value)
  const trimmed = value.trim()
  const match = /^(-?)(\d{1,12})(?:\.(\d{1,6}))?$/.exec(
    trimmed,
  )
  if (!match) {
    throw new TypeError(
      `${name} must be a signed decimal representable as numeric(18,6)`,
    )
  }

  const sign = match[1] === '-' ? -1n : 1n
  const integerPart = match[2] ?? '0'
  const fraction = (match[3] ?? '').padEnd(
    QUANTITY_SCALE,
    '0',
  )
  const absoluteScaled =
    BigInt(integerPart) * QUANTITY_SCALE_FACTOR +
    BigInt(fraction || '0')

  if (absoluteScaled > MAX_NUMERIC_18_6_SCALED) {
    throw new RangeError(`${name} exceeds numeric(18,6)`)
  }

  const scaled = absoluteScaled * sign
  if (scaled === 0n) {
    throw new RangeError(`${name} must be non-zero`)
  }

  return {
    normalized: formatScaled(scaled, QUANTITY_SCALE),
    scaled,
  }
}

function parseMoney(
  name: string,
  value: string,
): DecimalValue {
  requireNonBlank(name, value)
  const trimmed = value.trim()
  const match = /^(\d{1,14})(?:\.(\d{1,4}))?$/.exec(
    trimmed,
  )
  if (!match) {
    throw new TypeError(
      `${name} must be a non-negative decimal representable as numeric(18,4)`,
    )
  }

  const integerPart = match[1] ?? '0'
  const fraction = (match[2] ?? '').padEnd(
    MONEY_SCALE,
    '0',
  )
  const scaled =
    BigInt(integerPart) * MONEY_SCALE_FACTOR +
    BigInt(fraction || '0')

  if (scaled > MAX_NUMERIC_18_4_SCALED) {
    throw new RangeError(`${name} exceeds numeric(18,4)`)
  }

  return {
    normalized: formatScaled(scaled, MONEY_SCALE),
    scaled,
  }
}

function validateMovementType(
  movementType: InventoryMovementType,
): void {
  if (!MOVEMENT_TYPE_SET.has(movementType)) {
    throw new TypeError('Unsupported inventory movement type')
  }
}

function validateDirection(
  movementType: InventoryMovementType,
  quantityScaled: bigint,
): void {
  if (
    INBOUND_MOVEMENT_TYPES.has(movementType) &&
    quantityScaled <= 0n
  ) {
    throw new InventoryLedgerError(
      'INVALID_MOVEMENT_DIRECTION',
    )
  }
  if (
    OUTBOUND_MOVEMENT_TYPES.has(movementType) &&
    quantityScaled >= 0n
  ) {
    throw new InventoryLedgerError(
      'INVALID_MOVEMENT_DIRECTION',
    )
  }
}

function validateAppendInput(
  input: AppendInventoryMovementInput,
): {
  reasonCode: string | null
  notes: string | null
  lines: readonly ValidatedLine[]
} {
  requireNonBlank('actorUserId', input.actorUserId)
  requireNonBlank('postingBatchId', input.postingBatchId)
  requireNonBlank('warehouseId', input.warehouseId)
  validateMovementType(input.movementType)

  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    throw new TypeError(
      'Inventory movement must contain at least one line',
    )
  }

  const lines = input.lines.map((line, index) => {
    requireNonBlank(
      `lines[${index}].variantId`,
      line.variantId,
    )
    const quantity = parseSignedQuantity(
      `lines[${index}].quantitySigned`,
      line.quantitySigned,
    )
    validateDirection(input.movementType, quantity.scaled)
    const unitCost = parseMoney(
      `lines[${index}].unitCost`,
      line.unitCost,
    )
    const totalCost = parseMoney(
      `lines[${index}].totalCost`,
      line.totalCost,
    )

    return Object.freeze({
      variantId: line.variantId,
      quantitySigned: quantity.normalized,
      quantityScaled: quantity.scaled,
      unitCost: unitCost.normalized,
      totalCost: totalCost.normalized,
    })
  })

  return {
    reasonCode: normalizeNullableText(
      'reasonCode',
      input.reasonCode,
    ),
    notes: normalizeNullableText('notes', input.notes),
    lines,
  }
}

async function requirePostingBatch(
  client: PoolClient,
  postingBatchId: string,
): Promise<PostingBatchRow> {
  const result = await client.query<PostingBatchRow>(
    `SELECT
       id,
       branch_id,
       source_type,
       source_id,
       operation_type,
       posted_at,
       created_by
     FROM posting_batches
    WHERE id=$1
    FOR SHARE`,
    [postingBatchId],
  )
  const row = result.rows[0]
  if (!row) {
    throw new InventoryLedgerError(
      'POSTING_BATCH_NOT_FOUND',
    )
  }
  return row
}

async function requireWarehouse(
  client: PoolClient,
  warehouseId: string,
): Promise<WarehouseRow> {
  const result = await client.query<WarehouseRow>(
    `SELECT id,branch_id,is_active
       FROM warehouses
      WHERE id=$1
      FOR KEY SHARE`,
    [warehouseId],
  )
  const row = result.rows[0]
  if (!row) {
    throw new InventoryLedgerError('WAREHOUSE_NOT_FOUND')
  }
  return row
}

async function requireVariants(
  client: PoolClient,
  variantIds: readonly string[],
): Promise<void> {
  const uniqueVariantIds = [...new Set(variantIds)]
  const result = await client.query<{ id: string } & QueryResultRow>(
    `SELECT id
       FROM product_variants
      WHERE id = ANY($1::uuid[])
      FOR KEY SHARE`,
    [uniqueVariantIds],
  )

  if (result.rowCount !== uniqueVariantIds.length) {
    throw new InventoryLedgerError('VARIANT_NOT_FOUND')
  }
}

function mapLine(
  row: MovementLineRow,
): InventoryMovementLineRecord {
  return Object.freeze({
    id: row.id,
    movementId: row.movement_id,
    variantId: row.variant_id,
    quantitySigned: row.quantity_signed,
    unitCost: row.unit_cost,
    totalCost: row.total_cost,
  })
}

async function readLines(
  client: PoolClient,
  movementId: string,
): Promise<readonly InventoryMovementLineRecord[]> {
  const result = await client.query<MovementLineRow>(
    `SELECT
       id,
       movement_id,
       variant_id,
       quantity_signed::text AS quantity_signed,
       unit_cost::text AS unit_cost,
       total_cost::text AS total_cost
     FROM inventory_movement_lines
    WHERE movement_id=$1
    ORDER BY id`,
    [movementId],
  )

  return Object.freeze(result.rows.map(mapLine))
}

async function mapMovementWithLines(
  client: PoolClient,
  row: MovementRow,
): Promise<InventoryMovementRecord> {
  const lines = await readLines(client, row.id)
  return Object.freeze({
    id: row.id,
    branchId: row.branch_id,
    warehouseId: row.warehouse_id,
    movementType: row.movement_type,
    sourceType: row.source_type,
    sourceId: row.source_id,
    postingBatchId: row.posting_batch_id,
    occurredAt: row.occurred_at,
    createdBy: row.created_by,
    reasonCode: row.reason_code,
    notes: row.notes,
    lines,
  })
}

/**
 * Immutable Inventory Ledger primitive.
 *
 * Writes intentionally require an already-open business transaction. The caller
 * creates the PostingBatch in that same transaction, then appends Inventory
 * Movement(s), then the later module-specific effects (Stock Position, Cost,
 * Serial/Batch, Accounting, Audit/Outbox) before one COMMIT.
 *
 * 08.01 never mutates Inventory Stock Positions. That starts in 08.02.
 */
export class InventoryLedgerService {
  private readonly branchScope: BranchScopeService

  constructor(
    private readonly database: InventoryLedgerTransactionRunner,
  ) {
    this.branchScope = new BranchScopeService(database)
  }

  async appendWithinTransaction(
    client: PoolClient,
    input: AppendInventoryMovementInput,
  ): Promise<InventoryMovementRecord> {
    const validated = validateAppendInput(input)
    const batch = await requirePostingBatch(
      client,
      input.postingBatchId,
    )
    const warehouse = await requireWarehouse(
      client,
      input.warehouseId,
    )

    await this.branchScope.requireWithinTransaction(
      client as AuthorizationQueryClient,
      input.actorUserId,
      warehouse.branch_id,
    )

    if (batch.created_by !== input.actorUserId) {
      throw new InventoryLedgerError(
        'POSTING_BATCH_ACTOR_MISMATCH',
      )
    }

    if (
      input.movementType !== 'TRANSFER_IN' &&
      batch.branch_id !== warehouse.branch_id
    ) {
      throw new InventoryLedgerError(
        'POSTING_BATCH_BRANCH_MISMATCH',
      )
    }

    if (
      !warehouse.is_active &&
      batch.operation_type !== 'REVERSAL' &&
      batch.operation_type !== 'DELETE_REVERSAL'
    ) {
      throw new InventoryLedgerError(
        'WAREHOUSE_INACTIVE',
      )
    }

    await requireVariants(
      client,
      validated.lines.map((line) => line.variantId),
    )

    const movementId = randomUUID()
    const inserted = await client.query<MovementRow>(
      `INSERT INTO inventory_movements
        (id,branch_id,warehouse_id,movement_type,source_type,source_id,
         posting_batch_id,occurred_at,created_by,reason_code,notes)
       SELECT
         $1,
         $2,
         $3,
         $4,
         pb.source_type,
         pb.source_id,
         pb.id,
         pb.posted_at,
         $5,
         $6,
         $7
       FROM posting_batches pb
       WHERE pb.id=$8
       RETURNING
         id,
         branch_id,
         warehouse_id,
         movement_type,
         source_type,
         source_id,
         posting_batch_id,
         occurred_at,
         created_by,
         reason_code,
         notes`,
      [
        movementId,
        warehouse.branch_id,
        input.warehouseId,
        input.movementType,
        input.actorUserId,
        validated.reasonCode,
        validated.notes,
        batch.id,
      ],
    )
    const movement = inserted.rows[0]
    if (!movement) {
      throw new Error(
        'Inventory movement insert invariant failed: no row returned',
      )
    }

    for (const line of validated.lines) {
      await client.query(
        `INSERT INTO inventory_movement_lines
          (id,movement_id,variant_id,quantity_signed,unit_cost,total_cost)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          randomUUID(),
          movementId,
          line.variantId,
          line.quantitySigned,
          line.unitCost,
          line.totalCost,
        ],
      )
    }

    return mapMovementWithLines(client, movement)
  }

  async getMovement(
    input: GetInventoryMovementInput,
  ): Promise<InventoryMovementRecord> {
    requireNonBlank('actorUserId', input.actorUserId)
    requireNonBlank('movementId', input.movementId)

    return this.database.transaction(async (client) => {
      const result = await client.query<MovementRow>(
        `SELECT
           id,
           branch_id,
           warehouse_id,
           movement_type,
           source_type,
           source_id,
           posting_batch_id,
           occurred_at,
           created_by,
           reason_code,
           notes
         FROM inventory_movements
        WHERE id=$1`,
        [input.movementId],
      )
      const row = result.rows[0]
      if (!row) {
        throw new InventoryLedgerError(
          'MOVEMENT_NOT_FOUND',
        )
      }

      await this.branchScope.requireWithinTransaction(
        client as AuthorizationQueryClient,
        input.actorUserId,
        row.branch_id,
      )

      return mapMovementWithLines(client, row)
    })
  }
}
