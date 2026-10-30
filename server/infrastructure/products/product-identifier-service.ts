import { randomUUID } from 'node:crypto'
import type { PoolClient, QueryResultRow } from 'pg'

import { AuditService } from '../audit/audit-service.js'
import type {
  TransactionOptions,
  TransactionWork,
} from '../database/transaction.js'

export type ProductIdentifierErrorReason =
  | 'ACTOR_NOT_FOUND_OR_INACTIVE'
  | 'VARIANT_NOT_FOUND'
  | 'PRODUCT_UNIT_NOT_FOUND'
  | 'CROSS_PRODUCT_UNIT_LINK'
  | 'SKU_ALREADY_EXISTS'
  | 'BARCODE_ALREADY_EXISTS'

export class ProductIdentifierError extends Error {
  readonly reason: ProductIdentifierErrorReason

  constructor(reason: ProductIdentifierErrorReason) {
    super('Product identifier operation rejected')
    this.name = 'ProductIdentifierError'
    this.reason = reason
  }
}

export interface ProductIdentifierTransactionRunner {
  transaction<T>(
    work: TransactionWork<T>,
    options?: TransactionOptions,
  ): Promise<T>
}

export interface SetVariantSkuInput {
  actorUserId: string
  variantId: string
  sku: string | null
}

export interface AddBarcodeInput {
  actorUserId: string
  variantId: string
  productUnitId: string
  barcode: string
  isPrimary: boolean
}

export interface VariantSkuRecord {
  variantId: string
  productId: string
  sku: string | null
}

export interface BarcodeRecord {
  id: string
  variantId: string
  productUnitId: string
  productId: string
  barcode: string
  isPrimary: boolean
}

interface ActorContextRow extends QueryResultRow {
  company_id: string
  default_branch_id: string
}

interface VariantRow extends QueryResultRow {
  id: string
  product_id: string
  sku: string | null
}

interface ProductUnitRow extends QueryResultRow {
  id: string
  product_id: string
}

interface BarcodeRow extends QueryResultRow {
  id: string
  variant_id: string
  product_unit_id: string
  product_id: string
  barcode: string
  is_primary: boolean
}

interface PostgreSqlErrorShape {
  code?: unknown
  constraint?: unknown
}

const SKU_UNIQUE_CONSTRAINT =
  'ux_product_variants__sku__where_sku_is_not_null'
const BARCODE_UNIQUE_CONSTRAINT =
  'uq_variant_barcodes__barcode'

