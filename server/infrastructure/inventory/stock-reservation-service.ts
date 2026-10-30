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
import {
  StockPositionService,
  type StockPositionRecord,
} from './stock-position-service.js'

const SCALE = 6
const SCALE_FACTOR = 1_000_000n
const MAX_SCALED = 999_999_999_999_999_999n

export const STOCK_RESERVATION_STATUSES = Object.freeze([
  'ACTIVE',
  'PARTIALLY_CONSUMED',
  'RELEASED',
  'CONSUMED',
] as const)

export type StockReservationStatus =
  (typeof STOCK_RESERVATION_STATUSES)[number]

export type StockReservationErrorReason =
  | 'SALES_ORDER_NOT_FOUND'
  | 'SALES_ORDER_LINE_NOT_FOUND'
  | 'SALES_ORDER_LINE_CONTEXT_MISMATCH'
  | 'ORDER_WAREHOUSE_MISMATCH'
  | 'TARGET_WAREHOUSE_BRANCH_MISMATCH'
  | 'ORDER_LINE_BASE_QUANTITY_INVALID'
  | 'DESIRED_QUANTITY_EXCEEDS_ORDER_LINE'
  | 'INSUFFICIENT_AVAILABLE'
  | 'ACTIVE_RESERVATION_NOT_FOUND'
  | 'MULTIPLE_ACTIVE_RESERVATIONS'
  | 'CONSUME_EXCEEDS_RESERVED'
  | 'SAME_WAREHOUSE_REPLACEMENT'

export class StockReservationError extends Error {
  readonly reason: StockReservationErrorReason

  constructor(reason: StockReservationErrorReason) {
    super('Stock reservation operation rejected')
    this.name = 'StockReservationError'
    this.reason = reason
  }
}

export interface StockReservationTransactionRunner {
  transaction<T>(
    work: TransactionWork<T>,
    options?: TransactionOptions,
  ): Promise<T>
}

export interface ReservationLineKey {
  salesOrderId: string
  salesOrderLineId: string
}

export interface SetLineReservationInput
  extends ReservationLineKey {
  actorUserId: string
  warehouseId: string
  variantId: string
  desiredQuantity: string
}

export interface ConsumeReservationInput
  extends ReservationLineKey {
  actorUserId: string
  quantity: string
}

export interface ReleaseReservationInput
  extends ReservationLineKey {
  actorUserId: string
}

export interface ReplaceReservationWarehouseInput
  extends ReservationLineKey {
  actorUserId: string
  targetWarehouseId: string
}

export interface GetActiveReservationInput
  extends ReservationLineKey {
  actorUserId: string
}

export interface StockReservationRecord {
  id: string
  salesOrderId: string
  salesOrderLineId: string
  warehouseId: string
  variantId: string
  quantity: string
  status: StockReservationStatus
  createdAt: Date
  releasedAt: Date | null
}

export interface WarehouseReplacementResult {
  released: StockReservationRecord
  created: StockReservationRecord
  oldPosition: StockPositionRecord
  newPosition: StockPositionRecord
}

interface Decimal6 {
  normalized: string
  scaled: bigint
}

interface SalesOrderRow extends QueryResultRow {
  id: string
  branch_id: string
  warehouse_id: string
}

interface SalesOrderLineRow extends QueryResultRow {
  id: string
  sales_order_id: string
  variant_id: string
  ordered_quantity: string
  conversion_to_base: string
}

interface ReservationRow extends QueryResultRow {
  id: string
  sales_order_id: string
  sales_order_line_id: string
  warehouse_id: string
  variant_id: string
  quantity: string
  status: StockReservationStatus
  created_at: Date
  released_at: Date | null
}

