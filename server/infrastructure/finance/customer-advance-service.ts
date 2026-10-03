import { randomUUID } from 'node:crypto'
import type { PoolClient, QueryResultRow } from 'pg'

import { BranchScopedAuthorizationService, type AuthorizationQueryClient } from '../authorization/branch-scope-service.js'
import type { TransactionOptions, TransactionWork } from '../database/transaction.js'
import { CashDocumentPostingService, type PostedCashDocument } from './cash-document-posting-service.js'
import { TREASURY_PERMISSIONS } from './treasury-service.js'
import { IdempotencyService, type IdempotencyExecution } from '../idempotency/idempotency-service.js'
import { AuditService } from '../audit/audit-service.js'
import { TransactionalOutboxService } from '../outbox/transactional-outbox.js'

const MONEY_FACTOR=10_000n
const MAX_SCALED=999_999_999_999_999_999n

export type CustomerAdvanceErrorReason='SALES_ORDER_NOT_FOUND'|'SALES_ORDER_BRANCH_MISMATCH'|'ADVANCE_NOT_FOUND'|'SALES_INVOICE_CONTEXT_MISMATCH'|'APPLICATION_ALREADY_ACTIVE'|'APPLICATION_NOT_ACTIVE'|'INSUFFICIENT_ADVANCE_BALANCE'
export class CustomerAdvanceError extends Error {readonly reason:CustomerAdvanceErrorReason;constructor(reason:CustomerAdvanceErrorReason){super('Customer advance operation rejected');this.name='CustomerAdvanceError';this.reason=reason}}
export interface CustomerAdvanceTransactionRunner {transaction<T>(work:TransactionWork<T>,options?:TransactionOptions):Promise<T>}
export interface CreateCustomerAdvanceInput {idempotencyKey:string;idempotencyExpiresAt:Date;actorUserId:string;branchId:string;treasuryId:string;salesOrderId:string;amount:string;occurredAt:Date;reference?:string|null;notes?:string|null}
export interface ApplyCustomerAdvanceInput {idempotencyKey:string;idempotencyExpiresAt:Date;actorUserId:string;advanceId:string;salesInvoiceId:string;amount:string}
export interface ReverseCustomerAdvanceApplicationInput {idempotencyKey:string;idempotencyExpiresAt:Date;actorUserId:string;advanceId:string;salesInvoiceId:string}
export interface RebuildCustomerAdvanceProjectionInput {idempotencyKey:string;idempotencyExpiresAt:Date;actorUserId:string;advanceId:string}
export interface CustomerAdvanceRecord {id:string;counterpartyId:string;salesOrderId:string;receiptId:string;originalAmount:string;remainingAmountProjection:string;createdAt:Date}
export interface CustomerAdvanceApplicationRecord {id:string;advanceId:string;salesInvoiceId:string;amount:string;appliedAt:Date;operation:'APPLY'|'REVERSAL'}
export interface CreatedCustomerAdvance {advance:CustomerAdvanceRecord;receipt:PostedCashDocument}
export interface AppliedCustomerAdvance {advance:CustomerAdvanceRecord;application:CustomerAdvanceApplicationRecord}
export interface RebuiltCustomerAdvanceProjection {advance:CustomerAdvanceRecord;effectiveApplied:string}

interface SalesOrderRow extends QueryResultRow {id:string;branch_id:string;counterparty_id:string;company_id:string}
interface AdvanceContextRow extends QueryResultRow {id:string;counterparty_id:string;sales_order_id:string;receipt_id:string;original_amount:string;remaining_amount_projection:string;created_at:Date;branch_id:string;company_id:string}
interface InvoiceRow extends QueryResultRow {id:string;branch_id:string;counterparty_id:string|null;source_sales_order_id:string|null}
interface AdvanceRow extends QueryResultRow {id:string;counterparty_id:string;sales_order_id:string;receipt_id:string;original_amount:string;remaining_amount_projection:string;created_at:Date}
interface ApplicationRow extends QueryResultRow {id:string;advance_id:string;sales_invoice_id:string;amount:string;applied_at:Date}
interface PairStateRow extends QueryResultRow {history_count:number;latest_amount:string|null}

