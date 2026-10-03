import { randomUUID } from 'node:crypto'
import type { PoolClient, QueryResultRow } from 'pg'

import {
  BranchScopedAuthorizationService,
  type AuthorizationQueryClient,
} from '../authorization/branch-scope-service.js'
import { AuditService } from '../audit/audit-service.js'
import type { TransactionOptions, TransactionWork } from '../database/transaction.js'
import {
  IdempotencyService,
  type IdempotencyExecution,
} from '../idempotency/idempotency-service.js'
import { TransactionalOutboxService } from '../outbox/transactional-outbox.js'
import {
  CashDocumentPostingService,
  type CashDocumentType,
  type PostedCashDocument,
} from './cash-document-posting-service.js'
import { TREASURY_PERMISSIONS } from './treasury-service.js'

const MONEY_FACTOR=10_000n
const MAX_SCALED=999_999_999_999_999_999n

export type InstallmentSourceType='SALES_INVOICE'|'PURCHASE_INVOICE'
export type InstallmentStatus='UPCOMING'|'DUE'|'PARTIAL'|'PAID'|'OVERDUE'

export type InstallmentErrorReason=
 |'SOURCE_TYPE_UNSUPPORTED'
 |'SOURCE_NOT_FOUND'
 |'SOURCE_INACTIVE_OR_SETTLED'
 |'SOURCE_COUNTERPARTY_MISMATCH'
 |'SOURCE_COUNTERPARTY_ROLE_MISMATCH'
 |'BRANCH_INACTIVE'
 |'SCHEDULE_TOTAL_MISMATCH'
 |'PLAN_ALREADY_EXISTS'
 |'PLAN_NOT_FOUND'
 |'INSTALLMENT_NOT_FOUND'
 |'MIXED_SETTLEMENT_CONTEXT'
 |'INSTALLMENT_OVER_ALLOCATION'

export class InstallmentError extends Error{
 readonly reason:InstallmentErrorReason
 constructor(reason:InstallmentErrorReason){super('Installment operation rejected');this.name='InstallmentError';this.reason=reason}
}

export interface InstallmentTransactionRunner{transaction<T>(work:TransactionWork<T>,options?:TransactionOptions):Promise<T>}
export interface InstallmentScheduleLineInput{dueDate:string;amount:string}
export interface CreateInstallmentPlanInput{
 idempotencyKey:string;idempotencyExpiresAt:Date;actorUserId:string;counterpartyId:string;
 sourceType:InstallmentSourceType;sourceId:string;installments:InstallmentScheduleLineInput[]
}
export interface SettleInstallmentsInput{
 idempotencyKey:string;idempotencyExpiresAt:Date;actorUserId:string;treasuryId:string;occurredAt:Date;
 allocations:{installmentId:string;amount:string}[]
}
export interface RebuildInstallmentPlanInput{
 idempotencyKey:string;idempotencyExpiresAt:Date;actorUserId:string;planId:string
}
export interface InstallmentPlanRecord{id:string;counterpartyId:string;sourceType:InstallmentSourceType;sourceId:string;totalAmount:string;createdAt:Date}
export interface InstallmentRecord{id:string;planId:string;dueDate:string;amount:string;paidAmountProjection:string;status:InstallmentStatus}
export interface CreatedInstallmentPlan{plan:InstallmentPlanRecord;installments:readonly InstallmentRecord[]}
export interface InstallmentAllocationRecord{id:string;financialSourceType:CashDocumentType;financialSourceId:string;installmentId:string;amount:string;createdAt:Date}
export interface SettledInstallments{cash:PostedCashDocument;allocations:readonly InstallmentAllocationRecord[];installments:readonly InstallmentRecord[]}
export interface RebuiltInstallmentPlan{planId:string;installments:readonly InstallmentRecord[]}

