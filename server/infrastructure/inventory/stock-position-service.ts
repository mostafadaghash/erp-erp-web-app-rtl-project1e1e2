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
const MAX_INT4 = 2_147_483_647

export type StockPositionErrorReason =
  | 'WAREHOUSE_NOT_FOUND'
  | 'VARIANT_NOT_FOUND'
  | 'RESERVED_WOULD_BE_NEGATIVE'

export class StockPositionError extends Error {
  readonly reason: StockPositionErrorReason

  constructor(reason: StockPositionErrorReason) {
    super('Stock position operation rejected')
    this.name = 'StockPositionError'
    this.reason = reason
  }
}

export interface StockPositionTransactionRunner {
  transaction<T>(
    work: TransactionWork<T>,
    options?: TransactionOptions,
  ): Promise<T>
}

export interface StockPositionKey {
  warehouseId: string
  variantId: string
}

export interface LockStockPositionsInput {
  actorUserId: string
  positions: readonly StockPositionKey[]
}

export interface StockPositionDeltaInput extends StockPositionKey {
  onHandDelta: string
  reservedDelta: string
}

export interface ApplyStockPositionDeltasInput {
  actorUserId: string
  deltas: readonly StockPositionDeltaInput[]
}

export interface ApplyStockPositionDeltaInput
  extends StockPositionDeltaInput {
  actorUserId: string
}

export interface GetStockPositionInput extends StockPositionKey {
  actorUserId: string
}

export interface StockPositionRecord {
  branchId: string
  warehouseId: string
  variantId: string
  onHand: string
  reserved: string
  available: string
  version: number
  updatedAt: Date
}

interface Decimal6 {
  normalized: string
  scaled: bigint
}

interface WarehouseRow extends QueryResultRow {
  id: string
  branch_id: string
}

interface PositionRow extends QueryResultRow {
  branch_id: string
  warehouse_id: string
  variant_id: string
  on_hand: string
  reserved: string
  available: string
  version: number
  updated_at: Date
}

interface AggregatedDelta extends StockPositionKey {
  onHandScaled: bigint
  reservedScaled: bigint
}

interface PreparedUpdate extends StockPositionKey {
  onHand: string
  reserved: string
  expectedVersion: number
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
  const integerPart = absolute / QUANTITY_SCALE_FACTOR
  const fractionalPart = (absolute % QUANTITY_SCALE_FACTOR)
    .toString()
    .padStart(QUANTITY_SCALE, '0')

  return `${negative ? '-' : ''}${integerPart.toString()}.${fractionalPart}`
}

function parseSignedQuantity6(
  name: string,
  value: string,
): Decimal6 {
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
  const integerDigits = match[2] ?? '0'
  const fractionalDigits = (match[3] ?? '').padEnd(
    QUANTITY_SCALE,
    '0',
  )
  const absoluteScaled =
    BigInt(integerDigits) * QUANTITY_SCALE_FACTOR +
    BigInt(fractionalDigits || '0')

  if (absoluteScaled > MAX_NUMERIC_18_6_SCALED) {
    throw new RangeError(`${name} exceeds numeric(18,6)`)
  }

  const scaled = absoluteScaled * sign
  return {
    normalized: formatScaled6(scaled),
    scaled,
  }
}

function addScaled6(
  name: string,
  left: bigint,
  right: bigint,
): bigint {
  const result = left + right
  const absolute = result < 0n ? -result : result
  if (absolute > MAX_NUMERIC_18_6_SCALED) {
    throw new RangeError(`${name} exceeds numeric(18,6)`)
  }
  return result
}

function keyString(key: StockPositionKey): string {
  return `${key.warehouseId}\u0000${key.variantId}`
}

function compareKeys(
  left: StockPositionKey,
  right: StockPositionKey,
): number {
  const warehouse = left.warehouseId.localeCompare(
    right.warehouseId,
  )
  if (warehouse !== 0) return warehouse
  return left.variantId.localeCompare(right.variantId)
}

