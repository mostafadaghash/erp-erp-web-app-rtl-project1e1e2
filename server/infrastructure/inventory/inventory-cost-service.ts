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
  type StockPositionKey,
  type StockPositionRecord,
} from './stock-position-service.js'

const QUANTITY_SCALE_FACTOR = 1_000_000n
const MONEY_SCALE_FACTOR = 10_000n
const MAX_NUMERIC_18_6_SCALED = 999_999_999_999_999_999n
const MAX_NUMERIC_18_4_SCALED = 999_999_999_999_999_999n

export type InventoryCostErrorReason =
  | 'WAREHOUSE_NOT_FOUND'
  | 'VARIANT_NOT_FOUND'
  | 'COST_PROJECTION_DRIFT'
  | 'ZERO_QUANTITY_VALUE_RESIDUAL'
  | 'NEGATIVE_WEIGHTED_AVERAGE_RESULT'

export class InventoryCostError extends Error {
  readonly reason: InventoryCostErrorReason

  constructor(reason: InventoryCostErrorReason) {
    super('Inventory cost operation rejected')
    this.name = 'InventoryCostError'
    this.reason = reason
  }
}

export interface InventoryCostTransactionRunner {
  transaction<T>(
    work: TransactionWork<T>,
    options?: TransactionOptions,
  ): Promise<T>
}

export interface InventoryCostKey extends StockPositionKey {}

export interface LockInventoryCostsInput {
  actorUserId: string
  positions: readonly InventoryCostKey[]
}

export interface ApplyInboundCostInput extends InventoryCostKey {
  actorUserId: string
  quantity: string
  unitCost: string
  lastPurchaseCost?: string
}

export interface ApplyOutboundCostInput extends InventoryCostKey {
  actorUserId: string
  quantity: string
}

export interface GetInventoryCostInput extends InventoryCostKey {
  actorUserId: string
}

export interface InventoryCostRecord {
  warehouseId: string
  variantId: string
  weightedAverageCost: string
  lastPurchaseCost: string
  inventoryValue: string
  updatedAt: Date
}

export interface LockedInventoryCostRecord {
  position: StockPositionRecord
  cost: InventoryCostRecord
}

export interface InboundCostResult
  extends LockedInventoryCostRecord {
  inboundValue: string
}

export interface OutboundCostResult
  extends LockedInventoryCostRecord {
  unitCost: string
  totalCost: string
}

interface DecimalValue {
  normalized: string
  scaled: bigint
}

interface CostRow extends QueryResultRow {
  warehouse_id: string
  variant_id: string
  weighted_average_cost: string
  last_purchase_cost: string
  inventory_value: string
  updated_at: Date
}

