import { randomUUID } from 'node:crypto'
import type { PoolClient, QueryResultRow } from 'pg'

import { AuditService } from '../audit/audit-service.js'
import {
  BranchScopeService,
  BranchScopedAuthorizationService,
  type AuthorizationQueryClient,
} from '../authorization/branch-scope-service.js'
import type {
  TransactionOptions,
  TransactionWork,
} from '../database/transaction.js'

const SCALE = 6
const SCALE_FACTOR = 1_000_000n
const MAX_SCALED = 999_999_999_999_999_999n

export const SELL_EXPIRED_BATCH_PERMISSION =
  'inventory.sell_expired_batch'

export type BatchInventoryErrorReason =
  | 'MOVEMENT_LINE_NOT_FOUND'
  | 'BATCH_TRACKING_DISABLED'
  | 'EXPIRY_REQUIRED'
  | 'EXPIRY_TRACKING_DISABLED'
  | 'BATCH_QUANTITY_MISMATCH'
  | 'MOVEMENT_DIRECTION_MISMATCH'
  | 'BATCH_EXPIRY_MISMATCH'
  | 'INSUFFICIENT_BATCH_AVAILABLE'
  | 'EXPIRED_BATCH_BLOCKED'
  | 'EXPIRED_OVERRIDE_REASON_REQUIRED'
  | 'DUPLICATE_BATCH_INPUT'

export class BatchInventoryError extends Error {
  readonly reason: BatchInventoryErrorReason

  constructor(reason: BatchInventoryErrorReason) {
    super('Batch inventory operation rejected')
    this.name = 'BatchInventoryError'
    this.reason = reason
  }
}

export interface BatchInventoryTransactionRunner {
  transaction<T>(
    work: TransactionWork<T>,
    options?: TransactionOptions,
  ): Promise<T>
}

export interface BatchReceiptAllocationInput {
  batchNumber: string
  expiryDate?: string | null
  quantity: string
}

export interface ReceiveBatchInput {
  actorUserId: string
  movementLineId: string
  batches: readonly BatchReceiptAllocationInput[]
}

export interface IssueBatchFefoInput {
  actorUserId: string
  movementLineId: string
  expiredOverrideReason?: string | null
}

export interface BatchAllocationRecord {
  batchId: string
  batchNumber: string
  expiryDate: string | null
  quantity: string
  isExpired: boolean
}

interface Decimal6 {
  normalized: string
  scaled: bigint
}

interface MovementContextRow extends QueryResultRow {
  movement_line_id: string
  variant_id: string
  quantity_signed: string
  warehouse_id: string
  branch_id: string
  company_id: string
  movement_type: string
  tracking_batch: boolean
  tracking_expiry: boolean
}

interface BatchRow extends QueryResultRow {
  id: string
  variant_id: string
  batch_number: string
  expiry_date: string | null
  created_at: Date
}

interface BatchPositionRow extends QueryResultRow {
  warehouse_id: string
  batch_id: string
  on_hand: string
  reserved: string
  version: number
  updated_at: Date
}

interface CandidateRow extends QueryResultRow {
  batch_id: string
  batch_number: string
  expiry_date: string | null
  created_at: Date
  on_hand: string
  reserved: string
  is_expired: boolean
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
  return requireNonBlank(name, value)
}

function parseDate(
  name: string,
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) return null
  const normalized = requireNonBlank(name, value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new TypeError(`${name} must be YYYY-MM-DD`)
  }
  return normalized
}

function formatScaled(scaled: bigint): string {
  const negative = scaled < 0n
  const absolute = negative ? -scaled : scaled
  const integer = absolute / SCALE_FACTOR
  const fraction = (absolute % SCALE_FACTOR)
    .toString()
    .padStart(SCALE, '0')
  return `${negative ? '-' : ''}${integer.toString()}.${fraction}`
}

function parseQuantity(
  name: string,
  value: string,
  positive = false,
): Decimal6 {
  requireNonBlank(name, value)
  const match = /^(-?)(\d{1,12})(?:\.(\d{1,6}))?$/.exec(value.trim())
  if (!match) {
    throw new TypeError(
      `${name} must be representable as numeric(18,6)`,
    )
  }
  const sign = match[1] === '-' ? -1n : 1n
  const integer = BigInt(match[2] ?? '0')
  const fraction = BigInt(
    (match[3] ?? '').padEnd(SCALE, '0') || '0',
  )
  const absolute = integer * SCALE_FACTOR + fraction
  if (absolute > MAX_SCALED) {
    throw new RangeError(`${name} exceeds numeric(18,6)`)
  }
  const scaled = absolute * sign
  if (positive && scaled <= 0n) {
    throw new RangeError(`${name} must be greater than zero`)
  }
  return Object.freeze({
    normalized: formatScaled(scaled),
    scaled,
  })
}