interface SourceRow extends QueryResultRow{
 branch_id:string;company_id:string;branch_active:boolean;timezone:string;counterparty_id:string|null;due_total:string;deleted_at:Date|null
}
interface CounterpartyRow extends QueryResultRow{is_active:boolean;has_role:boolean}
interface PlanRow extends QueryResultRow{id:string;counterparty_id:string;source_type:InstallmentSourceType;source_id:string;total_amount:string;created_at:Date}
interface InstallmentRow extends QueryResultRow{id:string;plan_id:string;due_date:string;amount:string;paid_amount_projection:string;status:InstallmentStatus}
interface LockedInstallmentRow extends InstallmentRow{counterparty_id:string;source_type:InstallmentSourceType;source_id:string}
interface PaidRow extends QueryResultRow{paid:string}
interface DateRow extends QueryResultRow{business_date:string}
interface AllocationRow extends QueryResultRow{id:string;financial_source_type:CashDocumentType;financial_source_id:string;target_id:string;amount:string;created_at:Date}

function req(n:string,v:string){if(typeof v!=='string'||!v.trim())throw new TypeError(`${n} must be a non-empty string`);return v.trim()}
function validDate(n:string,v:Date){if(!(v instanceof Date)||!Number.isFinite(v.getTime()))throw new TypeError(`${n} must be a valid Date`)}
function sourceType(v:string):InstallmentSourceType{if(v!=='SALES_INVOICE'&&v!=='PURCHASE_INVOICE')throw new TypeError('sourceType must be SALES_INVOICE or PURCHASE_INVOICE');return v}
function dueDate(v:string){const x=req('dueDate',v);if(!/^\d{4}-\d{2}-\d{2}$/.test(x))throw new TypeError('dueDate must be YYYY-MM-DD');const d=new Date(`${x}T00:00:00Z`);if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==x)throw new TypeError('dueDate must be a real calendar date');return x}
function scaled(v:string){req('amount',v);const m=/^(\d{1,14})(?:\.(\d{1,4}))?$/.exec(v.trim());if(!m)throw new TypeError('amount must be positive numeric(18,4)');const s=BigInt(m[1]??'0')*MONEY_FACTOR+BigInt((m[2]??'').padEnd(4,'0')||'0');if(s<=0n)throw new RangeError('amount must be greater than zero');if(s>MAX_SCALED)throw new RangeError('amount exceeds numeric(18,4)');return s}
function money(v:string){const s=scaled(v);return `${s/MONEY_FACTOR}.${(s%MONEY_FACTOR).toString().padStart(4,'0')}`}
function moneyFromScaled(s:bigint){return `${s/MONEY_FACTOR}.${(s%MONEY_FACTOR).toString().padStart(4,'0')}`}
function status(amount:string,paid:string,due:string,businessDate:string):InstallmentStatus{
 const a=scaled(amount),p=BigInt(paid.split('.')[0]??'0')*MONEY_FACTOR+BigInt((paid.split('.')[1]??'').padEnd(4,'0').slice(0,4)||'0')
 if(p>=a)return'PAID';if(businessDate>due)return'OVERDUE';if(p>0n)return'PARTIAL';if(businessDate===due)return'DUE';return'UPCOMING'
}
function mapPlan(r:PlanRow):InstallmentPlanRecord{return Object.freeze({id:r.id,counterpartyId:r.counterparty_id,sourceType:r.source_type,sourceId:r.source_id,totalAmount:r.total_amount,createdAt:r.created_at})}
function mapInstallment(r:InstallmentRow):InstallmentRecord{return Object.freeze({id:r.id,planId:r.plan_id,dueDate:r.due_date,amount:r.amount,paidAmountProjection:r.paid_amount_projection,status:r.status})}

interface SourceContext{branchId:string;companyId:string;timezone:string;counterpartyId:string;dueTotal:string;cashType:CashDocumentType;requiredRole:'CUSTOMER'|'SUPPLIER';branchActive:boolean}

