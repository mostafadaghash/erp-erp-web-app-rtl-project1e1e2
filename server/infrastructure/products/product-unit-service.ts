import { randomUUID } from 'node:crypto'
import type { PoolClient, QueryResultRow } from 'pg'

import { AuditService } from '../audit/audit-service.js'
import type {
  TransactionOptions,
  TransactionWork,
} from '../database/transaction.js'

const DECIMAL_SCALE = 6
const DECIMAL_SCALE_FACTOR = 1_000_000n
const MAX_NUMERIC_18_6_SCALED = 999_999_999_999_999_999n

export const PRODUCT_UNIT_USAGES = Object.freeze([
  'SELL',
  'PURCHASE',
] as const)

export type ProductUnitUsage =
  (typeof PRODUCT_UNIT_USAGES)[number]

export type ProductUnitErrorReason =
  | 'ACTOR_NOT_FOUND_OR_INACTIVE'
  | 'PRODUCT_NOT_FOUND'
  | 'UNIT_NOT_FOUND'
  | 'PRODUCT_UNIT_NOT_FOUND'
  | 'VARIANT_NOT_FOUND'
  | 'CROSS_PRODUCT_UNIT_LINK'
  | 'BASE_UNIT_CONVERSION_MUST_BE_ONE'
  | 'FRACTION_NOT_ALLOWED'
  | 'PRODUCT_UNIT_NOT_SELLABLE'
  | 'PRODUCT_UNIT_NOT_PURCHASABLE'
  | 'BASE_QUANTITY_PRECISION_EXCEEDED'
  | 'BASE_QUANTITY_OUT_OF_RANGE'

export class ProductUnitError extends Error {
  readonly reason: ProductUnitErrorReason

  constructor(reason: ProductUnitErrorReason) {
    super('Product unit operation rejected')
    this.name = 'ProductUnitError'
    this.reason = reason
  }
}

export interface ProductUnitTransactionRunner {
  transaction<T>(
    work: TransactionWork<T>,
    options?: TransactionOptions,
  ): Promise<T>
}

export interface CreateUnitInput {
  actorUserId: string
  name: string
  symbol: string
  allowsFraction: boolean
}

export interface UnitRecord {
  id: string
  name: string
  symbol: string
  allowsFraction: boolean
  isActive: boolean
}

export interface AddProductUnitInput {
  actorUserId: string
  productId: string
  unitId: string
  conversionToBase: string
  isSellable: boolean
  isPurchasable: boolean
}

export interface UpdateProductUnitPolicyInput {
  actorUserId: string
  productUnitId: string
  conversionToBase: string
  isSellable: boolean
  isPurchasable: boolean
}

export interface ProductUnitRecord {
  id: string
  productId: string
  unitId: string
  unitName: string
  unitSymbol: string
  allowsFraction: boolean
  conversionToBase: string
  isSellable: boolean
  isPurchasable: boolean
  isBase: boolean
}

export interface ValidateAndConvertQuantityInput {
  variantId: string
  productUnitId: string
  quantity: string
  usage: ProductUnitUsage
}

export interface QuantityConversionResult {
  variantId: string
  productUnitId: string
  productId: string
  quantity: string
  baseQuantity: string
  conversionToBase: string
  allowsFraction: boolean
  usage: ProductUnitUsage
}

interface Decimal6 {
  normalized: string
  scaled: bigint
}

interface ActorContextRow extends QueryResultRow {
  company_id: string
  default_branch_id: string
}

interface ProductRow extends QueryResultRow {
  id: string
  base_unit_id: string
}

interface UnitRow extends QueryResultRow {
  id: string
  name: string
  symbol: string
  allows_fraction: boolean
  is_active: boolean
}

interface ProductUnitRow extends QueryResultRow {
  id: string
  product_id: string
  unit_id: string
  unit_name: string
  unit_symbol: string
  allows_fraction: boolean
  conversion_to_base: string
  is_sellable: boolean
  is_purchasable: boolean
  is_base: boolean
}

interface VariantRow extends QueryResultRow {
  id: string
  product_id: string
}