async function requireContext(
  client: PoolClient,
  movementLineId: string,
): Promise<MovementContextRow> {
  const result = await client.query<MovementContextRow>(
    `SELECT
       iml.id AS movement_line_id,
       iml.variant_id,
       iml.quantity_signed::text AS quantity_signed,
       im.warehouse_id,
       im.branch_id,
       br.company_id,
       im.movement_type,
       p.tracking_batch,
       p.tracking_expiry
     FROM inventory_movement_lines iml
     JOIN inventory_movements im ON im.id=iml.movement_id
     JOIN branches br ON br.id=im.branch_id
     JOIN product_variants pv ON pv.id=iml.variant_id
     JOIN products p ON p.id=pv.product_id
    WHERE iml.id=$1`,
    [movementLineId],
  )
  const row = result.rows[0]
  if (!row) {
    throw new BatchInventoryError('MOVEMENT_LINE_NOT_FOUND')
  }
  if (!row.tracking_batch) {
    throw new BatchInventoryError('BATCH_TRACKING_DISABLED')
  }
  return row
}

function normalizeReceiptAllocations(
  batches: readonly BatchReceiptAllocationInput[],
  trackingExpiry: boolean,
): readonly {
  batchNumber: string
  expiryDate: string | null
  quantity: Decimal6
}[] {
  if (!Array.isArray(batches) || batches.length === 0) {
    throw new TypeError('batches must contain at least one allocation')
  }

  const normalized = batches.map((batch, index) => {
    const batchNumber = requireNonBlank(
      `batches[${index}].batchNumber`,
      batch.batchNumber,
    )
    const expiryDate = parseDate(
      `batches[${index}].expiryDate`,
      batch.expiryDate,
    )
    if (trackingExpiry && expiryDate === null) {
      throw new BatchInventoryError('EXPIRY_REQUIRED')
    }
    if (!trackingExpiry && expiryDate !== null) {
      throw new BatchInventoryError('EXPIRY_TRACKING_DISABLED')
    }
    return Object.freeze({
      batchNumber,
      expiryDate,
      quantity: parseQuantity(
        `batches[${index}].quantity`,
        batch.quantity,
        true,
      ),
    })
  })

  const seen = new Set<string>()
  for (const allocation of normalized) {
    if (seen.has(allocation.batchNumber)) {
      throw new BatchInventoryError('DUPLICATE_BATCH_INPUT')
    }
    seen.add(allocation.batchNumber)
  }

  return Object.freeze(
    [...normalized].sort((a, b) =>
      a.batchNumber.localeCompare(b.batchNumber),
    ),
  )
}

async function lockOrCreateBatch(
  client: PoolClient,
  variantId: string,
  batchNumber: string,
  expiryDate: string | null,
): Promise<BatchRow> {
  await client.query(
    `INSERT INTO batches
      (id,variant_id,batch_number,expiry_date,created_at)
     VALUES ($1,$2,$3,$4,clock_timestamp())
     ON CONFLICT (variant_id,batch_number) DO NOTHING`,
    [randomUUID(), variantId, batchNumber, expiryDate],
  )
  const result = await client.query<BatchRow>(
    `SELECT id,variant_id,batch_number,expiry_date::text AS expiry_date,created_at
       FROM batches
      WHERE variant_id=$1 AND batch_number=$2
      FOR UPDATE`,
    [variantId, batchNumber],
  )
  const row = result.rows[0]
  if (!row) {
    throw new Error('Batch identity lock invariant failed')
  }
  if (row.expiry_date !== expiryDate) {
    throw new BatchInventoryError('BATCH_EXPIRY_MISMATCH')
  }
  return row
}

