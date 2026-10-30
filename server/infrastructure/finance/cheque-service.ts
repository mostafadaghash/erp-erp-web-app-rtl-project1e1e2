import { randomUUID } from 'node:crypto'
import type { PoolClient, QueryResultRow } from 'pg'

import {
  BranchScopedAuthorizationService,
  type AuthorizationQueryClient,
} from '../authorization/branch-scope-service.js'
import { AuditService } from '../audit/audit-service.js'
import type { TransactionOptions, TransactionWork } from '../database/transaction.js'
import {
  FinancialMovementService,
  type FinancialMovementAppendResult,
} from './financial-movement-service.js'
import {
  IdempotencyService,
  type IdempotencyExecution,
} from '../idempotency/idempotency-service.js'
import { TransactionalOutboxService } from '../outbox/transactional-outbox.js'
import { PostingBatchService } from '../posting/posting-batch-service.js'
import { TREASURY_PERMISSIONS } from './treasury-service.js'

const MONEY_FACTOR=10_000n
const MAX_SCALED=999_999_999_999_999_999n

export type ChequeDirection='RECEIVABLE'|'PAYABLE'
export type ChequeStatus='PENDING'|'CLEARED'|'BOUNCED'|'CANCELLED'
export type ChequeErrorReason=
  |'BRANCH_INACTIVE'
  |'COUNTERPARTY_NOT_FOUND'
  |'COUNTERPARTY_INACTIVE'
  |'COUNTERPARTY_ROLE_MISMATCH'
  |'CHEQUE_NOT_FOUND'
  |'CHEQUE_NOT_PENDING'
  |'TREASURY_INVALID'

export class ChequeError extends Error{
  readonly reason:ChequeErrorReason
  constructor(reason:ChequeErrorReason){super('Cheque operation rejected');this.name='ChequeError';this.reason=reason}
}

export interface ChequeTransactionRunner{transaction<T>(work:TransactionWork<T>,options?:TransactionOptions):Promise<T>}
export interface RegisterPendingChequeInput{
  idempotencyKey:string;idempotencyExpiresAt:Date;actorUserId:string;branchId:string;counterpartyId:string;
  direction:ChequeDirection;chequeNumber:string;bankName:string;amount:string;dueDate:string;
  sourceType:string;sourceId:string;notes?:string|null
}
export interface ClearChequeInput{
  idempotencyKey:string;idempotencyExpiresAt:Date;actorUserId:string;chequeId:string;treasuryId:string;occurredAt:Date
}
export interface TerminalChequeInput{
  idempotencyKey:string;idempotencyExpiresAt:Date;actorUserId:string;chequeId:string;reason?:string|null
}
export interface ChequeRecord{
  id:string;branchId:string;counterpartyId:string;direction:ChequeDirection;chequeNumber:string;bankName:string;
  amount:string;dueDate:string;status:ChequeStatus;sourceType:string;sourceId:string;settlementFinancialMovementId:string|null;
  notes:string|null;createdAt:Date
}
export interface ClearedCheque{cheque:ChequeRecord;financial:FinancialMovementAppendResult}

interface BranchRow extends QueryResultRow{company_id:string;is_active:boolean}
interface CounterpartyRow extends QueryResultRow{id:string;is_active:boolean;has_role:boolean}
interface ChequeRow extends QueryResultRow{
 id:string;branch_id:string;counterparty_id:string;direction:ChequeDirection;cheque_number:string;bank_name:string;
 amount:string;due_date:string;status:ChequeStatus;source_type:string;source_id:string;settlement_financial_movement_id:string|null;
 notes:string|null;created_at:Date
}
interface ChequeContextRow extends ChequeRow{company_id:string;branch_active:boolean}

