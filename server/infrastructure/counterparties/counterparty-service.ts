import { randomUUID } from 'node:crypto'
import type { PoolClient, QueryResultRow } from 'pg'

import { AuditService } from '../audit/audit-service.js'
import { normalizePhone } from './phone-normalization.js'
import type {
  TransactionOptions,
  TransactionWork,
} from '../database/transaction.js'

export const COUNTERPARTY_ROLES = Object.freeze([
  'CUSTOMER',
  'SUPPLIER',
  'OTHER',
] as const)

export type CounterpartyRole = (typeof COUNTERPARTY_ROLES)[number]

export type CounterpartyErrorReason =
  | 'COUNTERPARTY_NOT_FOUND'
  | 'ACTOR_NOT_FOUND_OR_INACTIVE'
  | 'DUPLICATE_INPUT_ROLE'
  | 'CUSTOMER_PROFILE_REQUIRES_CUSTOMER_ROLE'
  | 'SUPPLIER_PROFILE_REQUIRES_SUPPLIER_ROLE'

export class CounterpartyError extends Error {
  readonly reason: CounterpartyErrorReason

  constructor(reason: CounterpartyErrorReason) {
    super('Counterparty operation rejected')
    this.name = 'CounterpartyError'
    this.reason = reason
  }
}

export interface CounterpartyTransactionRunner {
  transaction<T>(
    work: TransactionWork<T>,
    options?: TransactionOptions,
  ): Promise<T>
}

export interface CustomerProfileInput {
  defaultPriceListId?: string | null
  creditLimit?: string | null
}

export interface SupplierProfileInput {
  notes?: string | null
}

export interface CreateCounterpartyInput {
  actorUserId: string
  name: string
  phone?: string | null
  address?: string | null
  notes?: string | null
  roles: readonly CounterpartyRole[]
  customerProfile?: CustomerProfileInput | null
  supplierProfile?: SupplierProfileInput | null
}

export interface UpdateCounterpartyIdentityInput {
  counterpartyId: string
  actorUserId: string
  name: string
  phone?: string | null
  address?: string | null
  notes?: string | null
}

export interface SetCounterpartyActiveInput {
  counterpartyId: string
  actorUserId: string
  isActive: boolean
}

export interface AddCounterpartyRoleInput {
  counterpartyId: string
  actorUserId: string
  role: CounterpartyRole
}

export interface UpsertCustomerProfileInput
  extends CustomerProfileInput {
  counterpartyId: string
  actorUserId: string
}

export interface UpsertSupplierProfileInput
  extends SupplierProfileInput {
  counterpartyId: string
  actorUserId: string
}

export interface CounterpartyCustomerProfile {
  defaultPriceListId: string | null
  creditLimit: string | null
}

export interface CounterpartySupplierProfile {
  notes: string | null
}

export interface CounterpartyRecord {
  id: string
  name: string
  phone: string | null
  normalizedPhone: string | null
  address: string | null
  notes: string | null
  isActive: boolean
  roles: readonly CounterpartyRole[]
  customerProfile: CounterpartyCustomerProfile | null
  supplierProfile: CounterpartySupplierProfile | null
}

interface ActorContextRow extends QueryResultRow {
  company_id: string
  default_branch_id: string
}

interface CounterpartyRow extends QueryResultRow {
  id: string
  name: string
  phone: string | null
  normalized_phone: string | null
  address: string | null
  notes: string | null
  is_active: boolean
}

interface RoleRow extends QueryResultRow {
  role: CounterpartyRole
}

interface CustomerProfileRow extends QueryResultRow {
  default_price_list_id: string | null
  credit_limit: string | null
}

interface SupplierProfileRow extends QueryResultRow {
  notes: string | null
}