async function lockBatchPosition(
  client: PoolClient,
  warehouseId: string,
  batchId: string,
): Promise<BatchPositionRow> {
  await client.query(
    `INSERT INTO batch_stock_positions
      (warehouse_id,batch_id,on_hand,reserved,version,updated_at)
     VALUES ($1,$2,0,0,0,clock_timestamp())
     ON CONFLICT (warehouse_id,batch_id) DO NOTHING`,
    [warehouseId, batchId],
  )
  const result = await client.query<BatchPositionRow>(
    `SELECT
       warehouse_id,batch_id,on_hand::text AS on_hand,
       reserved::text AS reserved,version,updated_at
     FROM batch_stock_positions
    WHERE warehouse_id=$1 AND batch_id=$2
    FOR UPDATE`,
    [warehouseId, batchId],
  )
  const row = result.rows[0]
  if (!row) {
    throw new Error('Batch position lock invariant failed')
  }
  return row
}

function availableScaled(row: { on_hand: string; reserved: string }): bigint {
  return (
    parseQuantity('batch.onHand', row.on_hand).scaled -
    parseQuantity('batch.reserved', row.reserved).scaled
  )
}

export class BatchInventoryService {
  private readonly branchScope: BranchScopeService
  private readonly authorization: BranchScopedAuthorizationService
  private readonly audit = new AuditService()

  constructor(
    private readonly database: BatchInventoryTransactionRunner,
  ) {
    this.branchScope = new BranchScopeService(database)
    this.authorization = new BranchScopedAuthorizationService(database)
  }

  async receiveWithinTransaction(
    client: PoolClient,
    input: ReceiveBatchInput,
  ): Promise<readonly BatchAllocationRecord[]> {
    requireNonBlank('actorUserId', input.actorUserId)
    const movementLineId = requireNonBlank('movementLineId', input.movementLineId)
    const context = await requireContext(client, movementLineId)
    await this.branchScope.requireWithinTransaction(
      client as AuthorizationQueryClient,
      input.actorUserId,
      context.branch_id,
    )

    const movementQuantity = parseQuantity(
      'movementQuantity',
      context.quantity_signed,
    )
    if (movementQuantity.scaled <= 0n) {
      throw new BatchInventoryError('MOVEMENT_DIRECTION_MISMATCH')
    }

    const allocations = normalizeReceiptAllocations(
      input.batches,
      context.tracking_expiry,
    )
    const total = allocations.reduce(
      (sum, item) => sum + item.quantity.scaled,
      0n,
    )
    if (total !== movementQuantity.scaled) {
      throw new BatchInventoryError('BATCH_QUANTITY_MISMATCH')
    }

    const result: BatchAllocationRecord[] = []
    for (const allocation of allocations) {
      const batch = await lockOrCreateBatch(
        client,
        context.variant_id,
        allocation.batchNumber,
        allocation.expiryDate,
      )
      const position = await lockBatchPosition(
        client,
        context.warehouse_id,
        batch.id,
      )
      const nextOnHand =
        parseQuantity('batch.onHand', position.on_hand).scaled +
        allocation.quantity.scaled

      await client.query(
        `UPDATE batch_stock_positions
            SET on_hand=$3,
                version=version+1,
                updated_at=clock_timestamp()
          WHERE warehouse_id=$1 AND batch_id=$2`,
        [context.warehouse_id, batch.id, formatScaled(nextOnHand)],
      )
      await client.query(
        `INSERT INTO inventory_line_batches
          (movement_line_id,batch_id,quantity)
         VALUES ($1,$2,$3)`,
        [movementLineId, batch.id, allocation.quantity.normalized],
      )
      result.push(
        Object.freeze({
          batchId: batch.id,
          batchNumber: batch.batch_number,
          expiryDate: batch.expiry_date,
          quantity: allocation.quantity.normalized,
          isExpired: false,
        }),
      )
    }
    return Object.freeze(result)
  }

