import { randomUUID } from 'node:crypto'
import type { PoolClient, QueryResultRow } from 'pg'
import type { TransactionOptions, TransactionWork } from '../database/transaction.js'
import { BranchScopeService, type AuthorizationQueryClient } from '../authorization/branch-scope-service.js'
import { IdempotencyService, type IdempotencyExecution } from '../idempotency/idempotency-service.js'
import { DocumentSequenceService } from '../sequences/document-sequence-service.js'
import { PostingBatchService } from '../posting/posting-batch-service.js'
import { FinancialMovementService, type FinancialMovementAppendResult } from './financial-movement-service.js'
import { AuditService } from '../audit/audit-service.js'
import { TransactionalOutboxService } from '../outbox/transactional-outbox.js'

export type CashDocumentType='RECEIPT'|'DISBURSEMENT'
export interface CashDocumentTransactionRunner { transaction<T>(work:TransactionWork<T>,options?:TransactionOptions):Promise<T> }
export interface PostCashDocumentInput {
 idempotencyKey:string; idempotencyExpiresAt:Date; actorUserId:string; branchId:string; treasuryId:string;
 amount:string; occurredAt:Date; counterpartyId?:string|null; categoryId?:string|null; reference?:string|null; notes?:string|null
}
export interface CashDocumentRecord {
 id:string; type:CashDocumentType; branchId:string; documentNumber:string; treasuryId:string; counterpartyId:string|null;
 amount:string; categoryId:string|null; reference:string|null; notes:string|null; occurredAt:Date; postedAt:Date; createdBy:string
}
export interface PostedCashDocument {document:CashDocumentRecord; financial:FinancialMovementAppendResult}
interface BranchRow extends QueryResultRow {company_id:string;is_active:boolean}
interface DocRow extends QueryResultRow {id:string;branch_id:string;document_number:string;treasury_id:string;counterparty_id:string|null;amount:string;category_id:string|null;reference:string|null;notes:string|null;occurred_at:Date;posted_at:Date;created_by:string}

function req(n:string,v:string){if(typeof v!=='string'||!v.trim())throw new TypeError(`${n} must be a non-empty string`);return v.trim()}
function opt(n:string,v:string|null|undefined){if(v==null)return null;return req(n,v)}
function money(v:string){req('amount',v);const m=/^(\d{1,14})(?:\.(\d{1,4}))?$/.exec(v.trim());if(!m)throw new TypeError('amount must be positive numeric(18,4)');const s=BigInt(m[1])*10000n+BigInt((m[2]??'').padEnd(4,'0')||'0');if(s<=0n)throw new RangeError('amount must be greater than zero');return `${s/10000n}.${(s%10000n).toString().padStart(4,'0')}`}
function map(type:CashDocumentType,r:DocRow):CashDocumentRecord{return Object.freeze({id:r.id,type,branchId:r.branch_id,documentNumber:r.document_number,treasuryId:r.treasury_id,counterpartyId:r.counterparty_id,amount:r.amount,categoryId:r.category_id,reference:r.reference,notes:r.notes,occurredAt:r.occurred_at,postedAt:r.posted_at,createdBy:r.created_by})}