function req(n:string,v:string){if(typeof v!=='string'||!v.trim())throw new TypeError(`${n} must be a non-empty string`);return v.trim()}
function validDate(n:string,v:Date){if(!(v instanceof Date)||!Number.isFinite(v.getTime()))throw new TypeError(`${n} must be a valid Date`)}
function money(v:string){req('amount',v);const m=/^(\d{1,14})(?:\.(\d{1,4}))?$/.exec(v.trim());if(!m)throw new TypeError('amount must be positive numeric(18,4)');const s=BigInt(m[1]??'0')*MONEY_FACTOR+BigInt((m[2]??'').padEnd(4,'0')||'0');if(s<=0n)throw new RangeError('amount must be greater than zero');if(s>MAX_SCALED)throw new RangeError('amount exceeds numeric(18,4)');return `${s/MONEY_FACTOR}.${(s%MONEY_FACTOR).toString().padStart(4,'0')}`}
function dueDate(v:string){const x=req('dueDate',v);if(!/^\d{4}-\d{2}-\d{2}$/.test(x))throw new TypeError('dueDate must be YYYY-MM-DD');const d=new Date(`${x}T00:00:00Z`);if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==x)throw new TypeError('dueDate must be a real calendar date');return x}
function opt(v:string|null|undefined){if(v==null)return null;const x=v.trim();return x||null}
function direction(v:string):ChequeDirection{if(v!=='RECEIVABLE'&&v!=='PAYABLE')throw new TypeError('direction must be RECEIVABLE or PAYABLE');return v}
function map(row:ChequeRow):ChequeRecord{return Object.freeze({id:row.id,branchId:row.branch_id,counterpartyId:row.counterparty_id,direction:row.direction,chequeNumber:row.cheque_number,bankName:row.bank_name,amount:row.amount,dueDate:row.due_date,status:row.status,sourceType:row.source_type,sourceId:row.source_id,settlementFinancialMovementId:row.settlement_financial_movement_id,notes:row.notes,createdAt:row.created_at})}

export class ChequeService{
 private readonly authorization:BranchScopedAuthorizationService
 private readonly idem:IdempotencyService
 private readonly financial:FinancialMovementService
 private readonly posting=new PostingBatchService()
 private readonly audit=new AuditService()
 private readonly outbox=new TransactionalOutboxService()
 constructor(private readonly db:ChequeTransactionRunner){this.authorization=new BranchScopedAuthorizationService(db);this.idem=new IdempotencyService(db);this.financial=new FinancialMovementService(db)}

