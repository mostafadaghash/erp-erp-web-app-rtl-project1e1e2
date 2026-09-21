import type { PoolClient, QueryResultRow } from 'pg'

import { AuditService } from '../audit/audit-service.js'
import { BranchScopeService } from '../authorization/branch-scope-service.js'
import type {
  TransactionOptions,
  TransactionWork,
} from '../database/transaction.js'

const QUANTITY_SCALE = 6
const QUANTITY_SCALE_FACTOR = 1_000_000n
const MAX_NUMERIC_18_6_SCALED = 999_999_999_999_999_999n

export type ReorderLevelErrorReason =
  | 'ACTOR_NOT_FOUND_OR_INACTIVE'
  | 'WAREHOUSE_NOT_FOUND'
  | 'VARIANT_NOT_FOUND'

export class ReorderLevelError extends Error {
  readonly reason: ReorderLevelErrorReason

  constructor(reason: ReorderLevelErrorReason) {
    super('Reorder level operation rejected')
    this.name = 'ReorderLevelError'
    this.reason = reason
  }
}

export interface ReorderLevelTransactionRunner {
  transaction<T>(
    work: TransactionWork<T>,
    options?: TransactionOptions,
  ): Promise<T>
}

export interface SetReorderLevelInput {
  actorUserId: string
  warehouseId: string
  variantId: string
  minimumQuantity: string
}

export interface ClearReorderLevelInput {
  actorUserId: string
  warehouseId: string
  variantId: string
}

export interface GetReorderLevelInput {
  actorUserId: string
  warehouseId: string
  variantId: string
}

export interface ListLowStockAlertsInput {
  actorUserId: string
  branchId?: string | null
}

export interface ReorderLevelRecord {
  branchId: string
  warehouseId: string
  variantId: string
  minimumQuantity: string
}

export interface LowStockAlertRecord {
  branchId: string
  branchName: string
  warehouseId: string
  warehouseName: string
  productId: string
  productName: string
  variantId: string
  variantName: string
  minimumQuantity: string
  onHand: string
  reserved: string
  available: string
  shortageQuantity: string
}

interface Decimal6 {
  normalized: string
  scaled: bigint
}

interface ActorContextRow extends QueryResultRow {
  company_id: string
  default_branch_id: string
  branch_scope_mode: 'ALL' | 'SELECTED'
}

interface WarehouseRow extends QueryResultRow {
  id: string
  branch_id: string
  company_id: string
}

interface VariantRow extends QueryResultRow {
  id: string
}

interface ReorderLevelRow extends QueryResultRow {
  variant_id: string
  warehouse_id: string
  branch_id: string
  minimum_quantity: string
}

interface LowStockAlertRow extends QueryResultRow {
  branch_id: string
  branch_name: string
  warehouse_id: string
  warehouse_name: string
  product_id: string
  product_name: string
  variant_id: string
  variant_name: string
  minimum_quantity: string
  on_hand: string
  reserved: string
  available: string
  shortage_quantity: string
}