function requireNonBlank(name: string, value: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`)
  }
}

function normalizeNullableText(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) return null
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

function validateRole(role: CounterpartyRole): void {
  if (!COUNTERPARTY_ROLES.includes(role)) {
    throw new TypeError('Unsupported counterparty role')
  }
}

function validateCreditLimit(value: string | null | undefined): void {
  if (value === null || value === undefined) return
  if (!/^\d+(?:\.\d{1,4})?$/.test(value)) {
    throw new TypeError(
      'creditLimit must be a non-negative decimal with at most 4 decimal places',
    )
  }
}

function validateCreateInput(input: CreateCounterpartyInput): void {
  requireNonBlank('actorUserId', input.actorUserId)
  requireNonBlank('counterparty name', input.name)

  if (input.roles.length === 0) {
    throw new TypeError('counterparty must have at least one role')
  }

  const uniqueRoles = new Set<CounterpartyRole>()
  for (const role of input.roles) {
    validateRole(role)
    if (uniqueRoles.has(role)) {
      throw new CounterpartyError('DUPLICATE_INPUT_ROLE')
    }
    uniqueRoles.add(role)
  }

  if (
    input.customerProfile !== undefined &&
    input.customerProfile !== null &&
    !uniqueRoles.has('CUSTOMER')
  ) {
    throw new CounterpartyError(
      'CUSTOMER_PROFILE_REQUIRES_CUSTOMER_ROLE',
    )
  }

  if (
    input.supplierProfile !== undefined &&
    input.supplierProfile !== null &&
    !uniqueRoles.has('SUPPLIER')
  ) {
    throw new CounterpartyError(
      'SUPPLIER_PROFILE_REQUIRES_SUPPLIER_ROLE',
    )
  }

  validateCreditLimit(input.customerProfile?.creditLimit)
}

function roleSortValue(role: CounterpartyRole): number {
  return COUNTERPARTY_ROLES.indexOf(role)
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
    throw new CounterpartyError('ACTOR_NOT_FOUND_OR_INACTIVE')
  }
  return row
}

async function lockCounterparty(
  client: PoolClient,
  counterpartyId: string,
): Promise<CounterpartyRow> {
  const result = await client.query<CounterpartyRow>(
    `SELECT
       id,name,phone,normalized_phone,address,notes,is_active
     FROM counterparties
    WHERE id=$1
    FOR UPDATE`,
    [counterpartyId],
  )
  const row = result.rows[0]
  if (!row) {
    throw new CounterpartyError('COUNTERPARTY_NOT_FOUND')
  }
  return row
}

async function hasRole(
  client: PoolClient,
  counterpartyId: string,
  role: CounterpartyRole,
): Promise<boolean> {
  const result = await client.query(
    `SELECT 1
       FROM counterparty_roles
      WHERE counterparty_id=$1
        AND role=$2`,
    [counterpartyId, role],
  )
  return result.rowCount === 1
}

function identitySnapshot(row: CounterpartyRow) {
  return {
    name: row.name,
    phone: row.phone,
    normalizedPhone: row.normalized_phone,
    address: row.address,
    notes: row.notes,
    isActive: row.is_active,
  }
}

export class CounterpartyService {
  private readonly audit = new AuditService()

  constructor(
    private readonly database: CounterpartyTransactionRunner,
  ) {}

  async create(
    input: CreateCounterpartyInput,
  ): Promise<CounterpartyRecord> {
    validateCreateInput(input)

    return this.database.transaction(async (client) => {
      const actor = await requireActorContext(
        client,
        input.actorUserId,
      )
      const counterpartyId = randomUUID()
      const phone = normalizePhone(input.phone)

      await client.query(
        `INSERT INTO counterparties
          (id,name,phone,normalized_phone,address,notes,is_active,created_at,updated_at)
         VALUES
          ($1,$2,$3,$4,$5,$6,true,clock_timestamp(),clock_timestamp())`,
        [
          counterpartyId,
          input.name.trim(),
          phone?.displayPhone ?? null,
          phone?.normalizedPhone ?? null,
          normalizeNullableText(input.address),
          normalizeNullableText(input.notes),
        ],
      )

      for (const role of input.roles) {
        await client.query(
          `INSERT INTO counterparty_roles
            (counterparty_id,role)
           VALUES ($1,$2)`,
          [counterpartyId, role],
        )
      }

      if (input.customerProfile) {
        await client.query(
          `INSERT INTO customer_profiles
            (counterparty_id,default_price_list_id,credit_limit)
           VALUES ($1,$2,$3::numeric)`,
          [
            counterpartyId,
            input.customerProfile.defaultPriceListId ?? null,
            input.customerProfile.creditLimit ?? null,
          ],
        )
      }

      if (input.supplierProfile) {
        await client.query(
          `INSERT INTO supplier_profiles
            (counterparty_id,notes)
           VALUES ($1,$2)`,
          [
            counterpartyId,
            normalizeNullableText(input.supplierProfile.notes),
          ],
        )
      }

      await this.audit.record(client, {
        companyId: actor.company_id,
        branchId: actor.default_branch_id,
        userId: input.actorUserId,
        action: 'COUNTERPARTY_CREATED',
        entityType: 'COUNTERPARTY',
        entityId: counterpartyId,
        after: {
          name: input.name.trim(),
          phone: phone?.displayPhone ?? null,
          normalizedPhone: phone?.normalizedPhone ?? null,
          address: normalizeNullableText(input.address),
          notes: normalizeNullableText(input.notes),
          isActive: true,
          roles: [...input.roles],
          hasCustomerProfile: input.customerProfile != null,
          hasSupplierProfile: input.supplierProfile != null,
        },
      })

      return this.readWithClient(client, counterpartyId)
    })
  }

  async get(counterpartyId: string): Promise<CounterpartyRecord> {
    requireNonBlank('counterpartyId', counterpartyId)

    return this.database.transaction((client) =>
      this.readWithClient(client, counterpartyId),
    )
  }

  async searchByPhone(
    phoneQuery: string,
  ): Promise<readonly CounterpartyRecord[]> {
    requireNonBlank('phoneQuery', phoneQuery)
    const normalized = normalizePhone(phoneQuery)
    if (!normalized) {
      throw new TypeError('phoneQuery must contain a phone number')
    }

    return this.database.transaction(async (client) => {
      const result = await client.query<{ id: string }>(
        `SELECT id
           FROM counterparties
          WHERE normalized_phone=$1
          ORDER BY id`,
        [normalized.normalizedPhone],
      )

      return Promise.all(
        result.rows.map((row) =>
          this.readWithClient(client, row.id),
        ),
      )
    })
  }

  async updateIdentity(
    input: UpdateCounterpartyIdentityInput,
  ): Promise<CounterpartyRecord> {
    requireNonBlank('counterpartyId', input.counterpartyId)
    requireNonBlank('actorUserId', input.actorUserId)
    requireNonBlank('counterparty name', input.name)

    return this.database.transaction(async (client) => {
      const actor = await requireActorContext(
        client,
        input.actorUserId,
      )
      const before = await lockCounterparty(
        client,
        input.counterpartyId,
      )

      const phone = normalizePhone(input.phone)
      const result = await client.query<CounterpartyRow>(
        `UPDATE counterparties
            SET name=$2,
                phone=$3,
                normalized_phone=$4,
                address=$5,
                notes=$6,
                updated_at=clock_timestamp()
          WHERE id=$1
          RETURNING
            id,name,phone,normalized_phone,address,notes,is_active`,
        [
          input.counterpartyId,
          input.name.trim(),
          phone?.displayPhone ?? null,
          phone?.normalizedPhone ?? null,
          normalizeNullableText(input.address),
          normalizeNullableText(input.notes),
        ],
      )
      const updated = result.rows[0]
      if (!updated) {
        throw new CounterpartyError('COUNTERPARTY_NOT_FOUND')
      }

      await this.audit.record(client, {
        companyId: actor.company_id,
        branchId: actor.default_branch_id,
        userId: input.actorUserId,
        action: 'COUNTERPARTY_IDENTITY_UPDATED',
        entityType: 'COUNTERPARTY',
        entityId: input.counterpartyId,
        before: identitySnapshot(before),
        after: identitySnapshot(updated),
      })

      return this.readWithClient(client, input.counterpartyId)
    })
  }

  async setActive(
    input: SetCounterpartyActiveInput,
  ): Promise<CounterpartyRecord> {
    requireNonBlank('counterpartyId', input.counterpartyId)
    requireNonBlank('actorUserId', input.actorUserId)

    return this.database.transaction(async (client) => {
      const actor = await requireActorContext(
        client,
        input.actorUserId,
      )
      const before = await lockCounterparty(
        client,
        input.counterpartyId,
      )

      if (before.is_active === input.isActive) {
        return this.readWithClient(client, input.counterpartyId)
      }

      await client.query(
        `UPDATE counterparties
            SET is_active=$2,
                updated_at=clock_timestamp()
          WHERE id=$1`,
        [input.counterpartyId, input.isActive],
      )

      await this.audit.record(client, {
        companyId: actor.company_id,
        branchId: actor.default_branch_id,
        userId: input.actorUserId,
        action: input.isActive
          ? 'COUNTERPARTY_ACTIVATED'
          : 'COUNTERPARTY_DEACTIVATED',
        entityType: 'COUNTERPARTY',
        entityId: input.counterpartyId,
        before: { isActive: before.is_active },
        after: { isActive: input.isActive },
      })

      return this.readWithClient(client, input.counterpartyId)
    })
  }

  async addRole(
    input: AddCounterpartyRoleInput,
  ): Promise<CounterpartyRecord> {
    requireNonBlank('counterpartyId', input.counterpartyId)
    requireNonBlank('actorUserId', input.actorUserId)
    validateRole(input.role)

    return this.database.transaction(async (client) => {
      const actor = await requireActorContext(
        client,
        input.actorUserId,
      )
      await lockCounterparty(client, input.counterpartyId)

      const inserted = await client.query<RoleRow>(
        `INSERT INTO counterparty_roles
          (counterparty_id,role)
         VALUES ($1,$2)
         ON CONFLICT (counterparty_id,role) DO NOTHING
         RETURNING role`,
        [input.counterpartyId, input.role],
      )

      if (inserted.rowCount === 1) {
        await this.audit.record(client, {
          companyId: actor.company_id,
          branchId: actor.default_branch_id,
          userId: input.actorUserId,
          action: 'COUNTERPARTY_ROLE_ADDED',
          entityType: 'COUNTERPARTY',
          entityId: input.counterpartyId,
          after: { role: input.role },
        })
      }

      return this.readWithClient(client, input.counterpartyId)
    })
  }

  async upsertCustomerProfile(
    input: UpsertCustomerProfileInput,
  ): Promise<CounterpartyRecord> {
    requireNonBlank('counterpartyId', input.counterpartyId)
    requireNonBlank('actorUserId', input.actorUserId)
    validateCreditLimit(input.creditLimit)

    return this.database.transaction(async (client) => {
      const actor = await requireActorContext(
        client,
        input.actorUserId,
      )
      await lockCounterparty(client, input.counterpartyId)

      if (
        !(await hasRole(
          client,
          input.counterpartyId,
          'CUSTOMER',
        ))
      ) {
        throw new CounterpartyError(
          'CUSTOMER_PROFILE_REQUIRES_CUSTOMER_ROLE',
        )
      }

      const before = await client.query<CustomerProfileRow>(
        `SELECT default_price_list_id,credit_limit::text AS credit_limit
           FROM customer_profiles
          WHERE counterparty_id=$1`,
        [input.counterpartyId],
      )

      await client.query(
        `INSERT INTO customer_profiles
          (counterparty_id,default_price_list_id,credit_limit)
         VALUES ($1,$2,$3::numeric)
         ON CONFLICT (counterparty_id) DO UPDATE
           SET default_price_list_id=EXCLUDED.default_price_list_id,
               credit_limit=EXCLUDED.credit_limit`,
        [
          input.counterpartyId,
          input.defaultPriceListId ?? null,
          input.creditLimit ?? null,
        ],
      )

      await this.audit.record(client, {
        companyId: actor.company_id,
        branchId: actor.default_branch_id,
        userId: input.actorUserId,
        action: 'COUNTERPARTY_CUSTOMER_PROFILE_UPSERTED',
        entityType: 'COUNTERPARTY',
        entityId: input.counterpartyId,
        before: before.rows[0]
          ? {
              defaultPriceListId:
                before.rows[0].default_price_list_id,
              creditLimit: before.rows[0].credit_limit,
            }
          : null,
        after: {
          defaultPriceListId:
            input.defaultPriceListId ?? null,
          creditLimit: input.creditLimit ?? null,
        },
      })

      return this.readWithClient(client, input.counterpartyId)
    })
  }

  async upsertSupplierProfile(
    input: UpsertSupplierProfileInput,
  ): Promise<CounterpartyRecord> {
    requireNonBlank('counterpartyId', input.counterpartyId)
    requireNonBlank('actorUserId', input.actorUserId)

    return this.database.transaction(async (client) => {
      const actor = await requireActorContext(
        client,
        input.actorUserId,
      )
      await lockCounterparty(client, input.counterpartyId)

      if (
        !(await hasRole(
          client,
          input.counterpartyId,
          'SUPPLIER',
        ))
      ) {
        throw new CounterpartyError(
          'SUPPLIER_PROFILE_REQUIRES_SUPPLIER_ROLE',
        )
      }

      const notes = normalizeNullableText(input.notes)
      const before = await client.query<SupplierProfileRow>(
        `SELECT notes
           FROM supplier_profiles
          WHERE counterparty_id=$1`,
        [input.counterpartyId],
      )

      await client.query(
        `INSERT INTO supplier_profiles
          (counterparty_id,notes)
         VALUES ($1,$2)
         ON CONFLICT (counterparty_id) DO UPDATE
           SET notes=EXCLUDED.notes`,
        [input.counterpartyId, notes],
      )

      await this.audit.record(client, {
        companyId: actor.company_id,
        branchId: actor.default_branch_id,
        userId: input.actorUserId,
        action: 'COUNTERPARTY_SUPPLIER_PROFILE_UPSERTED',
        entityType: 'COUNTERPARTY',
        entityId: input.counterpartyId,
        before: before.rows[0]
          ? { notes: before.rows[0].notes }
          : null,
        after: { notes },
      })

      return this.readWithClient(client, input.counterpartyId)
    })
  }

  private async readWithClient(
    client: PoolClient,
    counterpartyId: string,
  ): Promise<CounterpartyRecord> {
    const counterparty = await client.query<CounterpartyRow>(
      `SELECT
         id,name,phone,normalized_phone,address,notes,is_active
       FROM counterparties
      WHERE id=$1`,
      [counterpartyId],
    )
    const row = counterparty.rows[0]
    if (!row) {
      throw new CounterpartyError('COUNTERPARTY_NOT_FOUND')
    }

    const roles = await client.query<RoleRow>(
      `SELECT role
         FROM counterparty_roles
        WHERE counterparty_id=$1`,
      [counterpartyId],
    )
    const customer = await client.query<CustomerProfileRow>(
      `SELECT
         default_price_list_id,
         credit_limit::text AS credit_limit
       FROM customer_profiles
      WHERE counterparty_id=$1`,
      [counterpartyId],
    )
    const supplier = await client.query<SupplierProfileRow>(
      `SELECT notes
         FROM supplier_profiles
        WHERE counterparty_id=$1`,
      [counterpartyId],
    )

    const customerRow = customer.rows[0]
    const supplierRow = supplier.rows[0]

    return Object.freeze({
      id: row.id,
      name: row.name,
      phone: row.phone,
      normalizedPhone: row.normalized_phone,
      address: row.address,
      notes: row.notes,
      isActive: row.is_active,
      roles: Object.freeze(
        roles.rows
          .map((roleRow) => roleRow.role)
          .sort((a, b) => roleSortValue(a) - roleSortValue(b)),
      ),
      customerProfile: customerRow
        ? Object.freeze({
            defaultPriceListId:
              customerRow.default_price_list_id,
            creditLimit: customerRow.credit_limit,
          })
        : null,
      supplierProfile: supplierRow
        ? Object.freeze({ notes: supplierRow.notes })
        : null,
    })
  }
}