 async registerPending(input:RegisterPendingChequeInput):Promise<IdempotencyExecution<ChequeRecord>>{
  req('idempotencyKey',input.idempotencyKey);validDate('idempotencyExpiresAt',input.idempotencyExpiresAt);req('actorUserId',input.actorUserId);req('branchId',input.branchId);req('counterpartyId',input.counterpartyId)
  const dir=direction(input.direction),amount=money(input.amount),due=dueDate(input.dueDate),chequeNumber=req('chequeNumber',input.chequeNumber),bankName=req('bankName',input.bankName),sourceType=req('sourceType',input.sourceType),sourceId=req('sourceId',input.sourceId),notes=opt(input.notes)
  const payload={branchId:input.branchId,counterpartyId:input.counterpartyId,direction:dir,chequeNumber,bankName,amount,dueDate:due,sourceType,sourceId,notes}
  return this.idem.execute({key:input.idempotencyKey,userId:input.actorUserId,operationType:'REGISTER_PENDING_CHEQUE',payload,expiresAt:input.idempotencyExpiresAt},async client=>{
   await this.authorization.requireWithinTransaction(client as AuthorizationQueryClient,input.actorUserId,TREASURY_PERMISSIONS.manage,input.branchId)
   const b=await client.query<BranchRow>('SELECT company_id,is_active FROM branches WHERE id=$1 FOR KEY SHARE',[input.branchId]);const branch=b.rows[0];if(!branch||!branch.is_active)throw new ChequeError('BRANCH_INACTIVE')
   const requiredRole=dir==='RECEIVABLE'?'CUSTOMER':'SUPPLIER'
   const cp=await client.query<CounterpartyRow>(`SELECT c.id,c.is_active,EXISTS(SELECT 1 FROM counterparty_roles cr WHERE cr.counterparty_id=c.id AND cr.role=$2) AS has_role FROM counterparties c WHERE c.id=$1 FOR KEY SHARE OF c`,[input.counterpartyId,requiredRole]);const counterparty=cp.rows[0]
   if(!counterparty)throw new ChequeError('COUNTERPARTY_NOT_FOUND');if(!counterparty.is_active)throw new ChequeError('COUNTERPARTY_INACTIVE');if(!counterparty.has_role)throw new ChequeError('COUNTERPARTY_ROLE_MISMATCH')
   const id=randomUUID(),r=await client.query<ChequeRow>(`INSERT INTO cheques(id,branch_id,counterparty_id,direction,cheque_number,bank_name,amount,due_date,status,source_type,source_id,settlement_financial_movement_id,notes,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'PENDING',$9,$10,NULL,$11,clock_timestamp()) RETURNING id,branch_id,counterparty_id,direction,cheque_number,bank_name,amount::text AS amount,due_date::text AS due_date,status,source_type,source_id,settlement_financial_movement_id,notes,created_at`,[id,input.branchId,input.counterpartyId,dir,chequeNumber,bankName,amount,due,sourceType,sourceId,notes]);const row=r.rows[0];if(!row)throw new Error('Cheque insert invariant failed');const cheque=map(row)
   await this.audit.record(client,{companyId:branch.company_id,branchId:input.branchId,userId:input.actorUserId,action:'CHEQUE_PENDING_REGISTERED',entityType:'CHEQUE',entityId:id,after:{direction:dir,amount,dueDate:due,counterpartyId:input.counterpartyId,sourceType,sourceId}})
   await this.outbox.enqueue(client,{eventType:'CHEQUE_PENDING_REGISTERED',aggregateType:'CHEQUE',aggregateId:id,payload:{branchId:input.branchId,direction:dir,amount,dueDate:due,counterpartyId:input.counterpartyId}})
   return {value:cheque,resultReference:id}
  })
 }

 async clear(input:ClearChequeInput):Promise<IdempotencyExecution<ClearedCheque>>{
  req('idempotencyKey',input.idempotencyKey);validDate('idempotencyExpiresAt',input.idempotencyExpiresAt);req('actorUserId',input.actorUserId);req('chequeId',input.chequeId);req('treasuryId',input.treasuryId);validDate('occurredAt',input.occurredAt)
  const payload={chequeId:input.chequeId,treasuryId:input.treasuryId,occurredAt:input.occurredAt.toISOString()}
  return this.idem.execute({key:input.idempotencyKey,userId:input.actorUserId,operationType:'CLEAR_CHEQUE',payload,expiresAt:input.idempotencyExpiresAt},async client=>{
   const current=await this.lockCheque(client,input.chequeId);if(current.status!=='PENDING')throw new ChequeError('CHEQUE_NOT_PENDING')
   await this.authorization.requireWithinTransaction(client as AuthorizationQueryClient,input.actorUserId,TREASURY_PERMISSIONS.manage,current.branch_id)
   if(!current.branch_active)throw new ChequeError('BRANCH_INACTIVE')
   const treasury=await client.query('SELECT id FROM treasuries WHERE id=$1 AND branch_id=$2 AND is_active=true FOR UPDATE',[input.treasuryId,current.branch_id]);if(!treasury.rows[0])throw new ChequeError('TREASURY_INVALID')
   const batch=await this.posting.create(client,{branchId:current.branch_id,sourceType:'CHEQUE',sourceId:current.id,operationType:'POST',documentVersion:1,createdBy:input.actorUserId})
   const financial=await this.financial.appendWithinTransaction(client,{actorUserId:input.actorUserId,postingBatchId:batch.id,treasuryId:input.treasuryId,direction:current.direction==='RECEIVABLE'?'IN':'OUT',amount:current.amount,occurredAt:input.occurredAt,counterpartyId:current.counterparty_id})
   const updated=await client.query<ChequeRow>(`UPDATE cheques SET status='CLEARED',settlement_financial_movement_id=$2 WHERE id=$1 RETURNING id,branch_id,counterparty_id,direction,cheque_number,bank_name,amount::text AS amount,due_date::text AS due_date,status,source_type,source_id,settlement_financial_movement_id,notes,created_at`,[current.id,financial.movement.id]);const row=updated.rows[0];if(!row)throw new Error('Cheque clear invariant failed');const cheque=map(row)
   await this.audit.record(client,{companyId:current.company_id,branchId:current.branch_id,userId:input.actorUserId,action:'CHEQUE_CLEARED',entityType:'CHEQUE',entityId:current.id,before:{status:'PENDING'},after:{status:'CLEARED',treasuryId:input.treasuryId,financialMovementId:financial.movement.id}})
   await this.outbox.enqueue(client,{eventType:'CHEQUE_CLEARED',aggregateType:'CHEQUE',aggregateId:current.id,payload:{branchId:current.branch_id,treasuryId:input.treasuryId,financialMovementId:financial.movement.id,direction:current.direction,amount:current.amount}})
   return {value:Object.freeze({cheque,financial}),resultReference:current.id}
  })
 }

