import { randomUUID } from 'node:crypto'
import type { PoolClient, QueryResultRow } from 'pg'
import { BranchScopeService, type AuthorizationQueryClient } from '../authorization/branch-scope-service.js'
import type { TransactionOptions, TransactionWork } from '../database/transaction.js'

/** Internal only. The owning business command supplies the existing transaction and PostingBatch. */
export interface JournalTransactionRunner {
  transaction<T>(work: TransactionWork<T>, options?: TransactionOptions): Promise<T>
}
export type JournalErrorReason =
  | 'BATCH_NOT_FOUND' | 'ACTOR_MISMATCH' | 'BRANCH_INACTIVE'
  | 'OPERATION_MISMATCH' | 'LINES_REQUIRED' | 'UNBALANCED'
  | 'ACCOUNT_NOT_FOUND' | 'ACCOUNT_INACTIVE' | 'ACCOUNT_COMPANY_MISMATCH'
  | 'ACCOUNT_NOT_LEAF' | 'ORIGINAL_NOT_FOUND' | 'ORIGINAL_SCOPE_MISMATCH'
  | 'ORIGINAL_NOT_SEALED' | 'ORIGINAL_ALREADY_REVERSED'
  | 'SYSTEM_ROLE_UNSUPPORTED' | 'SYSTEM_SCOPE_MISMATCH'
  | 'SYSTEM_MAPPING_MISSING' | 'SYSTEM_MAPPING_INVALID'
export class JournalWriterError extends Error {
  readonly code = 'JOURNAL_OPERATION_REJECTED'
  constructor(readonly reason: JournalErrorReason) {
    super('Internal Journal operation rejected')
    this.name = 'JournalWriterError'
  }
}
export interface JournalLineDraft {
  glAccountId: string
  debit: string
  credit: string
  counterpartyId?: string | null
}
export interface PostJournalInput {
  actorUserId: string
  postingBatchId: string
  lines: readonly JournalLineDraft[]
  description?: string | null
}
export interface ReverseJournalInput {
  actorUserId: string
  postingBatchId: string
  originalEntryId: string
  description?: string | null
}
export interface JournalLineResult {
  id: string
  glAccountId: string
  debit: string
  credit: string
  counterpartyId: string | null
}
export interface JournalResult {
  id: string
  postingBatchId: string
  branchId: string
  sourceType: string
  sourceId: string
  postedAt: Date
  createdBy: string
  reversalOfEntryId: string | null
  lines: readonly JournalLineResult[]
}
export type SystemAccountScope = 'COMPANY' | 'TREASURY'
export interface ResolveSystemAccountInput {
  actorUserId: string
  postingBatchId: string
  roleKey: string
  scopeType: SystemAccountScope
  scopeId: string
}
// The ADR-0027 foundation vocabulary is deliberately NOT the 09.09 role catalogue.
const SYSTEM_ROLES: Readonly<Record<string, SystemAccountScope>> = Object.freeze({
  TREASURY_ASSET: 'TREASURY',
  CUSTOMER_RECEIVABLE_CONTROL: 'COMPANY',
  SUPPLIER_PAYABLE_CONTROL: 'COMPANY',
  CUSTOMER_ADVANCES_LIABILITY: 'COMPANY',
  CHEQUES_RECEIVABLE_CONTROL: 'COMPANY',
  CHEQUES_PAYABLE_CONTROL: 'COMPANY',
})
interface PostingContextRow extends QueryResultRow {
  id: string; branch_id: string; source_type: string; source_id: string
  operation_type: string; reverses_posting_batch_id: string | null
  created_by: string; posted_at: Date; company_id: string; branch_active: boolean
}
interface AccountRow extends QueryResultRow {
  id: string; company_id: string; is_active: boolean; has_children: boolean
}
interface OriginalRow extends QueryResultRow {
  id: string; branch_id: string; source_type: string; source_id: string
  posting_batch_id: string; reversal_of_entry_id: string | null; later_than_original: boolean
}
interface OriginalLineRow extends QueryResultRow {
  gl_account_id: string; debit: string; credit: string; counterparty_id: string | null
}
interface TreasuryScopeRow extends QueryResultRow {
  company_id: string; is_active: boolean; branch_active: boolean
}
interface MappingRow extends QueryResultRow { gl_account_id: string }