function normalizeKeys(
  positions: readonly StockPositionKey[],
): readonly StockPositionKey[] {
  if (!Array.isArray(positions) || positions.length === 0) {
    throw new TypeError(
      'positions must contain at least one Warehouse+Variant key',
    )
  }

  const unique = new Map<string, StockPositionKey>()
  positions.forEach((position, index) => {
    const warehouseId = requireNonBlank(
      `positions[${index}].warehouseId`,
      position.warehouseId,
    )
    const variantId = requireNonBlank(
      `positions[${index}].variantId`,
      position.variantId,
    )
    unique.set(
      keyString({ warehouseId, variantId }),
      Object.freeze({ warehouseId, variantId }),
    )
  })

  return Object.freeze(
    [...unique.values()].sort(compareKeys),
  )
}

function aggregateDeltas(
  deltas: readonly StockPositionDeltaInput[],
): readonly AggregatedDelta[] {
  if (!Array.isArray(deltas) || deltas.length === 0) {
    throw new TypeError(
      'deltas must contain at least one Stock Position change',
    )
  }

  const aggregate = new Map<string, AggregatedDelta>()

  deltas.forEach((delta, index) => {
    const warehouseId = requireNonBlank(
      `deltas[${index}].warehouseId`,
      delta.warehouseId,
    )
    const variantId = requireNonBlank(
      `deltas[${index}].variantId`,
      delta.variantId,
    )
    const onHand = parseSignedQuantity6(
      `deltas[${index}].onHandDelta`,
      delta.onHandDelta,
    )
    const reserved = parseSignedQuantity6(
      `deltas[${index}].reservedDelta`,
      delta.reservedDelta,
    )
    const key = keyString({ warehouseId, variantId })
    const existing = aggregate.get(key)

    aggregate.set(key, {
      warehouseId,
      variantId,
      onHandScaled: addScaled6(
        `deltas[${index}].onHandDelta`,
        existing?.onHandScaled ?? 0n,
        onHand.scaled,
      ),
      reservedScaled: addScaled6(
        `deltas[${index}].reservedDelta`,
        existing?.reservedScaled ?? 0n,
        reserved.scaled,
      ),
    })
  })

  const normalized = [...aggregate.values()]
    .filter(
      (delta) =>
        delta.onHandScaled !== 0n ||
        delta.reservedScaled !== 0n,
    )
    .sort(compareKeys)

  if (normalized.length === 0) {
    throw new RangeError(
      'Stock position deltas must change on_hand or reserved',
    )
  }

  return Object.freeze(normalized)
}

function mapPosition(row: PositionRow): StockPositionRecord {
  return Object.freeze({
    branchId: row.branch_id,
    warehouseId: row.warehouse_id,
    variantId: row.variant_id,
    onHand: row.on_hand,
    reserved: row.reserved,
    available: row.available,
    version: row.version,
    updatedAt: row.updated_at,
  })
}

async function requireWarehouses(
  client: PoolClient,
  warehouseIds: readonly string[],
): Promise<ReadonlyMap<string, WarehouseRow>> {
  const uniqueIds = [...new Set(warehouseIds)].sort()
  const result = await client.query<WarehouseRow>(
    `SELECT id,branch_id
       FROM warehouses
      WHERE id = ANY($1::uuid[])
      ORDER BY id
      FOR KEY SHARE`,
    [uniqueIds],
  )

  if (result.rowCount !== uniqueIds.length) {
    throw new StockPositionError('WAREHOUSE_NOT_FOUND')
  }

  return new Map(
    result.rows.map((row) => [row.id, row] as const),
  )
}

async function requireVariants(
  client: PoolClient,
  variantIds: readonly string[],
): Promise<void> {
  const uniqueIds = [...new Set(variantIds)].sort()
  const result = await client.query<{ id: string } & QueryResultRow>(
    `SELECT id
       FROM product_variants
      WHERE id = ANY($1::uuid[])
      ORDER BY id
      FOR KEY SHARE`,
    [uniqueIds],
  )

  if (result.rowCount !== uniqueIds.length) {
    throw new StockPositionError('VARIANT_NOT_FOUND')
  }
}

