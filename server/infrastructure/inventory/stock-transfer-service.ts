import { randomUUID } from 'node:crypto'
import type { PoolClient, QueryResultRow } from 'pg'

import { AuditService } from '../audit/audit-service.js'
import {
  BranchScopeService,
  type AuthorizationQueryClient,
} from '../authorization/branch-scope-service.js'
import type {
  TransactionOptions,
  TransactionWork,
} from '../database/transaction.js'
import { DocumentSequenceService } from '../sequences/document-sequence-service.js'
import { TransactionalOutboxService } from '../outbox/transactional-outbox.js'
import { PostingBatchService } from '../posting/posting-batch-service.js'
import {
  InventoryCostService,
  type LockedInventoryCostRecord,
} from './inventory-cost-service.js'
import {
  InventoryLedgerService,
  type InventoryMovementRecord,
} from './inventory-ledger-service.js'

const QUANTITY_FACTOR = 1_000_000n
const MONEY_FACTOR = 10_000n

export type StockTransferErrorReason =
  | 'WAREHOUSE_NOT_FOUND'
  | 'WAREHOUSE_INACTIVE'
  | 'SAME_WAREHOUSE'
  | 'VARIANT_NOT_FOUND'
  | 'INSUFFICIENT_AVAILABLE_STOCK'
  | 'SERIAL_TRACKING_REQUIRES_SERIALS'
  | 'SERIAL_COUNT_MISMATCH'
  | 'SERIAL_NOT_AVAILABLE'
  | 'BATCH_TRACKING_REQUIRES_BATCHES'
  | 'BATCH_QUANTITY_MISMATCH'
  | 'BATCH_NOT_AVAILABLE'

export class StockTransferError extends Error {
  readonly reason: StockTransferErrorReason

  constructor(reason: StockTransferErrorReason) {
    super('Stock transfer operation rejected')
    this.name = 'StockTransferError'
    this.reason = reason
  }
}

export interface StockTransferTransactionRunner {
  transaction<T>(
    work: TransactionWork<T>,
    options?: TransactionOptions,
  ): Promise<T>
}

export interface StockTransferLineInput {
  variantId: string
  quantity: string
  serialNumbers?: readonly string[]
  batches?: readonly {
    batchNumber: string
    quantity: string
  }[]
}

export interface CreateStockTransferInput {
  actorUserId: string
  fromWarehouseId: string
  toWarehouseId: string
  notes?: string | null
  lines: readonly StockTransferLineInput[]
}

export interface StockTransferRecord {
  id: string
  documentNumber: bigint
  issuingBranchId: string
  fromWarehouseId: string
  toWarehouseId: string
  status: 'POSTED'
  postedAt: Date
  outboundMovement: InventoryMovementRecord
  inboundMovement: InventoryMovementRecord
}

interface WarehouseRow extends QueryResultRow {
  id: string
  branch_id: string
  company_id: string
  is_active: boolean
}

interface VariantTrackingRow extends QueryResultRow {
  variant_id: string
  tracking_serial: boolean
  tracking_batch: boolean
}

interface SerialRow extends QueryResultRow {
  id: string
  serial_number: string
  current_warehouse_id: string | null
  status: string
}

interface BatchRow extends QueryResultRow {
  id: string
  batch_number: string
  on_hand: string
  reserved: string
}