export class InstallmentService{
 private readonly authorization:BranchScopedAuthorizationService
 private readonly idem:IdempotencyService
 private readonly cash:CashDocumentPostingService
 private readonly audit=new AuditService()
 private readonly outbox=new TransactionalOutboxService()
 constructor(private readonly db:InstallmentTransactionRunner){this.authorization=new BranchScopedAuthorizationService(db);this.idem=new IdempotencyService(db);this.cash=new CashDocumentPostingService(db)}

 async createPlan(input:CreateInstallmentPlanInput):Promise<IdempotencyExecution<CreatedInstallmentPlan>>{
  req('idempotencyKey',input.idempotencyKey);validDate('idempotencyExpiresAt',input.idempotencyExpiresAt);req('actorUserId',input.actorUserId);req('counterpartyId',input.counterpartyId);req('sourceId',input.sourceId)
  const st=sourceType(input.sourceType)
  if(!Array.isArray(input.installments)||input.installments.length===0)throw new TypeError('installments must contain at least one row')
  const rows=input.installments.map(x=>({dueDate:dueDate(x.dueDate),amount:money(x.amount)}))
  const total=rows.reduce((s,x)=>s+scaled(x.amount),0n)
  const payload={counterpartyId:input.counterpartyId,sourceType:st,sourceId:input.sourceId,installments:rows}
  return this.idem.execute({key:input.idempotencyKey,userId:input.actorUserId,operationType:'CREATE_INSTALLMENT_PLAN',payload,expiresAt:input.idempotencyExpiresAt},async client=>{
   const source=await this.resolveSource(client,st,input.sourceId,true)
   if(source.counterpartyId!==input.counterpartyId)throw new InstallmentError('SOURCE_COUNTERPARTY_MISMATCH')
   if(!source.branchActive)throw new InstallmentError('BRANCH_INACTIVE')
   await this.authorization.requireWithinTransaction(client as AuthorizationQueryClient,input.actorUserId,TREASURY_PERMISSIONS.manage,source.branchId)
   const cp=await client.query<CounterpartyRow>(`SELECT c.is_active,EXISTS(SELECT 1 FROM counterparty_roles cr WHERE cr.counterparty_id=c.id AND cr.role=$2) AS has_role FROM counterparties c WHERE c.id=$1 FOR KEY SHARE OF c`,[input.counterpartyId,source.requiredRole]);const counterparty=cp.rows[0]
   if(!counterparty||!counterparty.is_active)throw new InstallmentError('SOURCE_INACTIVE_OR_SETTLED')
   if(!counterparty.has_role)throw new InstallmentError('SOURCE_COUNTERPARTY_ROLE_MISMATCH')
   if(total!==scaled(source.dueTotal))throw new InstallmentError('SCHEDULE_TOTAL_MISMATCH')
   const existing=await client.query('SELECT id FROM installment_plans WHERE counterparty_id=$1 AND source_type=$2 AND source_id=$3',[input.counterpartyId,st,input.sourceId]);if(existing.rows[0])throw new InstallmentError('PLAN_ALREADY_EXISTS')
   const businessDate=await this.businessDate(client,source.timezone),planId=randomUUID()
   const p=await client.query<PlanRow>(`INSERT INTO installment_plans(id,counterparty_id,source_type,source_id,total_amount,created_at) VALUES($1,$2,$3,$4,$5,clock_timestamp()) RETURNING id,counterparty_id,source_type,source_id,total_amount::text AS total_amount,created_at`,[planId,input.counterpartyId,st,input.sourceId,moneyFromScaled(total)])
   const created:InstallmentRecord[]=[]
   for(const row of rows){
    const id=randomUUID(),projected=status(row.amount,'0.0000',row.dueDate,businessDate)
    const r=await client.query<InstallmentRow>(`INSERT INTO installments(id,plan_id,due_date,amount,paid_amount_projection,status) VALUES($1,$2,$3,$4,0,$5) RETURNING id,plan_id,due_date::text AS due_date,amount::text AS amount,paid_amount_projection::text AS paid_amount_projection,status`,[id,planId,row.dueDate,row.amount,projected]);created.push(mapInstallment(r.rows[0]!))
   }
   const plan=mapPlan(p.rows[0]!)
   await this.audit.record(client,{companyId:source.companyId,branchId:source.branchId,userId:input.actorUserId,action:'INSTALLMENT_PLAN_CREATED',entityType:'INSTALLMENT_PLAN',entityId:planId,after:{counterpartyId:input.counterpartyId,sourceType:st,sourceId:input.sourceId,totalAmount:plan.totalAmount,installmentCount:created.length}})
   await this.outbox.enqueue(client,{eventType:'INSTALLMENT_PLAN_CREATED',aggregateType:'INSTALLMENT_PLAN',aggregateId:planId,payload:{branchId:source.branchId,counterpartyId:input.counterpartyId,sourceType:st,sourceId:input.sourceId,totalAmount:plan.totalAmount,installmentCount:created.length}})
   return {value:Object.freeze({plan,installments:Object.freeze(created)}),resultReference:planId}
  })
 }