function req(n:string,v:string){if(typeof v!=='string'||!v.trim())throw new TypeError(`${n} must be a non-empty string`);return v.trim()}
function validDate(n:string,v:Date){if(!(v instanceof Date)||!Number.isFinite(v.getTime()))throw new TypeError(`${n} must be a valid Date`)}
function money(v:string){req('amount',v);const m=/^(\d{1,14})(?:\.(\d{1,4}))?$/.exec(v.trim());if(!m)throw new TypeError('amount must be positive numeric(18,4)');const value=BigInt(m[1]??'0')*MONEY_FACTOR+BigInt((m[2]??'').padEnd(4,'0')||'0');if(value<=0n)throw new RangeError('amount must be greater than zero');if(value>MAX_SCALED)throw new RangeError('amount exceeds numeric(18,4)');return {text:`${value/MONEY_FACTOR}.${(value%MONEY_FACTOR).toString().padStart(4,'0')}`,scaled:value}}
function scaled(v:string){const [w='0',f='']=v.split('.');return BigInt(w)*MONEY_FACTOR+BigInt(f.padEnd(4,'0').slice(0,4)||'0')}
function mapAdvance(r:AdvanceRow|AdvanceContextRow):CustomerAdvanceRecord{return Object.freeze({id:r.id,counterpartyId:r.counterparty_id,salesOrderId:r.sales_order_id,receiptId:r.receipt_id,originalAmount:r.original_amount,remainingAmountProjection:r.remaining_amount_projection,createdAt:r.created_at})}
function mapApplication(r:ApplicationRow,operation:'APPLY'|'REVERSAL'):CustomerAdvanceApplicationRecord{return Object.freeze({id:r.id,advanceId:r.advance_id,salesInvoiceId:r.sales_invoice_id,amount:r.amount,appliedAt:r.applied_at,operation})}

export class CustomerAdvanceService {
 private readonly authorization:BranchScopedAuthorizationService
 private readonly idem:IdempotencyService
 private readonly cash:CashDocumentPostingService
 private readonly audit=new AuditService()
 private readonly outbox=new TransactionalOutboxService()
 constructor(private readonly db:CustomerAdvanceTransactionRunner){this.authorization=new BranchScopedAuthorizationService(db);this.idem=new IdempotencyService(db);this.cash=new CashDocumentPostingService(db)}