export class CashDocumentPostingService {
 private readonly scope:BranchScopeService; private readonly idem:IdempotencyService; private readonly seq=new DocumentSequenceService()
 private readonly posting=new PostingBatchService(); private readonly financial:FinancialMovementService; private readonly audit=new AuditService(); private readonly outbox=new TransactionalOutboxService()
 constructor(private readonly db:CashDocumentTransactionRunner){this.scope=new BranchScopeService(db);this.idem=new IdempotencyService(db);this.financial=new FinancialMovementService(db)}
 postReceipt(input:PostCashDocumentInput){return this.post('RECEIPT',input)}
 postDisbursement(input:PostCashDocumentInput){return this.post('DISBURSEMENT',input)}
 private async post(type:CashDocumentType,input:PostCashDocumentInput):Promise<IdempotencyExecution<PostedCashDocument>>{
  req('idempotencyKey',input.idempotencyKey);req('actorUserId',input.actorUserId);req('branchId',input.branchId);req('treasuryId',input.treasuryId)
  const amount=money(input.amount);if(!(input.occurredAt instanceof Date)||!Number.isFinite(input.occurredAt.getTime()))throw new TypeError('occurredAt must be a valid Date')
  const payload={type,branchId:input.branchId,treasuryId:input.treasuryId,amount,occurredAt:input.occurredAt.toISOString(),counterpartyId:input.counterpartyId??null,categoryId:input.categoryId??null,reference:opt('reference',input.reference),notes:opt('notes',input.notes)}
  return this.idem.execute({key:input.idempotencyKey,userId:input.actorUserId,operationType:`POST_${type}`,payload,expiresAt:input.idempotencyExpiresAt},async client=>{
   await this.scope.requireWithinTransaction(client as AuthorizationQueryClient,input.actorUserId,input.branchId)
   const br=await client.query<BranchRow>('SELECT company_id,is_active FROM branches WHERE id=$1 FOR KEY SHARE',[input.branchId]);const branch=br.rows[0];if(!branch||!branch.is_active)throw new Error('Cash document branch is missing or inactive')
   const id=randomUUID()
   // Treasury/position lock occurs before sequence allocation, preserving the approved lock order.
   const treasury=await client.query<{id:string}>('SELECT id FROM treasuries WHERE id=$1 AND branch_id=$2 AND is_active=true FOR UPDATE',[input.treasuryId,input.branchId]);if(!treasury.rows[0])throw new Error('Cash document Treasury is missing, inactive, or outside branch')
   await client.query(`INSERT INTO treasury_balance_positions(treasury_id,current_balance,version,updated_at) VALUES($1,0,0,clock_timestamp()) ON CONFLICT(treasury_id) DO NOTHING`,[input.treasuryId])
   await client.query('SELECT treasury_id FROM treasury_balance_positions WHERE treasury_id=$1 FOR UPDATE',[input.treasuryId])
   const number=await this.seq.allocate(client,{branchId:input.branchId,documentType:type})
   const table=type==='RECEIPT'?'receipts':'disbursements'
   const inserted=await client.query<DocRow>(`INSERT INTO ${table}(id,branch_id,document_number,treasury_id,counterparty_id,amount,category_id,reference,notes,occurred_at,posted_at,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,clock_timestamp(),$11)
    RETURNING id,branch_id,document_number::text AS document_number,treasury_id,counterparty_id,amount::text AS amount,category_id,reference,notes,occurred_at,posted_at,created_by`,
    [id,input.branchId,number.documentNumber.toString(),input.treasuryId,input.counterpartyId??null,amount,input.categoryId??null,payload.reference,payload.notes,input.occurredAt,input.actorUserId])
   const doc=map(type,inserted.rows[0]!)
   const batch=await this.posting.create(client,{branchId:input.branchId,sourceType:type,sourceId:id,operationType:'POST',documentVersion:1,createdBy:input.actorUserId})
   const financial=await this.financial.appendWithinTransaction(client,{actorUserId:input.actorUserId,postingBatchId:batch.id,treasuryId:input.treasuryId,direction:type==='RECEIPT'?'IN':'OUT',amount,occurredAt:input.occurredAt,counterpartyId:input.counterpartyId??null})
   await this.audit.record(client,{companyId:branch.company_id,branchId:input.branchId,userId:input.actorUserId,action:`${type}_POSTED`,entityType:type,entityId:id,after:{documentNumber:doc.documentNumber,amount,treasuryId:input.treasuryId,financialMovementId:financial.movement.id}})
   await this.outbox.enqueue(client,{eventType:`${type}_POSTED`,aggregateType:type,aggregateId:id,payload:{branchId:input.branchId,documentNumber:doc.documentNumber,financialMovementId:financial.movement.id}})
   return {value:Object.freeze({document:doc,financial}),resultReference:id}
  })
 }
}