 async settle(input:SettleInstallmentsInput):Promise<IdempotencyExecution<SettledInstallments>>{
  req('idempotencyKey',input.idempotencyKey);validDate('idempotencyExpiresAt',input.idempotencyExpiresAt);req('actorUserId',input.actorUserId);req('treasuryId',input.treasuryId);validDate('occurredAt',input.occurredAt)
  if(!Array.isArray(input.allocations)||input.allocations.length===0)throw new TypeError('allocations must contain at least one row')
  const normalized=input.allocations.map(x=>({installmentId:req('installmentId',x.installmentId),amount:money(x.amount)})).sort((a,b)=>a.installmentId.localeCompare(b.installmentId))
  if(new Set(normalized.map(x=>x.installmentId)).size!==normalized.length)throw new TypeError('allocations must contain unique installmentId values')
  const payload={treasuryId:input.treasuryId,occurredAt:input.occurredAt.toISOString(),allocations:normalized}
  return this.idem.execute({key:input.idempotencyKey,userId:input.actorUserId,operationType:'SETTLE_INSTALLMENTS',payload,expiresAt:input.idempotencyExpiresAt},async client=>{
   const ids=normalized.map(x=>x.installmentId)
   const q=await client.query<LockedInstallmentRow>(`SELECT i.id,i.plan_id,i.due_date::text AS due_date,i.amount::text AS amount,i.paid_amount_projection::text AS paid_amount_projection,i.status,p.counterparty_id,p.source_type,p.source_id FROM installments i JOIN installment_plans p ON p.id=i.plan_id WHERE i.id=ANY($1::uuid[]) ORDER BY i.id FOR UPDATE OF i`,[ids])
   if(q.rows.length!==ids.length)throw new InstallmentError('INSTALLMENT_NOT_FOUND')
   const byId=new Map(q.rows.map(r=>[r.id,r]))
   let common:SourceContext|undefined,total=0n
   for(const request of normalized){
    const row=byId.get(request.installmentId);if(!row)throw new InstallmentError('INSTALLMENT_NOT_FOUND')
    const ctx=await this.resolveSource(client,row.source_type,row.source_id,false)
    if(ctx.counterpartyId!==row.counterparty_id)throw new InstallmentError('SOURCE_COUNTERPARTY_MISMATCH')
    if(!common)common=ctx
    else if(common.branchId!==ctx.branchId||common.counterpartyId!==ctx.counterpartyId||common.cashType!==ctx.cashType)throw new InstallmentError('MIXED_SETTLEMENT_CONTEXT')
    const paid=await this.effectivePaid(client,row.id),remaining=scaled(row.amount)-scaledAllowZero(paid),requested=scaled(request.amount)
    if(requested>remaining)throw new InstallmentError('INSTALLMENT_OVER_ALLOCATION')
    total+=requested
   }
   if(!common)throw new InstallmentError('INSTALLMENT_NOT_FOUND')
   if(!common.branchActive)throw new InstallmentError('BRANCH_INACTIVE')
   await this.authorization.requireWithinTransaction(client as AuthorizationQueryClient,input.actorUserId,TREASURY_PERMISSIONS.manage,common.branchId)
   const cashInput={actorUserId:input.actorUserId,branchId:common.branchId,treasuryId:input.treasuryId,amount:moneyFromScaled(total),occurredAt:input.occurredAt,counterpartyId:common.counterpartyId}
   const cash=common.cashType==='RECEIPT'?await this.cash.postReceiptWithinTransaction(client,cashInput):await this.cash.postDisbursementWithinTransaction(client,cashInput)
   const allocations:InstallmentAllocationRecord[]=[]
   for(const request of normalized){
    const id=randomUUID()
    const a=await client.query<AllocationRow>(`INSERT INTO financial_allocations(id,financial_source_type,financial_source_id,target_type,target_id,amount,created_at) VALUES($1,$2,$3,'INSTALLMENT',$4,$5,clock_timestamp()) RETURNING id,financial_source_type,financial_source_id,target_id,amount::text AS amount,created_at`,[id,cash.document.type,cash.document.id,request.installmentId,request.amount])
    const row=a.rows[0]!;allocations.push(Object.freeze({id:row.id,financialSourceType:row.financial_source_type,financialSourceId:row.financial_source_id,installmentId:row.target_id,amount:row.amount,createdAt:row.created_at}))
   }
   const refreshed=await client.query<InstallmentRow>(`SELECT id,plan_id,due_date::text AS due_date,amount::text AS amount,paid_amount_projection::text AS paid_amount_projection,status FROM installments WHERE id=ANY($1::uuid[]) ORDER BY id`,[ids])
   await this.audit.record(client,{companyId:common.companyId,branchId:common.branchId,userId:input.actorUserId,action:'INSTALLMENTS_SETTLED',entityType:'CASH_DOCUMENT',entityId:cash.document.id,after:{cashType:cash.document.type,counterpartyId:common.counterpartyId,totalAmount:cash.document.amount,allocations:allocations.map(x=>({installmentId:x.installmentId,amount:x.amount}))}})
   await this.outbox.enqueue(client,{eventType:'INSTALLMENTS_SETTLED',aggregateType:'CASH_DOCUMENT',aggregateId:cash.document.id,payload:{branchId:common.branchId,counterpartyId:common.counterpartyId,cashType:cash.document.type,totalAmount:cash.document.amount,installmentIds:ids}})
   return {value:Object.freeze({cash,allocations:Object.freeze(allocations),installments:Object.freeze(refreshed.rows.map(mapInstallment))}),resultReference:cash.document.id}
  })
 }