 async create(input:CreateCustomerAdvanceInput):Promise<IdempotencyExecution<CreatedCustomerAdvance>>{
  req('idempotencyKey',input.idempotencyKey);req('actorUserId',input.actorUserId);req('branchId',input.branchId);req('treasuryId',input.treasuryId);req('salesOrderId',input.salesOrderId);validDate('idempotencyExpiresAt',input.idempotencyExpiresAt);validDate('occurredAt',input.occurredAt)
  const amount=money(input.amount),payload={branchId:input.branchId,treasuryId:input.treasuryId,salesOrderId:input.salesOrderId,amount:amount.text,occurredAt:input.occurredAt.toISOString(),reference:input.reference?.trim()||null,notes:input.notes?.trim()||null}
  return this.idem.execute({key:input.idempotencyKey,userId:input.actorUserId,operationType:'CREATE_CUSTOMER_ADVANCE',payload,expiresAt:input.idempotencyExpiresAt},async client=>{
   const q=await client.query<SalesOrderRow>('SELECT so.id,so.branch_id,so.counterparty_id,b.company_id FROM sales_orders so JOIN branches b ON b.id=so.branch_id WHERE so.id=$1 FOR UPDATE OF so',[input.salesOrderId]);const order=q.rows[0]
   if(!order)throw new CustomerAdvanceError('SALES_ORDER_NOT_FOUND');if(order.branch_id!==input.branchId)throw new CustomerAdvanceError('SALES_ORDER_BRANCH_MISMATCH')
   await this.authorization.requireWithinTransaction(client as AuthorizationQueryClient,input.actorUserId,TREASURY_PERMISSIONS.manage,input.branchId)
   const receipt=await this.cash.postReceiptWithinTransaction(client,{actorUserId:input.actorUserId,branchId:input.branchId,treasuryId:input.treasuryId,counterpartyId:order.counterparty_id,amount:amount.text,occurredAt:input.occurredAt,reference:input.reference??null,notes:input.notes??null})
   const id=randomUUID(),inserted=await client.query<AdvanceRow>('INSERT INTO customer_advances(id,counterparty_id,sales_order_id,receipt_id,original_amount,remaining_amount_projection,created_at) VALUES($1,$2,$3,$4,$5,$5,clock_timestamp()) RETURNING id,counterparty_id,sales_order_id,receipt_id,original_amount::text AS original_amount,remaining_amount_projection::text AS remaining_amount_projection,created_at',[id,order.counterparty_id,input.salesOrderId,receipt.document.id,amount.text])
   const row=inserted.rows[0];if(!row)throw new Error('Customer advance insert invariant failed');const advance=mapAdvance(row)
   await this.audit.record(client,{companyId:order.company_id,branchId:input.branchId,userId:input.actorUserId,action:'CUSTOMER_ADVANCE_RECEIVED',entityType:'CUSTOMER_ADVANCE',entityId:id,after:{salesOrderId:input.salesOrderId,receiptId:receipt.document.id,amount:amount.text,financialMovementId:receipt.financial.movement.id}})
   await this.outbox.enqueue(client,{eventType:'CUSTOMER_ADVANCE_RECEIVED',aggregateType:'CUSTOMER_ADVANCE',aggregateId:id,payload:{branchId:input.branchId,salesOrderId:input.salesOrderId,receiptId:receipt.document.id,amount:amount.text}})
   return {value:Object.freeze({advance,receipt}),resultReference:id}
  })
 }

 async apply(input:ApplyCustomerAdvanceInput):Promise<IdempotencyExecution<AppliedCustomerAdvance>>{
  req('idempotencyKey',input.idempotencyKey);req('actorUserId',input.actorUserId);req('advanceId',input.advanceId);req('salesInvoiceId',input.salesInvoiceId);validDate('idempotencyExpiresAt',input.idempotencyExpiresAt);const amount=money(input.amount)
  return this.idem.execute({key:input.idempotencyKey,userId:input.actorUserId,operationType:'APPLY_CUSTOMER_ADVANCE',payload:{advanceId:input.advanceId,salesInvoiceId:input.salesInvoiceId,amount:amount.text},expiresAt:input.idempotencyExpiresAt},async client=>{
   const context=await this.lockAdvance(client,input.advanceId);await this.authorization.requireWithinTransaction(client as AuthorizationQueryClient,input.actorUserId,TREASURY_PERMISSIONS.manage,context.branch_id);await this.requireInvoiceContext(client,context,input.salesInvoiceId)
   const pair=await this.pairState(client,input.advanceId,input.salesInvoiceId);if(pair.history_count%2===1)throw new CustomerAdvanceError('APPLICATION_ALREADY_ACTIVE')
   const used=await this.effectiveApplied(client,input.advanceId);if(amount.scaled>scaled(context.original_amount)-scaled(used))throw new CustomerAdvanceError('INSUFFICIENT_ADVANCE_BALANCE')
   const application=await this.insertApplication(client,input.advanceId,input.salesInvoiceId,amount.text,'APPLY'),advance=await this.readAdvance(client,input.advanceId)
   await this.audit.record(client,{companyId:context.company_id,branchId:context.branch_id,userId:input.actorUserId,action:'CUSTOMER_ADVANCE_APPLIED',entityType:'CUSTOMER_ADVANCE',entityId:input.advanceId,after:{salesInvoiceId:input.salesInvoiceId,applicationId:application.id,amount:amount.text,remainingAmountProjection:advance.remainingAmountProjection}})
   await this.outbox.enqueue(client,{eventType:'CUSTOMER_ADVANCE_APPLIED',aggregateType:'CUSTOMER_ADVANCE',aggregateId:input.advanceId,payload:{branchId:context.branch_id,salesInvoiceId:input.salesInvoiceId,applicationId:application.id,amount:amount.text}})
   return {value:Object.freeze({advance,application}),resultReference:application.id}
  })
 }