function requireNonBlank(name: string, value: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`)
  }
  return value.trim()
}

function formatScaled6(scaled: bigint): string {
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
  positive: boolean,
): Decimal6 {
  requireNonBlank(name, value)
  const match = /^(-?)(\d{1,12})(?:\.(\d{1,6}))?$/.exec(
    value.trim(),
  )
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
  return {
    normalized: formatScaled6(scaled),
    scaled,
  }
}

function multiplyExact6(
  left: Decimal6,
  right: Decimal6,
): bigint {
  const raw = left.scaled * right.scaled
  if (raw % SCALE_FACTOR !== 0n) {
    throw new StockReservationError(
      'ORDER_LINE_BASE_QUANTITY_INVALID',
    )
  }
  const result = raw / SCALE_FACTOR
  if (result <= 0n || result > MAX_SCALED) {
    throw new StockReservationError(
      'ORDER_LINE_BASE_QUANTITY_INVALID',
    )
  }
  return result
}

function mapReservation(
  row: ReservationRow,
): StockReservationRecord {
  return Object.freeze({
    id: row.id,
    salesOrderId: row.sales_order_id,
    salesOrderLineId: row.sales_order_line_id,
    warehouseId: row.warehouse_id,
    variantId: row.variant_id,
    quantity: row.quantity,
    status: row.status,
    createdAt: row.created_at,
    releasedAt: row.released_at,
  })
}

async function lockOrder(
  client: PoolClient,
  salesOrderId: string,
): Promise<SalesOrderRow> {
  const result = await client.query<SalesOrderRow>(
    `SELECT id,branch_id,warehouse_id
       FROM sales_orders
      WHERE id=$1
      FOR UPDATE`,
    [salesOrderId],
  )
  const row = result.rows[0]
  if (!row) {
    throw new StockReservationError(
      'SALES_ORDER_NOT_FOUND',
    )
  }
  return row
}

async function lockLine(
  client: PoolClient,
  salesOrderLineId: string,
): Promise<SalesOrderLineRow> {
  const result = await client.query<SalesOrderLineRow>(
    `SELECT
       sol.id,
       sol.sales_order_id,
       sol.variant_id,
       sol.ordered_quantity::text AS ordered_quantity,
       pu.conversion_to_base::text AS conversion_to_base
     FROM sales_order_lines sol
     JOIN product_units pu
       ON pu.id=sol.product_unit_id
    WHERE sol.id=$1
    FOR UPDATE OF sol`,
    [salesOrderLineId],
  )
  const row = result.rows[0]
  if (!row) {
    throw new StockReservationError(
      'SALES_ORDER_LINE_NOT_FOUND',
    )
  }
  return row
}

function requireLineContext(
  order: SalesOrderRow,
  line: SalesOrderLineRow,
  expectedVariantId?: string,
): void {
  if (
    line.sales_order_id !== order.id ||
    (expectedVariantId !== undefined &&
      line.variant_id !== expectedVariantId)
  ) {
    throw new StockReservationError(
      'SALES_ORDER_LINE_CONTEXT_MISMATCH',
    )
  }
}

function orderedBaseQuantity(
  line: SalesOrderLineRow,
): bigint {
  return multiplyExact6(
    parseQuantity(
      'ordered_quantity',
      line.ordered_quantity,
      true,
    ),
    parseQuantity(
      'conversion_to_base',
      line.conversion_to_base,
      true,
    ),
  )
}

async function lockActiveReservations(
  client: PoolClient,
  lineId: string,
): Promise<readonly ReservationRow[]> {
  const result = await client.query<ReservationRow>(
    `SELECT
       id,
       sales_order_id,
       sales_order_line_id,
       warehouse_id,
       variant_id,
       quantity::text AS quantity,
       status,
       created_at,
       released_at
     FROM stock_reservations
    WHERE sales_order_line_id=$1
      AND status IN ('ACTIVE','PARTIALLY_CONSUMED')
    ORDER BY warehouse_id,variant_id,id
    FOR UPDATE`,
    [lineId],
  )
  if (result.rows.length > 1) {
    throw new StockReservationError(
      'MULTIPLE_ACTIVE_RESERVATIONS',
    )
  }
  return result.rows
}

function requireActiveContext(
  row: ReservationRow,
  order: SalesOrderRow,
  line: SalesOrderLineRow,
): void {
  if (
    row.sales_order_id !== order.id ||
    row.sales_order_line_id !== line.id ||
    row.variant_id !== line.variant_id
  ) {
    throw new StockReservationError(
      'SALES_ORDER_LINE_CONTEXT_MISMATCH',
    )
  }
}

function positionByWarehouse(
  rows: readonly StockPositionRecord[],
  warehouseId: string,
): StockPositionRecord {
  const row = rows.find(
    (position) => position.warehouseId === warehouseId,
  )
  if (!row) {
    throw new Error(
      'Stock reservation position invariant failed',
    )
  }
  return row
}

function ensureAvailable(
  position: StockPositionRecord,
  neededScaled: bigint,
): void {
  const available = parseQuantity(
    'available',
    position.available,
    false,
  ).scaled
  if (neededScaled > available) {
    throw new StockReservationError(
      'INSUFFICIENT_AVAILABLE',
    )
  }
}

/**
 * Phase 08.04 Stock Reservation primitive.
 *
 * Lock order:
 *   SalesOrder -> SalesOrderLine/active Reservation -> Stock Position.
 *
 * quantity on ACTIVE/PARTIALLY_CONSUMED rows is the remaining quantity that
 * currently contributes to StockPosition.reserved. Terminal rows remain as
 * history instead of being deleted.
 *
 * This service never deducts on_hand. Delivery later composes reservation
 * consumption with Inventory SALE/COGS in the same caller-owned transaction.
 */
export class StockReservationService {
  private readonly stockPositions: StockPositionService
  private readonly branchScope: BranchScopeService

  constructor(
    private readonly database: StockReservationTransactionRunner,
  ) {
    this.stockPositions = new StockPositionService(database)
    this.branchScope = new BranchScopeService(database)
  }

  private async lockContext(
    client: PoolClient,
    actorUserId: string,
    key: ReservationLineKey,
    expectedVariantId?: string,
  ): Promise<{
    order: SalesOrderRow
    line: SalesOrderLineRow
    active: ReservationRow | undefined
  }> {
    requireNonBlank('actorUserId', actorUserId)
    const salesOrderId = requireNonBlank(
      'salesOrderId',
      key.salesOrderId,
    )
    const salesOrderLineId = requireNonBlank(
      'salesOrderLineId',
      key.salesOrderLineId,
    )
    const order = await lockOrder(client, salesOrderId)
    await this.branchScope.requireWithinTransaction(
      client as AuthorizationQueryClient,
      actorUserId,
      order.branch_id,
    )
    const line = await lockLine(client, salesOrderLineId)
    requireLineContext(order, line, expectedVariantId)
    const activeRows = await lockActiveReservations(
      client,
      line.id,
    )
    const active = activeRows[0]
    if (active) {
      requireActiveContext(active, order, line)
    }
    return { order, line, active }
  }

  async setLineReservationWithinTransaction(
    client: PoolClient,
    input: SetLineReservationInput,
  ): Promise<StockReservationRecord> {
    const warehouseId = requireNonBlank(
      'warehouseId',
      input.warehouseId,
    )
    const variantId = requireNonBlank(
      'variantId',
      input.variantId,
    )
    const desired = parseQuantity(
      'desiredQuantity',
      input.desiredQuantity,
      true,
    )

    const { order, line, active } =
      await this.lockContext(
        client,
        input.actorUserId,
        input,
        variantId,
      )

    if (order.warehouse_id !== warehouseId) {
      throw new StockReservationError(
        'ORDER_WAREHOUSE_MISMATCH',
      )
    }
    if (desired.scaled > orderedBaseQuantity(line)) {
      throw new StockReservationError(
        'DESIRED_QUANTITY_EXCEEDS_ORDER_LINE',
      )
    }
    if (
      active !== undefined &&
      active.warehouse_id !== warehouseId
    ) {
      throw new StockReservationError(
        'ORDER_WAREHOUSE_MISMATCH',
      )
    }

    const [position] =
      await this.stockPositions.lockManyWithinTransaction(
        client,
        {
          actorUserId: input.actorUserId,
          positions: [{ warehouseId, variantId }],
        },
      )
    if (!position) {
      throw new Error(
        'Reservation Stock Position lock invariant failed',
      )
    }

    if (!active) {
      ensureAvailable(position, desired.scaled)
      const id = randomUUID()
      const inserted = await client.query<ReservationRow>(
        `INSERT INTO stock_reservations
          (id,sales_order_id,sales_order_line_id,warehouse_id,variant_id,
           quantity,status,created_at,released_at)
         VALUES ($1,$2,$3,$4,$5,$6,'ACTIVE',clock_timestamp(),NULL)
         RETURNING
           id,sales_order_id,sales_order_line_id,warehouse_id,variant_id,
           quantity::text AS quantity,status,created_at,released_at`,
        [
          id,
          order.id,
          line.id,
          warehouseId,
          variantId,
          desired.normalized,
        ],
      )
      await this.stockPositions.applyDeltaWithinTransaction(
        client,
        {
          actorUserId: input.actorUserId,
          warehouseId,
          variantId,
          onHandDelta: '0',
          reservedDelta: desired.normalized,
        },
      )
      const row = inserted.rows[0]
      if (!row) {
        throw new Error(
          'Reservation insert invariant failed',
        )
      }
      return mapReservation(row)
    }

    const current = parseQuantity(
      'currentReservationQuantity',
      active.quantity,
      true,
    )
    const delta = desired.scaled - current.scaled
    if (delta > 0n) {
      ensureAvailable(position, delta)
    }

    if (delta !== 0n) {
      await this.stockPositions.applyDeltaWithinTransaction(
        client,
        {
          actorUserId: input.actorUserId,
          warehouseId,
          variantId,
          onHandDelta: '0',
          reservedDelta: formatScaled6(delta),
        },
      )
    }

    const updated = await client.query<ReservationRow>(
      `UPDATE stock_reservations
          SET quantity=$2,
              released_at=NULL
        WHERE id=$1
        RETURNING
          id,sales_order_id,sales_order_line_id,warehouse_id,variant_id,
          quantity::text AS quantity,status,created_at,released_at`,
      [active.id, desired.normalized],
    )
    const row = updated.rows[0]
    if (!row) {
      throw new Error(
        'Reservation update invariant failed',
      )
    }
    return mapReservation(row)
  }

  async consumeWithinTransaction(
    client: PoolClient,
    input: ConsumeReservationInput,
  ): Promise<StockReservationRecord> {
    const quantity = parseQuantity(
      'quantity',
      input.quantity,
      true,
    )
    const { line, active } = await this.lockContext(
      client,
      input.actorUserId,
      input,
    )
    if (!active) {
      throw new StockReservationError(
        'ACTIVE_RESERVATION_NOT_FOUND',
      )
    }

    const current = parseQuantity(
      'currentReservationQuantity',
      active.quantity,
      true,
    )
    if (quantity.scaled > current.scaled) {
      throw new StockReservationError(
        'CONSUME_EXCEEDS_RESERVED',
      )
    }

    await this.stockPositions.lockManyWithinTransaction(
      client,
      {
        actorUserId: input.actorUserId,
        positions: [
          {
            warehouseId: active.warehouse_id,
            variantId: line.variant_id,
          },
        ],
      },
    )

    await this.stockPositions.applyDeltaWithinTransaction(
      client,
      {
        actorUserId: input.actorUserId,
        warehouseId: active.warehouse_id,
        variantId: line.variant_id,
        onHandDelta: '0',
        reservedDelta: formatScaled6(
          -quantity.scaled,
        ),
      },
    )

    const remaining = current.scaled - quantity.scaled
    const status: StockReservationStatus =
      remaining === 0n
        ? 'CONSUMED'
        : 'PARTIALLY_CONSUMED'
    const storedQuantity =
      remaining === 0n
        ? current.normalized
        : formatScaled6(remaining)

    const updated = await client.query<ReservationRow>(
      `UPDATE stock_reservations
          SET quantity=$2,
              status=$3,
              released_at=NULL
        WHERE id=$1
        RETURNING
          id,sales_order_id,sales_order_line_id,warehouse_id,variant_id,
          quantity::text AS quantity,status,created_at,released_at`,
      [active.id, storedQuantity, status],
    )
    const row = updated.rows[0]
    if (!row) {
      throw new Error(
        'Reservation consume invariant failed',
      )
    }
    return mapReservation(row)
  }

  async releaseRemainingWithinTransaction(
    client: PoolClient,
    input: ReleaseReservationInput,
  ): Promise<StockReservationRecord | null> {
    const { line, active } = await this.lockContext(
      client,
      input.actorUserId,
      input,
    )
    if (!active) return null

    const current = parseQuantity(
      'currentReservationQuantity',
      active.quantity,
      true,
    )
    await this.stockPositions.lockManyWithinTransaction(
      client,
      {
        actorUserId: input.actorUserId,
        positions: [
          {
            warehouseId: active.warehouse_id,
            variantId: line.variant_id,
          },
        ],
      },
    )
    await this.stockPositions.applyDeltaWithinTransaction(
      client,
      {
        actorUserId: input.actorUserId,
        warehouseId: active.warehouse_id,
        variantId: line.variant_id,
        onHandDelta: '0',
        reservedDelta: formatScaled6(-current.scaled),
      },
    )

    const updated = await client.query<ReservationRow>(
      `UPDATE stock_reservations
          SET status='RELEASED',
              released_at=clock_timestamp()
        WHERE id=$1
        RETURNING
          id,sales_order_id,sales_order_line_id,warehouse_id,variant_id,
          quantity::text AS quantity,status,created_at,released_at`,
      [active.id],
    )
    const row = updated.rows[0]
    if (!row) {
      throw new Error(
        'Reservation release invariant failed',
      )
    }
    return mapReservation(row)
  }

  async replaceWarehouseWithinTransaction(
    client: PoolClient,
    input: ReplaceReservationWarehouseInput,
  ): Promise<WarehouseReplacementResult> {
    const targetWarehouseId = requireNonBlank(
      'targetWarehouseId',
      input.targetWarehouseId,
    )
    const { order, line, active } =
      await this.lockContext(
        client,
        input.actorUserId,
        input,
      )
    if (!active) {
      throw new StockReservationError(
        'ACTIVE_RESERVATION_NOT_FOUND',
      )
    }
    if (active.warehouse_id === targetWarehouseId) {
      throw new StockReservationError(
        'SAME_WAREHOUSE_REPLACEMENT',
      )
    }

    const quantity = parseQuantity(
      'currentReservationQuantity',
      active.quantity,
      true,
    )
    const locked =
      await this.stockPositions.lockManyWithinTransaction(
        client,
        {
          actorUserId: input.actorUserId,
          positions: [
            {
              warehouseId: active.warehouse_id,
              variantId: line.variant_id,
            },
            {
              warehouseId: targetWarehouseId,
              variantId: line.variant_id,
            },
          ],
        },
      )
    const oldPosition = positionByWarehouse(
      locked,
      active.warehouse_id,
    )
    const newPosition = positionByWarehouse(
      locked,
      targetWarehouseId,
    )
    if (newPosition.branchId !== order.branch_id) {
      throw new StockReservationError(
        'TARGET_WAREHOUSE_BRANCH_MISMATCH',
      )
    }
    ensureAvailable(newPosition, quantity.scaled)

    const releasedResult =
      await client.query<ReservationRow>(
        `UPDATE stock_reservations
            SET status='RELEASED',
                released_at=clock_timestamp()
          WHERE id=$1
          RETURNING
            id,sales_order_id,sales_order_line_id,warehouse_id,variant_id,
            quantity::text AS quantity,status,created_at,released_at`,
        [active.id],
      )
    const released = releasedResult.rows[0]
    if (!released) {
      throw new Error(
        'Reservation warehouse release invariant failed',
      )
    }

    const newId = randomUUID()
    const createdResult =
      await client.query<ReservationRow>(
        `INSERT INTO stock_reservations
          (id,sales_order_id,sales_order_line_id,warehouse_id,variant_id,
           quantity,status,created_at,released_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,clock_timestamp(),NULL)
         RETURNING
           id,sales_order_id,sales_order_line_id,warehouse_id,variant_id,
           quantity::text AS quantity,status,created_at,released_at`,
        [
          newId,
          order.id,
          line.id,
          targetWarehouseId,
          line.variant_id,
          quantity.normalized,
          active.status,
        ],
      )
    const created = createdResult.rows[0]
    if (!created) {
      throw new Error(
        'Reservation warehouse create invariant failed',
      )
    }

    const updatedPositions =
      await this.stockPositions.applyDeltasWithinTransaction(
        client,
        {
          actorUserId: input.actorUserId,
          deltas: [
            {
              warehouseId: active.warehouse_id,
              variantId: line.variant_id,
              onHandDelta: '0',
              reservedDelta: formatScaled6(
                -quantity.scaled,
              ),
            },
            {
              warehouseId: targetWarehouseId,
              variantId: line.variant_id,
              onHandDelta: '0',
              reservedDelta: quantity.normalized,
            },
          ],
        },
      )

    return Object.freeze({
      released: mapReservation(released),
      created: mapReservation(created),
      oldPosition: positionByWarehouse(
        updatedPositions,
        active.warehouse_id,
      ),
      newPosition: positionByWarehouse(
        updatedPositions,
        targetWarehouseId,
      ),
    })
  }

  async getActiveForLine(
    input: GetActiveReservationInput,
  ): Promise<StockReservationRecord | null> {
    requireNonBlank('actorUserId', input.actorUserId)
    requireNonBlank('salesOrderId', input.salesOrderId)
    requireNonBlank(
      'salesOrderLineId',
      input.salesOrderLineId,
    )

    return this.database.transaction(async (client) => {
      const orderResult =
        await client.query<SalesOrderRow>(
          `SELECT id,branch_id,warehouse_id
             FROM sales_orders
            WHERE id=$1`,
          [input.salesOrderId],
        )
      const order = orderResult.rows[0]
      if (!order) {
        throw new StockReservationError(
          'SALES_ORDER_NOT_FOUND',
        )
      }
      await this.branchScope.requireWithinTransaction(
        client as AuthorizationQueryClient,
        input.actorUserId,
        order.branch_id,
      )
      const lineResult =
        await client.query<{ id: string; sales_order_id: string } & QueryResultRow>(
          `SELECT id,sales_order_id
             FROM sales_order_lines
            WHERE id=$1`,
          [input.salesOrderLineId],
        )
      const line = lineResult.rows[0]
      if (!line) {
        throw new StockReservationError(
          'SALES_ORDER_LINE_NOT_FOUND',
        )
      }
      if (line.sales_order_id !== order.id) {
        throw new StockReservationError(
          'SALES_ORDER_LINE_CONTEXT_MISMATCH',
        )
      }

      const result = await client.query<ReservationRow>(
        `SELECT
           id,sales_order_id,sales_order_line_id,warehouse_id,variant_id,
           quantity::text AS quantity,status,created_at,released_at
         FROM stock_reservations
        WHERE sales_order_line_id=$1
          AND status IN ('ACTIVE','PARTIALLY_CONSUMED')
        ORDER BY warehouse_id,variant_id,id`,
        [line.id],
      )
      if (result.rows.length > 1) {
        throw new StockReservationError(
          'MULTIPLE_ACTIVE_RESERVATIONS',
        )
      }
      const row = result.rows[0]
      return row ? mapReservation(row) : null
    })
  }
}
