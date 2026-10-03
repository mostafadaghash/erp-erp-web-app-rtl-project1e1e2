import { randomUUID } from 'node:crypto'
import type { PoolClient, QueryResultRow } from 'pg'

import { AuditService } from '../audit/audit-service.js'
import {
  BranchScopeService,
  BranchScopedAuthorizationService,
} from '../authorization/branch-scope-service.js'
import type {
  TransactionOptions,
  TransactionWork,
} from '../database/transaction.js'

const MONEY_SCALE = 4
const MONEY_SCALE_FACTOR = 10_000n
const MAX_NUMERIC_18_4_SCALED = 999_999_999_999_999_999n

const QUANTITY_SCALE = 6
const QUANTITY_SCALE_FACTOR = 1_000_000n
const MAX_NUMERIC_18_6_SCALED = 999_999_999_999_999_999n

export const PRICE_LIST_PERMISSIONS = Object.freeze({
  MANUAL_EDIT: 'sales.price.manual_edit',
  BELOW_MINIMUM: 'sales.price.below_minimum',
} as const)

const DEFAULT_SYSTEM_ROLE_KEYS = Object.freeze([
  'SYSTEM_ADMIN',
  'BRANCH_MANAGER',
  'ACCOUNTANT',
  'SALES',
  'CUSTOMER_SERVICE',
  'TECHNICIAN',
  'WAREHOUSE_KEEPER',
] as const)

export type SalePriceSource = 'PRICE_LIST' | 'MANUAL'
export type ResolvedPriceListSource =
  | 'EXPLICIT'
  | 'CUSTOMER_DEFAULT'
  | 'BRANCH_DEFAULT'

export type PriceListErrorReason =
  | 'ACTOR_NOT_FOUND_OR_INACTIVE'
  | 'DEFAULT_ROLE_CATALOG_INCOMPLETE'
  | 'PRICE_LIST_NOT_FOUND'
  | 'PRICE_LIST_INACTIVE'
  | 'PRICE_LIST_IS_DEFAULT'
  | 'VARIANT_NOT_FOUND'
  | 'VARIANT_INACTIVE'
  | 'PRODUCT_UNIT_NOT_FOUND'
  | 'CROSS_PRODUCT_UNIT_LINK'
  | 'PRODUCT_UNIT_NOT_SELLABLE'
  | 'PRICE_NOT_FOUND'
  | 'BRANCH_NOT_FOUND'
  | 'BRANCH_SETTINGS_NOT_FOUND'
  | 'CUSTOMER_PROFILE_NOT_FOUND'
  | 'DEFAULT_PRICE_LIST_NOT_CONFIGURED'

export class PriceListError extends Error {
  readonly reason: PriceListErrorReason

  constructor(reason: PriceListErrorReason) {
    super('Price list operation rejected')
    this.name = 'PriceListError'
    this.reason = reason
  }
}

export interface PriceListTransactionRunner {
  transaction<T>(
    work: TransactionWork<T>,
    options?: TransactionOptions,
  ): Promise<T>
}

export interface PriceListRecord {
  id: string
  name: string
  isActive: boolean
}

export interface PriceListItemRecord {
  priceListId: string
  variantId: string
  productUnitId: string
  productId: string
  price: string
}

export interface CreatePriceListInput {
  actorUserId: string
  name: string
}

export interface SetPriceListActiveInput {
  actorUserId: string
  priceListId: string
  isActive: boolean
}

export interface SetPriceListItemInput {
  actorUserId: string
  priceListId: string
  variantId: string
  productUnitId: string
  price: string
}

export interface SetBranchDefaultPriceListInput {
  actorUserId: string
  branchId: string
  priceListId: string | null
}

export interface SetCustomerDefaultPriceListInput {
  actorUserId: string
  counterpartyId: string
  priceListId: string | null
}

export interface SetMinimumSellingPriceInput {
  actorUserId: string
  variantId: string
  minimumSellingPrice: string | null
}

