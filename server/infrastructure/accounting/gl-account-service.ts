import { randomUUID } from 'node:crypto'
import type { PoolClient, QueryResultRow } from 'pg'
import { AuditService } from '../audit/audit-service.js'
import { PermissionDeniedError, resolveEffectivePermission } from '../authorization/effective-permission-service.js'
import type { TransactionOptions, TransactionWork } from '../database/transaction.js'
import { IdempotencyService } from '../idempotency/idempotency-service.js'

/** ADR-0029 / 09.08-A: Company Chart read + creation; no updates/mappings/UI/routes. */
export const GL_CHART_PERMISSIONS = Object.freeze({
  view: 'accounting.chart.view',
  manage: 'accounting.chart.manage',
} as const)
export type GLAccountErrorReason =
  | 'COMPANY_INACTIVE' | 'PARENT_NOT_FOUND' | 'PARENT_INACTIVE'
  | 'PARENT_COMPANY_MISMATCH' | 'CODE_CONFLICT' | 'CREATED_ACCOUNT_MISSING'
export class GLAccountError extends Error {
  readonly code = 'GL_ACCOUNT_OPERATION_REJECTED'
  constructor(readonly reason: GLAccountErrorReason) {
    super('Chart of Accounts operation rejected')
    this.name = 'GLAccountError'
  }
}
export interface GLAccountTransactionRunner {
  transaction<T>(work: TransactionWork<T>, options?: TransactionOptions): Promise<T>
}
export interface GLAccountRecord {
  id: string
  companyId: string
  code: string
  name: string
  accountType: string
  parentId: string | null
  isSystem: boolean
  isActive: boolean
}
export interface ListGLAccountsInput {
  actorUserId: string
  companyId: string
  includeInactive?: boolean
}
export interface CreateGLAccountInput {
  actorUserId: string
  companyId: string
  idempotencyKey: string
  code: string
  name: string
  accountType: string
  parentId?: string | null
  reason: string
}
export interface CreateGLAccountResult {
  account: GLAccountRecord
  replayed: boolean
}
interface AccountRow extends QueryResultRow {
  id: string; company_id: string; code: string; name: string
  account_type: string; parent_id: string | null
  is_system: boolean; is_active: boolean
}
interface AuthorizationRow extends QueryResultRow {
  user_active: boolean
  branch_scope_mode: string
  actor_company_id: string
  company_active: boolean
  permission_found: boolean
  role_default_allowed: boolean | null
  override_effect: 'ALLOW' | 'DENY' | null
}
interface ParentRow extends QueryResultRow {
  company_id: string; is_active: boolean
}
const CODE_PATTERN = /^[A-Z0-9._-]{1,64}$/
const CONTROL_PATTERN = /[\u0000-\u001F\u007F-\u009F]/
const REPLAY_TTL_MS = 24 * 60 * 60 * 1000