function requireNonBlank(name: string, value: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`)
  }
  return value.trim()
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

function parseQuantity(
  name: string,
  value: string,
  positiveOnly: boolean,
): DecimalValue {
  requireNonBlank(name, value)
  const trimmed = value.trim()
  const match = /^(-?)(\d{1,12})(?:\.(\d{1,6}))?$/.exec(
    trimmed,
  )
  if (!match) {
    throw new TypeError(
      `${name} must be a decimal representable as numeric(18,6)`,
    )
  }

  const sign = match[1] === '-' ? -1n : 1n
  const integerPart = match[2] ?? '0'
  const fraction = (match[3] ?? '').padEnd(6, '0')
  const absoluteScaled =
    BigInt(integerPart) * QUANTITY_SCALE_FACTOR +
    BigInt(fraction || '0')

  if (absoluteScaled > MAX_NUMERIC_18_6_SCALED) {
    throw new RangeError(`${name} exceeds numeric(18,6)`)
  }

  const scaled = absoluteScaled * sign
  if (positiveOnly && scaled <= 0n) {
    throw new RangeError(`${name} must be greater than zero`)
  }

  return {
    normalized: formatScaled(scaled, 6),
    scaled,
  }
}

function parseMoney(
  name: string,
  value: string,
  allowNegative: boolean,
): DecimalValue {
  requireNonBlank(name, value)
  const trimmed = value.trim()
  const match = /^(-?)(\d{1,14})(?:\.(\d{1,4}))?$/.exec(
    trimmed,
  )
  if (!match) {
    throw new TypeError(
      `${name} must be a decimal representable as numeric(18,4)`,
    )
  }

  const sign = match[1] === '-' ? -1n : 1n
  const integerPart = match[2] ?? '0'
  const fraction = (match[3] ?? '').padEnd(4, '0')
  const absoluteScaled =
    BigInt(integerPart) * MONEY_SCALE_FACTOR +
    BigInt(fraction || '0')

  if (absoluteScaled > MAX_NUMERIC_18_4_SCALED) {
    throw new RangeError(`${name} exceeds numeric(18,4)`)
  }

  const scaled = absoluteScaled * sign
  if (!allowNegative && scaled < 0n) {
    throw new RangeError(`${name} cannot be negative`)
  }

  return {
    normalized: formatScaled(scaled, 4),
    scaled,
  }
}

function checkedQuantity(
  name: string,
  scaled: bigint,
): bigint {
  const absolute = scaled < 0n ? -scaled : scaled
  if (absolute > MAX_NUMERIC_18_6_SCALED) {
    throw new RangeError(`${name} exceeds numeric(18,6)`)
  }
  return scaled
}

function checkedMoney(
  name: string,
  scaled: bigint,
  allowNegative: boolean,
): bigint {
  const absolute = scaled < 0n ? -scaled : scaled
  if (absolute > MAX_NUMERIC_18_4_SCALED) {
    throw new RangeError(`${name} exceeds numeric(18,4)`)
  }
  if (!allowNegative && scaled < 0n) {
    throw new InventoryCostError(
      'NEGATIVE_WEIGHTED_AVERAGE_RESULT',
    )
  }
  return scaled
}

function divideRoundedHalfAwayFromZero(
  numerator: bigint,
  denominator: bigint,
): bigint {
  if (denominator === 0n) {
    throw new RangeError('Cannot divide by zero')
  }

  const negative =
    (numerator < 0n) !== (denominator < 0n)
  const absoluteNumerator =
    numerator < 0n ? -numerator : numerator
  const absoluteDenominator =
    denominator < 0n ? -denominator : denominator

  let quotient =
    absoluteNumerator / absoluteDenominator
  const remainder =
    absoluteNumerator % absoluteDenominator

  if (remainder * 2n >= absoluteDenominator) {
    quotient += 1n
  }

  return negative ? -quotient : quotient
}

function valueFromQuantityAndCost(
  quantityScaled6: bigint,
  costScaled4: bigint,
): bigint {
  return checkedMoney(
    'inventoryValue',
    divideRoundedHalfAwayFromZero(
      quantityScaled6 * costScaled4,
      QUANTITY_SCALE_FACTOR,
    ),
    true,
  )
}

function weightedCostFromValueAndQuantity(
  valueScaled4: bigint,
  quantityScaled6: bigint,
): bigint {
  if (quantityScaled6 === 0n) {
    if (valueScaled4 !== 0n) {
      throw new InventoryCostError(
        'ZERO_QUANTITY_VALUE_RESIDUAL',
      )
    }
    return 0n
  }

  return checkedMoney(
    'weightedAverageCost',
    divideRoundedHalfAwayFromZero(
      valueScaled4 * QUANTITY_SCALE_FACTOR,
      quantityScaled6,
    ),
    false,
  )
}

function keyString(key: InventoryCostKey): string {
  return `${key.warehouseId}\u0000${key.variantId}`
}

function compareKeys(
  left: InventoryCostKey,
  right: InventoryCostKey,
): number {
  const warehouse = left.warehouseId.localeCompare(
    right.warehouseId,
  )
  if (warehouse !== 0) return warehouse
  return left.variantId.localeCompare(right.variantId)
}

function normalizeKeys(
  positions: readonly InventoryCostKey[],
): readonly InventoryCostKey[] {
  if (!Array.isArray(positions) || positions.length === 0) {
    throw new TypeError(
      'positions must contain at least one Warehouse+Variant key',
    )
  }

  const unique = new Map<string, InventoryCostKey>()
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

function mapCost(row: CostRow): InventoryCostRecord {
  return Object.freeze({
    warehouseId: row.warehouse_id,
    variantId: row.variant_id,
    weightedAverageCost: row.weighted_average_cost,
    lastPurchaseCost: row.last_purchase_cost,
    inventoryValue: row.inventory_value,
    updatedAt: row.updated_at,
  })
}

interface ReadContextRow extends QueryResultRow {
  branch_id: string
  variant_exists: boolean
}

async function requireReadContext(
  client: PoolClient,
  warehouseId: string,
  variantId: string,
): Promise<ReadContextRow> {
  const result = await client.query<ReadContextRow>(
    `SELECT
       w.branch_id,
       EXISTS (
         SELECT 1
           FROM product_variants pv
          WHERE pv.id=$2
       ) AS variant_exists
     FROM warehouses w
    WHERE w.id=$1`,
    [warehouseId, variantId],
  )
  const row = result.rows[0]
  if (!row) {
    throw new InventoryCostError('WAREHOUSE_NOT_FOUND')
  }
  if (!row.variant_exists) {
    throw new InventoryCostError('VARIANT_NOT_FOUND')
  }
  return row
}

async function readCost(
  client: PoolClient,
  warehouseId: string,
  variantId: string,
  forUpdate: boolean,
): Promise<CostRow | undefined> {
  const result = await client.query<CostRow>(
    `SELECT
       warehouse_id,
       variant_id,
       weighted_average_cost::text AS weighted_average_cost,
       last_purchase_cost::text AS last_purchase_cost,
       inventory_value::text AS inventory_value,
       updated_at
     FROM variant_warehouse_cost_projection
    WHERE warehouse_id=$1
      AND variant_id=$2
    ${forUpdate ? 'FOR UPDATE' : ''}`,
    [warehouseId, variantId],
  )
  return result.rows[0]
}

function assertCostMatchesOnHand(
  onHandValue: string,
  cost: InventoryCostRecord,
): void {
  const onHand = parseQuantity(
    'position.onHand',
    onHandValue,
    false,
  ).scaled
  const weightedAverage = parseMoney(
    'cost.weightedAverageCost',
    cost.weightedAverageCost,
    false,
  ).scaled
  const storedValue = parseMoney(
    'cost.inventoryValue',
    cost.inventoryValue,
    true,
  ).scaled
  const expectedValue = valueFromQuantityAndCost(
    onHand,
    weightedAverage,
  )

  if (storedValue !== expectedValue) {
    throw new InventoryCostError(
      'COST_PROJECTION_DRIFT',
    )
  }
}

function assertProjectionConsistent(
  position: StockPositionRecord,
  cost: InventoryCostRecord,
): void {
  assertCostMatchesOnHand(position.onHand, cost)
}

/**
 * Phase 08.03 weighted-average operational projection.
 *
 * Lock order is always:
 *   Inventory Stock Position -> Variant/Warehouse Cost State.
 *
 * Historical truth remains the immutable Inventory Ledger. All valued mutations
 * require an already-open business transaction, so Movement + Stock Position +
 * Cost Projection can later share one COMMIT.
 *
 * lastPurchaseCost is explicit: purchase flows pass it; Sales Return / Transfer
 * inbound flows omit it so a non-purchase receipt does not rewrite the report
 * field.
 */
export class InventoryCostService {
  private readonly stockPositions: StockPositionService
  private readonly branchScope: BranchScopeService

  constructor(
    private readonly database: InventoryCostTransactionRunner,
  ) {
    this.stockPositions = new StockPositionService(database)
    this.branchScope = new BranchScopeService(database)
  }

  async lockManyWithinTransaction(
    client: PoolClient,
    input: LockInventoryCostsInput,
  ): Promise<readonly LockedInventoryCostRecord[]> {
    requireNonBlank('actorUserId', input.actorUserId)
    const keys = normalizeKeys(input.positions)

    // Global order: Stock Position rows are locked before Cost State rows.
    const stockRows =
      await this.stockPositions.lockManyWithinTransaction(
        client,
        {
          actorUserId: input.actorUserId,
          positions: keys,
        },
      )
    const stockByKey = new Map(
      stockRows.map((position) => [
        keyString(position),
        position,
      ]),
    )

    const locked: LockedInventoryCostRecord[] = []
    for (const key of keys) {
      await client.query(
        `INSERT INTO variant_warehouse_cost_projection
          (warehouse_id,variant_id,weighted_average_cost,last_purchase_cost,
           inventory_value,updated_at)
         VALUES ($1,$2,0,0,0,now())
         ON CONFLICT (warehouse_id,variant_id)
         DO NOTHING`,
        [key.warehouseId, key.variantId],
      )

      const costRow = await readCost(
        client,
        key.warehouseId,
        key.variantId,
        true,
      )
      const position = stockByKey.get(keyString(key))
      if (!costRow || !position) {
        throw new Error(
          'Inventory cost lock invariant failed',
        )
      }

      const cost = mapCost(costRow)
      assertProjectionConsistent(position, cost)
      locked.push(
        Object.freeze({
          position,
          cost,
        }),
      )
    }

    return Object.freeze(locked)
  }

  async applyInboundWithinTransaction(
    client: PoolClient,
    input: ApplyInboundCostInput,
  ): Promise<InboundCostResult> {
    requireNonBlank('actorUserId', input.actorUserId)
    const warehouseId = requireNonBlank(
      'warehouseId',
      input.warehouseId,
    )
    const variantId = requireNonBlank(
      'variantId',
      input.variantId,
    )
    const quantity = parseQuantity(
      'quantity',
      input.quantity,
      true,
    )
    const unitCost = parseMoney(
      'unitCost',
      input.unitCost,
      false,
    )
    const lastPurchaseCost =
      input.lastPurchaseCost === undefined
        ? undefined
        : parseMoney(
            'lastPurchaseCost',
            input.lastPurchaseCost,
            false,
          )

    const [locked] = await this.lockManyWithinTransaction(
      client,
      {
        actorUserId: input.actorUserId,
        positions: [{ warehouseId, variantId }],
      },
    )
    if (!locked) {
      throw new Error(
        'Inventory cost inbound invariant failed',
      )
    }

    const currentOnHand = parseQuantity(
      'current.onHand',
      locked.position.onHand,
      false,
    ).scaled
    const currentValue = parseMoney(
      'current.inventoryValue',
      locked.cost.inventoryValue,
      true,
    ).scaled
    const inboundValue = valueFromQuantityAndCost(
      quantity.scaled,
      unitCost.scaled,
    )
    const nextOnHand = checkedQuantity(
      'onHand',
      currentOnHand + quantity.scaled,
    )
    const unroundedNextValue = checkedMoney(
      'inventoryValue',
      currentValue + inboundValue,
      true,
    )
    const nextWeightedAverage =
      weightedCostFromValueAndQuantity(
        unroundedNextValue,
        nextOnHand,
      )

    const updatedPosition =
      await this.stockPositions.applyDeltaWithinTransaction(
        client,
        {
          actorUserId: input.actorUserId,
          warehouseId,
          variantId,
          onHandDelta: quantity.normalized,
          reservedDelta: '0',
        },
      )

    const verifiedOnHand = parseQuantity(
      'updated.onHand',
      updatedPosition.onHand,
      false,
    ).scaled
    if (verifiedOnHand !== nextOnHand) {
      throw new Error(
        'Inventory cost inbound stock invariant failed',
      )
    }

    const nextInventoryValue =
      valueFromQuantityAndCost(
        verifiedOnHand,
        nextWeightedAverage,
      )
    const result = await client.query<CostRow>(
      `UPDATE variant_warehouse_cost_projection
          SET weighted_average_cost=$3,
              last_purchase_cost=$4,
              inventory_value=$5,
              updated_at=now()
        WHERE warehouse_id=$1
          AND variant_id=$2
      RETURNING
        warehouse_id,
        variant_id,
        weighted_average_cost::text AS weighted_average_cost,
        last_purchase_cost::text AS last_purchase_cost,
        inventory_value::text AS inventory_value,
        updated_at`,
      [
        warehouseId,
        variantId,
        formatScaled(nextWeightedAverage, 4),
        lastPurchaseCost?.normalized ??
          locked.cost.lastPurchaseCost,
        formatScaled(nextInventoryValue, 4),
      ],
    )
    const row = result.rows[0]
    if (!row) {
      throw new Error(
        'Inventory cost inbound update invariant failed',
      )
    }

    return Object.freeze({
      position: updatedPosition,
      cost: mapCost(row),
      inboundValue: formatScaled(inboundValue, 4),
    })
  }

  async applyOutboundWithinTransaction(
    client: PoolClient,
    input: ApplyOutboundCostInput,
  ): Promise<OutboundCostResult> {
    requireNonBlank('actorUserId', input.actorUserId)
    const warehouseId = requireNonBlank(
      'warehouseId',
      input.warehouseId,
    )
    const variantId = requireNonBlank(
      'variantId',
      input.variantId,
    )
    const quantity = parseQuantity(
      'quantity',
      input.quantity,
      true,
    )

    const [locked] = await this.lockManyWithinTransaction(
      client,
      {
        actorUserId: input.actorUserId,
        positions: [{ warehouseId, variantId }],
      },
    )
    if (!locked) {
      throw new Error(
        'Inventory cost outbound invariant failed',
      )
    }

    const weightedAverage = parseMoney(
      'weightedAverageCost',
      locked.cost.weightedAverageCost,
      false,
    )
    const totalCost = valueFromQuantityAndCost(
      quantity.scaled,
      weightedAverage.scaled,
    )

    const updatedPosition =
      await this.stockPositions.applyDeltaWithinTransaction(
        client,
        {
          actorUserId: input.actorUserId,
          warehouseId,
          variantId,
          onHandDelta: formatScaled(
            -quantity.scaled,
            6,
          ),
          reservedDelta: '0',
        },
      )

    const afterOnHand = parseQuantity(
      'updated.onHand',
      updatedPosition.onHand,
      false,
    ).scaled
    const nextInventoryValue =
      valueFromQuantityAndCost(
        afterOnHand,
        weightedAverage.scaled,
      )

    const result = await client.query<CostRow>(
      `UPDATE variant_warehouse_cost_projection
          SET inventory_value=$3,
              updated_at=now()
        WHERE warehouse_id=$1
          AND variant_id=$2
      RETURNING
        warehouse_id,
        variant_id,
        weighted_average_cost::text AS weighted_average_cost,
        last_purchase_cost::text AS last_purchase_cost,
        inventory_value::text AS inventory_value,
        updated_at`,
      [
        warehouseId,
        variantId,
        formatScaled(nextInventoryValue, 4),
      ],
    )
    const row = result.rows[0]
    if (!row) {
      throw new Error(
        'Inventory cost outbound update invariant failed',
      )
    }

    return Object.freeze({
      position: updatedPosition,
      cost: mapCost(row),
      unitCost: weightedAverage.normalized,
      totalCost: formatScaled(totalCost, 4),
    })
  }

  async getCost(
    input: GetInventoryCostInput,
  ): Promise<InventoryCostRecord | null> {
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
      const context = await requireReadContext(
        client,
        warehouseId,
        variantId,
      )
      await this.branchScope.requireWithinTransaction(
        client as AuthorizationQueryClient,
        input.actorUserId,
        context.branch_id,
      )

      const row = await readCost(
        client,
        warehouseId,
        variantId,
        false,
      )
      if (!row) return null

      const stock = await client.query<
        { on_hand: string } & QueryResultRow
      >(
        `SELECT on_hand::text AS on_hand
           FROM inventory_stock_positions
          WHERE warehouse_id=$1
            AND variant_id=$2`,
        [warehouseId, variantId],
      )
      const stockRow = stock.rows[0]
      if (!stockRow) {
        throw new InventoryCostError(
          'COST_PROJECTION_DRIFT',
        )
      }

      const cost = mapCost(row)
      assertCostMatchesOnHand(stockRow.on_hand, cost)
      return cost
    })
  }
}
