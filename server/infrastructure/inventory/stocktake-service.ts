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
import { TransactionalOutboxService } from '../outbox/transactional-outbox.js'
import { PostingBatchService } from '../posting/posting-batch-service.js'
import { DocumentSequenceService } from '../sequences/document-sequence-service.js'
import { InventoryCostService } from './inventory-cost-service.js'
import { InventoryLedgerService } from './inventory-ledger-service.js'
import { StockPositionService } from './stock-position-service.js'

const Q = 1_000_000n
const M = 10_000n

export type StocktakeErrorReason =
  | 'SESSION_NOT_FOUND'
  | 'SESSION_NOT_OPEN'
  | 'SESSION_NOT_COUNTED'
  | 'SESSION_IMMUTABLE'
  | 'WAREHOUSE_NOT_FOUND'
  | 'WAREHOUSE_INACTIVE'
  | 'VARIANT_NOT_FOUND'
  | 'POSITION_VERSION_CHANGED'
  | 'BOOK_QUANTITY_CHANGED'
  | 'NO_COUNT_LINES'
  | 'TRACKING_COUNT_INCOMPLETE'
  | 'MISSING_OVERAGE_COST'

export class StocktakeError extends Error {
  readonly reason: StocktakeErrorReason
  constructor(reason: StocktakeErrorReason) {
    super('Stocktake operation rejected')
    this.name = 'StocktakeError'
    this.reason = reason
  }
}

export interface StocktakeTransactionRunner {
  transaction<T>(
    work: TransactionWork<T>,
    options?: TransactionOptions,
  ): Promise<T>
}

export interface StocktakeSessionRecord {
  id: string
  branchId: string
  documentNumber: bigint
  warehouseId: string
  status: 'OPEN' | 'COUNTED' | 'APPROVED' | 'CANCELLED'
  startedBy: string
  startedAt: Date
  approvedBy: string | null
  approvedAt: Date | null
}

export interface StocktakeSnapshot {
  variantId: string
  bookQuantity: string
  stockPositionVersion: number
}

export interface CountStocktakeLineInput {
  actorUserId: string
  sessionId: string
  variantId: string
  countedQuantity: string
  expectedBookQuantity: string
  expectedStockPositionVersion: number
  notes?: string | null
  serialIds?: readonly string[]
  batches?: readonly { batchId: string; quantity: string }[]
}

interface SessionRow extends QueryResultRow {
  id: string
  branch_id: string
  document_number: string
  warehouse_id: string
  status: 'OPEN' | 'COUNTED' | 'APPROVED' | 'CANCELLED'
  started_by: string
  started_at: Date
  approved_by: string | null
  approved_at: Date | null
}

interface TrackingRow extends QueryResultRow {
  tracking_serial: boolean
  tracking_batch: boolean
}

