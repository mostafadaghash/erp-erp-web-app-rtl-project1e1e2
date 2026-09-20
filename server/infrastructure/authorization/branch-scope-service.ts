import type { PoolClient, QueryResultRow } from 'pg'

import {
  PermissionDeniedError,
  resolveEffectivePermission,
  type EffectivePermissionDecision,
  type EffectivePermissionTransactionRunner,
  type PermissionOverrideEffect,
} from './effective-permission-service.js'

export type BranchScopeMode = 'SELECTED' | 'ALL'

export type BranchScopeSource =
  | 'NOT_FOUND'
  | 'USER_INACTIVE'
  | 'BRANCH_NOT_FOUND'
  | 'INVALID_SCOPE'
  | 'ALL'
  | 'SELECTED'

export interface BranchScopeInput {
  userId: string
  branchId: string
  found: boolean
  userActive: boolean
  branchExists: boolean
  scopeMode: BranchScopeMode | null
  defaultBranchId: string | null
  selectedAccess: boolean
}

export interface BranchScopeDecision {
  userId: string
  branchId: string
  allowed: boolean
  source: BranchScopeSource
  scopeMode: BranchScopeMode | null
  defaultBranchId: string | null
}

export interface BranchScopedPermissionDecision {
  allowed: boolean
  branchScope: BranchScopeDecision
  permission: EffectivePermissionDecision
}

export type AuthorizationQueryClient = Pick<PoolClient, 'query'>

interface BranchScopeRow extends QueryResultRow {
  user_active: boolean
  default_branch_id: string
  branch_scope_mode: BranchScopeMode
  branch_exists: boolean
  selected_access: boolean
}

interface BranchScopedPermissionRow extends BranchScopeRow {
  permission_found: boolean
  role_default_allowed: boolean | null
  override_effect: PermissionOverrideEffect | null
}

function assertNonEmpty(name: string, value: string): void {
  if (value.trim().length === 0) {
    throw new TypeError(`${name} cannot be empty`)
  }
}

function scopeDecision(
  input: BranchScopeInput,
  allowed: boolean,
  source: BranchScopeSource,
): BranchScopeDecision {
  return Object.freeze({
    userId: input.userId,
    branchId: input.branchId,
    allowed,
    source,
    scopeMode: input.scopeMode,
    defaultBranchId: input.defaultBranchId,
  })
}

/**
 * Architecture Baseline v1.7 Branch Scope:
 * ALL grants every existing branch in V1.
 * SELECTED grants only rows present in user_branch_access.
 * Missing/inactive subjects and missing branches fail closed.
 */
export function resolveBranchScope(
  input: BranchScopeInput,
): BranchScopeDecision {
  if (!input.found) {
    return scopeDecision(
      {
        ...input,
        scopeMode: null,
        defaultBranchId: null,
        selectedAccess: false,
      },
      false,
      'NOT_FOUND',
    )
  }

  if (!input.userActive) {
    return scopeDecision(input, false, 'USER_INACTIVE')
  }

  if (!input.branchExists) {
    return scopeDecision(input, false, 'BRANCH_NOT_FOUND')
  }

  if (input.scopeMode === 'ALL') {
    return scopeDecision(input, true, 'ALL')
  }

  if (input.scopeMode === 'SELECTED') {
    return scopeDecision(input, input.selectedAccess, 'SELECTED')
  }

  return scopeDecision(input, false, 'INVALID_SCOPE')
}

export class BranchAccessDeniedError extends Error {
  readonly branchId: string

  constructor(branchId: string) {
    super('Branch access denied')
    this.name = 'BranchAccessDeniedError'
    this.branchId = branchId
  }
}

async function readBranchScope(
  client: AuthorizationQueryClient,
  userId: string,
  branchId: string,
): Promise<BranchScopeDecision> {
  const result = await client.query<BranchScopeRow>(
    `SELECT
       u.is_active AS user_active,
       u.default_branch_id,
       u.branch_scope_mode,
       EXISTS (
         SELECT 1
           FROM branches b
          WHERE b.id = $2
       ) AS branch_exists,
       EXISTS (
         SELECT 1
           FROM user_branch_access uba
          WHERE uba.user_id = u.id
            AND uba.branch_id = $2
       ) AS selected_access
     FROM users u
    WHERE u.id = $1`,
    [userId, branchId],
  )

  const row = result.rows[0]
  if (result.rowCount !== 1 || row === undefined) {
    return resolveBranchScope({
      userId,
      branchId,
      found: false,
      userActive: false,
      branchExists: false,
      scopeMode: null,
      defaultBranchId: null,
      selectedAccess: false,
    })
  }

  return resolveBranchScope({
    userId,
    branchId,
    found: true,
    userActive: row.user_active,
    branchExists: row.branch_exists,
    scopeMode: row.branch_scope_mode,
    defaultBranchId: row.default_branch_id,
    selectedAccess: row.selected_access,
  })
}