 bounce(input:TerminalChequeInput){return this.terminal('BOUNCED',input)}
 cancel(input:TerminalChequeInput){return this.terminal('CANCELLED',input)}

 private async terminal(status:'BOUNCED'|'CANCELLED',input:TerminalChequeInput):Promise<IdempotencyExecution<ChequeRecord>>{
  req('idempotencyKey',input.idempotencyKey);validDate('idempotencyExpiresAt',input.idempotencyExpiresAt);req('actorUserId',input.actorUserId);req('chequeId',input.chequeId);const reason=opt(input.reason)
  return this.idem.execute({key:input.idempotencyKey,userId:input.actorUserId,operationType:`${status}_CHEQUE`,payload:{chequeId:input.chequeId,reason},expiresAt:input.idempotencyExpiresAt},async client=>{
   const current=await this.lockCheque(client,input.chequeId);if(current.status!=='PENDING')throw new ChequeError('CHEQUE_NOT_PENDING')
   await this.authorization.requireWithinTransaction(client as AuthorizationQueryClient,input.actorUserId,TREASURY_PERMISSIONS.manage,current.branch_id);if(!current.branch_active)throw new ChequeError('BRANCH_INACTIVE')
   const r=await client.query<ChequeRow>(`UPDATE cheques SET status=$2 WHERE id=$1 RETURNING id,branch_id,counterparty_id,direction,cheque_number,bank_name,amount::text AS amount,due_date::text AS due_date,status,source_type,source_id,settlement_financial_movement_id,notes,created_at`,[current.id,status]);const row=r.rows[0];if(!row)throw new Error('Cheque terminal transition invariant failed');const cheque=map(row)
   await this.audit.record(client,{companyId:current.company_id,branchId:current.branch_id,userId:input.actorUserId,action:`CHEQUE_${status}`,entityType:'CHEQUE',entityId:current.id,reason,before:{status:'PENDING'},after:{status}})
   await this.outbox.enqueue(client,{eventType:`CHEQUE_${status}`,aggregateType:'CHEQUE',aggregateId:current.id,payload:{branchId:current.branch_id,status,reason}})
   return {value:cheque,resultReference:current.id}
  })
 }

 private async lockCheque(client:PoolClient,id:string):Promise<ChequeContextRow>{
  const q=await client.query<ChequeContextRow>(`SELECT ch.id,ch.branch_id,ch.counterparty_id,ch.direction,ch.cheque_number,ch.bank_name,ch.amount::text AS amount,ch.due_date::text AS due_date,ch.status,ch.source_type,ch.source_id,ch.settlement_financial_movement_id,ch.notes,ch.created_at,b.company_id,b.is_active AS branch_active FROM cheques ch JOIN branches b ON b.id=ch.branch_id WHERE ch.id=$1 FOR UPDATE OF ch`,[id]);const row=q.rows[0];if(!row)throw new ChequeError('CHEQUE_NOT_FOUND');return row
 }
}