 async reverseApplication(input:ReverseCustomerAdvanceApplicationInput):Promise<IdempotencyExecution<AppliedCustomerAdvance>>{
  req('idempotencyKey',input.idempotencyKey);req('actorUserId',input.actorUserId);req('advanceId',input.advanceId);req('salesInvoiceId',input.salesInvoiceId);validDate('idempotencyExpiresAt',input.idempotencyExpiresAt)
  return this.idem.execute({key:input.idempotencyKey,userId:input.actorUserId,operationType:'REVERSE_CUSTOMER_ADVANCE_APPLICATION',payload:{advanceId:input.advanceId,salesInvoiceId:input.salesInvoiceId},expiresAt:input.idempotencyExpiresAt},async client=>{
   const context=await this.lockAdvance(client,input.advanceId);await this.authorization.requireWithinTransaction(client as AuthorizationQueryClient,input.actorUserId,TREASURY_PERMISSIONS.manage,context.branch_id);await this.requireInvoiceContext(client,context,input.salesInvoiceId)
   const pair=await this.pairState(client,input.advanceId,input.salesInvoiceId);if(pair.history_count===0||pair.history_count%2===0||!pair.latest_amount)throw new CustomerAdvanceError('APPLICATION_NOT_ACTIVE')
   const application=await this.insertApplication(client,input.advanceId,input.salesInvoiceId,pair.latest_amount,'REVERSAL'),advance=await this.readAdvance(client,input.advanceId)
   await this.audit.record(client,{companyId:context.company_id,branchId:context.branch_id,userId:input.actorUserId,action:'CUSTOMER_ADVANCE_APPLICATION_REVERSED',entityType:'CUSTOMER_ADVANCE',entityId:input.advanceId,after:{salesInvoiceId:input.salesInvoiceId,applicationId:application.id,amount:application.amount,remainingAmountProjection:advance.remainingAmountProjection}})
   await this.outbox.enqueue(client,{eventType:'CUSTOMER_ADVANCE_APPLICATION_REVERSED',aggregateType:'CUSTOMER_ADVANCE',aggregateId:input.advanceId,payload:{branchId:context.branch_id,salesInvoiceId:input.salesInvoiceId,applicationId:application.id,amount:application.amount}})
   return {value:Object.freeze({advance,application}),resultReference:application.id}
  })
 }

 async rebuildProjection(input:RebuildCustomerAdvanceProjectionInput):Promise<IdempotencyExecution<RebuiltCustomerAdvanceProjection>>{
  req('idempotencyKey',input.idempotencyKey);req('actorUserId',input.actorUserId);req('advanceId',input.advanceId);validDate('idempotencyExpiresAt',input.idempotencyExpiresAt)
  return this.idem.execute({key:input.idempotencyKey,userId:input.actorUserId,operationType:'REBUILD_CUSTOMER_ADVANCE_PROJECTION',payload:{advanceId:input.advanceId},expiresAt:input.idempotencyExpiresAt},async client=>{
   const context=await this.lockAdvance(client,input.advanceId);await this.authorization.requireWithinTransaction(client as AuthorizationQueryClient,input.actorUserId,TREASURY_PERMISSIONS.manage,context.branch_id)
   const used=await this.effectiveApplied(client,input.advanceId),expected=scaled(context.original_amount)-scaled(used),expectedText=`${expected/MONEY_FACTOR}.${(expected%MONEY_FACTOR).toString().padStart(4,'0')}`
   await client.query('UPDATE customer_advances SET remaining_amount_projection=$2 WHERE id=$1',[input.advanceId,expectedText]);const advance=await this.readAdvance(client,input.advanceId)
   await this.audit.record(client,{companyId:context.company_id,branchId:context.branch_id,userId:input.actorUserId,action:'CUSTOMER_ADVANCE_PROJECTION_REBUILT',entityType:'CUSTOMER_ADVANCE',entityId:input.advanceId,after:{effectiveApplied:used,remainingAmountProjection:advance.remainingAmountProjection}})
   await this.outbox.enqueue(client,{eventType:'CUSTOMER_ADVANCE_PROJECTION_REBUILT',aggregateType:'CUSTOMER_ADVANCE',aggregateId:input.advanceId,payload:{branchId:context.branch_id,effectiveApplied:used,remainingAmountProjection:advance.remainingAmountProjection}})
   return {value:Object.freeze({advance,effectiveApplied:used}),resultReference:input.advanceId}
  })
 }