function requireNonBlank(name: string, value: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`)
  }
  return value.trim()
}

function normalizeSku(value: string | null): string | null {
  if (value === null) return null
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  return trimmed.toUpperCase()
}

function normalizeBarcode(value: string): string {
  return requireNonBlank('barcode', value)
}

function postgresUniqueConstraint(
  error: unknown,
): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const shape = error as PostgreSqlErrorShape
  if (shape.code !== '23505') return undefined
  return typeof shape.constraint === 'string'
    ? shape.constraint
    : undefined
}

function translateUniqueConflict(error: unknown): never {
  const constraint = postgresUniqueConstraint(error)
  if (constraint === SKU_UNIQUE_CONSTRAINT) {
    throw new ProductIdentifierError('SKU_ALREADY_EXISTS')
  }
  if (constraint === BARCODE_UNIQUE_CONSTRAINT) {
    throw new ProductIdentifierError('BARCODE_ALREADY_EXISTS')
  }
  throw error
}

async function requireActorContext(
  client: PoolClient,
  actorUserId: string,
): Promise<ActorContextRow> {
  const result = await client.query<ActorContextRow>(
    `SELECT
       b.company_id,
       u.default_branch_id
     FROM users u
     JOIN branches b
       ON b.id=u.default_branch_id
    WHERE u.id=$1
      AND u.is_active=true`,
    [actorUserId],
  )
  const row = result.rows[0]
  if (!row) {
    throw new ProductIdentifierError(
      'ACTOR_NOT_FOUND_OR_INACTIVE',
    )
  }
  return row
}

async function lockVariant(
  client: PoolClient,
  variantId: string,
): Promise<VariantRow> {
  const result = await client.query<VariantRow>(
    `SELECT id,product_id,sku
       FROM product_variants
      WHERE id=$1
      FOR UPDATE`,
    [variantId],
  )
  const row = result.rows[0]
  if (!row) {
    throw new ProductIdentifierError('VARIANT_NOT_FOUND')
  }
  return row
}

async function requireProductUnit(
  client: PoolClient,
  productUnitId: string,
): Promise<ProductUnitRow> {
  const result = await client.query<ProductUnitRow>(
    `SELECT id,product_id
       FROM product_units
      WHERE id=$1
      FOR KEY SHARE`,
    [productUnitId],
  )
  const row = result.rows[0]
  if (!row) {
    throw new ProductIdentifierError(
      'PRODUCT_UNIT_NOT_FOUND',
    )
  }
  return row
}

export class ProductIdentifierService {
  private readonly audit = new AuditService()

  constructor(
    private readonly database: ProductIdentifierTransactionRunner,
  ) {}

  async setVariantSku(
    input: SetVariantSkuInput,
  ): Promise<VariantSkuRecord> {
    requireNonBlank('actorUserId', input.actorUserId)
    requireNonBlank('variantId', input.variantId)
    const sku = normalizeSku(input.sku)

    try {
      return await this.database.transaction(async (client) => {
        const actor = await requireActorContext(
          client,
          input.actorUserId,
        )
        const before = await lockVariant(
          client,
          input.variantId,
        )

        const updated = await client.query<VariantRow>(
          `UPDATE product_variants
              SET sku=$2,
                  updated_at=clock_timestamp()
            WHERE id=$1
          RETURNING id,product_id,sku`,
          [input.variantId, sku],
        )
        const row = updated.rows[0]
        if (!row) {
          throw new ProductIdentifierError(
            'VARIANT_NOT_FOUND',
          )
        }

        await this.audit.record(client, {
          companyId: actor.company_id,
          branchId: actor.default_branch_id,
          userId: input.actorUserId,
          action: 'VARIANT_SKU_UPDATED',
          entityType: 'PRODUCT_VARIANT',
          entityId: row.id,
          before: {
            sku: before.sku,
          },
          after: {
            sku: row.sku,
          },
        })

        return Object.freeze({
          variantId: row.id,
          productId: row.product_id,
          sku: row.sku,
        })
      })
    } catch (error) {
      translateUniqueConflict(error)
    }
  }

  async addBarcode(
    input: AddBarcodeInput,
  ): Promise<BarcodeRecord> {
    requireNonBlank('actorUserId', input.actorUserId)
    requireNonBlank('variantId', input.variantId)
    requireNonBlank('productUnitId', input.productUnitId)
    const barcode = normalizeBarcode(input.barcode)

    try {
      return await this.database.transaction(async (client) => {
        const actor = await requireActorContext(
          client,
          input.actorUserId,
        )
        const variant = await lockVariant(
          client,
          input.variantId,
        )
        const productUnit = await requireProductUnit(
          client,
          input.productUnitId,
        )

        if (variant.product_id !== productUnit.product_id) {
          throw new ProductIdentifierError(
            'CROSS_PRODUCT_UNIT_LINK',
          )
        }

        const barcodeId = randomUUID()
        const inserted = await client.query<BarcodeRow>(
          `INSERT INTO variant_barcodes
            (id,variant_id,product_unit_id,barcode,is_primary)
           VALUES ($1,$2,$3,$4,$5)
           RETURNING
             id,
             variant_id,
             product_unit_id,
             $6::uuid AS product_id,
             barcode,
             is_primary`,
          [
            barcodeId,
            input.variantId,
            input.productUnitId,
            barcode,
            input.isPrimary,
            variant.product_id,
          ],
        )
        const row = inserted.rows[0]
        if (!row) {
          throw new Error(
            'Barcode invariant failed: insert returned no row',
          )
        }

        await this.audit.record(client, {
          companyId: actor.company_id,
          branchId: actor.default_branch_id,
          userId: input.actorUserId,
          action: 'VARIANT_BARCODE_ADDED',
          entityType: 'VARIANT_BARCODE',
          entityId: row.id,
          after: {
            variantId: row.variant_id,
            productUnitId: row.product_unit_id,
            productId: row.product_id,
            barcode: row.barcode,
            isPrimary: row.is_primary,
          },
        })

        return Object.freeze({
          id: row.id,
          variantId: row.variant_id,
          productUnitId: row.product_unit_id,
          productId: row.product_id,
          barcode: row.barcode,
          isPrimary: row.is_primary,
        })
      })
    } catch (error) {
      translateUniqueConflict(error)
    }
  }

  async findVariantBySku(
    skuInput: string,
  ): Promise<VariantSkuRecord | null> {
    const sku = normalizeSku(
      requireNonBlank('sku', skuInput),
    )
    if (sku === null) return null

    return this.database.transaction(async (client) => {
      const result = await client.query<VariantRow>(
        `SELECT id,product_id,sku
           FROM product_variants
          WHERE sku=$1`,
        [sku],
      )
      const row = result.rows[0]
      if (!row) return null
      return Object.freeze({
        variantId: row.id,
        productId: row.product_id,
        sku: row.sku,
      })
    })
  }

  async findBarcode(
    barcodeInput: string,
  ): Promise<BarcodeRecord | null> {
    const barcode = normalizeBarcode(barcodeInput)

    return this.database.transaction(async (client) => {
      const result = await client.query<BarcodeRow>(
        `SELECT
           vb.id,
           vb.variant_id,
           vb.product_unit_id,
           pv.product_id,
           vb.barcode,
           vb.is_primary
         FROM variant_barcodes vb
         JOIN product_variants pv
           ON pv.id=vb.variant_id
        WHERE vb.barcode=$1`,
        [barcode],
      )
      const row = result.rows[0]
      if (!row) return null
      return Object.freeze({
        id: row.id,
        variantId: row.variant_id,
        productUnitId: row.product_unit_id,
        productId: row.product_id,
        barcode: row.barcode,
        isPrimary: row.is_primary,
      })
    })
  }
}