function id(name: string, value: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(name + ' is required')
  return value.trim()
}
function validatedName(value: string): string {
  if (typeof value !== 'string') throw new TypeError('Account name must be a string')
  const name=value.trim()
  if (!name || name.length > 200 || CONTROL_PATTERN.test(name)) {
    throw new TypeError('Account name must be 1 to 200 characters without controls')
  }
  return name
}
function validatedCode(value: string): string {
  if (typeof value !== 'string') throw new TypeError('Account code must be a string')
  const code=value.trim().toUpperCase()
  if (!CODE_PATTERN.test(code)) throw new TypeError('Account code must be 1 to 64 ASCII letters, digits, dots, underscores or dashes')
  return code
}
function validatedType(value: string): string {
  if (typeof value !== 'string') throw new TypeError('Account type must be a string')
  const type=value.trim()
  if (!type || type.length>64 || CONTROL_PATTERN.test(type)) {
    throw new TypeError('Account type must be 1 to 64 characters without controls')
  }
  return type
}
function validatedReason(value: string): string {
  if (typeof value !== 'string') throw new TypeError('Audit reason must be a string')
  const reason=value.trim()
  if (!reason || reason.length > 500 || CONTROL_PATTERN.test(reason)) {
    throw new TypeError('Audit reason must be 1 to 500 characters without controls')
  }
  return reason
}
function mapAccount(row: AccountRow): GLAccountRecord {
  return Object.freeze({
    id:row.id,companyId:row.company_id,code:row.code,
    name:row.name,accountType:row.account_type,parentId:row.parent_id,
    isSystem:row.is_system,isActive:row.is_active,
  })
}
function codeConflict(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return false
  const pg=error as { code?: unknown;constraint?: unknown }
  return pg.code==='23505' && pg.constraint==='uq_gl_accounts__company_code'
}
/** Company-wide permission AND ALL scope AND actor home Company must match. */
async function authorize(
  client: PoolClient,actorUserId: string,companyId: string,permission: string,
): Promise<void> {
  const result=await client.query<AuthorizationRow>(
    'SELECT u.is_active AS user_active,u.branch_scope_mode,'+
    'b.company_id AS actor_company_id,c.is_active AS company_active,'+
    '(p.id IS NOT NULL) AS permission_found,rp.is_allowed AS role_default_allowed,'+
    'upo.effect AS override_effect '+
    'FROM public.users u '+
    'JOIN public.branches b ON b.id=u.default_branch_id '+
    'JOIN public.companies c ON c.id=$2 '+
    'LEFT JOIN public.permissions p ON p.permission_key=$3 '+
    'LEFT JOIN public.role_permissions rp ON rp.role_id=u.role_id AND rp.permission_id=p.id '+
    'LEFT JOIN public.user_permission_overrides upo ON upo.user_id=u.id AND upo.permission_id=p.id '+
    'WHERE u.id=$1',
    [actorUserId,companyId,permission],
  )
  const actor=result.rows[0]
  if (!actor || !actor.user_active || actor.branch_scope_mode!=='ALL' ||
      actor.actor_company_id!==companyId || !actor.company_active ||
      !resolveEffectivePermission({
        permissionKey:permission,found:actor.permission_found,
        userActive:actor.user_active,roleDefaultAllowed:actor.role_default_allowed===true,
        overrideEffect:actor.override_effect,
      }).allowed) {
    throw new PermissionDeniedError(permission)
  }
}
async function getAccount(client:PoolClient,companyId:string,accountId:string):Promise<GLAccountRecord> {
  const r=await client.query<AccountRow>(
    'SELECT id,company_id,code,name,account_type,parent_id,is_system,is_active '+
    'FROM public.gl_accounts WHERE company_id=$1 AND id=$2',
    [companyId,accountId],
  )
  if(!r.rows[0])throw new GLAccountError('CREATED_ACCOUNT_MISSING')
  return mapAccount(r.rows[0])
}
export class GLAccountService {
  private readonly audit=new AuditService()
  constructor(private readonly database: GLAccountTransactionRunner) {}

  async list(input: ListGLAccountsInput): Promise<readonly GLAccountRecord[]> {
    const actor=id('actorUserId',input.actorUserId)
    const company=id('companyId',input.companyId)
    if(input.includeInactive!==undefined && typeof input.includeInactive!=='boolean') {
      throw new TypeError('includeInactive must be a boolean')
    }
    return this.database.transaction(async client=>{
      await authorize(client,actor,company,GL_CHART_PERMISSIONS.view)
      const result=await client.query<AccountRow>(
        'SELECT id,company_id,code,name,account_type,parent_id,is_system,is_active '+
        'FROM public.gl_accounts WHERE company_id=$1 AND ($2::boolean OR is_active) ORDER BY code,id',
        [company,input.includeInactive===true],
      )
      return Object.freeze(result.rows.map(mapAccount))
    })
  }

