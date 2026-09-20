import { randomUUID } from 'node:crypto'
import type { PoolClient, QueryResultRow } from 'pg'

import { AuditService } from '../audit/audit-service.js'
import type {
  TransactionOptions,
  TransactionWork,
} from '../database/transaction.js'

export const PRODUCT_TYPES = Object.freeze([
  'STOCK',
  'SERVICE',
] as const)

export type ProductType = (typeof PRODUCT_TYPES)[number]

export type ProductModelErrorReason =
  | 'ACTOR_NOT_FOUND_OR_INACTIVE'
  | 'CATEGORY_NOT_FOUND'
  | 'UNIT_NOT_FOUND'
  | 'PRODUCT_NOT_FOUND'

export class ProductModelError extends Error {
  readonly reason: ProductModelErrorReason

  constructor(reason: ProductModelErrorReason) {
    super('Product model operation rejected')
    this.name = 'ProductModelError'
    this.reason = reason
  }
}

export interface ProductModelTransactionRunner {
  transaction<T>(
    work: TransactionWork<T>,
    options?: TransactionOptions,
  ): Promise<T>
}

export interface CreateSimpleProductInput {
  actorUserId: string
  name: string
  categoryId: string
  productType: ProductType
  baseUnitMasterId: string
  trackingSerial?: boolean
  trackingBatch?: boolean
  trackingExpiry?: boolean
}

export interface ProductUnitRecord {
  id: string
  unitId: string
  conversionToBase: string
  isSellable: boolean
  isPurchasable: boolean
}

export interface ProductVariantRecord {
  id: string
  name: string
  sku: string | null
  isDefault: boolean
  combinationSignature: string
  minimumSellingPrice: string | null
  isActive: boolean
}

export interface ProductModelRecord {
  id: string
  name: string
  categoryId: string
  productType: ProductType
  baseUnitId: string
  trackingSerial: boolean
  trackingBatch: boolean
  trackingExpiry: boolean
  isActive: boolean
  simpleProduct: boolean
  baseProductUnit: ProductUnitRecord
  variants: readonly ProductVariantRecord[]
}

interface ActorContextRow extends QueryResultRow {
  company_id: string
  default_branch_id: string
}

interface ProductRow extends QueryResultRow {
  id: string
  name: string
  category_id: string
  product_type: ProductType
  base_unit_id: string
  tracking_serial: boolean
  tracking_batch: boolean
  tracking_expiry: boolean
  is_active: boolean
}

interface ProductUnitRow extends QueryResultRow {
  id: string
  unit_id: string
  conversion_to_base: string
  is_sellable: boolean
  is_purchasable: boolean
}

interface ProductVariantRow extends QueryResultRow {
  id: string
  name: string
  sku: string | null
  is_default: boolean
  combination_signature: string
  minimum_selling_price: string | null
  is_active: boolean
}

const INTERNAL_DEFAULT_VARIANT_NAME = 'Default'
const INTERNAL_DEFAULT_VARIANT_SIGNATURE = 'DEFAULT'

