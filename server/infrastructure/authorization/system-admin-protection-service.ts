import type { PoolClient, QueryResultRow } from 'pg'

import { AuditService } from '../audit/audit-service.js'
import type {
  TransactionOptions,
  TransactionWork,
} from '../database/transaction.js'

export const SYSTEM_ADMIN_ROLE_KEY = 'SYSTEM_ADMIN' as const

export type SystemAdminProtectionErrorReason =
  | 'SYSTEM_ADMIN_ROLE_NOT_FOUND'
  | 'USER_NOT_FOUND'
  | 'ROLE_NOT_FOUND'
  | 'LAST_ACTIVE_SYSTEM_ADMIN'

export class SystemAdminProtectionError extends Error {
  readonly reason: SystemAdminProtectionErrorReason

  constructor(reason: SystemAdminProtectionErrorReason) {
    super('System administrator protection rejected the operation')
    this.name = 'SystemAdminProtectionError'
    this.reason = reason
  }
}

export interface SystemAdminProtectionTransactionRunner {
  transaction<T>(
    work: TransactionWork<T>,
    options?: TransactionOptions,
  ): Promise<T>
}

export interface SetUserActiveInput {
  userId: string
  isActive: boolean
  actorUserId: string
}

export interface ChangeUserRoleInput {
  userId: string
  roleId: string
  actorUserId: string
}

export interface ProtectedUserRecord {
  id: string
  roleId: string
  isActive: boolean
}

interface RoleRow extends QueryResultRow {
  id: string
  role_key: string
}

interface ProtectedUserRow extends QueryResultRow {
  id: string
  role_id: string
  is_active: boolean
  default_branch_id: string
  company_id: string
}

interface CountRow extends QueryResultRow {
  count: number
}