function textValue(name: string, value: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${name} must be a non-empty string`)
  }
  return value.trim()
}

function decimal6(name: string, value: string, allowNegative = false) {
  textValue(name, value)
  const match = /^(-?)(\d{1,12})(?:\.(\d{1,6}))?$/.exec(value.trim())
  if (!match) throw new TypeError(`${name} must be numeric(18,6)`)
  const negative = match[1] === '-'
  if (negative && !allowNegative) {
    throw new RangeError(`${name} must be nonnegative`)
  }
  const absolute =
    BigInt(match[2] ?? '0') * Q +
    BigInt((match[3] ?? '').padEnd(6, '0') || '0')
  const scaled = negative ? -absolute : absolute
  return { scaled, normalized: format(scaled, 6) }
}

function money4(value: string) {
  const match = /^(\d{1,14})(?:\.(\d{1,4}))?$/.exec(value)
  if (!match) throw new TypeError('cost must be numeric(18,4)')
  return BigInt(match[1] ?? '0') * M +
    BigInt((match[2] ?? '').padEnd(4, '0') || '0')
}

function format(value: bigint, scale: number): string {
  const factor = 10n ** BigInt(scale)
  const neg = value < 0n
  const abs = neg ? -value : value
  return `${neg ? '-' : ''}${abs / factor}.${(abs % factor)
    .toString().padStart(scale, '0')}`
}

function totalCost(qty: bigint, unitCost: string): string {
  return format((qty * money4(unitCost) + Q / 2n) / Q, 4)
}

function mapSession(row: SessionRow): StocktakeSessionRecord {
  return Object.freeze({
    id: row.id,
    branchId: row.branch_id,
    documentNumber: BigInt(row.document_number),
    warehouseId: row.warehouse_id,
    status: row.status,
    startedBy: row.started_by,
    startedAt: row.started_at,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
  })
}

async function session(
  client: PoolClient,
  id: string,
  lock: boolean,
): Promise<SessionRow> {
  const result = await client.query<SessionRow>(
    `SELECT id,branch_id,document_number::text,warehouse_id,status,
            started_by,started_at,approved_by,approved_at
       FROM stocktake_sessions
      WHERE id=$1
      ${lock ? 'FOR UPDATE' : ''}`,
    [id],
  )
  const row = result.rows[0]
  if (!row) throw new StocktakeError('SESSION_NOT_FOUND')
  return row
}

export class StocktakeService {
  private readonly scope: BranchScopeService
  private readonly positions: StockPositionService
  private readonly costs: InventoryCostService
  private readonly ledger: InventoryLedgerService
  private readonly posting = new PostingBatchService()
  private readonly sequences = new DocumentSequenceService()
  private readonly audit = new AuditService()
  private readonly outbox = new TransactionalOutboxService()

  constructor(private readonly database: StocktakeTransactionRunner) {
    this.scope = new BranchScopeService(database)
    this.positions = new StockPositionService(database)
    this.costs = new InventoryCostService(database)
    this.ledger = new InventoryLedgerService(database)
  }

  async open(input: {
    actorUserId: string
    warehouseId: string
  }): Promise<StocktakeSessionRecord> {
    const actor = textValue('actorUserId', input.actorUserId)
    const warehouseId = textValue('warehouseId', input.warehouseId)
    return this.database.transaction(async (client) => {
      const warehouse = await client.query<{
        branch_id: string
        is_active: boolean
      } & QueryResultRow>(
        `SELECT branch_id,is_active FROM warehouses WHERE id=$1 FOR KEY SHARE`,
        [warehouseId],
      )
      const row = warehouse.rows[0]
      if (!row) throw new StocktakeError('WAREHOUSE_NOT_FOUND')
      if (!row.is_active) throw new StocktakeError('WAREHOUSE_INACTIVE')
      await this.scope.requireWithinTransaction(
        client as AuthorizationQueryClient,
        actor,
        row.branch_id,
      )
      const sequence = await this.sequences.allocate(client, {
        branchId: row.branch_id,
        documentType: 'STOCKTAKE',
      })
      const id = randomUUID()
      const inserted = await client.query<SessionRow>(
        `INSERT INTO stocktake_sessions
          (id,branch_id,document_number,warehouse_id,status,started_by,started_at)
         VALUES ($1,$2,$3,$4,'OPEN',$5,clock_timestamp())
         RETURNING id,branch_id,document_number::text,warehouse_id,status,
                   started_by,started_at,approved_by,approved_at`,
        [id, row.branch_id, sequence.documentNumber.toString(), warehouseId, actor],
      )
      return mapSession(inserted.rows[0]!)
    })
  }

  async snapshot(input: {
    actorUserId: string
    sessionId: string
    variantId: string
  }): Promise<StocktakeSnapshot> {
    return this.database.transaction(async (client) => {
      const current = await session(client, textValue('sessionId', input.sessionId), false)
      if (current.status !== 'OPEN') {
        throw new StocktakeError(
          current.status === 'APPROVED' ? 'SESSION_IMMUTABLE' : 'SESSION_NOT_OPEN',
        )
      }
      await this.scope.requireWithinTransaction(
        client as AuthorizationQueryClient,
        textValue('actorUserId', input.actorUserId),
        current.branch_id,
      )
      const [position] = await this.positions.lockManyWithinTransaction(client, {
        actorUserId: input.actorUserId,
        positions: [{
          warehouseId: current.warehouse_id,
          variantId: textValue('variantId', input.variantId),
        }],
      })
      if (!position) throw new StocktakeError('VARIANT_NOT_FOUND')
      return Object.freeze({
        variantId: position.variantId,
        bookQuantity: position.onHand,
        stockPositionVersion: position.version,
      })
    })
  }

  async countLine(input: CountStocktakeLineInput): Promise<void> {
    const counted = decimal6('countedQuantity', input.countedQuantity)
    const expectedBook = decimal6('expectedBookQuantity', input.expectedBookQuantity, true)
    if (!Number.isInteger(input.expectedStockPositionVersion) ||
        input.expectedStockPositionVersion < 0) {
      throw new TypeError('expectedStockPositionVersion must be a nonnegative integer')
    }

    await this.database.transaction(async (client) => {
      const current = await session(client, textValue('sessionId', input.sessionId), true)
      if (current.status !== 'OPEN') {
        throw new StocktakeError(
          current.status === 'APPROVED' ? 'SESSION_IMMUTABLE' : 'SESSION_NOT_OPEN',
        )
      }
      await this.scope.requireWithinTransaction(
        client as AuthorizationQueryClient,
        textValue('actorUserId', input.actorUserId),
        current.branch_id,
      )
      const variantId = textValue('variantId', input.variantId)
      const [position] = await this.positions.lockManyWithinTransaction(client, {
        actorUserId: input.actorUserId,
        positions: [{ warehouseId: current.warehouse_id, variantId }],
      })
      if (!position) throw new StocktakeError('VARIANT_NOT_FOUND')
      if (position.version !== input.expectedStockPositionVersion) {
        throw new StocktakeError('POSITION_VERSION_CHANGED')
      }
      if (decimal6('position.onHand', position.onHand, true).scaled !== expectedBook.scaled) {
        throw new StocktakeError('BOOK_QUANTITY_CHANGED')
      }

      const trackResult = await client.query<TrackingRow>(
        `SELECT p.tracking_serial,p.tracking_batch
           FROM product_variants pv
           JOIN products p ON p.id=pv.product_id
          WHERE pv.id=$1 FOR KEY SHARE OF pv`,
        [variantId],
      )
      const track = trackResult.rows[0]
      if (!track) throw new StocktakeError('VARIANT_NOT_FOUND')
      const serialIds = [...(input.serialIds ?? [])].sort()
      const batches = [...(input.batches ?? [])].sort((a, b) =>
        a.batchId.localeCompare(b.batchId),
      )
      if (
        track.tracking_serial &&
        BigInt(serialIds.length) * Q !== counted.scaled
      ) {
        throw new StocktakeError('TRACKING_COUNT_INCOMPLETE')
      }
      if (track.tracking_batch) {
        const batchTotal = batches.reduce(
          (sum, batch) =>
            sum + decimal6('batch.quantity', batch.quantity).scaled,
          0n,
        )
        if (batchTotal !== counted.scaled) {
          throw new StocktakeError('TRACKING_COUNT_INCOMPLETE')
        }
      }

      const lineId = randomUUID()
      const difference = counted.scaled - expectedBook.scaled
      await client.query(
        `INSERT INTO stocktake_lines
          (id,session_id,variant_id,book_quantity_at_count,counted_quantity,
           counted_at,stock_position_version_at_count,difference,notes)
         VALUES ($1,$2,$3,$4,$5,clock_timestamp(),$6,$7,$8)
         ON CONFLICT (session_id,variant_id)
         DO UPDATE SET
           book_quantity_at_count=EXCLUDED.book_quantity_at_count,
           counted_quantity=EXCLUDED.counted_quantity,
           counted_at=EXCLUDED.counted_at,
           stock_position_version_at_count=EXCLUDED.stock_position_version_at_count,
           difference=EXCLUDED.difference,
           notes=EXCLUDED.notes`,
        [
          lineId,
          current.id,
          variantId,
          expectedBook.normalized,
          counted.normalized,
          input.expectedStockPositionVersion,
          format(difference, 6),
          input.notes?.trim() || null,
        ],
      )
      const actualLine = await client.query<{ id: string } & QueryResultRow>(
        'SELECT id FROM stocktake_lines WHERE session_id=$1 AND variant_id=$2',
        [current.id, variantId],
      )
      const storedLineId = actualLine.rows[0]!.id
      await client.query(
        'DELETE FROM stocktake_line_serials WHERE stocktake_line_id=$1',
        [storedLineId],
      )
      await client.query(
        'DELETE FROM stocktake_line_batches WHERE stocktake_line_id=$1',
        [storedLineId],
      )
      for (const serialId of serialIds) {
        await client.query(
          'INSERT INTO stocktake_line_serials (stocktake_line_id,serial_id) VALUES ($1,$2)',
          [storedLineId, serialId],
        )
      }
      for (const batch of batches) {
        await client.query(
          'INSERT INTO stocktake_line_batches (stocktake_line_id,batch_id,quantity) VALUES ($1,$2,$3)',
          [storedLineId, batch.batchId, decimal6('batch.quantity', batch.quantity).normalized],
        )
      }
    })
  }

  async markCounted(input: {
    actorUserId: string
    sessionId: string
  }): Promise<StocktakeSessionRecord> {
    return this.database.transaction(async (client) => {
      const current = await session(client, textValue('sessionId', input.sessionId), true)
      if (current.status !== 'OPEN') {
        throw new StocktakeError(
          current.status === 'APPROVED' ? 'SESSION_IMMUTABLE' : 'SESSION_NOT_OPEN',
        )
      }
      await this.scope.requireWithinTransaction(
        client as AuthorizationQueryClient,
        textValue('actorUserId', input.actorUserId),
        current.branch_id,
      )
      const count = await client.query<{ count: string } & QueryResultRow>(
        'SELECT count(*)::text AS count FROM stocktake_lines WHERE session_id=$1',
        [current.id],
      )
      if (BigInt(count.rows[0]?.count ?? '0') === 0n) {
        throw new StocktakeError('NO_COUNT_LINES')
      }
      const updated = await client.query<SessionRow>(
        `UPDATE stocktake_sessions SET status='COUNTED'
          WHERE id=$1
          RETURNING id,branch_id,document_number::text,warehouse_id,status,
                    started_by,started_at,approved_by,approved_at`,
        [current.id],
      )
      return mapSession(updated.rows[0]!)
    })
  }

  async approve(input: {
    actorUserId: string
    sessionId: string
  }): Promise<StocktakeSessionRecord> {
    const actor = textValue('actorUserId', input.actorUserId)
    return this.database.transaction(async (client) => {
      const current = await session(client, textValue('sessionId', input.sessionId), true)
      if (current.status === 'APPROVED') throw new StocktakeError('SESSION_IMMUTABLE')
      if (current.status !== 'COUNTED') throw new StocktakeError('SESSION_NOT_COUNTED')
      await this.scope.requireWithinTransaction(
        client as AuthorizationQueryClient,
        actor,
        current.branch_id,
      )
      const lines = await client.query<{
        id: string
        variant_id: string
        difference: string
      } & QueryResultRow>(
        `SELECT id,variant_id,difference::text
           FROM stocktake_lines WHERE session_id=$1 ORDER BY variant_id`,
        [current.id],
      )
      if (lines.rowCount === 0) throw new StocktakeError('NO_COUNT_LINES')

      const locked = await this.costs.lockManyWithinTransaction(client, {
        actorUserId: actor,
        positions: lines.rows.map((line) => ({
          warehouseId: current.warehouse_id,
          variantId: line.variant_id,
        })),
      })
      const costByVariant = new Map(
        locked.map((item) => [item.position.variantId, item]),
      )

      // Tracking rows are locked after Stock/Cost rows to validate the counted
      // identity set before any adjustment effect is posted.
      const serialLineIds = lines.rows.map((line) => line.id)
      await client.query(
        `SELECT sn.id
           FROM stocktake_line_serials sls
           JOIN serial_numbers sn ON sn.id=sls.serial_id
          WHERE sls.stocktake_line_id=ANY($1::uuid[])
          ORDER BY sn.variant_id,sn.serial_number,sn.id
          FOR UPDATE OF sn`,
        [serialLineIds],
      )
      await client.query(
        `SELECT bsp.batch_id
           FROM stocktake_line_batches slb
           JOIN batches b ON b.id=slb.batch_id
           LEFT JOIN batch_stock_positions bsp
             ON bsp.batch_id=b.id AND bsp.warehouse_id=$2
          WHERE slb.stocktake_line_id=ANY($1::uuid[])
            AND bsp.batch_id IS NOT NULL
          ORDER BY b.variant_id,b.batch_number,b.id
          FOR UPDATE OF bsp`,
        [serialLineIds, current.warehouse_id],
      )

      const nonZero = lines.rows.filter(
        (line) => decimal6('difference', line.difference, true).scaled !== 0n,
      )
      if (nonZero.length > 0) {
        const adjustmentId = randomUUID()
        const postingBatch = await this.posting.create(client, {
          branchId: current.branch_id,
          sourceType: 'STOCKTAKE',
          sourceId: current.id,
          operationType: 'POST',
          documentVersion: 1,
          reversesPostingBatchId: null,
          createdBy: actor,
        })
        const adjustmentSequence = await this.sequences.allocate(client, {
          branchId: current.branch_id,
          documentType: 'INVENTORY_ADJUSTMENT',
        })
        await client.query(
          `INSERT INTO inventory_adjustments
            (id,branch_id,document_number,warehouse_id,source_stocktake_id,
             reason_code,notes,created_by,posted_at)
           VALUES ($1,$2,$3,$4,$5,'STOCKTAKE','Stocktake approval',$6,$7)`,
          [
            adjustmentId,
            current.branch_id,
            adjustmentSequence.documentNumber.toString(),
            current.warehouse_id,
            current.id,
            actor,
            postingBatch.postedAt,
          ],
        )

        const movementLines = nonZero.map((line) => {
          const diff = decimal6('difference', line.difference, true)
          const state = costByVariant.get(line.variant_id)
          if (!state) throw new Error('Stocktake cost lock invariant failed')
          let unitCost = state.cost.weightedAverageCost
          if (diff.scaled > 0n && money4(unitCost) === 0n) {
            unitCost = state.cost.lastPurchaseCost
          }
          if (diff.scaled > 0n && money4(unitCost) === 0n) {
            throw new StocktakeError('MISSING_OVERAGE_COST')
          }
          return {
            variantId: line.variant_id,
            quantitySigned: diff.normalized,
            unitCost,
            totalCost: totalCost(diff.scaled < 0n ? -diff.scaled : diff.scaled, unitCost),
          }
        })
        await this.ledger.appendWithinTransaction(client, {
          actorUserId: actor,
          postingBatchId: postingBatch.id,
          warehouseId: current.warehouse_id,
          movementType: 'ADJUSTMENT',
          lines: movementLines,
        })

        for (const movementLine of movementLines) {
          const diff = decimal6('difference', movementLine.quantitySigned, true)
          const adjustmentLineId = randomUUID()
          await client.query(
            `INSERT INTO inventory_adjustment_lines
              (id,adjustment_id,variant_id,quantity_difference,unit_cost)
             VALUES ($1,$2,$3,$4,$5)`,
            [
              adjustmentLineId,
              adjustmentId,
              movementLine.variantId,
              diff.normalized,
              movementLine.unitCost,
            ],
          )
          if (diff.scaled < 0n) {
            await this.costs.applyOutboundWithinTransaction(client, {
              actorUserId: actor,
              warehouseId: current.warehouse_id,
              variantId: movementLine.variantId,
              quantity: format(-diff.scaled, 6),
            })
          } else {
            await this.costs.applyInboundWithinTransaction(client, {
              actorUserId: actor,
              warehouseId: current.warehouse_id,
              variantId: movementLine.variantId,
              quantity: diff.normalized,
              unitCost: movementLine.unitCost,
            })
          }
        }
      }

      const updated = await client.query<SessionRow>(
        `UPDATE stocktake_sessions
            SET status='APPROVED',approved_by=$2,approved_at=clock_timestamp()
          WHERE id=$1
          RETURNING id,branch_id,document_number::text,warehouse_id,status,
                    started_by,started_at,approved_by,approved_at`,
        [current.id, actor],
      )
      const auditCompany = await client.query<{ company_id: string } & QueryResultRow>(
        'SELECT company_id FROM branches WHERE id=$1',
        [current.branch_id],
      )
      const companyId = auditCompany.rows[0]?.company_id
      if (!companyId) throw new Error('Stocktake audit company invariant failed')
      await this.audit.record(client, {
        companyId,
        branchId: current.branch_id,
        userId: actor,
        action: 'inventory.stocktake.approved',
        entityType: 'stocktake_session',
        entityId: current.id,
        after: { lineCount: lines.rowCount, differenceLineCount: nonZero.length },
      })
      await this.outbox.enqueue(client, {
        eventType: 'inventory.stocktake.approved',
        aggregateType: 'stocktake_session',
        aggregateId: current.id,
        payload: { stocktakeSessionId: current.id },
      })
      return mapSession(updated.rows[0]!)
    })
  }

  async cancel(input: {
    actorUserId: string
    sessionId: string
  }): Promise<StocktakeSessionRecord> {
    return this.database.transaction(async (client) => {
      const current = await session(client, textValue('sessionId', input.sessionId), true)
      if (current.status === 'APPROVED') throw new StocktakeError('SESSION_IMMUTABLE')
      if (current.status === 'CANCELLED') throw new StocktakeError('SESSION_NOT_OPEN')
      await this.scope.requireWithinTransaction(
        client as AuthorizationQueryClient,
        textValue('actorUserId', input.actorUserId),
        current.branch_id,
      )
      const updated = await client.query<SessionRow>(
        `UPDATE stocktake_sessions SET status='CANCELLED'
          WHERE id=$1
          RETURNING id,branch_id,document_number::text,warehouse_id,status,
                    started_by,started_at,approved_by,approved_at`,
        [current.id],
      )
      return mapSession(updated.rows[0]!)
    })
  }
}