export interface ResolveAutomaticPriceInput {
  actorUserId: string
  branchId: string
  counterpartyId?: string | null
  explicitPriceListId?: string | null
  variantId: string
  productUnitId: string
}

export interface ResolvedAutomaticPrice {
  priceListId: string
  priceListSource: ResolvedPriceListSource
  variantId: string
  productUnitId: string
  price: string
  priceSource: 'PRICE_LIST'
}

export interface AuthorizeEffectiveSalePriceInput {
  actorUserId: string
  branchId: string
  variantId: string
  productUnitId: string
  effectiveUnitPrice: string
  priceSource: SalePriceSource
}

export interface SalePriceAuthorization {
  variantId: string
  productUnitId: string
  effectiveUnitPrice: string
  minimumSellingPrice: string | null
  priceSource: SalePriceSource
  belowMinimum: boolean
}

interface DecimalValue {
  normalized: string
  scaled: bigint
}

interface ActorContextRow extends QueryResultRow {
  company_id: string
  default_branch_id: string
}

interface PriceListRow extends QueryResultRow {
  id: string
  name: string
  is_active: boolean
}

interface PriceListItemRow extends QueryResultRow {
  price_list_id: string
  variant_id: string
  product_unit_id: string
  product_id: string
  price: string
}

interface VariantPricingRow extends QueryResultRow {
  id: string
  product_id: string
  minimum_selling_price: string | null
  is_active: boolean
}

interface ProductUnitPricingRow extends QueryResultRow {
  id: string
  product_id: string
  conversion_to_base: string
  is_sellable: boolean
}

interface BranchRow extends QueryResultRow {
  id: string
  company_id: string
}

interface BranchSettingsRow extends QueryResultRow {
  default_price_list_id: string | null
}

interface CustomerProfileRow extends QueryResultRow {
  counterparty_id: string
  default_price_list_id: string | null
}

interface PermissionRow extends QueryResultRow {
  id: string
  permission_key: string
}

