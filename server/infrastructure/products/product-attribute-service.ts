import { randomUUID } from 'node:crypto'
import type { PoolClient, QueryResultRow } from 'pg'

import { AuditService } from '../audit/audit-service.js'
import type {
  TransactionOptions,
  TransactionWork,
} from '../database/transaction.js'

export const ATTRIBUTE_USAGE_TYPES = Object.freeze([
  'VARIANT',
  'DESCRIPTIVE',
] as const)

export type AttributeUsageType =
  (typeof ATTRIBUTE_USAGE_TYPES)[number]

export type ProductAttributeErrorReason =
  | 'ACTOR_NOT_FOUND_OR_INACTIVE'
  | 'PRODUCT_NOT_FOUND'
  | 'ATTRIBUTE_NOT_FOUND'
  | 'ATTRIBUTE_VALUE_NOT_FOUND'
  | 'ATTRIBUTE_NOT_ACTIVE'
  | 'ATTRIBUTE_NOT_LINKED_TO_PRODUCT'
  | 'DESCRIPTIVE_ATTRIBUTE_NOT_ALLOWED_IN_VARIANT'
  | 'DUPLICATE_ATTRIBUTE_SELECTION'
  | 'VARIANT_COMBINATION_ALREADY_EXISTS'
  | 'VARIANT_NOT_FOUND'

export class ProductAttributeError extends Error {
  readonly reason: ProductAttributeErrorReason

  constructor(reason: ProductAttributeErrorReason) {
    super('Product attribute operation rejected')
    this.name = 'ProductAttributeError'
    this.reason = reason
  }
}

export interface ProductAttributeTransactionRunner {
  transaction<T>(
    work: TransactionWork<T>,
    options?: TransactionOptions,
  ): Promise<T>
}

export interface CreateAttributeInput {
  actorUserId: string
  name: string
  attributeType: string
  usageType: AttributeUsageType
}

export interface AttributeRecord {
  id: string
  name: string
  attributeType: string
  usageType: AttributeUsageType
  isActive: boolean
}

export interface AddAttributeValueInput {
  actorUserId: string
  attributeId: string
  value: string
  sortOrder: number
}

export interface AttributeValueRecord {
  id: string
  attributeId: string
  value: string
  sortOrder: number
}

export interface LinkAttributeToProductInput {
  actorUserId: string
  productId: string
  attributeId: string
}

export interface CreateVariantFromAttributesInput {
  actorUserId: string
  productId: string
  name: string
  attributeValueIds: readonly string[]
}

export interface VariantAttributeSelection {
  attributeId: string
  attributeName: string
  attributeValueId: string
  value: string
  sortOrder: number
}

export interface VariantCompositionRecord {
  variantId: string
  productId: string
  name: string
  isDefault: boolean
  combinationSignature: string
  reusedInternalDefault: boolean
  selections: readonly VariantAttributeSelection[]
}

interface ActorContextRow extends QueryResultRow {
  company_id: string
  default_branch_id: string
}

interface AttributeRow extends QueryResultRow {
  id: string
  name: string
  attribute_type: string
  usage_type: AttributeUsageType
  is_active: boolean
}

interface AttributeValueRow extends QueryResultRow {
  id: string
  attribute_id: string
  attribute_name: string
  usage_type: AttributeUsageType
  is_active: boolean
  value: string
  sort_order: number
  is_linked_to_product: boolean
}

interface VariantRow extends QueryResultRow {
  id: string
  product_id: string
  name: string
  is_default: boolean
  combination_signature: string
}

interface PostgreSqlErrorShape {
  code?: unknown
  constraint?: unknown
}

const VARIANT_COMBINATION_CONSTRAINT =
  'uq_product_variants__product_combination'
const INTERNAL_DEFAULT_SIGNATURE = 'DEFAULT'