function nonBlank(name: string, value: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`)
  }
  return value.trim()
}

function parseQuantity(
  value: string,
  allowZero: boolean,
): { normalized: string; scaled: bigint } {
  nonBlank('quantity', value)
  const match = /^(\d{1,12})(?:\.(\d{1,6}))?$/.exec(value.trim())
  if (!match) throw new TypeError('quantity must be numeric(18,6)')
  const scaled =
    BigInt(match[1] ?? '0') * QUANTITY_FACTOR +
    BigInt((match[2] ?? '').padEnd(6, '0') || '0')
  if (scaled < 0n || (!allowZero && scaled === 0n)) {
    throw new RangeError('quantity must be greater than zero')
  }
  return { normalized: format(scaled, 6), scaled }
}

function quantity(value: string) {
  return parseQuantity(value, false)
}

function nonNegativeQuantity(value: string) {
  return parseQuantity(value, true)
}

function money(value: string): bigint {
  const match = /^(\d{1,14})(?:\.(\d{1,4}))?$/.exec(value)
  if (!match) throw new TypeError('money must be numeric(18,4)')
  return BigInt(match[1] ?? '0') * MONEY_FACTOR +
    BigInt((match[2] ?? '').padEnd(4, '0') || '0')
}

function format(value: bigint, scale: number): string {
  const factor = 10n ** BigInt(scale)
  const negative = value < 0n
  const absolute = negative ? -value : value
  return `${negative ? '-' : ''}${absolute / factor}.${(absolute % factor)
    .toString().padStart(scale, '0')}`
}

function totalCost(qtyScaled: bigint, unitCost: string): string {
  const cost = money(unitCost)
  const numerator = qtyScaled * cost
  const rounded =
    (numerator + QUANTITY_FACTOR / 2n) / QUANTITY_FACTOR
  return format(rounded, 4)
}

function normalizeLines(lines: readonly StockTransferLineInput[]) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new TypeError('lines must contain at least one transfer line')
  }
  const seen = new Set<string>()
  return lines.map((line, index) => {
    const variantId = nonBlank(`lines[${index}].variantId`, line.variantId)
    if (seen.has(variantId)) {
      throw new TypeError('transfer cannot contain duplicate Variant lines')
    }
    seen.add(variantId)
    const parsed = quantity(line.quantity)
    const serialNumbers = Object.freeze(
      [...(line.serialNumbers ?? [])].map((value, serialIndex) =>
        nonBlank(`lines[${index}].serialNumbers[${serialIndex}]`, value),
      ).sort((a, b) => a.localeCompare(b)),
    )
    if (new Set(serialNumbers).size !== serialNumbers.length) {
      throw new TypeError('serialNumbers cannot contain duplicates')
    }
    const batches = Object.freeze(
      [...(line.batches ?? [])].map((batch, batchIndex) => ({
        batchNumber: nonBlank(
          `lines[${index}].batches[${batchIndex}].batchNumber`,
          batch.batchNumber,
        ),
        quantity: quantity(batch.quantity),
      })).sort((a, b) => a.batchNumber.localeCompare(b.batchNumber)),
    )
    if (new Set(batches.map((item) => item.batchNumber)).size !== batches.length) {
      throw new TypeError('batches cannot contain duplicates')
    }
    return Object.freeze({
      variantId,
      quantity: parsed,
      serialNumbers,
      batches,
    })
  }).sort((a, b) => a.variantId.localeCompare(b.variantId))
}

async function warehouses(
  client: PoolClient,
  ids: readonly string[],
): Promise<Map<string, WarehouseRow>> {
  const result = await client.query<WarehouseRow>(
    `SELECT w.id,w.branch_id,b.company_id,w.is_active
       FROM warehouses w
       JOIN branches b ON b.id=w.branch_id
      WHERE w.id=ANY($1::uuid[])
      ORDER BY w.id
      FOR KEY SHARE OF w`,
    [ids],
  )
  return new Map(result.rows.map((row) => [row.id, row]))
}

async function tracking(
  client: PoolClient,
  variantIds: readonly string[],
): Promise<Map<string, VariantTrackingRow>> {
  const result = await client.query<VariantTrackingRow>(
    `SELECT pv.id AS variant_id,p.tracking_serial,p.tracking_batch
       FROM product_variants pv
       JOIN products p ON p.id=pv.product_id
      WHERE pv.id=ANY($1::uuid[])
      ORDER BY pv.id
      FOR KEY SHARE OF pv`,
    [variantIds],
  )
  return new Map(result.rows.map((row) => [row.variant_id, row]))
}

export class StockTransferService {
  private readonly branchScope: BranchScopeService
  private readonly costs: InventoryCostService
  private readonly ledger: InventoryLedgerService
  private readonly posting = new PostingBatchService()
  private readonly sequences = new DocumentSequenceService()
  private readonly audit = new AuditService()
  private readonly outbox = new TransactionalOutboxService()

  constructor(
    private readonly database: StockTransferTransactionRunner,
  ) {
    this.branchScope = new BranchScopeService(database)
    this.costs = new InventoryCostService(database)
    this.ledger = new InventoryLedgerService(database)
  }

  async create(
    input: CreateStockTransferInput,
  ): Promise<StockTransferRecord> {
    const actorUserId = nonBlank('actorUserId', input.actorUserId)
    const fromWarehouseId = nonBlank('fromWarehouseId', input.fromWarehouseId)
    const toWarehouseId = nonBlank('toWarehouseId', input.toWarehouseId)
    if (fromWarehouseId === toWarehouseId) {
      throw new StockTransferError('SAME_WAREHOUSE')
    }
    const lines = normalizeLines(input.lines)

    return this.database.transaction(async (client) => {
      const byWarehouse = await warehouses(
        client,
        [fromWarehouseId, toWarehouseId],
      )
      const source = byWarehouse.get(fromWarehouseId)
      const target = byWarehouse.get(toWarehouseId)
      if (!source || !target) throw new StockTransferError('WAREHOUSE_NOT_FOUND')
      if (!source.is_active || !target.is_active) {
        throw new StockTransferError('WAREHOUSE_INACTIVE')
      }
      await this.branchScope.requireWithinTransaction(
        client as AuthorizationQueryClient,
        actorUserId,
        source.branch_id,
      )
      await this.branchScope.requireWithinTransaction(
        client as AuthorizationQueryClient,
        actorUserId,
        target.branch_id,
      )

      const trackingByVariant = await tracking(
        client,
        lines.map((line) => line.variantId),
      )
      if (trackingByVariant.size !== lines.length) {
        throw new StockTransferError('VARIANT_NOT_FOUND')
      }

      // Fixed global order: Inventory Positions for source/target, then cost rows.
      const lockedCosts = await this.costs.lockManyWithinTransaction(
        client,
        {
          actorUserId,
          positions: lines.flatMap((line) => [
            { warehouseId: fromWarehouseId, variantId: line.variantId },
            { warehouseId: toWarehouseId, variantId: line.variantId },
          ]),
        },
      )
      const lockedByKey = new Map(
        lockedCosts.map((row) => [
          `${row.position.warehouseId}\u0000${row.position.variantId}`,
          row,
        ]),
      )

      for (const line of lines) {
        const sourceLocked = lockedByKey.get(
          `${fromWarehouseId}\u0000${line.variantId}`,
        )
        if (!sourceLocked) throw new Error('Source transfer lock invariant failed')
        if (quantity(sourceLocked.position.available).scaled < line.quantity.scaled) {
          throw new StockTransferError('INSUFFICIENT_AVAILABLE_STOCK')
        }
      }

      // Batch rows are locked after overall Inventory Positions, in stable order.
      const batchLocks = new Map<string, BatchRow>()
      for (const line of lines) {
        const track = trackingByVariant.get(line.variantId)!
        if (track.tracking_batch && line.batches.length === 0) {
          throw new StockTransferError('BATCH_TRACKING_REQUIRES_BATCHES')
        }
        const batchTotal = line.batches.reduce(
          (sum, item) => sum + item.quantity.scaled,
          0n,
        )
        if (track.tracking_batch && batchTotal !== line.quantity.scaled) {
          throw new StockTransferError('BATCH_QUANTITY_MISMATCH')
        }
        for (const allocation of line.batches) {
          const result = await client.query<BatchRow>(
            `SELECT b.id,b.batch_number,
                    bsp.on_hand::text AS on_hand,bsp.reserved::text AS reserved
               FROM batches b
               JOIN batch_stock_positions bsp ON bsp.batch_id=b.id
              WHERE b.variant_id=$1
                AND b.batch_number=$2
                AND bsp.warehouse_id=$3
              FOR UPDATE OF bsp`,
            [line.variantId, allocation.batchNumber, fromWarehouseId],
          )
          const row = result.rows[0]
          if (!row) throw new StockTransferError('BATCH_NOT_AVAILABLE')
          if (
            nonNegativeQuantity(row.on_hand).scaled -
              nonNegativeQuantity(row.reserved).scaled <
            allocation.quantity.scaled
          ) {
            throw new StockTransferError('BATCH_NOT_AVAILABLE')
          }
          batchLocks.set(
            `${line.variantId}\u0000${allocation.batchNumber}`,
            row,
          )
        }
      }

      // Serial rows are locked after Batch rows, in stable Variant+Serial order.
      const serialLocks = new Map<string, SerialRow>()
      for (const line of lines) {
        const track = trackingByVariant.get(line.variantId)!
        if (track.tracking_serial && line.serialNumbers.length === 0) {
          throw new StockTransferError('SERIAL_TRACKING_REQUIRES_SERIALS')
        }
        if (
          track.tracking_serial &&
          BigInt(line.serialNumbers.length) * QUANTITY_FACTOR !==
            line.quantity.scaled
        ) {
          throw new StockTransferError('SERIAL_COUNT_MISMATCH')
        }
        if (line.serialNumbers.length > 0) {
          const result = await client.query<SerialRow>(
            `SELECT id,serial_number,current_warehouse_id,status
               FROM serial_numbers
              WHERE variant_id=$1
                AND serial_number=ANY($2::text[])
              ORDER BY serial_number,id
              FOR UPDATE`,
            [line.variantId, line.serialNumbers],
          )
          if (result.rowCount !== line.serialNumbers.length) {
            throw new StockTransferError('SERIAL_NOT_AVAILABLE')
          }
          for (const row of result.rows) {
            if (
              row.status !== 'STOCK_IN' ||
              row.current_warehouse_id !== fromWarehouseId
            ) {
              throw new StockTransferError('SERIAL_NOT_AVAILABLE')
            }
            serialLocks.set(
              `${line.variantId}\u0000${row.serial_number}`,
              row,
            )
          }
        }
      }

      const transferId = randomUUID()
      const postingBatch = await this.posting.create(client, {
        branchId: source.branch_id,
        sourceType: 'STOCK_TRANSFER',
        sourceId: transferId,
        operationType: 'POST',
        documentVersion: 1,
        reversesPostingBatchId: null,
        createdBy: actorUserId,
      })

      const movementLines = lines.map((line) => {
        const sourceLocked = lockedByKey.get(
          `${fromWarehouseId}\u0000${line.variantId}`,
        ) as LockedInventoryCostRecord
        const unitCost = sourceLocked.cost.weightedAverageCost
        return {
          variantId: line.variantId,
          unitCost,
          totalCost: totalCost(line.quantity.scaled, unitCost),
        }
      })

      const outboundMovement = await this.ledger.appendWithinTransaction(
        client,
        {
          actorUserId,
          postingBatchId: postingBatch.id,
          warehouseId: fromWarehouseId,
          movementType: 'TRANSFER_OUT',
          lines: lines.map((line, index) => ({
            ...movementLines[index]!,
            quantitySigned: format(-line.quantity.scaled, 6),
          })),
        },
      )
      const inboundMovement = await this.ledger.appendWithinTransaction(
        client,
        {
          actorUserId,
          postingBatchId: postingBatch.id,
          warehouseId: toWarehouseId,
          movementType: 'TRANSFER_IN',
          lines: lines.map((line, index) => ({
            ...movementLines[index]!,
            quantitySigned: line.quantity.normalized,
          })),
        },
      )

      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]!
        const outLine = outboundMovement.lines[index]!
        const inLine = inboundMovement.lines[index]!
        const unitCost = movementLines[index]!.unitCost

        await this.costs.applyOutboundWithinTransaction(client, {
          actorUserId,
          warehouseId: fromWarehouseId,
          variantId: line.variantId,
          quantity: line.quantity.normalized,
        })
        await this.costs.applyInboundWithinTransaction(client, {
          actorUserId,
          warehouseId: toWarehouseId,
          variantId: line.variantId,
          quantity: line.quantity.normalized,
          unitCost,
        })

        for (const allocation of line.batches) {
          const batch = batchLocks.get(
            `${line.variantId}\u0000${allocation.batchNumber}`,
          )!
          const sourceOnHand =
            quantity(batch.on_hand).scaled - allocation.quantity.scaled
          await client.query(
            `UPDATE batch_stock_positions
                SET on_hand=$3,version=version+1,updated_at=clock_timestamp()
              WHERE warehouse_id=$1 AND batch_id=$2`,
            [fromWarehouseId, batch.id, format(sourceOnHand, 6)],
          )
          await client.query(
            `INSERT INTO batch_stock_positions
              (warehouse_id,batch_id,on_hand,reserved,version,updated_at)
             VALUES ($1,$2,$3,0,1,clock_timestamp())
             ON CONFLICT (warehouse_id,batch_id)
             DO UPDATE SET
               on_hand=batch_stock_positions.on_hand+EXCLUDED.on_hand,
               version=batch_stock_positions.version+1,
               updated_at=clock_timestamp()`,
            [toWarehouseId, batch.id, allocation.quantity.normalized],
          )
          await client.query(
            `INSERT INTO inventory_line_batches
              (movement_line_id,batch_id,quantity)
             VALUES ($1,$2,$3),($4,$2,$3)`,
            [outLine.id, batch.id, allocation.quantity.normalized, inLine.id],
          )
        }

        for (const serialNumber of line.serialNumbers) {
          const serial = serialLocks.get(
            `${line.variantId}\u0000${serialNumber}`,
          )!
          await client.query(
            `UPDATE serial_numbers
                SET current_warehouse_id=$2,status='STOCK_IN'
              WHERE id=$1`,
            [serial.id, toWarehouseId],
          )
          await client.query(
            `INSERT INTO inventory_line_serials (movement_line_id,serial_id)
             VALUES ($1,$3),($2,$3)`,
            [outLine.id, inLine.id, serial.id],
          )
        }
      }

      // Sequence row is deliberately last in the approved lock order.
      const sequence = await this.sequences.allocate(client, {
        branchId: source.branch_id,
        documentType: 'STOCK_TRANSFER',
      })
      const inserted = await client.query<{
        posted_at: Date
      } & QueryResultRow>(
        `INSERT INTO stock_transfers
          (id,document_number,issuing_branch_id,from_warehouse_id,to_warehouse_id,
           status,notes,created_by,posted_at)
         VALUES ($1,$2,$3,$4,$5,'POSTED',$6,$7,$8)
         RETURNING posted_at`,
        [
          transferId,
          sequence.documentNumber.toString(),
          source.branch_id,
          fromWarehouseId,
          toWarehouseId,
          input.notes?.trim() || null,
          actorUserId,
          postingBatch.postedAt,
        ],
      )
      for (const line of lines) {
        await client.query(
          `INSERT INTO stock_transfer_lines
            (id,transfer_id,variant_id,quantity)
           VALUES ($1,$2,$3,$4)`,
          [randomUUID(), transferId, line.variantId, line.quantity.normalized],
        )
      }

      await this.audit.record(client, {
        companyId: source.company_id,
        branchId: source.branch_id,
        userId: actorUserId,
        action: 'inventory.stock_transfer.posted',
        entityType: 'stock_transfer',
        entityId: transferId,
        after: {
          fromWarehouseId,
          toWarehouseId,
          lineCount: lines.length,
        },
      })
      await this.outbox.enqueue(client, {
        eventType: 'inventory.stock_transfer.posted',
        aggregateType: 'stock_transfer',
        aggregateId: transferId,
        payload: {
          transferId,
          fromWarehouseId,
          toWarehouseId,
        },
      })

      const postedAt = inserted.rows[0]?.posted_at
      if (!postedAt) throw new Error('Stock transfer insert invariant failed')
      return Object.freeze({
        id: transferId,
        documentNumber: sequence.documentNumber,
        issuingBranchId: source.branch_id,
        fromWarehouseId,
        toWarehouseId,
        status: 'POSTED' as const,
        postedAt,
        outboundMovement,
        inboundMovement,
      })
    })
  }
}
