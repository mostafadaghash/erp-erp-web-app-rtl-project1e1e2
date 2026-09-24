import { randomUUID } from 'node:crypto'
import type { PoolClient, QueryResultRow } from 'pg'

import {
  AuditService,
  serializeAuditSnapshot,
  type AuditJsonValue,
} from '../audit/audit-service.js'
import type {
  TransactionOptions,
  TransactionWork,
} from '../database/transaction.js'

export type CompanySettings = Readonly<Record<string, AuditJsonValue>>

export type OrganizationErrorReason =
  | 'COMPANY_NOT_FOUND'
  | 'COMPANY_INACTIVE'
  | 'BRANCH_NOT_FOUND'
  | 'WAREHOUSE_NOT_FOUND'
  | 'WAREHOUSE_INACTIVE'
  | 'WAREHOUSE_BRANCH_MISMATCH'
  | 'WAREHOUSE_IS_DEFAULT'
  | 'WAREHOUSE_HAS_MOVEMENTS'
  | 'DEFAULT_WAREHOUSE_NOT_CONFIGURED'

export class OrganizationError extends Error {
  readonly reason: OrganizationErrorReason

  constructor(reason: OrganizationErrorReason) {
    super('Organization operation rejected')
    this.name = 'OrganizationError'
    this.reason = reason
  }
}

export interface OrganizationTransactionRunner {
  transaction<T>(
    work: TransactionWork<T>,
    options?: TransactionOptions,
  ): Promise<T>
}

export interface CreateBranchInput {
  companyId: string
  actorUserId: string
  name: string
  code: string
  defaultWarehouseName: string
  defaultWarehouseCode: string
}

export interface CreateBranchResult {
  branchId: string
  defaultWarehouseId: string
}

export interface SetBranchActiveInput {
  branchId: string
  actorUserId: string
  isActive: boolean
}

export interface SetDefaultWarehouseInput {
  branchId: string
  warehouseId: string
  actorUserId: string
}

export interface MoveWarehouseInput {
  warehouseId: string
  targetBranchId: string
  actorUserId: string
}

export interface SetWarehouseActiveInput {
  warehouseId: string
  actorUserId: string
  isActive: boolean
}

export interface UpdateCompanySettingsInput {
  companyId: string
  actorUserId: string
  settings: CompanySettings
}

export interface DefaultWarehouseRecord {
  branchId: string
  warehouseId: string
  name: string
  code: string
  isActive: boolean
}

interface CompanyRow extends QueryResultRow {
  id: string
  is_active: boolean
}

interface BranchRow extends QueryResultRow {
  id: string
  company_id: string
  name: string
  code: string
  is_active: boolean
}

interface WarehouseRow extends QueryResultRow {
  id: string
  branch_id: string
  name: string
  code: string
  is_active: boolean
}

interface CompanySettingsRow extends QueryResultRow {
  settings_json: CompanySettings
}

interface BranchSettingsRow extends QueryResultRow {
  default_warehouse_id: string | null
}

interface DefaultWarehouseRow extends QueryResultRow {
  branch_id: string
  warehouse_id: string | null
  warehouse_name: string | null
  warehouse_code: string | null
  warehouse_is_active: boolean | null
}