function requireNonBlank(name: string, value: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`)
  }
  return value.trim()
}

function validateUsageType(
  usageType: AttributeUsageType,
): void {
  if (!ATTRIBUTE_USAGE_TYPES.includes(usageType)) {
    throw new TypeError('Unsupported Attribute usage type')
  }
}

function validateSortOrder(sortOrder: number): void {
  if (!Number.isInteger(sortOrder) || sortOrder < 0) {
    throw new TypeError(
      'sortOrder must be a non-negative integer',
    )
  }
}

function canonicalSignature(
  selections: readonly Pick<
    VariantAttributeSelection,
    'attributeId' | 'attributeValueId'
  >[],
): string {
  return [...selections]
    .sort((left, right) => {
      const attributeOrder =
        left.attributeId.localeCompare(right.attributeId)
      if (attributeOrder !== 0) return attributeOrder
      return left.attributeValueId.localeCompare(
        right.attributeValueId,
      )
    })
    .map(
      (selection) =>
        `${selection.attributeId}:${selection.attributeValueId}`,
    )
    .join('|')
}

function postgresConstraint(
  error: unknown,
): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const shape = error as PostgreSqlErrorShape
  if (shape.code !== '23505') return undefined
  return typeof shape.constraint === 'string'
    ? shape.constraint
    : undefined
}

function translateCombinationConflict(error: unknown): never {
  if (postgresConstraint(error) === VARIANT_COMBINATION_CONSTRAINT) {
    throw new ProductAttributeError(
      'VARIANT_COMBINATION_ALREADY_EXISTS',
    )
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
    throw new ProductAttributeError(
      'ACTOR_NOT_FOUND_OR_INACTIVE',
    )
  }
  return row
}

async function lockProduct(
  client: PoolClient,
  productId: string,
): Promise<void> {
  const result = await client.query(
    `SELECT id
       FROM products
      WHERE id=$1
      FOR UPDATE`,
    [productId],
  )
  if (result.rowCount !== 1) {
    throw new ProductAttributeError('PRODUCT_NOT_FOUND')
  }
}

async function requireAttribute(
  client: PoolClient,
  attributeId: string,
): Promise<AttributeRow> {
  const result = await client.query<AttributeRow>(
    `SELECT id,name,attribute_type,usage_type,is_active
       FROM attributes
      WHERE id=$1
      FOR KEY SHARE`,
    [attributeId],
  )
  const row = result.rows[0]
  if (!row) {
    throw new ProductAttributeError('ATTRIBUTE_NOT_FOUND')
  }
  return row
}

function mapAttribute(row: AttributeRow): AttributeRecord {
  return Object.freeze({
    id: row.id,
    name: row.name,
    attributeType: row.attribute_type,
    usageType: row.usage_type,
    isActive: row.is_active,
  })
}

function mapSelection(
  row: AttributeValueRow,
): VariantAttributeSelection {
  return Object.freeze({
    attributeId: row.attribute_id,
    attributeName: row.attribute_name,
    attributeValueId: row.id,
    value: row.value,
    sortOrder: row.sort_order,
  })
}

export class ProductAttributeService {
  private readonly audit = new AuditService()

  constructor(
    private readonly database: ProductAttributeTransactionRunner,
  ) {}

  async createAttribute(
    input: CreateAttributeInput,
  ): Promise<AttributeRecord> {
    requireNonBlank('actorUserId', input.actorUserId)
    const name = requireNonBlank('attribute name', input.name)
    const attributeType = requireNonBlank(
      'attributeType',
      input.attributeType,
    )
    validateUsageType(input.usageType)

    return this.database.transaction(async (client) => {
      const actor = await requireActorContext(
        client,
        input.actorUserId,
      )
      const attributeId = randomUUID()

      const inserted = await client.query<AttributeRow>(
        `INSERT INTO attributes
          (id,name,attribute_type,usage_type,is_active)
         VALUES ($1,$2,$3,$4,true)
         RETURNING id,name,attribute_type,usage_type,is_active`,
        [
          attributeId,
          name,
          attributeType,
          input.usageType,
        ],
      )
      const row = inserted.rows[0]
      if (!row) {
        throw new Error(
          'Attribute invariant failed: insert returned no row',
        )
      }

      await this.audit.record(client, {
        companyId: actor.company_id,
        branchId: actor.default_branch_id,
        userId: input.actorUserId,
        action: 'ATTRIBUTE_CREATED',
        entityType: 'ATTRIBUTE',
        entityId: row.id,
        after: {
          name: row.name,
          attributeType: row.attribute_type,
          usageType: row.usage_type,
          isActive: row.is_active,
        },
      })

      return mapAttribute(row)
    })
  }

  async addAttributeValue(
    input: AddAttributeValueInput,
  ): Promise<AttributeValueRecord> {
    requireNonBlank('actorUserId', input.actorUserId)
    requireNonBlank('attributeId', input.attributeId)
    const value = requireNonBlank('attribute value', input.value)
    validateSortOrder(input.sortOrder)

    return this.database.transaction(async (client) => {
      const actor = await requireActorContext(
        client,
        input.actorUserId,
      )
      await requireAttribute(client, input.attributeId)
      const valueId = randomUUID()

      const inserted = await client.query<{
        id: string
        attribute_id: string
        value: string
        sort_order: number
      } & QueryResultRow>(
        `INSERT INTO attribute_values
          (id,attribute_id,value,sort_order)
         VALUES ($1,$2,$3,$4)
         RETURNING id,attribute_id,value,sort_order`,
        [
          valueId,
          input.attributeId,
          value,
          input.sortOrder,
        ],
      )
      const row = inserted.rows[0]
      if (!row) {
        throw new Error(
          'Attribute value invariant failed: insert returned no row',
        )
      }

      await this.audit.record(client, {
        companyId: actor.company_id,
        branchId: actor.default_branch_id,
        userId: input.actorUserId,
        action: 'ATTRIBUTE_VALUE_CREATED',
        entityType: 'ATTRIBUTE_VALUE',
        entityId: row.id,
        after: {
          attributeId: row.attribute_id,
          value: row.value,
          sortOrder: row.sort_order,
        },
      })

      return Object.freeze({
        id: row.id,
        attributeId: row.attribute_id,
        value: row.value,
        sortOrder: row.sort_order,
      })
    })
  }

  async linkAttributeToProduct(
    input: LinkAttributeToProductInput,
  ): Promise<void> {
    requireNonBlank('actorUserId', input.actorUserId)
    requireNonBlank('productId', input.productId)
    requireNonBlank('attributeId', input.attributeId)

    return this.database.transaction(async (client) => {
      const actor = await requireActorContext(
        client,
        input.actorUserId,
      )
      await lockProduct(client, input.productId)
      const attribute = await requireAttribute(
        client,
        input.attributeId,
      )
      if (!attribute.is_active) {
        throw new ProductAttributeError(
          'ATTRIBUTE_NOT_ACTIVE',
        )
      }

      const inserted = await client.query(
        `INSERT INTO product_attributes
          (product_id,attribute_id)
         VALUES ($1,$2)
         ON CONFLICT (product_id,attribute_id) DO NOTHING
         RETURNING product_id`,
        [input.productId, input.attributeId],
      )

      if (inserted.rowCount === 1) {
        await this.audit.record(client, {
          companyId: actor.company_id,
          branchId: actor.default_branch_id,
          userId: input.actorUserId,
          action: 'PRODUCT_ATTRIBUTE_LINKED',
          entityType: 'PRODUCT',
          entityId: input.productId,
          after: {
            attributeId: input.attributeId,
            usageType: attribute.usage_type,
          },
        })
      }
    })
  }

  async createVariantFromAttributes(
    input: CreateVariantFromAttributesInput,
  ): Promise<VariantCompositionRecord> {
    requireNonBlank('actorUserId', input.actorUserId)
    requireNonBlank('productId', input.productId)
    const name = requireNonBlank('variant name', input.name)

    if (
      !Array.isArray(input.attributeValueIds) ||
      input.attributeValueIds.length === 0
    ) {
      throw new TypeError(
        'attributeValueIds must contain at least one value',
      )
    }
    for (const valueId of input.attributeValueIds) {
      requireNonBlank('attributeValueId', valueId)
    }

    const uniqueValueIds = [...new Set(input.attributeValueIds)]

    try {
      return await this.database.transaction(async (client) => {
        const actor = await requireActorContext(
          client,
          input.actorUserId,
        )
        await lockProduct(client, input.productId)

        const values = await client.query<AttributeValueRow>(
          `SELECT
             av.id,
             av.attribute_id,
             a.name AS attribute_name,
             a.usage_type,
             a.is_active,
             av.value,
             av.sort_order,
             EXISTS (
               SELECT 1
                 FROM product_attributes pa
                WHERE pa.product_id=$1
                  AND pa.attribute_id=av.attribute_id
             ) AS is_linked_to_product
           FROM attribute_values av
           JOIN attributes a
             ON a.id=av.attribute_id
          WHERE av.id = ANY($2::uuid[])
          ORDER BY av.attribute_id,av.id`,
          [input.productId, uniqueValueIds],
        )

        if (values.rowCount !== uniqueValueIds.length) {
          throw new ProductAttributeError(
            'ATTRIBUTE_VALUE_NOT_FOUND',
          )
        }

        const seenAttributes = new Set<string>()
        const selections: VariantAttributeSelection[] = []

        for (const row of values.rows) {
          if (!row.is_active) {
            throw new ProductAttributeError(
              'ATTRIBUTE_NOT_ACTIVE',
            )
          }
          if (!row.is_linked_to_product) {
            throw new ProductAttributeError(
              'ATTRIBUTE_NOT_LINKED_TO_PRODUCT',
            )
          }
          if (row.usage_type !== 'VARIANT') {
            throw new ProductAttributeError(
              'DESCRIPTIVE_ATTRIBUTE_NOT_ALLOWED_IN_VARIANT',
            )
          }
          if (seenAttributes.has(row.attribute_id)) {
            throw new ProductAttributeError(
              'DUPLICATE_ATTRIBUTE_SELECTION',
            )
          }
          seenAttributes.add(row.attribute_id)
          selections.push(mapSelection(row))
        }

        const signature = canonicalSignature(selections)

        const variants = await client.query<VariantRow>(
          `SELECT
             id,
             product_id,
             name,
             is_default,
             combination_signature
           FROM product_variants
          WHERE product_id=$1
          ORDER BY id
          FOR UPDATE`,
          [input.productId],
        )

        const internalDefault =
          variants.rowCount === 1 &&
          variants.rows[0]?.is_default === true &&
          variants.rows[0]?.combination_signature ===
            INTERNAL_DEFAULT_SIGNATURE
            ? variants.rows[0]
            : undefined

        let variantId: string
        let reusedInternalDefault = false

        if (internalDefault) {
          variantId = internalDefault.id
          reusedInternalDefault = true
          await client.query(
            `UPDATE product_variants
                SET name=$2,
                    is_default=false,
                    combination_signature=$3,
                    updated_at=clock_timestamp()
              WHERE id=$1`,
            [variantId, name, signature],
          )
        } else {
          variantId = randomUUID()
          await client.query(
            `INSERT INTO product_variants
              (id,product_id,name,sku,is_default,combination_signature,
               minimum_selling_price,is_active,created_at,updated_at)
             VALUES
              ($1,$2,$3,NULL,false,$4,NULL,true,clock_timestamp(),clock_timestamp())`,
            [variantId, input.productId, name, signature],
          )
        }

        for (const selection of selections) {
          await client.query(
            `INSERT INTO variant_attribute_values
              (variant_id,attribute_value_id)
             VALUES ($1,$2)`,
            [variantId, selection.attributeValueId],
          )
        }

        await this.audit.record(client, {
          companyId: actor.company_id,
          branchId: actor.default_branch_id,
          userId: input.actorUserId,
          action: 'PRODUCT_VARIANT_COMPOSED',
          entityType: 'PRODUCT_VARIANT',
          entityId: variantId,
          before: reusedInternalDefault
            ? {
                isDefault: true,
                combinationSignature:
                  INTERNAL_DEFAULT_SIGNATURE,
              }
            : null,
          after: {
            productId: input.productId,
            name,
            isDefault: false,
            combinationSignature: signature,
            reusedInternalDefault,
            attributeValueIds: selections.map(
              (selection) => selection.attributeValueId,
            ),
          },
        })

        return Object.freeze({
          variantId,
          productId: input.productId,
          name,
          isDefault: false,
          combinationSignature: signature,
          reusedInternalDefault,
          selections: Object.freeze(selections),
        })
      })
    } catch (error) {
      translateCombinationConflict(error)
    }
  }

  async getVariantComposition(
    variantIdInput: string,
  ): Promise<VariantCompositionRecord> {
    const variantId = requireNonBlank(
      'variantId',
      variantIdInput,
    )

    return this.database.transaction(async (client) => {
      const variantResult = await client.query<VariantRow>(
        `SELECT
           id,
           product_id,
           name,
           is_default,
           combination_signature
         FROM product_variants
        WHERE id=$1`,
        [variantId],
      )
      const variant = variantResult.rows[0]
      if (!variant) {
        throw new ProductAttributeError('VARIANT_NOT_FOUND')
      }

      const values = await client.query<AttributeValueRow>(
        `SELECT
           av.id,
           av.attribute_id,
           a.name AS attribute_name,
           a.usage_type,
           a.is_active,
           av.value,
           av.sort_order,
           true AS is_linked_to_product
         FROM variant_attribute_values vav
         JOIN attribute_values av
           ON av.id=vav.attribute_value_id
         JOIN attributes a
           ON a.id=av.attribute_id
        WHERE vav.variant_id=$1
        ORDER BY av.attribute_id,av.id`,
        [variantId],
      )

      return Object.freeze({
        variantId: variant.id,
        productId: variant.product_id,
        name: variant.name,
        isDefault: variant.is_default,
        combinationSignature:
          variant.combination_signature,
        reusedInternalDefault: false,
        selections: Object.freeze(
          values.rows.map(mapSelection),
        ),
      })
    })
  }
}