function requireNonBlank(name: string, value: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`)
  }
  return value.trim()
}

function formatScaled6(scaled: bigint): string {
  const integerPart = scaled / QUANTITY_SCALE_FACTOR
  const fractionalPart = (scaled % QUANTITY_SCALE_FACTOR)
    .toString()
    .padStart(QUANTITY_SCALE, '0')

  return `${integerPart.toString()}.${fractionalPart}`
}

function parseQuantity6(
  name: string,
  value: string,
): Decimal6 {
  requireNonBlank(name, value)
  const trimmed = value.trim()
  const match = /^(\d{1,12})(?:\.(\d{1,6}))?$/.exec(trimmed)
  if (!match) {
    throw new TypeError(
      `${name} must be a non-negative decimal representable as numeric(18,6)`,
    )
  }

  const integerDigits = match[1] ?? '0'
  const fractionalDigits = (match[2] ?? '').padEnd(
    QUANTITY_SCALE,
    '0',
  )
  const scaled =
    BigInt(integerDigits) * QUANTITY_SCALE_FACTOR +
    BigInt(fractionalDigits || '0')

  if (scaled > MAX_NUMERIC_18_6_SCALED) {
    throw new RangeError(
      `${name} exceeds numeric(18,6)`,
    )
  }

  return {
    normalized: formatScaled6(scaled),
    scaled,
  }
}

function mapReorderLevel(
  row: ReorderLevelRow,
): ReorderLevelRecord {
  return Object.freeze({
    branchId: row.branch_id,
    warehouseId: row.warehouse_id,
    variantId: row.variant_id,
    minimumQuantity: row.minimum_quantity,
  })
}

function mapLowStockAlert(
  row: LowStockAlertRow,
): LowStockAlertRecord {
  return Object.freeze({
    branchId: row.branch_id,
    branchName: row.branch_name,
    warehouseId: row.warehouse_id,
    warehouseName: row.warehouse_name,
    productId: row.product_id,
    productName: row.product_name,
    variantId: row.variant_id,
    variantName: row.variant_name,
    minimumQuantity: row.minimum_quantity,
    onHand: row.on_hand,
    reserved: row.reserved,
    available: row.available,
    shortageQuantity: row.shortage_quantity,
  })
}

async function requireActorContext(
  client: PoolClient,
  actorUserId: string,
): Promise<ActorContextRow> {
  const result = await client.query<ActorContextRow>(
    `SELECT
       b.company_id,
       u.default_branch_id,
       u.branch_scope_mode
     FROM users u
     JOIN branches b
       ON b.id=u.default_branch_id
    WHERE u.id=$1
      AND u.is_active=true`,
    [actorUserId],
  )
  const row = result.rows[0]
  if (!row) {
    throw new ReorderLevelError(
      'ACTOR_NOT_FOUND_OR_INACTIVE',
    )
  }
  return row
}

async function requireWarehouse(
  client: PoolClient,
  warehouseId: string,
): Promise<WarehouseRow> {
  const result = await client.query<WarehouseRow>(
    `SELECT
       w.id,
       w.branch_id,
       b.company_id
     FROM warehouses w
     JOIN branches b
       ON b.id=w.branch_id
    WHERE w.id=$1
    FOR KEY SHARE OF w`,
    [warehouseId],
  )
  const row = result.rows[0]
  if (!row) {
    throw new ReorderLevelError('WAREHOUSE_NOT_FOUND')
  }
  return row
}

async function requireVariant(
  client: PoolClient,
  variantId: string,
): Promise<VariantRow> {
  const result = await client.query<VariantRow>(
    `SELECT id
       FROM product_variants
      WHERE id=$1
      FOR KEY SHARE`,
    [variantId],
  )
  const row = result.rows[0]
  if (!row) {
    throw new ReorderLevelError('VARIANT_NOT_FOUND')
  }
  return row
}

export class ReorderLevelService {
  private readonly audit = new AuditService()
  private readonly branchScope: BranchScopeService

  constructor(
    private readonly database: ReorderLevelTransactionRunner,
  ) {
    this.branchScope = new BranchScopeService(database)
  }

  async setReorderLevel(
    input: SetReorderLevelInput,
  ): Promise<ReorderLevelRecord> {
    requireNonBlank('actorUserId', input.actorUserId)
    requireNonBlank('warehouseId', input.warehouseId)
    requireNonBlank('variantId', input.variantId)
    const minimum = parseQuantity6(
      'minimumQuantity',
      input.minimumQuantity,
    )

    return this.database.transaction(async (client) => {
      const actor = await requireActorContext(
        client,
        input.actorUserId,
      )
      const warehouse = await requireWarehouse(
        client,
        input.warehouseId,
      )
      await this.branchScope.requireWithinTransaction(
        client,
        input.actorUserId,
        warehouse.branch_id,
      )
      await requireVariant(client, input.variantId)

      const before = await client.query<{
        minimum_quantity: string
      } & QueryResultRow>(
        `SELECT minimum_quantity::text AS minimum_quantity
           FROM reorder_levels
          WHERE variant_id=$1
            AND warehouse_id=$2`,
        [input.variantId, input.warehouseId],
      )

      const result = await client.query<ReorderLevelRow>(
        `INSERT INTO reorder_levels
          (variant_id,warehouse_id,minimum_quantity)
         VALUES ($1,$2,$3)
         ON CONFLICT (variant_id,warehouse_id)
         DO UPDATE
           SET minimum_quantity=EXCLUDED.minimum_quantity
         RETURNING
           variant_id,
           warehouse_id,
           $4::uuid AS branch_id,
           minimum_quantity::text AS minimum_quantity`,
        [
          input.variantId,
          input.warehouseId,
          minimum.normalized,
          warehouse.branch_id,
        ],
      )
      const row = result.rows[0]
      if (!row) {
        throw new Error(
          'Reorder Level invariant failed: upsert returned no row',
        )
      }

      const previousMinimum =
        before.rows[0]?.minimum_quantity ?? null
      if (previousMinimum !== row.minimum_quantity) {
        await this.audit.record(client, {
          companyId:
            warehouse.company_id ?? actor.company_id,
          branchId: warehouse.branch_id,
          userId: input.actorUserId,
          action: 'REORDER_LEVEL_UPSERTED',
          entityType: 'PRODUCT_VARIANT_REORDER_LEVEL',
          entityId: input.variantId,
          before:
            previousMinimum === null
              ? null
              : {
                  warehouseId: input.warehouseId,
                  minimumQuantity: previousMinimum,
                },
          after: {
            warehouseId: input.warehouseId,
            minimumQuantity: row.minimum_quantity,
          },
        })
      }

      return mapReorderLevel(row)
    })
  }

  async clearReorderLevel(
    input: ClearReorderLevelInput,
  ): Promise<boolean> {
    requireNonBlank('actorUserId', input.actorUserId)
    requireNonBlank('warehouseId', input.warehouseId)
    requireNonBlank('variantId', input.variantId)

    return this.database.transaction(async (client) => {
      const actor = await requireActorContext(
        client,
        input.actorUserId,
      )
      const warehouse = await requireWarehouse(
        client,
        input.warehouseId,
      )
      await this.branchScope.requireWithinTransaction(
        client,
        input.actorUserId,
        warehouse.branch_id,
      )
      await requireVariant(client, input.variantId)

      const result = await client.query<{
        minimum_quantity: string
      } & QueryResultRow>(
        `DELETE FROM reorder_levels
          WHERE variant_id=$1
            AND warehouse_id=$2
        RETURNING minimum_quantity::text AS minimum_quantity`,
        [input.variantId, input.warehouseId],
      )
      const deleted = result.rows[0]
      if (!deleted) return false

      await this.audit.record(client, {
        companyId:
          warehouse.company_id ?? actor.company_id,
        branchId: warehouse.branch_id,
        userId: input.actorUserId,
        action: 'REORDER_LEVEL_CLEARED',
        entityType: 'PRODUCT_VARIANT_REORDER_LEVEL',
        entityId: input.variantId,
        before: {
          warehouseId: input.warehouseId,
          minimumQuantity: deleted.minimum_quantity,
        },
        after: null,
      })

      return true
    })
  }

  async getReorderLevel(
    input: GetReorderLevelInput,
  ): Promise<ReorderLevelRecord | null> {
    requireNonBlank('actorUserId', input.actorUserId)
    requireNonBlank('warehouseId', input.warehouseId)
    requireNonBlank('variantId', input.variantId)

    return this.database.transaction(async (client) => {
      await requireActorContext(client, input.actorUserId)
      const warehouse = await requireWarehouse(
        client,
        input.warehouseId,
      )
      await this.branchScope.requireWithinTransaction(
        client,
        input.actorUserId,
        warehouse.branch_id,
      )
      await requireVariant(client, input.variantId)

      const result = await client.query<ReorderLevelRow>(
        `SELECT
           rl.variant_id,
           rl.warehouse_id,
           $3::uuid AS branch_id,
           rl.minimum_quantity::text AS minimum_quantity
         FROM reorder_levels rl
        WHERE rl.variant_id=$1
          AND rl.warehouse_id=$2`,
        [
          input.variantId,
          input.warehouseId,
          warehouse.branch_id,
        ],
      )
      const row = result.rows[0]
      return row ? mapReorderLevel(row) : null
    })
  }

  /**
   * Live operational alert read. v1.7 defines low stock as:
   * Available = On Hand - Reserved, and Available < minimum_quantity.
   *
   * inventory_stock_positions is a rebuildable operational projection, not
   * historical truth. A missing projection row is treated as zero stock for
   * alerting so a configured threshold can still surface before first stock.
   *
   * No locks are taken here because this is a read model. Inventory commands
   * in Phase 08 own atomic position updates; a later read observes the new
   * projection state.
   */
  async listLowStockAlerts(
    input: ListLowStockAlertsInput,
  ): Promise<readonly LowStockAlertRecord[]> {
    requireNonBlank('actorUserId', input.actorUserId)
    if (
      input.branchId !== null &&
      input.branchId !== undefined
    ) {
      requireNonBlank('branchId', input.branchId)
    }

    return this.database.transaction(async (client) => {
      const actor = await requireActorContext(
        client,
        input.actorUserId,
      )

      if (input.branchId) {
        await this.branchScope.requireWithinTransaction(
          client,
          input.actorUserId,
          input.branchId,
        )
      }

      const result = await client.query<LowStockAlertRow>(
        `SELECT
           b.id AS branch_id,
           b.name AS branch_name,
           w.id AS warehouse_id,
           w.name AS warehouse_name,
           p.id AS product_id,
           p.name AS product_name,
           pv.id AS variant_id,
           pv.name AS variant_name,
           rl.minimum_quantity::text AS minimum_quantity,
           COALESCE(isp.on_hand,0::numeric)::numeric(18,6)::text AS on_hand,
           COALESCE(isp.reserved,0::numeric)::numeric(18,6)::text AS reserved,
           (
             COALESCE(isp.on_hand,0::numeric)
             - COALESCE(isp.reserved,0::numeric)
           )::numeric(18,6)::text AS available,
           (
             rl.minimum_quantity
             - (
                 COALESCE(isp.on_hand,0::numeric)
                 - COALESCE(isp.reserved,0::numeric)
               )
           )::numeric(18,6)::text AS shortage_quantity
         FROM reorder_levels rl
         JOIN warehouses w
           ON w.id=rl.warehouse_id
         JOIN branches b
           ON b.id=w.branch_id
         JOIN product_variants pv
           ON pv.id=rl.variant_id
         JOIN products p
           ON p.id=pv.product_id
         LEFT JOIN inventory_stock_positions isp
           ON isp.warehouse_id=rl.warehouse_id
          AND isp.variant_id=rl.variant_id
        WHERE ($2::uuid IS NULL OR b.id=$2)
          AND (
            $3::text='ALL'
            OR (
              $3::text='SELECTED'
              AND EXISTS (
                SELECT 1
                  FROM user_branch_access uba
                 WHERE uba.user_id=$1
                   AND uba.branch_id=b.id
              )
            )
          )
          AND (
            COALESCE(isp.on_hand,0::numeric)
            - COALESCE(isp.reserved,0::numeric)
          ) < rl.minimum_quantity
        ORDER BY
          b.name,
          w.name,
          p.name,
          pv.name,
          pv.id`,
        [
          input.actorUserId,
          input.branchId ?? null,
          actor.branch_scope_mode,
        ],
      )

      return Object.freeze(
        result.rows.map(mapLowStockAlert),
      )
    })
  }
}