const FACTOR = 10000n
const MONEY_PATTERN = /^(0|[1-9]\d{0,13})(?:\.(\d{1,4}))?$/
function requireId(name: string, value: string): void {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(name + ' must be a nonempty identifier')
  }
}
function parseMoney(value: string): {scaled: bigint; text: string} {
  if (typeof value !== 'string') throw new TypeError('amount must be numeric(18,4) decimal text')
  const match = MONEY_PATTERN.exec(value)
  if (!match) throw new TypeError('amount must be numeric(18,4) decimal text')
  const scaled = BigInt(match[1]!) * FACTOR + BigInt((match[2] ?? '').padEnd(4,'0') || '0')
  return {
    scaled,
    text: String(scaled / FACTOR) + '.' + String(scaled % FACTOR).padStart(4,'0'),
  }
}
function normalizeLines(lines: readonly JournalLineDraft[]): readonly JournalLineDraft[] {
  if (!Array.isArray(lines) || lines.length===0) throw new JournalWriterError('LINES_REQUIRED')
  let debits=0n, credits=0n
  const clean=lines.map(line => {
    if (!line || typeof line !== 'object') throw new TypeError('Journal line must be an object')
    requireId('glAccountId',line.glAccountId)
    if (line.counterpartyId != null) requireId('counterpartyId',line.counterpartyId)
    const d=parseMoney(line.debit), c=parseMoney(line.credit)
    if (d.scaled>0n && c.scaled>0n) throw new TypeError('both debit and credit positive')
    debits += d.scaled
    credits += c.scaled
    return Object.freeze({
      glAccountId:line.glAccountId,debit:d.text,credit:c.text,
      counterpartyId:line.counterpartyId ?? null,
    })
  })
  if (debits !== credits) throw new JournalWriterError('UNBALANCED')
  return Object.freeze(clean)
}
function descriptionValue(v: string | null | undefined): string | null {
  if (v == null) return null
  if (typeof v !== 'string') throw new TypeError('description must be text')
  return v.trim() || null
}
async function requireContext(
  client: PoolClient, scope: BranchScopeService, actorUserId: string, batchId: string,
): Promise<PostingContextRow> {
  requireId('actorUserId',actorUserId);requireId('postingBatchId',batchId)
  const result=await client.query<PostingContextRow>(
    'SELECT pb.id,pb.branch_id,pb.source_type,pb.source_id,pb.operation_type,'+
    'pb.reverses_posting_batch_id,pb.created_by,pb.posted_at,'+
    'b.company_id,b.is_active AS branch_active '+
    'FROM public.posting_batches pb JOIN public.branches b ON b.id=pb.branch_id '+
    'WHERE pb.id=$1 FOR SHARE OF pb,b', [batchId],
  )
  const batch=result.rows[0]
  if (!batch) throw new JournalWriterError('BATCH_NOT_FOUND')
  if (batch.created_by !== actorUserId) throw new JournalWriterError('ACTOR_MISMATCH')
  await scope.requireWithinTransaction(client as AuthorizationQueryClient,actorUserId,batch.branch_id)
  if (!batch.branch_active) throw new JournalWriterError('BRANCH_INACTIVE')
  return batch
}
async function requireAccounts(client: PoolClient, companyId: string, ids: readonly string[]): Promise<void> {
  // Stable metadata lock order, FOR SHARE blocks non-key GL changes.
  for (const id of [...new Set(ids)].sort()) {
    const result=await client.query<AccountRow>(
      'SELECT g.id,g.company_id,g.is_active,'+
      'EXISTS(SELECT 1 FROM public.gl_accounts child WHERE child.parent_id=g.id) AS has_children '+
      'FROM public.gl_accounts g WHERE g.id=$1 FOR SHARE', [id],
    )
    const account=result.rows[0]
    if (!account) throw new JournalWriterError('ACCOUNT_NOT_FOUND')
    if (account.company_id!==companyId) throw new JournalWriterError('ACCOUNT_COMPANY_MISMATCH')
    if (!account.is_active) throw new JournalWriterError('ACCOUNT_INACTIVE')
    if (account.has_children) throw new JournalWriterError('ACCOUNT_NOT_LEAF')
  }
}
async function persist(
  client: PoolClient, batch: PostingContextRow, lines: readonly JournalLineDraft[],
  description: string | null, original: string | null,
): Promise<JournalResult> {
  const id=randomUUID()
  await client.query(
    'INSERT INTO public.journal_entries '+
    '(id,branch_id,source_type,source_id,posting_batch_id,reversal_of_entry_id,posted_at,created_by,description) '+
    'SELECT $1,pb.branch_id,pb.source_type,pb.source_id,pb.id,$2,pb.posted_at,pb.created_by,$3 '+
    'FROM public.posting_batches pb WHERE pb.id=$4',
    [id,original,description,batch.id],
  )
  const stored: JournalLineResult[]=[]
  for (const line of lines) {
    const lineId=randomUUID()
    await client.query(
      'INSERT INTO public.journal_lines '+
      '(id,journal_entry_id,gl_account_id,debit,credit,counterparty_id) '+
      'VALUES ($1,$2,$3,$4::numeric(18,4),$5::numeric(18,4),$6)',
      [lineId,id,line.glAccountId,line.debit,line.credit,line.counterpartyId ?? null],
    )
    stored.push(Object.freeze({
      id:lineId,glAccountId:line.glAccountId,debit:line.debit,
      credit:line.credit,counterpartyId:line.counterpartyId ?? null,
    }))
  }
  return Object.freeze({
    id,postingBatchId:batch.id,branchId:batch.branch_id,
    sourceType:batch.source_type,sourceId:batch.source_id,
    postedAt:batch.posted_at,createdBy:batch.created_by,reversalOfEntryId:original,
    lines:Object.freeze(stored),
  })
}
export class JournalWriterService {
  private readonly scope: BranchScopeService
  constructor(database: JournalTransactionRunner) {this.scope=new BranchScopeService(database)}
  async postWithinTransaction(client: PoolClient,input: PostJournalInput): Promise<JournalResult> {
    const lines=normalizeLines(input.lines) // before any SQL
    const description=descriptionValue(input.description)
    const batch=await requireContext(client,this.scope,input.actorUserId,input.postingBatchId)
    if (batch.operation_type!=='POST' && batch.operation_type!=='CORRECTION') {
      throw new JournalWriterError('OPERATION_MISMATCH')
    }
    await requireAccounts(client,batch.company_id,lines.map(l=>l.glAccountId))
    return persist(client,batch,lines,description,null)
  }
  async reverseWithinTransaction(client: PoolClient,input: ReverseJournalInput): Promise<JournalResult> {
    requireId('originalEntryId',input.originalEntryId)
    const description=descriptionValue(input.description)
    const batch=await requireContext(client,this.scope,input.actorUserId,input.postingBatchId)
    if (batch.operation_type!=='REVERSAL' && batch.operation_type!=='DELETE_REVERSAL') {
      throw new JournalWriterError('OPERATION_MISMATCH')
    }
    // Original lock serializes two independent reversers in READ COMMITTED.
    const originalResult=await client.query<OriginalRow>(
      'SELECT e.id,e.branch_id,e.source_type,e.source_id,e.posting_batch_id,'+
      'e.reversal_of_entry_id,(pb.posted_at>e.posted_at) AS later_than_original '+
      'FROM public.journal_entries e JOIN public.posting_batches pb ON pb.id=$2 '+
      'WHERE e.id=$1 FOR UPDATE OF e',[input.originalEntryId,batch.id],
    )
    const original=originalResult.rows[0]
    if (!original) throw new JournalWriterError('ORIGINAL_NOT_FOUND')
    if (original.reversal_of_entry_id!==null ||
        original.branch_id!==batch.branch_id ||
        original.source_type!==batch.source_type ||
        original.source_id!==batch.source_id ||
        original.posting_batch_id!==batch.reverses_posting_batch_id ||
        !original.later_than_original) {
      throw new JournalWriterError('ORIGINAL_SCOPE_MISMATCH')
    }
    const checks=await client.query<{sealed:boolean;reversed:boolean}&QueryResultRow>(
      'SELECT EXISTS(SELECT 1 FROM public.journal_entry_seals WHERE entry_id=$1) AS sealed,'+
      'EXISTS(SELECT 1 FROM public.journal_entries WHERE reversal_of_entry_id=$1) AS reversed',
      [original.id],
    )
    if (!checks.rows[0]?.sealed) throw new JournalWriterError('ORIGINAL_NOT_SEALED')
    if (checks.rows[0]?.reversed) throw new JournalWriterError('ORIGINAL_ALREADY_REVERSED')
    const originalLines=await client.query<OriginalLineRow>(
      'SELECT gl_account_id,debit::text AS debit,credit::text AS credit,counterparty_id '+
      'FROM public.journal_lines WHERE journal_entry_id=$1 ORDER BY id',[original.id],
    )
    const lines=normalizeLines(originalLines.rows.map(l=>({
      glAccountId:l.gl_account_id,debit:l.credit,credit:l.debit,counterpartyId:l.counterparty_id,
    })))
    await requireAccounts(client,batch.company_id,lines.map(l=>l.glAccountId))
    return persist(client,batch,lines,description,original.id)
  }
}
/** ADR-0027 internal mapping resolver. Role choice belongs to trusted future posting adapters. */
export class SystemAccountResolver {
  private readonly scope: BranchScopeService
  constructor(database: JournalTransactionRunner) {this.scope=new BranchScopeService(database)}
  async resolveWithinTransaction(client: PoolClient,input: ResolveSystemAccountInput): Promise<string> {
    requireId('scopeId',input.scopeId)
    if (SYSTEM_ROLES[input.roleKey]!==input.scopeType) {
      throw new JournalWriterError('SYSTEM_ROLE_UNSUPPORTED')
    }
    const batch=await requireContext(client,this.scope,input.actorUserId,input.postingBatchId)
    if (input.scopeType==='COMPANY') {
      if (input.scopeId!==batch.company_id) throw new JournalWriterError('SYSTEM_SCOPE_MISMATCH')
    } else {
      const t=await client.query<TreasuryScopeRow>(
        'SELECT b.company_id,t.is_active,b.is_active AS branch_active '+
        'FROM public.treasuries t JOIN public.branches b ON b.id=t.branch_id '+
        'WHERE t.id=$1 FOR SHARE OF t,b',[input.scopeId],
      )
      if (!t.rows[0]?.is_active || !t.rows[0].branch_active ||
          t.rows[0].company_id!==batch.company_id) {
        throw new JournalWriterError('SYSTEM_SCOPE_MISMATCH')
      }
    }
    const result=await client.query<MappingRow>(
      'SELECT gl_account_id FROM public.system_account_mappings '+
      'WHERE company_id=$1 AND scope_type=$2 AND scope_id=$3 AND role_key=$4 FOR SHARE',
      [batch.company_id,input.scopeType,input.scopeId,input.roleKey],
    )
    const accountId=result.rows[0]?.gl_account_id
    if (!accountId) throw new JournalWriterError('SYSTEM_MAPPING_MISSING')
    try {await requireAccounts(client,batch.company_id,[accountId])}
    catch(error) {
      if (error instanceof JournalWriterError) throw new JournalWriterError('SYSTEM_MAPPING_INVALID')
      throw error
    }
    return accountId
  }
}
