import type {
  TransactionOptions,
  TransactionWork,
} from '../database/transaction.js'

export type PermissionOverrideEffect = 'ALLOW' | 'DENY'

export type EffectivePermissionSource =
  | 'NOT_FOUND'
  | 'USER_INACTIVE'
  | 'USER_OVERRIDE'
  | 'ROLE_DEFAULT'

export interface EffectivePermissionInput {
  permissionKey: string
  found: boolean
  userActive: boolean
  roleDefaultAllowed: boolean
  overrideEffect: PermissionOverrideEffect | null
}

export interface EffectivePermissionDecision {
  permissionKey: string
  allowed: boolean
  source: EffectivePermissionSource
  roleDefaultAllowed: boolean
  overrideEffect: PermissionOverrideEffect | null
}

interface PermissionDecisionRow {
  user_active: boolean
  role_default_allowed: boolean | null
  override_effect: PermissionOverrideEffect | null
}

export interface EffectivePermissionTransactionRunner {
  transaction<T>(
    work: TransactionWork<T>,
    options?: TransactionOptions,
  ): Promise<T>
}

function assertNonEmpty(name: string, value: string): void {
  if (value.trim().length === 0) {
    throw new TypeError(`${name} cannot be empty`)
  }
}

function decision(
  input: EffectivePermissionInput,
  allowed: boolean,
  source: EffectivePermissionSource,
): EffectivePermissionDecision {
  return Object.freeze({
    permissionKey: input.permissionKey,
    allowed,
    source,
    roleDefaultAllowed: input.roleDefaultAllowed,
    overrideEffect: input.overrideEffect,
  })
}

/**
 * Architecture Baseline v1.7 precedence:
 * Role Default -> User ALLOW/DENY Override -> Effective Permission.
 * Logical INHERIT is represented by the absence of an override row.
 */
export function resolveEffectivePermission(
  input: EffectivePermissionInput,
): EffectivePermissionDecision {
  if (!input.found) {
    return decision(
      {
        ...input,
        roleDefaultAllowed: false,
        overrideEffect: null,
      },
      false,
      'NOT_FOUND',
    )
  }

  if (!input.userActive) {
    return decision(input, false, 'USER_INACTIVE')
  }

  if (input.overrideEffect === 'ALLOW') {
    return decision(input, true, 'USER_OVERRIDE')
  }

  if (input.overrideEffect === 'DENY') {
    return decision(input, false, 'USER_OVERRIDE')
  }

  return decision(input, input.roleDefaultAllowed, 'ROLE_DEFAULT')
}

export class PermissionDeniedError extends Error {
  readonly permissionKey: string

  constructor(permissionKey: string) {
    super('Permission denied')
    this.name = 'PermissionDeniedError'
    this.permissionKey = permissionKey
  }
}

export class EffectivePermissionService {
  constructor(
    private readonly database: EffectivePermissionTransactionRunner,
  ) {}

  async evaluate(
    userId: string,
    permissionKey: string,
  ): Promise<EffectivePermissionDecision> {
    assertNonEmpty('userId', userId)
    assertNonEmpty('permissionKey', permissionKey)

    return this.database.transaction(async (client) => {
      const result = await client.query<PermissionDecisionRow>(
        `SELECT
           u.is_active AS user_active,
           rp.is_allowed AS role_default_allowed,
           upo.effect AS override_effect
         FROM users u
         JOIN permissions p
           ON p.permission_key = $2
         LEFT JOIN role_permissions rp
           ON rp.role_id = u.role_id
          AND rp.permission_id = p.id
         LEFT JOIN user_permission_overrides upo
           ON upo.user_id = u.id
          AND upo.permission_id = p.id
        WHERE u.id = $1`,
        [userId, permissionKey],
      )

      const row = result.rows[0]
      if (result.rowCount !== 1 || row === undefined) {
        return resolveEffectivePermission({
          permissionKey,
          found: false,
          userActive: false,
          roleDefaultAllowed: false,
          overrideEffect: null,
        })
      }

      return resolveEffectivePermission({
        permissionKey,
        found: true,
        userActive: row.user_active,
        roleDefaultAllowed: row.role_default_allowed === true,
        overrideEffect: row.override_effect,
      })
    })
  }

  async hasPermission(
    userId: string,
    permissionKey: string,
  ): Promise<boolean> {
    return (await this.evaluate(userId, permissionKey)).allowed
  }

  async requirePermission(
    userId: string,
    permissionKey: string,
  ): Promise<EffectivePermissionDecision> {
    const result = await this.evaluate(userId, permissionKey)
    if (!result.allowed) {
      throw new PermissionDeniedError(permissionKey)
    }
    return result
  }
}