 async rebuildPlan(input:RebuildInstallmentPlanInput):Promise<IdempotencyExecution<RebuiltInstallmentPlan>>{
  req('idempotencyKey',input.idempotencyKey);validDate('idempotencyExpiresAt',input.idempotencyExpiresAt);req('actorUserId',input.actorUserId);req('planId',input.planId)
  return this.idem.execute({key:input.idempotencyKey,userId:input.actorUserId,operationType:'REBUILD_INSTALLMENT_PLAN',payload:{planId:input.planId},expiresAt:input.idempotencyExpiresAt},async client=>{
   const p=await client.query<PlanRow>('SELECT id,counterparty_id,source_type,source_id,total_amount::text AS total_amount,created_at FROM installment_plans WHERE id=$1',[input.planId]);const plan=p.rows[0];if(!plan)throw new InstallmentError('PLAN_NOT_FOUND')
   const source=await this.resolveSource(client,plan.source_type,plan.source_id,false)
   await this.authorization.requireWithinTransaction(client as AuthorizationQueryClient,input.actorUserId,TREASURY_PERMISSIONS.manage,source.branchId)
   const locked=await client.query<InstallmentRow>(`SELECT id,plan_id,due_date::text AS due_date,amount::text AS amount,paid_amount_projection::text AS paid_amount_projection,status FROM installments WHERE plan_id=$1 ORDER BY id FOR UPDATE`,[input.planId])
   const businessDate=await this.businessDate(client,source.timezone),rebuilt:InstallmentRecord[]=[]
   for(const row of locked.rows){
    const paid=await this.effectivePaid(client,row.id),projected=status(row.amount,paid,row.due_date,businessDate)
    const u=await client.query<InstallmentRow>(`UPDATE installments SET paid_amount_projection=$2,status=$3 WHERE id=$1 RETURNING id,plan_id,due_date::text AS due_date,amount::text AS amount,paid_amount_projection::text AS paid_amount_projection,status`,[row.id,paid,projected]);rebuilt.push(mapInstallment(u.rows[0]!))
   }
   await this.audit.record(client,{companyId:source.companyId,branchId:source.branchId,userId:input.actorUserId,action:'INSTALLMENT_PLAN_REBUILT',entityType:'INSTALLMENT_PLAN',entityId:input.planId,after:{installmentCount:rebuilt.length}})
   await this.outbox.enqueue(client,{eventType:'INSTALLMENT_PLAN_REBUILT',aggregateType:'INSTALLMENT_PLAN',aggregateId:input.planId,payload:{branchId:source.branchId,installmentCount:rebuilt.length}})
   return {value:Object.freeze({planId:input.planId,installments:Object.freeze(rebuilt)}),resultReference:input.planId}
  })
 }

