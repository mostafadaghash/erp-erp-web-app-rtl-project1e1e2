import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'

import type {
  TransactionOptions,
  TransactionWork,
} from '../database/transaction.js'

export const DEFAULT_SYSTEM_ROLES = Object.freeze([
  Object.freeze({
    roleKey: 'SYSTEM_ADMIN',
    displayNameKey: 'roles.systemAdmin',
  }),
  Object.freeze({
    roleKey: 'BRANCH_MANAGER',
    displayNameKey: 'roles.branchManager',
  }),
  Object.freeze({
    roleKey: 'ACCOUNTANT',
    displayNameKey: 'roles.accountant',
  }),
  Object.freeze({
    roleKey: 'SALES',
    displayNameKey: 'roles.sales',
  }),
  Object.freeze({
    roleKey: 'CUSTOMER_SERVICE',
    displayNameKey: 'roles.customerService',
  }),
  Object.freeze({
    roleKey: 'TECHNICIAN',
    displayNameKey: 'roles.technician',
  }),
  Object.freeze({
    roleKey: 'WAREHOUSE_KEEPER',
    displayNameKey: 'roles.warehouseKeeper',
  }),
] as const)

export type DefaultSystemRoleKey =
  (typeof DEFAULT_SYSTEM_ROLES)[number]['roleKey']

export interface RoleRecord {
  id: string
  roleKey: string
  displayNameKey: string
  isSystem: boolean
}

interface RoleRow {
  id: string
  role_key: string
  display_name_key: string
  is_system: boolean
}

export interface RoleCatalogTransactionRunner {
  transaction<T>(
    work: TransactionWork<T>,
    options?: TransactionOptions,
  ): Promise<T>
}

const DEFAULT_ROLE_KEYS = new Set<string>(
  DEFAULT_SYSTEM_ROLES.map((role) => role.roleKey),
)

function toRoleRecord(row: RoleRow): RoleRecord {
  return Object.freeze({
    id: row.id,
    roleKey: row.role_key,
    displayNameKey: row.display_name_key,
    isSystem: row.is_system,
  })
}

function canonicalizeDefaultRoleRows(rows: readonly RoleRow[]): RoleRecord[] {
  const byKey = new Map(rows.map((row) => [row.role_key, row]))

  if (
    rows.length !== DEFAULT_SYSTEM_ROLES.length ||
    byKey.size !== DEFAULT_SYSTEM_ROLES.length
  ) {
    throw new Error('Default role catalog returned an unexpected row count')
  }

  return DEFAULT_SYSTEM_ROLES.map((expected) => {
    const row = byKey.get(expected.roleKey)
    if (
      !row ||
      row.display_name_key !== expected.displayNameKey ||
      row.is_system !== true
    ) {
      throw new Error(
        `Default role catalog drift remains for ${expected.roleKey}`,
      )
    }
    return toRoleRecord(row)
  })
}

export function isDefaultSystemRoleKey(
  roleKey: string,
): roleKey is DefaultSystemRoleKey {
  return DEFAULT_ROLE_KEYS.has(roleKey)
}

export class RoleCatalogService {
  constructor(private readonly database: RoleCatalogTransactionRunner) {}

  async ensureDefaultRoles(): Promise<readonly RoleRecord[]> {
    return this.database.transaction(async (client) => {
      const ids = DEFAULT_SYSTEM_ROLES.map(() => randomUUID())
      const valuesSql = DEFAULT_SYSTEM_ROLES.map((_, index) => {
        const offset = index * 4
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`
      }).join(',\n')

      const params = DEFAULT_SYSTEM_ROLES.flatMap((role, index) => [
        ids[index],
        role.roleKey,
        role.displayNameKey,
        true,
      ])

      const result = await client.query<RoleRow>(
        `INSERT INTO roles (id,role_key,display_name_key,is_system)
         VALUES
         ${valuesSql}
         ON CONFLICT (role_key) DO UPDATE
           SET display_name_key=EXCLUDED.display_name_key,
               is_system=TRUE
         RETURNING id,role_key,display_name_key,is_system`,
        params,
      )

      return canonicalizeDefaultRoleRows(result.rows)
    })
  }

  async listDefaultRoles(): Promise<readonly RoleRecord[]> {
    return this.database.transaction(async (client) => {
      return this.listDefaultRolesWithClient(client)
    })
  }

  private async listDefaultRolesWithClient(
    client: PoolClient,
  ): Promise<readonly RoleRecord[]> {
    const result = await client.query<RoleRow>(
      `SELECT id,role_key,display_name_key,is_system
         FROM roles
        WHERE role_key = ANY($1::text[])`,
      [DEFAULT_SYSTEM_ROLES.map((role) => role.roleKey)],
    )

    return canonicalizeDefaultRoleRows(result.rows)
  }
}