function requireNonBlank(name: string, value: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`)
  }
}

function toProtectedUser(row: ProtectedUserRow): ProtectedUserRecord {
  return Object.freeze({
    id: row.id,
    roleId: row.role_id,
    isActive: row.is_active,
  })
}

/**
 * Final Gate 05 policy:
 *
 * - The system must always retain at least one ACTIVE user whose canonical
 *   role_key is SYSTEM_ADMIN.
 * - Custom roles never count as a SYSTEM_ADMIN substitute.
 * - Disabling or demoting the last active SYSTEM_ADMIN is rejected.
 * - Enabling/promoting is allowed.
 * - Every mutation in this service locks the canonical SYSTEM_ADMIN role row
 *   first. This row is the serialization guard that makes concurrent admin
 *   removals safe under READ COMMITTED.
 */
export class SystemAdminProtectionService {
  private readonly audit = new AuditService()

  constructor(
    private readonly database: SystemAdminProtectionTransactionRunner,
  ) {}

  private async lockSystemAdminRole(
    client: PoolClient,
  ): Promise<RoleRow> {
    const result = await client.query<RoleRow>(
      `SELECT id,role_key
         FROM roles
        WHERE role_key=$1
        FOR UPDATE`,
      [SYSTEM_ADMIN_ROLE_KEY],
    )
    const row = result.rows[0]
    if (!row) {
      throw new SystemAdminProtectionError(
        'SYSTEM_ADMIN_ROLE_NOT_FOUND',
      )
    }
    return row
  }

  private async lockUser(
    client: PoolClient,
    userId: string,
  ): Promise<ProtectedUserRow> {
    const result = await client.query<ProtectedUserRow>(
      `SELECT
         u.id,
         u.role_id,
         u.is_active,
         u.default_branch_id,
         b.company_id
       FROM users u
       JOIN branches b
         ON b.id=u.default_branch_id
      WHERE u.id=$1
      FOR UPDATE OF u`,
      [userId],
    )
    const row = result.rows[0]
    if (!row) {
      throw new SystemAdminProtectionError('USER_NOT_FOUND')
    }
    return row
  }

  private async requireRole(
    client: PoolClient,
    roleId: string,
  ): Promise<RoleRow> {
    const result = await client.query<RoleRow>(
      `SELECT id,role_key
         FROM roles
        WHERE id=$1`,
      [roleId],
    )
    const row = result.rows[0]
    if (!row) {
      throw new SystemAdminProtectionError('ROLE_NOT_FOUND')
    }
    return row
  }

  private async assertCanRemoveActiveSystemAdmin(
    client: PoolClient,
    systemAdminRoleId: string,
  ): Promise<void> {
    const result = await client.query<CountRow>(
      `SELECT COUNT(*)::integer AS count
         FROM users
        WHERE role_id=$1
          AND is_active=true`,
      [systemAdminRoleId],
    )

    const activeSystemAdmins = result.rows[0]?.count ?? 0
    if (activeSystemAdmins <= 1) {
      throw new SystemAdminProtectionError(
        'LAST_ACTIVE_SYSTEM_ADMIN',
      )
    }
  }

  async setUserActive(
    input: SetUserActiveInput,
  ): Promise<ProtectedUserRecord> {
    requireNonBlank('userId', input.userId)
    requireNonBlank('actorUserId', input.actorUserId)

    return this.database.transaction(async (client) => {
      const systemAdminRole = await this.lockSystemAdminRole(client)
      const user = await this.lockUser(client, input.userId)

      if (user.is_active === input.isActive) {
        return toProtectedUser(user)
      }

      if (
        user.is_active &&
        !input.isActive &&
        user.role_id === systemAdminRole.id
      ) {
        await this.assertCanRemoveActiveSystemAdmin(
          client,
          systemAdminRole.id,
        )
      }

      const result = await client.query<ProtectedUserRow>(
        `UPDATE users
            SET is_active=$2,
                updated_at=clock_timestamp()
          WHERE id=$1
          RETURNING
            id,
            role_id,
            is_active,
            default_branch_id,
            $3::uuid AS company_id`,
        [input.userId, input.isActive, user.company_id],
      )
      const updated = result.rows[0]
      if (!updated) {
        throw new SystemAdminProtectionError('USER_NOT_FOUND')
      }

      await this.audit.record(client, {
        companyId: updated.company_id,
        branchId: updated.default_branch_id,
        userId: input.actorUserId,
        action: input.isActive
          ? 'USER_ACTIVATED'
          : 'USER_DEACTIVATED',
        entityType: 'USER',
        entityId: updated.id,
        before: {
          roleId: user.role_id,
          isActive: user.is_active,
        },
        after: {
          roleId: updated.role_id,
          isActive: updated.is_active,
        },
      })

      return toProtectedUser(updated)
    })
  }

  async changeUserRole(
    input: ChangeUserRoleInput,
  ): Promise<ProtectedUserRecord> {
    requireNonBlank('userId', input.userId)
    requireNonBlank('roleId', input.roleId)
    requireNonBlank('actorUserId', input.actorUserId)

    return this.database.transaction(async (client) => {
      const systemAdminRole = await this.lockSystemAdminRole(client)
      const user = await this.lockUser(client, input.userId)
      const targetRole = await this.requireRole(client, input.roleId)

      if (user.role_id === targetRole.id) {
        return toProtectedUser(user)
      }

      if (
        user.is_active &&
        user.role_id === systemAdminRole.id &&
        targetRole.id !== systemAdminRole.id
      ) {
        await this.assertCanRemoveActiveSystemAdmin(
          client,
          systemAdminRole.id,
        )
      }

      const result = await client.query<ProtectedUserRow>(
        `UPDATE users
            SET role_id=$2,
                updated_at=clock_timestamp()
          WHERE id=$1
          RETURNING
            id,
            role_id,
            is_active,
            default_branch_id,
            $3::uuid AS company_id`,
        [input.userId, targetRole.id, user.company_id],
      )
      const updated = result.rows[0]
      if (!updated) {
        throw new SystemAdminProtectionError('USER_NOT_FOUND')
      }

      await this.audit.record(client, {
        companyId: updated.company_id,
        branchId: updated.default_branch_id,
        userId: input.actorUserId,
        action: 'USER_ROLE_CHANGED',
        entityType: 'USER',
        entityId: updated.id,
        before: {
          roleId: user.role_id,
          isActive: user.is_active,
        },
        after: {
          roleId: updated.role_id,
          isActive: updated.is_active,
        },
      })

      return toProtectedUser(updated)
    })
  }
}