async function readPosition(
  client: PoolClient,
  warehouseId: string,
  variantId: string,
  forUpdate: boolean,
): Promise<PositionRow | undefined> {
  const result = await client.query<PositionRow>(
    `SELECT
       w.branch_id,
       isp.warehouse_id,
       isp.variant_id,
       isp.on_hand::text AS on_hand,
       isp.reserved::text AS reserved,
       (isp.on_hand - isp.reserved)::numeric(18,6)::text AS available,
       isp.version,
       isp.updated_at
     FROM inventory_stock_positions isp
     JOIN warehouses w
       ON w.id=isp.warehouse_id
    WHERE isp.warehouse_id=$1
      AND isp.variant_id=$2
    ${forUpdate ? 'FOR UPDATE OF isp' : ''}`,
    [warehouseId, variantId],
  )

  return result.rows[0]
}

/**
 * 08.02 synchronous operational Stock Position projection.
 *
 * Historical truth remains inventory_movements/inventory_movement_lines.
 * This service owns only the rebuildable Warehouse+Variant lock row:
 * on_hand, reserved, derived available, version, updated_at.
 *
 * Mutations require the caller's existing business transaction so Movement,
 * Reservation and Position effects can commit or roll back together.
 */
export class StockPositionService {
  private readonly branchScope: BranchScopeService

  constructor(
    private readonly database: StockPositionTransactionRunner,
  ) {
    this.branchScope = new BranchScopeService(database)
  }

  async lockManyWithinTransaction(
    client: PoolClient,
    input: LockStockPositionsInput,
  ): Promise<readonly StockPositionRecord[]> {
    requireNonBlank('actorUserId', input.actorUserId)
    const positions = normalizeKeys(input.positions)

    const warehouses = await requireWarehouses(
      client,
      positions.map((position) => position.warehouseId),
    )
    await requireVariants(
      client,
      positions.map((position) => position.variantId),
    )

    const branchIds = [
      ...new Set(
        positions.map((position) => {
          const warehouse = warehouses.get(
            position.warehouseId,
          )
          if (!warehouse) {
            throw new StockPositionError(
              'WAREHOUSE_NOT_FOUND',
            )
          }
          return warehouse.branch_id
        }),
      ),
    ].sort()

    for (const branchId of branchIds) {
      await this.branchScope.requireWithinTransaction(
        client as AuthorizationQueryClient,
        input.actorUserId,
        branchId,
      )
    }

    const locked: StockPositionRecord[] = []

    // Fixed global order: warehouse_id -> variant_id.
    // Missing rows are created at zero in the same transaction, then locked.
    for (const position of positions) {
      await client.query(
        `INSERT INTO inventory_stock_positions
          (warehouse_id,variant_id,on_hand,reserved,version,updated_at)
         VALUES ($1,$2,0,0,0,now())
         ON CONFLICT (warehouse_id,variant_id)
         DO NOTHING`,
        [position.warehouseId, position.variantId],
      )

      const row = await readPosition(
        client,
        position.warehouseId,
        position.variantId,
        true,
      )
      if (!row) {
        throw new Error(
          'Stock Position lock invariant failed: row not found after ensure',
        )
      }
      locked.push(mapPosition(row))
    }

    return Object.freeze(locked)
  }