 private async lockAdvance(client:PoolClient,advanceId:string){const r=await client.query<AdvanceContextRow>('SELECT ca.id,ca.counterparty_id,ca.sales_order_id,ca.receipt_id,ca.original_amount::text AS original_amount,ca.remaining_amount_projection::text AS remaining_amount_projection,ca.created_at,so.branch_id,b.company_id FROM customer_advances ca JOIN sales_orders so ON so.id=ca.sales_order_id JOIN branches b ON b.id=so.branch_id WHERE ca.id=$1 FOR UPDATE OF ca',[advanceId]);const row=r.rows[0];if(!row)throw new CustomerAdvanceError('ADVANCE_NOT_FOUND');return row}
 private async requireInvoiceContext(client:PoolClient,advance:AdvanceContextRow,salesInvoiceId:string){const r=await client.query<InvoiceRow>('SELECT id,branch_id,counterparty_id,source_sales_order_id FROM sales_invoices WHERE id=$1 FOR KEY SHARE',[salesInvoiceId]);const invoice=r.rows[0];if(!invoice||invoice.branch_id!==advance.branch_id||invoice.counterparty_id!==advance.counterparty_id||invoice.source_sales_order_id!==advance.sales_order_id)throw new CustomerAdvanceError('SALES_INVOICE_CONTEXT_MISMATCH')}
 private async pairState(client:PoolClient,advanceId:string,salesInvoiceId:string){const r=await client.query<PairStateRow>('SELECT count(*)::int AS history_count,(array_agg(amount ORDER BY applied_at DESC,id DESC))[1]::text AS latest_amount FROM advance_applications WHERE advance_id=$1 AND sales_invoice_id=$2',[advanceId,salesInvoiceId]);return r.rows[0]??{history_count:0,latest_amount:null}}
 private async effectiveApplied(client:PoolClient,advanceId:string){const r=await client.query<{amount:string}>('SELECT public.fn_customer_advance_effective_applied($1)::text AS amount',[advanceId]);return r.rows[0]?.amount??'0.0000'}
 private async insertApplication(client:PoolClient,advanceId:string,salesInvoiceId:string,amount:string,operation:'APPLY'|'REVERSAL'){const id=randomUUID(),r=await client.query<ApplicationRow>('INSERT INTO advance_applications(id,advance_id,sales_invoice_id,amount,applied_at) VALUES($1,$2,$3,$4,clock_timestamp()) RETURNING id,advance_id,sales_invoice_id,amount::text AS amount,applied_at',[id,advanceId,salesInvoiceId,amount]);const row=r.rows[0];if(!row)throw new Error('Customer advance application insert invariant failed');return mapApplication(row,operation)}
 private async readAdvance(client:PoolClient,advanceId:string){const r=await client.query<AdvanceRow>('SELECT id,counterparty_id,sales_order_id,receipt_id,original_amount::text AS original_amount,remaining_amount_projection::text AS remaining_amount_projection,created_at FROM customer_advances WHERE id=$1',[advanceId]);const row=r.rows[0];if(!row)throw new CustomerAdvanceError('ADVANCE_NOT_FOUND');return mapAdvance(row)}
}