  async issueFefoWithinTransaction(
    client: PoolClient,
    input: IssueBatchFefoInput,
  ): Promise<readonly BatchAllocationRecord[]> {
    requireNonBlank('actorUserId', input.actorUserId)
    const movementLineId = requireNonBlank('movementLineId', input.movementLineId)
    const overrideReason = normalizeNullableText(
      'expiredOverrideReason',
      input.expiredOverrideReason,
    )
    const context = await requireContext(client, movementLineId)
    await this.branchScope.requireWithinTransaction(
      client as AuthorizationQueryClient,
      input.actorUserId,
      context.branch_id,
    )

    const movementQuantity = parseQuantity(
      'movementQuantity',
      context.quantity_signed,
    )
    if (movementQuantity.scaled >= 0n) {
      throw new BatchInventoryError('MOVEMENT_DIRECTION_MISMATCH')
    }
    const needed = -movementQuantity.scaled

    const candidatesResult = await client.query<CandidateRow>(
      `SELECT
         b.id AS batch_id,
         b.batch_number,
         b.expiry_date::text AS expiry_date,
         b.created_at,
         bsp.on_hand::text AS on_hand,
         bsp.reserved::text AS reserved,
         (b.expiry_date IS NOT NULL AND b.expiry_date < CURRENT_DATE) AS is_expired
       FROM batches b
       JOIN batch_stock_positions bsp ON bsp.batch_id=b.id
      WHERE b.variant_id=$1
        AND bsp.warehouse_id=$2
        AND (bsp.on_hand - bsp.reserved) > 0
      ORDER BY
        CASE
          WHEN b.expiry_date IS NOT NULL AND b.expiry_date >= CURRENT_DATE THEN 0
          WHEN b.expiry_date IS NULL THEN 1
          ELSE 2
        END,
        b.expiry_date ASC NULLS LAST,
        b.created_at ASC,
        b.id
      FOR UPDATE OF bsp`,
      [context.variant_id, context.warehouse_id],
    )

    const nonExpired = candidatesResult.rows.filter((row) => !row.is_expired)
    const expired = candidatesResult.rows.filter((row) => row.is_expired)
    const nonExpiredAvailable = nonExpired.reduce(
      (sum, row) => sum + availableScaled(row),
      0n,
    )
    const allAvailable =
      nonExpiredAvailable +
      expired.reduce((sum, row) => sum + availableScaled(row), 0n)

    if (allAvailable < needed) {
      throw new BatchInventoryError('INSUFFICIENT_BATCH_AVAILABLE')
    }

    let candidates = nonExpired
    if (nonExpiredAvailable < needed) {
      if (context.movement_type === 'SALE') {
        if (overrideReason === null) {
          throw new BatchInventoryError('EXPIRED_BATCH_BLOCKED')
        }
        await this.authorization.requireWithinTransaction(
          client as AuthorizationQueryClient,
          input.actorUserId,
          SELL_EXPIRED_BATCH_PERMISSION,
          context.branch_id,
        )
      }
      candidates = [...nonExpired, ...expired]
    }

    let remaining = needed
    const allocations: BatchAllocationRecord[] = []
    for (const row of candidates) {
      if (remaining === 0n) break
      const available = availableScaled(row)
      if (available <= 0n) continue
      const take = available < remaining ? available : remaining
      const onHand = parseQuantity('batch.onHand', row.on_hand).scaled
      const nextOnHand = onHand - take

      await client.query(
        `UPDATE batch_stock_positions
            SET on_hand=$3,
                version=version+1,
                updated_at=clock_timestamp()
          WHERE warehouse_id=$1 AND batch_id=$2`,
        [context.warehouse_id, row.batch_id, formatScaled(nextOnHand)],
      )
      await client.query(
        `INSERT INTO inventory_line_batches
          (movement_line_id,batch_id,quantity)
         VALUES ($1,$2,$3)`,
        [movementLineId, row.batch_id, formatScaled(take)],
      )

      if (row.is_expired && context.movement_type === 'SALE') {
        if (overrideReason === null) {
          throw new BatchInventoryError('EXPIRED_OVERRIDE_REASON_REQUIRED')
        }
        await this.audit.record(client, {
          companyId: context.company_id,
          branchId: context.branch_id,
          userId: input.actorUserId,
          action: 'inventory.batch.expired_sale_override',
          entityType: 'batch',
          entityId: row.batch_id,
          reason: overrideReason,
          before: {
            expiryDate: row.expiry_date,
            warehouseId: context.warehouse_id,
          },
          after: {
            movementLineId,
            quantity: formatScaled(take),
          },
        })
      }

      allocations.push(
        Object.freeze({
          batchId: row.batch_id,
          batchNumber: row.batch_number,
          expiryDate: row.expiry_date,
          quantity: formatScaled(take),
          isExpired: row.is_expired,
        }),
      )
      remaining -= take
    }

    if (remaining !== 0n) {
      throw new Error('FEFO allocation invariant failed')
    }
    return Object.freeze(allocations)
  }
}