function requireNonBlank(name: string, value: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`)
  }
}

function validateCompanySettings(settings: CompanySettings): string {
  if (
    settings === null ||
    typeof settings !== 'object' ||
    Array.isArray(settings)
  ) {
    throw new TypeError('Company settings must be a JSON object')
  }

  const serialized = serializeAuditSnapshot(settings)
  if (serialized === null) {
    throw new TypeError('Company settings must be a JSON object')
  }
  return serialized
}

async function requireCompany(
  client: PoolClient,
  companyId: string,
): Promise<CompanyRow> {
  const result = await client.query<CompanyRow>(
    `SELECT id,is_active
       FROM companies
      WHERE id=$1
      FOR UPDATE`,
    [companyId],
  )
  const row = result.rows[0]
  if (!row) throw new OrganizationError('COMPANY_NOT_FOUND')
  return row
}

async function requireBranch(
  client: PoolClient,
  branchId: string,
): Promise<BranchRow> {
  const result = await client.query<BranchRow>(
    `SELECT id,company_id,name,code,is_active
       FROM branches
      WHERE id=$1
      FOR UPDATE`,
    [branchId],
  )
  const row = result.rows[0]
  if (!row) throw new OrganizationError('BRANCH_NOT_FOUND')
  return row
}

async function requireWarehouse(
  client: PoolClient,
  warehouseId: string,
): Promise<WarehouseRow> {
  const result = await client.query<WarehouseRow>(
    `SELECT id,branch_id,name,code,is_active
       FROM warehouses
      WHERE id=$1
      FOR UPDATE`,
    [warehouseId],
  )
  const row = result.rows[0]
  if (!row) throw new OrganizationError('WAREHOUSE_NOT_FOUND')
  return row
}

export class OrganizationService {
  private readonly audit = new AuditService()

  constructor(
    private readonly database: OrganizationTransactionRunner,
  ) {}

  async updateCompanySettings(
    input: UpdateCompanySettingsInput,
  ): Promise<CompanySettings> {
    requireNonBlank('companyId', input.companyId)
    requireNonBlank('actorUserId', input.actorUserId)
    const settingsJson = validateCompanySettings(input.settings)

    return this.database.transaction(async (client) => {
      await requireCompany(client, input.companyId)

      const beforeResult = await client.query<CompanySettingsRow>(
        `SELECT settings_json
           FROM company_settings
          WHERE company_id=$1
          FOR UPDATE`,
        [input.companyId],
      )
      const before = beforeResult.rows[0]?.settings_json ?? null

      const result = await client.query<CompanySettingsRow>(
        `INSERT INTO company_settings
          (company_id,settings_json,updated_by,updated_at)
         VALUES ($1,$2::jsonb,$3,clock_timestamp())
         ON CONFLICT (company_id) DO UPDATE
           SET settings_json=EXCLUDED.settings_json,
               updated_by=EXCLUDED.updated_by,
               updated_at=clock_timestamp()
         RETURNING settings_json`,
        [input.companyId, settingsJson, input.actorUserId],
      )
      const row = result.rows[0]
      if (!row) throw new Error('Company settings invariant failed')

      await this.audit.record(client, {
        companyId: input.companyId,
        userId: input.actorUserId,
        action: 'ORGANIZATION_COMPANY_SETTINGS_UPDATED',
        entityType: 'COMPANY_SETTINGS',
        entityId: input.companyId,
        before,
        after: input.settings,
      })

      return Object.freeze({ ...row.settings_json })
    })
  }

  async getCompanySettings(companyId: string): Promise<CompanySettings | null> {
    requireNonBlank('companyId', companyId)

    return this.database.transaction(async (client) => {
      const company = await client.query(
        'SELECT id FROM companies WHERE id=$1',
        [companyId],
      )
      if (company.rowCount !== 1) {
        throw new OrganizationError('COMPANY_NOT_FOUND')
      }

      const result = await client.query<CompanySettingsRow>(
        `SELECT settings_json
           FROM company_settings
          WHERE company_id=$1`,
        [companyId],
      )
      const row = result.rows[0]
      return row ? Object.freeze({ ...row.settings_json }) : null
    })
  }

  async createBranch(
    input: CreateBranchInput,
  ): Promise<CreateBranchResult> {
    requireNonBlank('companyId', input.companyId)
    requireNonBlank('actorUserId', input.actorUserId)
    requireNonBlank('branch name', input.name)
    requireNonBlank('branch code', input.code)
    requireNonBlank('default warehouse name', input.defaultWarehouseName)
    requireNonBlank('default warehouse code', input.defaultWarehouseCode)

    return this.database.transaction(async (client) => {
      const company = await requireCompany(client, input.companyId)
      if (!company.is_active) {
        throw new OrganizationError('COMPANY_INACTIVE')
      }

      const branchId = randomUUID()
      const defaultWarehouseId = randomUUID()

      await client.query(
        `INSERT INTO branches
          (id,company_id,name,code,is_active,created_at,updated_at)
         VALUES ($1,$2,$3,$4,true,clock_timestamp(),clock_timestamp())`,
        [branchId, input.companyId, input.name.trim(), input.code.trim()],
      )

      await client.query(
        `INSERT INTO warehouses
          (id,branch_id,name,code,is_active,created_at,updated_at)
         VALUES ($1,$2,$3,$4,true,clock_timestamp(),clock_timestamp())`,
        [
          defaultWarehouseId,
          branchId,
          input.defaultWarehouseName.trim(),
          input.defaultWarehouseCode.trim(),
        ],
      )

      await client.query(
        `INSERT INTO branch_settings
          (branch_id,default_warehouse_id,settings_json,updated_at)
         VALUES ($1,$2,'{}'::jsonb,clock_timestamp())`,
        [branchId, defaultWarehouseId],
      )

      await this.audit.record(client, {
        companyId: input.companyId,
        branchId,
        userId: input.actorUserId,
        action: 'ORGANIZATION_BRANCH_CREATED',
        entityType: 'BRANCH',
        entityId: branchId,
        after: {
          name: input.name.trim(),
          code: input.code.trim(),
          isActive: true,
          defaultWarehouseId,
        },
      })

      return Object.freeze({ branchId, defaultWarehouseId })
    })
  }

  async setBranchActive(input: SetBranchActiveInput): Promise<void> {
    requireNonBlank('branchId', input.branchId)
    requireNonBlank('actorUserId', input.actorUserId)

    await this.database.transaction(async (client) => {
      const branch = await requireBranch(client, input.branchId)
      if (branch.is_active === input.isActive) return

      await client.query(
        `UPDATE branches
            SET is_active=$2,
                updated_at=clock_timestamp()
          WHERE id=$1`,
        [input.branchId, input.isActive],
      )

      await this.audit.record(client, {
        companyId: branch.company_id,
        branchId: branch.id,
        userId: input.actorUserId,
        action: input.isActive
          ? 'ORGANIZATION_BRANCH_ACTIVATED'
          : 'ORGANIZATION_BRANCH_DEACTIVATED',
        entityType: 'BRANCH',
        entityId: branch.id,
        before: { isActive: branch.is_active },
        after: { isActive: input.isActive },
      })
    })
  }

  async getDefaultWarehouse(
    branchId: string,
  ): Promise<DefaultWarehouseRecord> {
    requireNonBlank('branchId', branchId)

    return this.database.transaction(async (client) => {
      const result = await client.query<DefaultWarehouseRow>(
        `SELECT
           b.id AS branch_id,
           w.id AS warehouse_id,
           w.name AS warehouse_name,
           w.code AS warehouse_code,
           w.is_active AS warehouse_is_active
         FROM branches b
         LEFT JOIN branch_settings bs
           ON bs.branch_id=b.id
         LEFT JOIN warehouses w
           ON w.id=bs.default_warehouse_id
        WHERE b.id=$1`,
        [branchId],
      )

      const row = result.rows[0]
      if (!row) throw new OrganizationError('BRANCH_NOT_FOUND')
      if (
        row.warehouse_id === null ||
        row.warehouse_name === null ||
        row.warehouse_code === null ||
        row.warehouse_is_active === null
      ) {
        throw new OrganizationError('DEFAULT_WAREHOUSE_NOT_CONFIGURED')
      }

      return Object.freeze({
        branchId: row.branch_id,
        warehouseId: row.warehouse_id,
        name: row.warehouse_name,
        code: row.warehouse_code,
        isActive: row.warehouse_is_active,
      })
    })
  }

  async setDefaultWarehouse(
    input: SetDefaultWarehouseInput,
  ): Promise<DefaultWarehouseRecord> {
    requireNonBlank('branchId', input.branchId)
    requireNonBlank('warehouseId', input.warehouseId)
    requireNonBlank('actorUserId', input.actorUserId)

    return this.database.transaction(async (client) => {
      const branch = await requireBranch(client, input.branchId)
      const settingsResult = await client.query<BranchSettingsRow>(
        `SELECT default_warehouse_id
           FROM branch_settings
          WHERE branch_id=$1
          FOR UPDATE`,
        [input.branchId],
      )
      const previousDefaultWarehouseId =
        settingsResult.rows[0]?.default_warehouse_id ?? null

      const warehouse = await requireWarehouse(client, input.warehouseId)
      if (warehouse.branch_id !== input.branchId) {
        throw new OrganizationError('WAREHOUSE_BRANCH_MISMATCH')
      }
      if (!warehouse.is_active) {
        throw new OrganizationError('WAREHOUSE_INACTIVE')
      }

      await client.query(
        `INSERT INTO branch_settings
          (branch_id,default_warehouse_id,settings_json,updated_at)
         VALUES ($1,$2,'{}'::jsonb,clock_timestamp())
         ON CONFLICT (branch_id) DO UPDATE
           SET default_warehouse_id=EXCLUDED.default_warehouse_id,
               updated_at=clock_timestamp()`,
        [input.branchId, input.warehouseId],
      )

      if (previousDefaultWarehouseId !== input.warehouseId) {
        await this.audit.record(client, {
          companyId: branch.company_id,
          branchId: input.branchId,
          userId: input.actorUserId,
          action: 'ORGANIZATION_DEFAULT_WAREHOUSE_CHANGED',
          entityType: 'BRANCH_SETTINGS',
          entityId: input.branchId,
          before: {
            defaultWarehouseId: previousDefaultWarehouseId,
          },
          after: {
            defaultWarehouseId: input.warehouseId,
          },
        })
      }

      return Object.freeze({
        branchId: input.branchId,
        warehouseId: warehouse.id,
        name: warehouse.name,
        code: warehouse.code,
        isActive: warehouse.is_active,
      })
    })
  }

  async moveWarehouseToBranch(
    input: MoveWarehouseInput,
  ): Promise<void> {
    requireNonBlank('warehouseId', input.warehouseId)
    requireNonBlank('targetBranchId', input.targetBranchId)
    requireNonBlank('actorUserId', input.actorUserId)

    await this.database.transaction(async (client) => {
      const warehouse = await requireWarehouse(client, input.warehouseId)
      if (warehouse.branch_id === input.targetBranchId) return

      const branchLocks = await client.query<BranchRow>(
        `SELECT id,company_id,name,code,is_active
           FROM branches
          WHERE id=ANY($1::uuid[])
          ORDER BY id
          FOR UPDATE`,
        [[warehouse.branch_id, input.targetBranchId]],
      )
      const sourceBranch = branchLocks.rows.find(
        (row) => row.id === warehouse.branch_id,
      )
      const targetBranch = branchLocks.rows.find(
        (row) => row.id === input.targetBranchId,
      )
      if (!sourceBranch) throw new OrganizationError('BRANCH_NOT_FOUND')
      if (!targetBranch) throw new OrganizationError('BRANCH_NOT_FOUND')

      const defaultUse = await client.query(
        `SELECT 1
           FROM branch_settings
          WHERE default_warehouse_id=$1
          LIMIT 1`,
        [input.warehouseId],
      )
      if (defaultUse.rowCount !== 0) {
        throw new OrganizationError('WAREHOUSE_IS_DEFAULT')
      }

      const movement = await client.query(
        `SELECT 1
           FROM inventory_movements
          WHERE warehouse_id=$1
          LIMIT 1`,
        [input.warehouseId],
      )
      if (movement.rowCount !== 0) {
        throw new OrganizationError('WAREHOUSE_HAS_MOVEMENTS')
      }

      await client.query(
        `UPDATE warehouses
            SET branch_id=$2,
                updated_at=clock_timestamp()
          WHERE id=$1`,
        [input.warehouseId, input.targetBranchId],
      )

      await this.audit.record(client, {
        companyId: sourceBranch.company_id,
        branchId: warehouse.branch_id,
        userId: input.actorUserId,
        action: 'ORGANIZATION_WAREHOUSE_BRANCH_CHANGED',
        entityType: 'WAREHOUSE',
        entityId: warehouse.id,
        before: { branchId: warehouse.branch_id },
        after: { branchId: input.targetBranchId },
      })
    })
  }

  async setWarehouseActive(
    input: SetWarehouseActiveInput,
  ): Promise<void> {
    requireNonBlank('warehouseId', input.warehouseId)
    requireNonBlank('actorUserId', input.actorUserId)

    await this.database.transaction(async (client) => {
      const warehouse = await requireWarehouse(client, input.warehouseId)
      if (warehouse.is_active === input.isActive) return

      if (!input.isActive) {
        const defaultUse = await client.query(
          `SELECT 1
             FROM branch_settings
            WHERE default_warehouse_id=$1
            LIMIT 1`,
          [input.warehouseId],
        )
        if (defaultUse.rowCount !== 0) {
          throw new OrganizationError('WAREHOUSE_IS_DEFAULT')
        }
      }

      const branch = await requireBranch(client, warehouse.branch_id)

      await client.query(
        `UPDATE warehouses
            SET is_active=$2,
                updated_at=clock_timestamp()
          WHERE id=$1`,
        [input.warehouseId, input.isActive],
      )

      await this.audit.record(client, {
        companyId: branch.company_id,
        branchId: warehouse.branch_id,
        userId: input.actorUserId,
        action: input.isActive
          ? 'ORGANIZATION_WAREHOUSE_ACTIVATED'
          : 'ORGANIZATION_WAREHOUSE_DEACTIVATED',
        entityType: 'WAREHOUSE',
        entityId: warehouse.id,
        before: { isActive: warehouse.is_active },
        after: { isActive: input.isActive },
      })
    })
  }
}