  async applyDeltasWithinTransaction(
    client: PoolClient,
    input: ApplyStockPositionDeltasInput,
  ): Promise<readonly StockPositionRecord[]> {
    requireNonBlank('actorUserId', input.actorUserId)
    const deltas = aggregateDeltas(input.deltas)

    const locked = await this.lockManyWithinTransaction(
      client,
      {
        actorUserId: input.actorUserId,
        positions: deltas.map((delta) => ({
          warehouseId: delta.warehouseId,
          variantId: delta.variantId,
        })),
      },
    )
    const lockedByKey = new Map(
      locked.map((position) => [
        keyString(position),
        position,
      ]),
    )

    const prepared: PreparedUpdate[] = []

    for (const delta of deltas) {
      const current = lockedByKey.get(keyString(delta))
      if (!current) {
        throw new Error(
          'Stock Position update invariant failed: locked row missing',
        )
      }

      const currentOnHand = parseSignedQuantity6(
        'current.onHand',
        current.onHand,
      ).scaled
      const currentReserved = parseSignedQuantity6(
        'current.reserved',
        current.reserved,
      ).scaled
      const nextOnHand = addScaled6(
        'onHand',
        currentOnHand,
        delta.onHandScaled,
      )
      const nextReserved = addScaled6(
        'reserved',
        currentReserved,
        delta.reservedScaled,
      )

      if (nextReserved < 0n) {
        throw new StockPositionError(
          'RESERVED_WOULD_BE_NEGATIVE',
        )
      }
      if (
        !Number.isInteger(current.version) ||
        current.version < 0 ||
        current.version >= MAX_INT4
      ) {
        throw new RangeError(
          'Stock Position version cannot be incremented safely',
        )
      }

      prepared.push({
        warehouseId: delta.warehouseId,
        variantId: delta.variantId,
        onHand: formatScaled6(nextOnHand),
        reserved: formatScaled6(nextReserved),
        expectedVersion: current.version,
      })
    }

    const updated: StockPositionRecord[] = []

    for (const change of prepared) {
      const result = await client.query<PositionRow>(
        `UPDATE inventory_stock_positions isp
            SET on_hand=$3,
                reserved=$4,
                version=isp.version + 1,
                updated_at=now()
           FROM warehouses w
          WHERE isp.warehouse_id=$1
            AND isp.variant_id=$2
            AND isp.version=$5
            AND w.id=isp.warehouse_id
        RETURNING
          w.branch_id,
          isp.warehouse_id,
          isp.variant_id,
          isp.on_hand::text AS on_hand,
          isp.reserved::text AS reserved,
          (isp.on_hand - isp.reserved)::numeric(18,6)::text AS available,
          isp.version,
          isp.updated_at`,
        [
          change.warehouseId,
          change.variantId,
          change.onHand,
          change.reserved,
          change.expectedVersion,
        ],
      )
      const row = result.rows[0]
      if (!row) {
        throw new Error(
          'Stock Position update invariant failed: version changed while row lock was held',
        )
      }
      updated.push(mapPosition(row))
    }

    return Object.freeze(updated)
  }

  async applyDeltaWithinTransaction(
    client: PoolClient,
    input: ApplyStockPositionDeltaInput,
  ): Promise<StockPositionRecord> {
    const [position] = await this.applyDeltasWithinTransaction(
      client,
      {
        actorUserId: input.actorUserId,
        deltas: [
          {
            warehouseId: input.warehouseId,
            variantId: input.variantId,
            onHandDelta: input.onHandDelta,
            reservedDelta: input.reservedDelta,
          },
        ],
      },
    )

    if (!position) {
      throw new Error(
        'Stock Position single-delta invariant failed',
      )
    }
    return position
  }

  async getPosition(
    input: GetStockPositionInput,
  ): Promise<StockPositionRecord | null> {
    requireNonBlank('actorUserId', input.actorUserId)
    const warehouseId = requireNonBlank(
      'warehouseId',
      input.warehouseId,
    )
    const variantId = requireNonBlank(
      'variantId',
      input.variantId,
    )

    return this.database.transaction(async (client) => {
      const warehouses = await requireWarehouses(
        client,
        [warehouseId],
      )
      await requireVariants(client, [variantId])

      const warehouse = warehouses.get(warehouseId)
      if (!warehouse) {
        throw new StockPositionError(
          'WAREHOUSE_NOT_FOUND',
        )
      }

      await this.branchScope.requireWithinTransaction(
        client as AuthorizationQueryClient,
        input.actorUserId,
        warehouse.branch_id,
      )

      const row = await readPosition(
        client,
        warehouseId,
        variantId,
        false,
      )
      return row ? mapPosition(row) : null
    })
  }
}