function requireNonBlank(name: string, value: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`)
  }
  return value.trim()
}

function formatScaled(scaled: bigint, scale: number): string {
  const factor = 10n ** BigInt(scale)
  const integerPart = scaled / factor
  const fractionalPart = (scaled % factor)
    .toString()
    .padStart(scale, '0')

  return `${integerPart.toString()}.${fractionalPart}`
}

function parseFixedDecimal(
  name: string,
  value: string,
  scale: number,
  integerDigits: number,
  maximumScaled: bigint,
  options: { positive: boolean },
): DecimalValue {
  requireNonBlank(name, value)
  const trimmed = value.trim()
  const expression = new RegExp(
    `^(\\d{1,${integerDigits}})(?:\\.(\\d{1,${scale}}))?$`,
  )
  const match = expression.exec(trimmed)
  if (!match) {
    throw new TypeError(
      `${name} must be a decimal representable as numeric(18,${scale})`,
    )
  }

  const integerPart = match[1] ?? '0'
  const fraction = (match[2] ?? '').padEnd(scale, '0')
  const factor = 10n ** BigInt(scale)
  const scaled =
    BigInt(integerPart) * factor + BigInt(fraction || '0')

  if (scaled > maximumScaled) {
    throw new RangeError(
      `${name} exceeds numeric(18,${scale})`,
    )
  }
  if (options.positive && scaled <= 0n) {
    throw new RangeError(`${name} must be greater than zero`)
  }

  return {
    normalized: formatScaled(scaled, scale),
    scaled,
  }
}

function parseMoney(name: string, value: string): DecimalValue {
  return parseFixedDecimal(
    name,
    value,
    MONEY_SCALE,
    14,
    MAX_NUMERIC_18_4_SCALED,
    { positive: false },
  )
}

function parseConversion(value: string): DecimalValue {
  return parseFixedDecimal(
    'conversionToBase',
    value,
    QUANTITY_SCALE,
    12,
    MAX_NUMERIC_18_6_SCALED,
    { positive: true },
  )
}

function validatePriceSource(source: SalePriceSource): void {
  if (source !== 'PRICE_LIST' && source !== 'MANUAL') {
    throw new TypeError('Unsupported sale price source')
  }
}

function mapPriceList(row: PriceListRow): PriceListRecord {
  return Object.freeze({
    id: row.id,
    name: row.name,
    isActive: row.is_active,
  })
}

function mapPriceListItem(
  row: PriceListItemRow,
): PriceListItemRecord {
  return Object.freeze({
    priceListId: row.price_list_id,
    variantId: row.variant_id,
    productUnitId: row.product_unit_id,
    productId: row.product_id,
    price: row.price,
  })
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
    throw new PriceListError(
      'ACTOR_NOT_FOUND_OR_INACTIVE',
    )
  }
  return row
}

async function requirePriceList(
  client: PoolClient,
  priceListId: string,
  options: { active: boolean; lock?: boolean },
): Promise<PriceListRow> {
  const result = await client.query<PriceListRow>(
    `SELECT id,name,is_active
       FROM price_lists
      WHERE id=$1
      ${options.lock ? 'FOR UPDATE' : ''}`,
    [priceListId],
  )
  const row = result.rows[0]
  if (!row) {
    throw new PriceListError('PRICE_LIST_NOT_FOUND')
  }
  if (options.active && !row.is_active) {
    throw new PriceListError('PRICE_LIST_INACTIVE')
  }
  return row
}

async function requireVariant(
  client: PoolClient,
  variantId: string,
  options: { lock?: boolean; active?: boolean } = {},
): Promise<VariantPricingRow> {
  const result = await client.query<VariantPricingRow>(
    `SELECT
       id,
       product_id,
       minimum_selling_price::text AS minimum_selling_price,
       is_active
     FROM product_variants
    WHERE id=$1
    ${options.lock ? 'FOR UPDATE' : 'FOR KEY SHARE'}`,
    [variantId],
  )
  const row = result.rows[0]
  if (!row) {
    throw new PriceListError('VARIANT_NOT_FOUND')
  }
  if (options.active && !row.is_active) {
    throw new PriceListError('VARIANT_INACTIVE')
  }
  return row
}

async function requireProductUnit(
  client: PoolClient,
  productUnitId: string,
): Promise<ProductUnitPricingRow> {
  const result = await client.query<ProductUnitPricingRow>(
    `SELECT
       id,
       product_id,
       conversion_to_base::text AS conversion_to_base,
       is_sellable
     FROM product_units
    WHERE id=$1
    FOR KEY SHARE`,
    [productUnitId],
  )
  const row = result.rows[0]
  if (!row) {
    throw new PriceListError('PRODUCT_UNIT_NOT_FOUND')
  }
  return row
}

function assertPricingPair(
  variant: VariantPricingRow,
  productUnit: ProductUnitPricingRow,
): void {
  if (variant.product_id !== productUnit.product_id) {
    throw new PriceListError('CROSS_PRODUCT_UNIT_LINK')
  }
  if (!productUnit.is_sellable) {
    throw new PriceListError('PRODUCT_UNIT_NOT_SELLABLE')
  }
}

export class PriceListService {
  private readonly audit = new AuditService()
  private readonly branchScope: BranchScopeService
  private readonly authorization: BranchScopedAuthorizationService

  constructor(
    private readonly database: PriceListTransactionRunner,
  ) {
    this.branchScope = new BranchScopeService(database)
    this.authorization =
      new BranchScopedAuthorizationService(database)
  }

  /**
   * 07.05 introduces only the permission defaults explicitly fixed by v1.7:
   * below-minimum defaults to SYSTEM_ADMIN only. Manual price edit is a
   * separate permission but its role-default matrix is intentionally not
   * invented; absence of a role_permissions row fails closed.
   */
  async ensurePricingPermissions(): Promise<void> {
    await this.database.transaction(async (client) => {
      const definitions = [
        {
          id: randomUUID(),
          key: PRICE_LIST_PERMISSIONS.MANUAL_EDIT,
          descriptionKey:
            'permissions.sales.price.manualEdit',
        },
        {
          id: randomUUID(),
          key: PRICE_LIST_PERMISSIONS.BELOW_MINIMUM,
          descriptionKey:
            'permissions.sales.price.belowMinimum',
        },
      ] as const

      for (const definition of definitions) {
        await client.query(
          `INSERT INTO permissions
            (id,permission_key,module,description_key)
           VALUES ($1,$2,'sales',$3)
           ON CONFLICT (permission_key) DO UPDATE
             SET module=EXCLUDED.module,
                 description_key=EXCLUDED.description_key`,
          [
            definition.id,
            definition.key,
            definition.descriptionKey,
          ],
        )
      }

      const belowMinimum = await client.query<PermissionRow>(
        `SELECT id,permission_key
           FROM permissions
          WHERE permission_key=$1`,
        [PRICE_LIST_PERMISSIONS.BELOW_MINIMUM],
      )
      const permission = belowMinimum.rows[0]
      if (!permission) {
        throw new Error(
          'Pricing permission invariant failed: below-minimum permission missing',
        )
      }

      const roles = await client.query<{
        id: string
        role_key: string
      } & QueryResultRow>(
        `SELECT id,role_key
           FROM roles
          WHERE role_key = ANY($1::text[])
          ORDER BY role_key`,
        [DEFAULT_SYSTEM_ROLE_KEYS],
      )
      if (roles.rowCount !== DEFAULT_SYSTEM_ROLE_KEYS.length) {
        throw new PriceListError(
          'DEFAULT_ROLE_CATALOG_INCOMPLETE',
        )
      }

      for (const role of roles.rows) {
        await client.query(
          `INSERT INTO role_permissions
            (role_id,permission_id,is_allowed)
           VALUES ($1,$2,$3)
           ON CONFLICT (role_id,permission_id) DO NOTHING`,
          [
            role.id,
            permission.id,
            role.role_key === 'SYSTEM_ADMIN',
          ],
        )
      }
    })
  }

  async createPriceList(
    input: CreatePriceListInput,
  ): Promise<PriceListRecord> {
    requireNonBlank('actorUserId', input.actorUserId)
    const name = requireNonBlank('price list name', input.name)

    return this.database.transaction(async (client) => {
      const actor = await requireActorContext(
        client,
        input.actorUserId,
      )
      const priceListId = randomUUID()

      const result = await client.query<PriceListRow>(
        `INSERT INTO price_lists
          (id,name,is_active,created_at,updated_at)
         VALUES ($1,$2,true,clock_timestamp(),clock_timestamp())
         RETURNING id,name,is_active`,
        [priceListId, name],
      )
      const row = result.rows[0]
      if (!row) {
        throw new Error(
          'Price List invariant failed: insert returned no row',
        )
      }

      await this.audit.record(client, {
        companyId: actor.company_id,
        branchId: actor.default_branch_id,
        userId: input.actorUserId,
        action: 'PRICE_LIST_CREATED',
        entityType: 'PRICE_LIST',
        entityId: row.id,
        after: {
          name: row.name,
          isActive: row.is_active,
        },
      })

      return mapPriceList(row)
    })
  }

  async setPriceListActive(
    input: SetPriceListActiveInput,
  ): Promise<PriceListRecord> {
    requireNonBlank('actorUserId', input.actorUserId)
    requireNonBlank('priceListId', input.priceListId)

    return this.database.transaction(async (client) => {
      const actor = await requireActorContext(
        client,
        input.actorUserId,
      )
      const before = await requirePriceList(
        client,
        input.priceListId,
        { active: false, lock: true },
      )

      if (before.is_active === input.isActive) {
        return mapPriceList(before)
      }

      if (!input.isActive) {
        const defaultUse = await client.query(
          `SELECT 1
             FROM branch_settings
            WHERE default_price_list_id=$1
            UNION ALL
           SELECT 1
             FROM customer_profiles
            WHERE default_price_list_id=$1
            LIMIT 1`,
          [input.priceListId],
        )
        if (defaultUse.rowCount !== 0) {
          throw new PriceListError('PRICE_LIST_IS_DEFAULT')
        }
      }

      const result = await client.query<PriceListRow>(
        `UPDATE price_lists
            SET is_active=$2,
                updated_at=clock_timestamp()
          WHERE id=$1
        RETURNING id,name,is_active`,
        [input.priceListId, input.isActive],
      )
      const row = result.rows[0]
      if (!row) {
        throw new PriceListError('PRICE_LIST_NOT_FOUND')
      }

      await this.audit.record(client, {
        companyId: actor.company_id,
        branchId: actor.default_branch_id,
        userId: input.actorUserId,
        action: input.isActive
          ? 'PRICE_LIST_ACTIVATED'
          : 'PRICE_LIST_DEACTIVATED',
        entityType: 'PRICE_LIST',
        entityId: row.id,
        before: { isActive: before.is_active },
        after: { isActive: row.is_active },
      })

      return mapPriceList(row)
    })
  }

  async setPriceListItem(
    input: SetPriceListItemInput,
  ): Promise<PriceListItemRecord> {
    requireNonBlank('actorUserId', input.actorUserId)
    requireNonBlank('priceListId', input.priceListId)
    requireNonBlank('variantId', input.variantId)
    requireNonBlank('productUnitId', input.productUnitId)
    const price = parseMoney('price', input.price)

    return this.database.transaction(async (client) => {
      const actor = await requireActorContext(
        client,
        input.actorUserId,
      )
      await requirePriceList(client, input.priceListId, {
        active: true,
        lock: true,
      })
      const variant = await requireVariant(
        client,
        input.variantId,
        { active: true },
      )
      const productUnit = await requireProductUnit(
        client,
        input.productUnitId,
      )
      assertPricingPair(variant, productUnit)

      const before = await client.query<{
        price: string
      } & QueryResultRow>(
        `SELECT price::text AS price
           FROM price_list_items
          WHERE price_list_id=$1
            AND variant_id=$2
            AND product_unit_id=$3`,
        [
          input.priceListId,
          input.variantId,
          input.productUnitId,
        ],
      )

      const result = await client.query<PriceListItemRow>(
        `INSERT INTO price_list_items
          (price_list_id,variant_id,product_unit_id,price,updated_at)
         VALUES ($1,$2,$3,$4,clock_timestamp())
         ON CONFLICT (price_list_id,variant_id,product_unit_id)
         DO UPDATE
           SET price=EXCLUDED.price,
               updated_at=clock_timestamp()
         RETURNING
           price_list_id,
           variant_id,
           product_unit_id,
           $5::uuid AS product_id,
           price::text AS price`,
        [
          input.priceListId,
          input.variantId,
          input.productUnitId,
          price.normalized,
          variant.product_id,
        ],
      )
      const row = result.rows[0]
      if (!row) {
        throw new Error(
          'Price List Item invariant failed: upsert returned no row',
        )
      }

      await this.audit.record(client, {
        companyId: actor.company_id,
        branchId: actor.default_branch_id,
        userId: input.actorUserId,
        action: 'PRICE_LIST_ITEM_UPSERTED',
        entityType: 'PRICE_LIST',
        entityId: input.priceListId,
        before: before.rows[0]
          ? {
              variantId: input.variantId,
              productUnitId: input.productUnitId,
              price: before.rows[0].price,
            }
          : null,
        after: {
          variantId: input.variantId,
          productUnitId: input.productUnitId,
          price: row.price,
        },
      })

      return mapPriceListItem(row)
    })
  }

  async setBranchDefaultPriceList(
    input: SetBranchDefaultPriceListInput,
  ): Promise<void> {
    requireNonBlank('actorUserId', input.actorUserId)
    requireNonBlank('branchId', input.branchId)
    if (input.priceListId !== null) {
      requireNonBlank('priceListId', input.priceListId)
    }

    await this.database.transaction(async (client) => {
      const actor = await requireActorContext(
        client,
        input.actorUserId,
      )
      await this.branchScope.requireWithinTransaction(
        client,
        input.actorUserId,
        input.branchId,
      )

      const branch = await client.query<BranchRow>(
        `SELECT id,company_id
           FROM branches
          WHERE id=$1
          FOR UPDATE`,
        [input.branchId],
      )
      const branchRow = branch.rows[0]
      if (!branchRow) {
        throw new PriceListError('BRANCH_NOT_FOUND')
      }

      const settings =
        await client.query<BranchSettingsRow>(
          `SELECT default_price_list_id
             FROM branch_settings
            WHERE branch_id=$1
            FOR UPDATE`,
          [input.branchId],
        )
      const current = settings.rows[0]
      if (!current) {
        throw new PriceListError(
          'BRANCH_SETTINGS_NOT_FOUND',
        )
      }

      if (input.priceListId !== null) {
        await requirePriceList(client, input.priceListId, {
          active: true,
        })
      }

      if (
        current.default_price_list_id === input.priceListId
      ) {
        return
      }

      await client.query(
        `UPDATE branch_settings
            SET default_price_list_id=$2,
                updated_at=clock_timestamp()
          WHERE branch_id=$1`,
        [input.branchId, input.priceListId],
      )

      await this.audit.record(client, {
        companyId: branchRow.company_id ?? actor.company_id,
        branchId: input.branchId,
        userId: input.actorUserId,
        action: 'BRANCH_DEFAULT_PRICE_LIST_CHANGED',
        entityType: 'BRANCH_SETTINGS',
        entityId: input.branchId,
        before: {
          defaultPriceListId:
            current.default_price_list_id,
        },
        after: {
          defaultPriceListId: input.priceListId,
        },
      })
    })
  }

  async setCustomerDefaultPriceList(
    input: SetCustomerDefaultPriceListInput,
  ): Promise<void> {
    requireNonBlank('actorUserId', input.actorUserId)
    requireNonBlank('counterpartyId', input.counterpartyId)
    if (input.priceListId !== null) {
      requireNonBlank('priceListId', input.priceListId)
    }

    await this.database.transaction(async (client) => {
      const actor = await requireActorContext(
        client,
        input.actorUserId,
      )

      const profile = await client.query<CustomerProfileRow>(
        `SELECT counterparty_id,default_price_list_id
           FROM customer_profiles
          WHERE counterparty_id=$1
          FOR UPDATE`,
        [input.counterpartyId],
      )
      const current = profile.rows[0]
      if (!current) {
        throw new PriceListError(
          'CUSTOMER_PROFILE_NOT_FOUND',
        )
      }

      if (input.priceListId !== null) {
        await requirePriceList(client, input.priceListId, {
          active: true,
        })
      }

      if (
        current.default_price_list_id === input.priceListId
      ) {
        return
      }

      await client.query(
        `UPDATE customer_profiles
            SET default_price_list_id=$2
          WHERE counterparty_id=$1`,
        [input.counterpartyId, input.priceListId],
      )

      await this.audit.record(client, {
        companyId: actor.company_id,
        branchId: actor.default_branch_id,
        userId: input.actorUserId,
        action: 'CUSTOMER_DEFAULT_PRICE_LIST_CHANGED',
        entityType: 'COUNTERPARTY',
        entityId: input.counterpartyId,
        before: {
          defaultPriceListId:
            current.default_price_list_id,
        },
        after: {
          defaultPriceListId: input.priceListId,
        },
      })
    })
  }

  async setMinimumSellingPrice(
    input: SetMinimumSellingPriceInput,
  ): Promise<string | null> {
    requireNonBlank('actorUserId', input.actorUserId)
    requireNonBlank('variantId', input.variantId)
    const minimum =
      input.minimumSellingPrice === null
        ? null
        : parseMoney(
            'minimumSellingPrice',
            input.minimumSellingPrice,
          )

    return this.database.transaction(async (client) => {
      const actor = await requireActorContext(
        client,
        input.actorUserId,
      )
      const before = await requireVariant(
        client,
        input.variantId,
        { lock: true },
      )

      const result = await client.query<{
        minimum_selling_price: string | null
      } & QueryResultRow>(
        `UPDATE product_variants
            SET minimum_selling_price=$2,
                updated_at=clock_timestamp()
          WHERE id=$1
        RETURNING
          minimum_selling_price::text AS minimum_selling_price`,
        [
          input.variantId,
          minimum?.normalized ?? null,
        ],
      )
      const row = result.rows[0]
      if (!row) {
        throw new PriceListError('VARIANT_NOT_FOUND')
      }

      await this.audit.record(client, {
        companyId: actor.company_id,
        branchId: actor.default_branch_id,
        userId: input.actorUserId,
        action: 'VARIANT_MINIMUM_SELLING_PRICE_CHANGED',
        entityType: 'PRODUCT_VARIANT',
        entityId: input.variantId,
        before: {
          minimumSellingPrice:
            before.minimum_selling_price,
        },
        after: {
          minimumSellingPrice:
            row.minimum_selling_price,
        },
      })

      return row.minimum_selling_price
    })
  }

  async resolveAutomaticPrice(
    input: ResolveAutomaticPriceInput,
  ): Promise<ResolvedAutomaticPrice> {
    requireNonBlank('actorUserId', input.actorUserId)
    requireNonBlank('branchId', input.branchId)
    requireNonBlank('variantId', input.variantId)
    requireNonBlank('productUnitId', input.productUnitId)
    if (input.counterpartyId !== null && input.counterpartyId !== undefined) {
      requireNonBlank('counterpartyId', input.counterpartyId)
    }
    if (
      input.explicitPriceListId !== null &&
      input.explicitPriceListId !== undefined
    ) {
      requireNonBlank(
        'explicitPriceListId',
        input.explicitPriceListId,
      )
    }

    return this.database.transaction(async (client) => {
      await requireActorContext(client, input.actorUserId)
      await this.branchScope.requireWithinTransaction(
        client,
        input.actorUserId,
        input.branchId,
      )

      let priceListId: string | null =
        input.explicitPriceListId ?? null
      let priceListSource: ResolvedPriceListSource =
        'EXPLICIT'

      if (priceListId === null && input.counterpartyId) {
        const customer =
          await client.query<CustomerProfileRow>(
            `SELECT
               counterparty_id,
               default_price_list_id
             FROM customer_profiles
            WHERE counterparty_id=$1`,
            [input.counterpartyId],
          )
        const row = customer.rows[0]
        if (!row) {
          throw new PriceListError(
            'CUSTOMER_PROFILE_NOT_FOUND',
          )
        }
        if (row.default_price_list_id !== null) {
          priceListId = row.default_price_list_id
          priceListSource = 'CUSTOMER_DEFAULT'
        }
      }

      if (priceListId === null) {
        const settings =
          await client.query<BranchSettingsRow>(
            `SELECT default_price_list_id
               FROM branch_settings
              WHERE branch_id=$1`,
            [input.branchId],
          )
        const row = settings.rows[0]
        if (!row) {
          throw new PriceListError(
            'BRANCH_SETTINGS_NOT_FOUND',
          )
        }
        priceListId = row.default_price_list_id
        priceListSource = 'BRANCH_DEFAULT'
      }

      if (priceListId === null) {
        throw new PriceListError(
          'DEFAULT_PRICE_LIST_NOT_CONFIGURED',
        )
      }

      await requirePriceList(client, priceListId, {
        active: true,
      })
      const variant = await requireVariant(
        client,
        input.variantId,
        { active: true },
      )
      const productUnit = await requireProductUnit(
        client,
        input.productUnitId,
      )
      assertPricingPair(variant, productUnit)

      const result = await client.query<PriceListItemRow>(
        `SELECT
           pli.price_list_id,
           pli.variant_id,
           pli.product_unit_id,
           $4::uuid AS product_id,
           pli.price::text AS price
         FROM price_list_items pli
        WHERE pli.price_list_id=$1
          AND pli.variant_id=$2
          AND pli.product_unit_id=$3`,
        [
          priceListId,
          input.variantId,
          input.productUnitId,
          variant.product_id,
        ],
      )
      const row = result.rows[0]
      if (!row) {
        throw new PriceListError('PRICE_NOT_FOUND')
      }

      return Object.freeze({
        priceListId,
        priceListSource,
        variantId: row.variant_id,
        productUnitId: row.product_unit_id,
        price: row.price,
        priceSource: 'PRICE_LIST' as const,
      })
    })
  }

  /**
   * The Variant minimum is a base-unit floor while Price List rows are stored
   * per ProductUnit. Compare without floating point:
   * saleUnitPrice / conversionToBase < minimumBasePrice
   * iff saleUnitPrice * 1e6 < minimumBasePrice * conversionScaled6.
   *
   * This method authorizes policy only. The later Sales posting command must
   * record actual sensitive override use in the document Audit transaction.
   */
  async authorizeEffectiveSalePrice(
    input: AuthorizeEffectiveSalePriceInput,
  ): Promise<SalePriceAuthorization> {
    requireNonBlank('actorUserId', input.actorUserId)
    requireNonBlank('branchId', input.branchId)
    requireNonBlank('variantId', input.variantId)
    requireNonBlank('productUnitId', input.productUnitId)
    validatePriceSource(input.priceSource)
    const effectivePrice = parseMoney(
      'effectiveUnitPrice',
      input.effectiveUnitPrice,
    )

    return this.database.transaction(async (client) => {
      await requireActorContext(client, input.actorUserId)
      await this.branchScope.requireWithinTransaction(
        client,
        input.actorUserId,
        input.branchId,
      )

      const variant = await requireVariant(
        client,
        input.variantId,
        { active: true },
      )
      const productUnit = await requireProductUnit(
        client,
        input.productUnitId,
      )
      assertPricingPair(variant, productUnit)

      if (input.priceSource === 'MANUAL') {
        await this.authorization.requireWithinTransaction(
          client,
          input.actorUserId,
          PRICE_LIST_PERMISSIONS.MANUAL_EDIT,
          input.branchId,
        )
      }

      let belowMinimum = false
      if (variant.minimum_selling_price !== null) {
        const minimum = parseMoney(
          'minimumSellingPrice',
          variant.minimum_selling_price,
        )
        const conversion = parseConversion(
          productUnit.conversion_to_base,
        )

        belowMinimum =
          effectivePrice.scaled * QUANTITY_SCALE_FACTOR <
          minimum.scaled * conversion.scaled

        if (belowMinimum) {
          await this.authorization.requireWithinTransaction(
            client,
            input.actorUserId,
            PRICE_LIST_PERMISSIONS.BELOW_MINIMUM,
            input.branchId,
          )
        }
      }

      return Object.freeze({
        variantId: input.variantId,
        productUnitId: input.productUnitId,
        effectiveUnitPrice: effectivePrice.normalized,
        minimumSellingPrice:
          variant.minimum_selling_price,
        priceSource: input.priceSource,
        belowMinimum,
      })
    })
  }
}