async function readBranchScopedPermission(
  client: AuthorizationQueryClient,
  userId: string,
  permissionKey: string,
  branchId: string,
): Promise<BranchScopedPermissionDecision> {
  const result = await client.query<BranchScopedPermissionRow>(
    `SELECT
       u.is_active AS user_active,
       u.default_branch_id,
       u.branch_scope_mode,
       EXISTS (
         SELECT 1
           FROM branches b
          WHERE b.id = $3
       ) AS branch_exists,
       EXISTS (
         SELECT 1
           FROM user_branch_access uba
          WHERE uba.user_id = u.id
            AND uba.branch_id = $3
       ) AS selected_access,
       (p.id IS NOT NULL) AS permission_found,
       rp.is_allowed AS role_default_allowed,
       upo.effect AS override_effect
     FROM users u
     LEFT JOIN permissions p
       ON p.permission_key = $2
     LEFT JOIN role_permissions rp
       ON rp.role_id = u.role_id
      AND rp.permission_id = p.id
     LEFT JOIN user_permission_overrides upo
       ON upo.user_id = u.id
      AND upo.permission_id = p.id
    WHERE u.id = $1`,
    [userId, permissionKey, branchId],
  )

  const row = result.rows[0]
  if (result.rowCount !== 1 || row === undefined) {
    const branchScope = resolveBranchScope({
      userId,
      branchId,
      found: false,
      userActive: false,
      branchExists: false,
      scopeMode: null,
      defaultBranchId: null,
      selectedAccess: false,
    })
    const permission = resolveEffectivePermission({
      permissionKey,
      found: false,
      userActive: false,
      roleDefaultAllowed: false,
      overrideEffect: null,
    })

    return Object.freeze({
      allowed: false,
      branchScope,
      permission,
    })
  }

  const branchScope = resolveBranchScope({
    userId,
    branchId,
    found: true,
    userActive: row.user_active,
    branchExists: row.branch_exists,
    scopeMode: row.branch_scope_mode,
    defaultBranchId: row.default_branch_id,
    selectedAccess: row.selected_access,
  })
  const permission = resolveEffectivePermission({
    permissionKey,
    found: row.permission_found,
    userActive: row.user_active,
    roleDefaultAllowed: row.role_default_allowed === true,
    overrideEffect: row.override_effect,
  })

  return Object.freeze({
    allowed: branchScope.allowed && permission.allowed,
    branchScope,
    permission,
  })
}

export class BranchScopeService {
  constructor(
    private readonly database: EffectivePermissionTransactionRunner,
  ) {}

  async evaluate(
    userId: string,
    branchId: string,
  ): Promise<BranchScopeDecision> {
    assertNonEmpty('userId', userId)
    assertNonEmpty('branchId', branchId)

    return this.database.transaction((client) =>
      readBranchScope(client, userId, branchId),
    )
  }

  async hasAccess(userId: string, branchId: string): Promise<boolean> {
    return (await this.evaluate(userId, branchId)).allowed
  }

  async requireAccess(
    userId: string,
    branchId: string,
  ): Promise<BranchScopeDecision> {
    const result = await this.evaluate(userId, branchId)
    if (!result.allowed) {
      throw new BranchAccessDeniedError(branchId)
    }
    return result
  }
}

/**
 * Use requireWithinTransaction() from sensitive Business Queries/Commands so
 * permission + branch scope are rechecked by the Backend inside the same
 * transaction that performs the business work.
 */
export class BranchScopedAuthorizationService {
  constructor(
    private readonly database: EffectivePermissionTransactionRunner,
  ) {}

  async evaluateWithinTransaction(
    client: AuthorizationQueryClient,
    userId: string,
    permissionKey: string,
    branchId: string,
  ): Promise<BranchScopedPermissionDecision> {
    assertNonEmpty('userId', userId)
    assertNonEmpty('permissionKey', permissionKey)
    assertNonEmpty('branchId', branchId)

    return readBranchScopedPermission(
      client,
      userId,
      permissionKey,
      branchId,
    )
  }

  async requireWithinTransaction(
    client: AuthorizationQueryClient,
    userId: string,
    permissionKey: string,
    branchId: string,
  ): Promise<BranchScopedPermissionDecision> {
    const result = await this.evaluateWithinTransaction(
      client,
      userId,
      permissionKey,
      branchId,
    )

    if (!result.branchScope.allowed) {
      throw new BranchAccessDeniedError(branchId)
    }
    if (!result.permission.allowed) {
      throw new PermissionDeniedError(permissionKey)
    }

    return result
  }

  async evaluate(
    userId: string,
    permissionKey: string,
    branchId: string,
  ): Promise<BranchScopedPermissionDecision> {
    assertNonEmpty('userId', userId)
    assertNonEmpty('permissionKey', permissionKey)
    assertNonEmpty('branchId', branchId)

    return this.database.transaction((client) =>
      this.evaluateWithinTransaction(
        client,
        userId,
        permissionKey,
        branchId,
      ),
    )
  }

  async require(
    userId: string,
    permissionKey: string,
    branchId: string,
  ): Promise<BranchScopedPermissionDecision> {
    assertNonEmpty('userId', userId)
    assertNonEmpty('permissionKey', permissionKey)
    assertNonEmpty('branchId', branchId)

    return this.database.transaction((client) =>
      this.requireWithinTransaction(
        client,
        userId,
        permissionKey,
        branchId,
      ),
    )
  }
}