  async create(input: CreateGLAccountInput):Promise<CreateGLAccountResult> {
    const actor=id('actorUserId',input.actorUserId)
    const company=id('companyId',input.companyId)
    const key=id('idempotencyKey',input.idempotencyKey)
    if(key.length>128)throw new TypeError('Idempotency key cannot exceed 128 characters')
    const code=validatedCode(input.code)
    const name=validatedName(input.name)
    const accountType=validatedType(input.accountType)
    const reason=validatedReason(input.reason)
    const parent=input.parentId==null ? null : id('parentId',input.parentId)
    if ('isSystem' in input) {
      throw new TypeError('System accounts require a separate trusted setup operation')
    }
    // Authorization runs inside the transaction BEFORE both first-time writes
    // AND idempotency replays, preventing a revoked actor from replaying success.
    const authorizedRunner:GLAccountTransactionRunner = {
      transaction:(work,options)=>this.database.transaction(async client=>{
        await authorize(client,actor,company,GL_CHART_PERMISSIONS.manage)
        return work(client)
      },options),
    }
    const idempotency=new IdempotencyService(authorizedRunner)
    try {
      const execution=await idempotency.execute<GLAccountRecord>({
        key:'GL_ACCOUNT_CREATE:'+company+':'+key,
        userId:actor,
        operationType:'GL_ACCOUNT_CREATE',
        payload:{company,code,name,accountType,parent,reason},
        expiresAt:new Date(Date.now()+REPLAY_TTL_MS),
        transactionOptions:{context:{userId:actor}},
      },async client=>{
        // A Company row is the admin serialization root; no new index.
        const c=await client.query<{id:string;is_active:boolean}&QueryResultRow>(
          'SELECT id,is_active FROM public.companies WHERE id=$1 FOR UPDATE',
          [company],
        )
        if(!c.rows[0]?.is_active)throw new GLAccountError('COMPANY_INACTIVE')
        if(parent){
          const p=await client.query<ParentRow>(
            'SELECT company_id,is_active FROM public.gl_accounts WHERE id=$1 FOR UPDATE',
            [parent],
          )
          if(!p.rows[0])throw new GLAccountError('PARENT_NOT_FOUND')
          if(p.rows[0].company_id!==company)throw new GLAccountError('PARENT_COMPANY_MISMATCH')
          if(!p.rows[0].is_active)throw new GLAccountError('PARENT_INACTIVE')
        }
        const accountId=randomUUID()
        const result=await client.query<AccountRow>(
          'INSERT INTO public.gl_accounts '+
          '(id,company_id,code,name,account_type,parent_id,is_system,is_active) '+
          'VALUES ($1,$2,$3,$4,$5,$6,false,true) '+
          'RETURNING id,company_id,code,name,account_type,parent_id,is_system,is_active',
          [accountId,company,code,name,accountType,parent],
        )
        if(!result.rows[0])throw new Error('GL Account insert invariant failed')
        const record=mapAccount(result.rows[0])
        await this.audit.record(client,{
          companyId:company,userId:actor,action:'GL_ACCOUNT_CREATED',
          entityType:'GL_ACCOUNT',entityId:accountId,reason,
          after:{code,name,accountType,parentId:parent,isSystem:false,isActive:true},
        })
        return {value:record,resultReference:accountId}
      })
      if(execution.state==='EXECUTED'){
        return Object.freeze({account:execution.value,replayed:false})
      }
      if(execution.state==='REPLAYED' && execution.resultReference){
        const existing=await this.database.transaction(async client=>{
          await authorize(client,actor,company,GL_CHART_PERMISSIONS.manage)
          return getAccount(client,company,execution.resultReference!)
        })
        return Object.freeze({account:existing,replayed:true})
      }
      throw new Error('GL Account idempotency reference incomplete')
    }catch(error){
      if(codeConflict(error))throw new GLAccountError('CODE_CONFLICT')
      throw error
    }
  }
}