function requireNonBlank(name: string, value: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`)
  }
}

function validateProductType(productType: ProductType): void {
  if (!PRODUCT_TYPES.includes(productType)) {
    throw new TypeError('Unsupported product type')
  }
}

function validateTrackingPolicy(
  trackingSerial: boolean,
  trackingBatch: boolean,
  trackingExpiry: boolean,
): void {
  if (
    (trackingSerial && trackingBatch) ||
    (trackingExpiry && !trackingBatch)
  ) {
    throw new TypeError('Invalid product tracking policy')
  }
}

function validateCreateInput(input: CreateSimpleProductInput): {
  trackingSerial: boolean
  trackingBatch: boolean
  trackingExpiry: boolean
} {
  requireNonBlank('actorUserId', input.actorUserId)
  requireNonBlank('product name', input.name)
  requireNonBlank('categoryId', input.categoryId)
  requireNonBlank('baseUnitMasterId', input.baseUnitMasterId)
  validateProductType(input.productType)

  const trackingSerial = input.trackingSerial ?? false
  const trackingBatch = input.trackingBatch ?? false
  const trackingExpiry = input.trackingExpiry ?? false
  validateTrackingPolicy(
    trackingSerial,
    trackingBatch,
    trackingExpiry,
  )

  return {
    trackingSerial,
    trackingBatch,
    trackingExpiry,
  }
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
    throw new ProductModelError('ACTOR_NOT_FOUND_OR_INACTIVE')
  }
  return row
}

async function requireCategory(
  client: PoolClient,
  categoryId: string,
): Promise<void> {
  const result = await client.query(
    `SELECT id
       FROM product_categories
      WHERE id=$1
      FOR KEY SHARE`,
    [categoryId],
  )
  if (result.rowCount !== 1) {
    throw new ProductModelError('CATEGORY_NOT_FOUND')
  }
}

async function requireUnit(
  client: PoolClient,
  unitId: string,
): Promise<void> {
  const result = await client.query(
    `SELECT id
       FROM units
      WHERE id=$1
      FOR KEY SHARE`,
    [unitId],
  )
  if (result.rowCount !== 1) {
    throw new ProductModelError('UNIT_NOT_FOUND')
  }
}

function mapBaseProductUnit(row: ProductUnitRow): ProductUnitRecord {
  return Object.freeze({
    id: row.id,
    unitId: row.unit_id,
    conversionToBase: row.conversion_to_base,
    isSellable: row.is_sellable,
    isPurchasable: row.is_purchasable,
  })
}

function mapVariant(row: ProductVariantRow): ProductVariantRecord {
  return Object.freeze({
    id: row.id,
    name: row.name,
    sku: row.sku,
    isDefault: row.is_default,
    combinationSignature: row.combination_signature,
    minimumSellingPrice: row.minimum_selling_price,
    isActive: row.is_active,
  })
}

/**
 * Phase 07.01 Product core.
 *
 * The only creation command in this slice creates a simple Product atomically
 * with its required Base ProductUnit and one internal Default Variant.
 * Alternate-unit management, fraction policy, SKU/barcode, attributes,
 * pricing and reorder workflows remain owned by later Phase 07 slices.
 */
export class ProductModelService {
  private readonly audit = new AuditService()

  constructor(
    private readonly database: ProductModelTransactionRunner,
  ) {}

  async createSimpleProduct(
    input: CreateSimpleProductInput,
  ): Promise<ProductModelRecord> {
    const tracking = validateCreateInput(input)

    return this.database.transaction(async (client) => {
      const actor = await requireActorContext(
        client,
        input.actorUserId,
      )
      await requireCategory(client, input.categoryId)
      await requireUnit(client, input.baseUnitMasterId)

      const productId = randomUUID()
      const baseProductUnitId = randomUUID()
      const defaultVariantId = randomUUID()

      await client.query(
        `INSERT INTO products
          (id,name,category_id,product_type,base_unit_id,
           tracking_serial,tracking_batch,tracking_expiry,
           is_active,created_at,updated_at)
         VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,true,clock_timestamp(),clock_timestamp())`,
        [
          productId,
          input.name.trim(),
          input.categoryId,
          input.productType,
          baseProductUnitId,
          tracking.trackingSerial,
          tracking.trackingBatch,
          tracking.trackingExpiry,
        ],
      )

      // 07.01 only bootstraps the mandatory Base ProductUnit.
      // Management of alternate units and these flags belongs to 07.02.
      await client.query(
        `INSERT INTO product_units
          (id,product_id,unit_id,conversion_to_base,is_sellable,is_purchasable)
         VALUES ($1,$2,$3,1.000000,true,true)`,
        [
          baseProductUnitId,
          productId,
          input.baseUnitMasterId,
        ],
      )

      await client.query(
        `INSERT INTO product_variants
          (id,product_id,name,sku,is_default,combination_signature,
           minimum_selling_price,is_active,created_at,updated_at)
         VALUES
          ($1,$2,$3,NULL,true,$4,NULL,true,clock_timestamp(),clock_timestamp())`,
        [
          defaultVariantId,
          productId,
          INTERNAL_DEFAULT_VARIANT_NAME,
          INTERNAL_DEFAULT_VARIANT_SIGNATURE,
        ],
      )

      await this.audit.record(client, {
        companyId: actor.company_id,
        branchId: actor.default_branch_id,
        userId: input.actorUserId,
        action: 'PRODUCT_CREATED',
        entityType: 'PRODUCT',
        entityId: productId,
        after: {
          name: input.name.trim(),
          categoryId: input.categoryId,
          productType: input.productType,
          baseProductUnitId,
          baseUnitMasterId: input.baseUnitMasterId,
          trackingSerial: tracking.trackingSerial,
          trackingBatch: tracking.trackingBatch,
          trackingExpiry: tracking.trackingExpiry,
          simpleProduct: true,
          defaultVariantId,
        },
      })

      return this.readWithClient(client, productId)
    })
  }

  async get(productId: string): Promise<ProductModelRecord> {
    requireNonBlank('productId', productId)
    return this.database.transaction((client) =>
      this.readWithClient(client, productId),
    )
  }

  private async readWithClient(
    client: PoolClient,
    productId: string,
  ): Promise<ProductModelRecord> {
    const productResult = await client.query<ProductRow>(
      `SELECT
         id,
         name,
         category_id,
         product_type,
         base_unit_id,
         tracking_serial,
         tracking_batch,
         tracking_expiry,
         is_active
       FROM products
      WHERE id=$1`,
      [productId],
    )
    const product = productResult.rows[0]
    if (!product) {
      throw new ProductModelError('PRODUCT_NOT_FOUND')
    }

    const baseUnitResult = await client.query<ProductUnitRow>(
      `SELECT
         id,
         unit_id,
         conversion_to_base::text AS conversion_to_base,
         is_sellable,
         is_purchasable
       FROM product_units
      WHERE id=$1
        AND product_id=$2`,
      [product.base_unit_id, product.id],
    )
    const baseUnit = baseUnitResult.rows[0]
    if (!baseUnit) {
      throw new Error(
        'Product model invariant failed: Base ProductUnit missing',
      )
    }

    const variantsResult = await client.query<ProductVariantRow>(
      `SELECT
         id,
         name,
         sku,
         is_default,
         combination_signature,
         minimum_selling_price::text AS minimum_selling_price,
         is_active
       FROM product_variants
      WHERE product_id=$1
      ORDER BY id`,
      [product.id],
    )

    if (variantsResult.rowCount === 0) {
      throw new Error(
        'Product model invariant failed: Product has no Variant',
      )
    }

    const variants = Object.freeze(
      variantsResult.rows.map(mapVariant),
    )
    const simpleProduct =
      variants.length === 1 && variants[0]?.isDefault === true

    return Object.freeze({
      id: product.id,
      name: product.name,
      categoryId: product.category_id,
      productType: product.product_type,
      baseUnitId: product.base_unit_id,
      trackingSerial: product.tracking_serial,
      trackingBatch: product.tracking_batch,
      trackingExpiry: product.tracking_expiry,
      isActive: product.is_active,
      simpleProduct,
      baseProductUnit: mapBaseProductUnit(baseUnit),
      variants,
    })
  }
}