function requireNonBlank(name: string, value: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`)
  }
}

function validateUsage(usage: ProductUnitUsage): void {
  if (!PRODUCT_UNIT_USAGES.includes(usage)) {
    throw new TypeError('Unsupported ProductUnit usage')
  }
}

function formatScaled6(scaled: bigint): string {
  const integerPart = scaled / DECIMAL_SCALE_FACTOR
  const fractionalPart = (
    scaled % DECIMAL_SCALE_FACTOR
  )
    .toString()
    .padStart(DECIMAL_SCALE, '0')

  return `${integerPart.toString()}.${fractionalPart}`
}

function parseDecimal6(
  name: string,
  value: string,
  options: { positive: boolean },
): Decimal6 {
  requireNonBlank(name, value)
  const trimmed = value.trim()
  const match = /^(\d{1,12})(?:\.(\d{1,6}))?$/.exec(trimmed)
  if (!match) {
    throw new TypeError(
      `${name} must be a decimal representable as numeric(18,6)`,
    )
  }

  const integerDigits = match[1] ?? '0'
  const fractionalDigits = (match[2] ?? '').padEnd(
    DECIMAL_SCALE,
    '0',
  )
  const scaled =
    BigInt(integerDigits) * DECIMAL_SCALE_FACTOR +
    BigInt(fractionalDigits || '0')

  if (scaled > MAX_NUMERIC_18_6_SCALED) {
    throw new RangeError(
      `${name} exceeds numeric(18,6)`,
    )
  }
  if (options.positive && scaled <= 0n) {
    throw new RangeError(`${name} must be greater than zero`)
  }

  return {
    normalized: formatScaled6(scaled),
    scaled,
  }
}

function multiplyDecimal6Exact(
  quantity: Decimal6,
  factor: Decimal6,
): string {
  const rawScaled12 = quantity.scaled * factor.scaled
  const remainder = rawScaled12 % DECIMAL_SCALE_FACTOR

  if (remainder !== 0n) {
    throw new ProductUnitError(
      'BASE_QUANTITY_PRECISION_EXCEEDED',
    )
  }

  const baseScaled = rawScaled12 / DECIMAL_SCALE_FACTOR
  if (baseScaled > MAX_NUMERIC_18_6_SCALED) {
    throw new ProductUnitError('BASE_QUANTITY_OUT_OF_RANGE')
  }

  return formatScaled6(baseScaled)
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
    throw new ProductUnitError(
      'ACTOR_NOT_FOUND_OR_INACTIVE',
    )
  }
  return row
}

async function lockProduct(
  client: PoolClient,
  productId: string,
): Promise<ProductRow> {
  const result = await client.query<ProductRow>(
    `SELECT id,base_unit_id
       FROM products
      WHERE id=$1
      FOR UPDATE`,
    [productId],
  )
  const row = result.rows[0]
  if (!row) {
    throw new ProductUnitError('PRODUCT_NOT_FOUND')
  }
  return row
}

async function requireUnit(
  client: PoolClient,
  unitId: string,
): Promise<UnitRow> {
  const result = await client.query<UnitRow>(
    `SELECT id,name,symbol,allows_fraction,is_active
       FROM units
      WHERE id=$1
      FOR KEY SHARE`,
    [unitId],
  )
  const row = result.rows[0]
  if (!row) {
    throw new ProductUnitError('UNIT_NOT_FOUND')
  }
  return row
}

function mapUnit(row: UnitRow): UnitRecord {
  return Object.freeze({
    id: row.id,
    name: row.name,
    symbol: row.symbol,
    allowsFraction: row.allows_fraction,
    isActive: row.is_active,
  })
}

function mapProductUnit(
  row: ProductUnitRow,
): ProductUnitRecord {
  return Object.freeze({
    id: row.id,
    productId: row.product_id,
    unitId: row.unit_id,
    unitName: row.unit_name,
    unitSymbol: row.unit_symbol,
    allowsFraction: row.allows_fraction,
    conversionToBase: row.conversion_to_base,
    isSellable: row.is_sellable,
    isPurchasable: row.is_purchasable,
    isBase: row.is_base,
  })
}

export class ProductUnitService {
  private readonly audit = new AuditService()

  constructor(
    private readonly database: ProductUnitTransactionRunner,
  ) {}

  async createUnit(input: CreateUnitInput): Promise<UnitRecord> {
    requireNonBlank('actorUserId', input.actorUserId)
    requireNonBlank('unit name', input.name)
    requireNonBlank('unit symbol', input.symbol)

    return this.database.transaction(async (client) => {
      const actor = await requireActorContext(
        client,
        input.actorUserId,
      )
      const unitId = randomUUID()

      const inserted = await client.query<UnitRow>(
        `INSERT INTO units
          (id,name,symbol,allows_fraction,is_active)
         VALUES ($1,$2,$3,$4,true)
         RETURNING id,name,symbol,allows_fraction,is_active`,
        [
          unitId,
          input.name.trim(),
          input.symbol.trim(),
          input.allowsFraction,
        ],
      )
      const row = inserted.rows[0]
      if (!row) {
        throw new Error(
          'Unit invariant failed: insert returned no row',
        )
      }

      await this.audit.record(client, {
        companyId: actor.company_id,
        branchId: actor.default_branch_id,
        userId: input.actorUserId,
        action: 'UNIT_CREATED',
        entityType: 'UNIT',
        entityId: unitId,
        after: {
          name: row.name,
          symbol: row.symbol,
          allowsFraction: row.allows_fraction,
          isActive: row.is_active,
        },
      })

      return mapUnit(row)
    })
  }

  async addProductUnit(
    input: AddProductUnitInput,
  ): Promise<ProductUnitRecord> {
    requireNonBlank('actorUserId', input.actorUserId)
    requireNonBlank('productId', input.productId)
    requireNonBlank('unitId', input.unitId)
    const conversion = parseDecimal6(
      'conversionToBase',
      input.conversionToBase,
      { positive: true },
    )

    return this.database.transaction(async (client) => {
      const actor = await requireActorContext(
        client,
        input.actorUserId,
      )
      await lockProduct(client, input.productId)
      await requireUnit(client, input.unitId)

      const productUnitId = randomUUID()
      await client.query(
        `INSERT INTO product_units
          (id,product_id,unit_id,conversion_to_base,is_sellable,is_purchasable)
         VALUES ($1,$2,$3,$4::numeric,$5,$6)`,
        [
          productUnitId,
          input.productId,
          input.unitId,
          conversion.normalized,
          input.isSellable,
          input.isPurchasable,
        ],
      )

      const created = await this.readWithClient(
        client,
        productUnitId,
      )

      await this.audit.record(client, {
        companyId: actor.company_id,
        branchId: actor.default_branch_id,
        userId: input.actorUserId,
        action: 'PRODUCT_UNIT_ADDED',
        entityType: 'PRODUCT_UNIT',
        entityId: productUnitId,
        after: {
          productId: created.productId,
          unitId: created.unitId,
          conversionToBase: created.conversionToBase,
          isSellable: created.isSellable,
          isPurchasable: created.isPurchasable,
          isBase: created.isBase,
        },
      })

      return created
    })
  }

  async updateProductUnitPolicy(
    input: UpdateProductUnitPolicyInput,
  ): Promise<ProductUnitRecord> {
    requireNonBlank('actorUserId', input.actorUserId)
    requireNonBlank('productUnitId', input.productUnitId)
    const conversion = parseDecimal6(
      'conversionToBase',
      input.conversionToBase,
      { positive: true },
    )

    return this.database.transaction(async (client) => {
      const actor = await requireActorContext(
        client,
        input.actorUserId,
      )

      const lookup = await client.query<{
        product_id: string
      } & QueryResultRow>(
        `SELECT product_id
           FROM product_units
          WHERE id=$1`,
        [input.productUnitId],
      )
      const lookupRow = lookup.rows[0]
      if (!lookupRow) {
        throw new ProductUnitError(
          'PRODUCT_UNIT_NOT_FOUND',
        )
      }

      const product = await lockProduct(
        client,
        lookupRow.product_id,
      )
      const before = await this.lockProductUnit(
        client,
        input.productUnitId,
      )

      if (
        product.base_unit_id === input.productUnitId &&
        conversion.scaled !== DECIMAL_SCALE_FACTOR
      ) {
        throw new ProductUnitError(
          'BASE_UNIT_CONVERSION_MUST_BE_ONE',
        )
      }

      await client.query(
        `UPDATE product_units
            SET conversion_to_base=$2::numeric,
                is_sellable=$3,
                is_purchasable=$4
          WHERE id=$1`,
        [
          input.productUnitId,
          conversion.normalized,
          input.isSellable,
          input.isPurchasable,
        ],
      )

      const updated = await this.readWithClient(
        client,
        input.productUnitId,
      )

      await this.audit.record(client, {
        companyId: actor.company_id,
        branchId: actor.default_branch_id,
        userId: input.actorUserId,
        action: 'PRODUCT_UNIT_POLICY_UPDATED',
        entityType: 'PRODUCT_UNIT',
        entityId: input.productUnitId,
        before: {
          conversionToBase: before.conversionToBase,
          isSellable: before.isSellable,
          isPurchasable: before.isPurchasable,
          isBase: before.isBase,
        },
        after: {
          conversionToBase: updated.conversionToBase,
          isSellable: updated.isSellable,
          isPurchasable: updated.isPurchasable,
          isBase: updated.isBase,
        },
      })

      return updated
    })
  }

  async validateAndConvertQuantity(
    input: ValidateAndConvertQuantityInput,
  ): Promise<QuantityConversionResult> {
    requireNonBlank('variantId', input.variantId)
    requireNonBlank('productUnitId', input.productUnitId)
    validateUsage(input.usage)
    const quantity = parseDecimal6(
      'quantity',
      input.quantity,
      { positive: false },
    )

    return this.database.transaction(async (client) => {
      const variantResult = await client.query<VariantRow>(
        `SELECT id,product_id
           FROM product_variants
          WHERE id=$1`,
        [input.variantId],
      )
      const variant = variantResult.rows[0]
      if (!variant) {
        throw new ProductUnitError('VARIANT_NOT_FOUND')
      }

      const productUnit = await this.readWithClient(
        client,
        input.productUnitId,
      )

      if (variant.product_id !== productUnit.productId) {
        throw new ProductUnitError(
          'CROSS_PRODUCT_UNIT_LINK',
        )
      }

      if (
        !productUnit.allowsFraction &&
        quantity.scaled % DECIMAL_SCALE_FACTOR !== 0n
      ) {
        throw new ProductUnitError(
          'FRACTION_NOT_ALLOWED',
        )
      }

      if (
        input.usage === 'SELL' &&
        !productUnit.isSellable
      ) {
        throw new ProductUnitError(
          'PRODUCT_UNIT_NOT_SELLABLE',
        )
      }

      if (
        input.usage === 'PURCHASE' &&
        !productUnit.isPurchasable
      ) {
        throw new ProductUnitError(
          'PRODUCT_UNIT_NOT_PURCHASABLE',
        )
      }

      const factor = parseDecimal6(
        'stored conversionToBase',
        productUnit.conversionToBase,
        { positive: true },
      )
      const baseQuantity = multiplyDecimal6Exact(
        quantity,
        factor,
      )

      return Object.freeze({
        variantId: input.variantId,
        productUnitId: input.productUnitId,
        productId: variant.product_id,
        quantity: quantity.normalized,
        baseQuantity,
        conversionToBase: factor.normalized,
        allowsFraction: productUnit.allowsFraction,
        usage: input.usage,
      })
    })
  }

  async getProductUnit(
    productUnitId: string,
  ): Promise<ProductUnitRecord> {
    requireNonBlank('productUnitId', productUnitId)
    return this.database.transaction((client) =>
      this.readWithClient(client, productUnitId),
    )
  }

  private async lockProductUnit(
    client: PoolClient,
    productUnitId: string,
  ): Promise<ProductUnitRecord> {
    const result = await client.query<ProductUnitRow>(
      `SELECT
         pu.id,
         pu.product_id,
         pu.unit_id,
         u.name AS unit_name,
         u.symbol AS unit_symbol,
         u.allows_fraction,
         pu.conversion_to_base::text AS conversion_to_base,
         pu.is_sellable,
         pu.is_purchasable,
         (p.base_unit_id=pu.id) AS is_base
       FROM product_units pu
       JOIN products p
         ON p.id=pu.product_id
       JOIN units u
         ON u.id=pu.unit_id
      WHERE pu.id=$1
      FOR UPDATE OF pu`,
      [productUnitId],
    )
    const row = result.rows[0]
    if (!row) {
      throw new ProductUnitError(
        'PRODUCT_UNIT_NOT_FOUND',
      )
    }
    return mapProductUnit(row)
  }

  private async readWithClient(
    client: PoolClient,
    productUnitId: string,
  ): Promise<ProductUnitRecord> {
    const result = await client.query<ProductUnitRow>(
      `SELECT
         pu.id,
         pu.product_id,
         pu.unit_id,
         u.name AS unit_name,
         u.symbol AS unit_symbol,
         u.allows_fraction,
         pu.conversion_to_base::text AS conversion_to_base,
         pu.is_sellable,
         pu.is_purchasable,
         (p.base_unit_id=pu.id) AS is_base
       FROM product_units pu
       JOIN products p
         ON p.id=pu.product_id
       JOIN units u
         ON u.id=pu.unit_id
      WHERE pu.id=$1`,
      [productUnitId],
    )
    const row = result.rows[0]
    if (!row) {
      throw new ProductUnitError(
        'PRODUCT_UNIT_NOT_FOUND',
      )
    }
    return mapProductUnit(row)
  }
}