 private async resolveSource(client:PoolClient,st:InstallmentSourceType,id:string,lock:boolean):Promise<SourceContext>{
  const table=st==='SALES_INVOICE'?'sales_invoices':'purchase_invoices',requiredRole=st==='SALES_INVOICE'?'CUSTOMER' as const:'SUPPLIER' as const,cashType=st==='SALES_INVOICE'?'RECEIPT' as const:'DISBURSEMENT' as const
  const suffix=lock?` FOR UPDATE OF src`:''
  const q=await client.query<SourceRow>(`SELECT src.branch_id,b.company_id,b.is_active AS branch_active,c.timezone,src.counterparty_id,src.due_total::text AS due_total,src.deleted_at FROM ${table} src JOIN branches b ON b.id=src.branch_id JOIN companies c ON c.id=b.company_id WHERE src.id=$1${suffix}`,[id]);const row=q.rows[0]
  if(!row)throw new InstallmentError('SOURCE_NOT_FOUND')
  if(row.deleted_at||!row.counterparty_id||scaledAllowZero(row.due_total)<=0n)throw new InstallmentError('SOURCE_INACTIVE_OR_SETTLED')
  return {branchId:row.branch_id,companyId:row.company_id,timezone:row.timezone,counterpartyId:row.counterparty_id,dueTotal:row.due_total,cashType,requiredRole,branchActive:row.branch_active}
 }
 private async businessDate(client:PoolClient,timezone:string){const q=await client.query<DateRow>('SELECT (CURRENT_TIMESTAMP AT TIME ZONE $1)::date::text AS business_date',[timezone]);return q.rows[0]!.business_date}
 private async effectivePaid(client:PoolClient,id:string){const q=await client.query<PaidRow>(`SELECT COALESCE(SUM(amount),0)::numeric(18,4)::text AS paid FROM financial_allocations WHERE target_type='INSTALLMENT' AND target_id=$1`,[id]);return q.rows[0]!.paid}
}

function scaledAllowZero(v:string){req('numeric amount',v);const m=/^(\d{1,14})(?:\.(\d{1,4}))?$/.exec(v.trim());if(!m)throw new TypeError('numeric amount is invalid');return BigInt(m[1]??'0')*MONEY_FACTOR+BigInt((m[2]??'').padEnd(4,'0')||'0')}
