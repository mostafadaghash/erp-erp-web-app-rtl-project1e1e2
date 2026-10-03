import { randomUUID } from 'node:crypto'
import type { PoolClient, QueryResultRow } from 'pg'

import { AuditService } from '../audit/audit-service.js'
import { BranchScopeService, type AuthorizationQueryClient } from '../authorization/branch-scope-service.js'
import type { TransactionOptions, TransactionWork } from '../database/transaction.js'
import { IdempotencyService, type IdempotencyExecution } from '../idempotency/idempotency-service.js'
import { TransactionalOutboxService } from '../outbox/transactional-outbox.js'
import { PostingBatchService } from '../posting/posting-batch-service.js'
import { DocumentSequenceService } from '../sequences/document-sequence-service.js'
import { BatchInventoryService, type BatchReceiptAllocationInput } from './batch-inventory-service.js'
import { InventoryCostService } from './inventory-cost-service.js'
import { InventoryLedgerService } from './inventory-ledger-service.js'
import { SerialInventoryService } from './serial-inventory-service.js'

const Q=1_000_000n
const M=10_000n
const DAY=24*60*60*1000
export const INVENTORY_ADJUSTMENT_REASONS=Object.freeze([
  'STOCKTAKE_SHORTAGE','STOCKTAKE_OVERAGE','DAMAGE','INTERNAL_USE','OTHER',
] as const)
export type InventoryAdjustmentReason=(typeof INVENTORY_ADJUSTMENT_REASONS)[number]
export type InventoryAdjustmentErrorReason=
  | 'WAREHOUSE_NOT_FOUND'|'WAREHOUSE_INACTIVE'|'NO_LINES'|'DUPLICATE_VARIANT'
  | 'OTHER_NOTE_REQUIRED'|'ZERO_DIFFERENCE'|'NEGATIVE_STOCK_PERMISSION_REQUIRED'
  | 'MANUAL_COST_PERMISSION_REQUIRED'|'OVERAGE_COST_REQUIRED'

export class InventoryAdjustmentError extends Error {
  readonly reason: InventoryAdjustmentErrorReason
  constructor(reason: InventoryAdjustmentErrorReason){
    super('Inventory adjustment operation rejected')
    this.name='InventoryAdjustmentError'; this.reason=reason
  }
}
export interface InventoryAdjustmentTransactionRunner {
  transaction<T>(work:TransactionWork<T>,options?:TransactionOptions):Promise<T>
}
export interface InventoryAdjustmentLineInput {
  variantId:string
  quantityDifference:string
  manualUnitCost?:string|null
  serialNumbers?:readonly string[]
  batches?:readonly BatchReceiptAllocationInput[]
}
export interface CreateInventoryAdjustmentInput {
  actorUserId:string
  idempotencyKey:string
  warehouseId:string
  reasonCode:InventoryAdjustmentReason
  notes?:string|null
  lines:readonly InventoryAdjustmentLineInput[]
}
export interface InventoryAdjustmentRecord {
  id:string; branchId:string; documentNumber:bigint; warehouseId:string
  reasonCode:InventoryAdjustmentReason; notes:string|null; postedAt:Date
  reservationShortfallCount:number
}
interface D6{normalized:string;scaled:bigint}
function nonblank(n:string,v:string){if(typeof v!=='string'||!v.trim())throw new TypeError(`${n} must be non-empty`);return v.trim()}
function d6(n:string,v:string):D6{
  nonblank(n,v); const m=/^(-?)(\d{1,12})(?:\.(\d{1,6}))?$/.exec(v.trim())
  if(!m)throw new TypeError(`${n} must be numeric(18,6)`)
  const a=BigInt(m[2]??'0')*Q+BigInt((m[3]??'').padEnd(6,'0')||'0')
  const scaled=m[1]==='-'?-a:a
  return {scaled,normalized:fmt(scaled,6)}
}
function money(v:string){const m=/^(\d{1,14})(?:\.(\d{1,4}))?$/.exec(v);if(!m)throw new TypeError('cost must be numeric(18,4)');return BigInt(m[1]??'0')*M+BigInt((m[2]??'').padEnd(4,'0')||'0')}
function fmt(v:bigint,s:number){const f=10n**BigInt(s),neg=v<0n,a=neg?-v:v;return `${neg?'-':''}${a/f}.${(a%f).toString().padStart(s,'0')}`}
function total(q:bigint,c:string){return fmt((q*money(c)+Q/2n)/Q,4)}
async function allowed(client:PoolClient,userId:string,key:string){
  const r=await client.query<{allowed:boolean}&QueryResultRow>(
    `SELECT CASE WHEN upo.effect='ALLOW' THEN true
                 WHEN upo.effect='DENY' THEN false
                 ELSE COALESCE(rp.is_allowed,false) END AS allowed
       FROM users u JOIN permissions p ON p.permission_key=$2
       LEFT JOIN role_permissions rp ON rp.role_id=u.role_id AND rp.permission_id=p.id
       LEFT JOIN user_permission_overrides upo ON upo.user_id=u.id AND upo.permission_id=p.id
      WHERE u.id=$1 AND u.is_active=true`,[userId,key])
  return r.rows[0]?.allowed===true
}
export class InventoryAdjustmentService {
  private readonly scope:BranchScopeService
  private readonly costs:InventoryCostService
  private readonly ledger:InventoryLedgerService
  private readonly serials:SerialInventoryService
  private readonly batches:BatchInventoryService
  private readonly posting=new PostingBatchService()
  private readonly seq=new DocumentSequenceService()
  private readonly audit=new AuditService()
  private readonly outbox=new TransactionalOutboxService()
  private readonly idempotency:IdempotencyService
  constructor(private readonly database:InventoryAdjustmentTransactionRunner){
    this.scope=new BranchScopeService(database);this.costs=new InventoryCostService(database)
    this.ledger=new InventoryLedgerService(database);this.serials=new SerialInventoryService(database)
    this.batches=new BatchInventoryService(database);this.idempotency=new IdempotencyService(database)
  }
  async create(input:CreateInventoryAdjustmentInput):Promise<IdempotencyExecution<InventoryAdjustmentRecord>>{
    const actor=nonblank('actorUserId',input.actorUserId),key=nonblank('idempotencyKey',input.idempotencyKey)
    const warehouseId=nonblank('warehouseId',input.warehouseId),notes=input.notes?.trim()||null
    if(!INVENTORY_ADJUSTMENT_REASONS.includes(input.reasonCode))throw new TypeError('reasonCode is invalid')
    if(input.reasonCode==='OTHER'&&!notes)throw new InventoryAdjustmentError('OTHER_NOTE_REQUIRED')
    if(input.lines.length===0)throw new InventoryAdjustmentError('NO_LINES')
    const seen=new Set<string>()
    const lines=input.lines.map(l=>{
      const variantId=nonblank('variantId',l.variantId),diff=d6('quantityDifference',l.quantityDifference)
      if(diff.scaled===0n)throw new InventoryAdjustmentError('ZERO_DIFFERENCE')
      if(seen.has(variantId))throw new InventoryAdjustmentError('DUPLICATE_VARIANT');seen.add(variantId)
      return {...l,variantId,diff}
    }).sort((a,b)=>a.variantId.localeCompare(b.variantId))
    return this.idempotency.execute({
      key,userId:actor,operationType:'INVENTORY_ADJUSTMENT_POST',
      payload:{warehouseId,reasonCode:input.reasonCode,notes,lines:input.lines},
      expiresAt:new Date(Date.now()+30*DAY),
    },async client=>{
      const w=await client.query<{branch_id:string;company_id:string;is_active:boolean}&QueryResultRow>(
        `SELECT w.branch_id,b.company_id,w.is_active FROM warehouses w JOIN branches b ON b.id=w.branch_id WHERE w.id=$1 FOR KEY SHARE OF w`,[warehouseId])
      const wh=w.rows[0];if(!wh)throw new InventoryAdjustmentError('WAREHOUSE_NOT_FOUND')
      if(!wh.is_active)throw new InventoryAdjustmentError('WAREHOUSE_INACTIVE')
      await this.scope.requireWithinTransaction(client as AuthorizationQueryClient,actor,wh.branch_id)

      const trackingRows=await client.query<{id:string;tracking_serial:boolean;tracking_batch:boolean}&QueryResultRow>(
        `SELECT pv.id,p.tracking_serial,p.tracking_batch FROM product_variants pv JOIN products p ON p.id=pv.product_id WHERE pv.id=ANY($1::uuid[])`,
        [lines.map(l=>l.variantId)])
      const tracking=new Map(trackingRows.rows.map(r=>[r.id,r]))
      const locked=await this.costs.lockManyWithinTransaction(client,{actorUserId:actor,positions:lines.map(l=>({warehouseId,variantId:l.variantId}))})
      const byVariant=new Map(locked.map(x=>[x.position.variantId,x]))
      const prepared=[]
      for(const l of lines){
        const state=byVariant.get(l.variantId);if(!state)throw new Error('Adjustment lock invariant failed')
        const onHand=d6('onHand',state.position.onHand).scaled
        if(onHand+l.diff.scaled<0n&&!await allowed(client,actor,'inventory.allow_negative_stock'))
          throw new InventoryAdjustmentError('NEGATIVE_STOCK_PERMISSION_REQUIRED')
        let unitCost=state.cost.weightedAverageCost
        if(l.diff.scaled>0n&&money(unitCost)===0n)unitCost=state.cost.lastPurchaseCost
        if(l.diff.scaled>0n&&money(unitCost)===0n){
          if(!l.manualUnitCost)throw new InventoryAdjustmentError('OVERAGE_COST_REQUIRED')
          if(!await allowed(client,actor,'inventory.set_adjustment_cost'))
            throw new InventoryAdjustmentError('MANUAL_COST_PERMISSION_REQUIRED')
          unitCost=l.manualUnitCost
        }
        prepared.push({...l,unitCost})
      }

      const id=randomUUID(),sequence=await this.seq.allocate(client,{branchId:wh.branch_id,documentType:'INVENTORY_ADJUSTMENT'})
      const pb=await this.posting.create(client,{branchId:wh.branch_id,sourceType:'INVENTORY_ADJUSTMENT',sourceId:id,operationType:'POST',documentVersion:1,reversesPostingBatchId:null,createdBy:actor})
      await client.query(`INSERT INTO inventory_adjustments
        (id,branch_id,document_number,warehouse_id,source_stocktake_id,reason_code,notes,created_by,posted_at)
        VALUES($1,$2,$3,$4,NULL,$5,$6,$7,$8)`,
        [id,wh.branch_id,sequence.documentNumber.toString(),warehouseId,input.reasonCode,notes,actor,pb.postedAt])

      const movement=await this.ledger.appendWithinTransaction(client,{
        actorUserId:actor,postingBatchId:pb.id,warehouseId,movementType:'ADJUSTMENT',
        reasonCode:input.reasonCode,notes,
        lines:prepared.map(l=>({variantId:l.variantId,quantitySigned:l.diff.normalized,unitCost:l.unitCost,totalCost:total(l.diff.scaled<0n?-l.diff.scaled:l.diff.scaled,l.unitCost)})),
      })
      const moveByVariant=new Map(movement.lines.map(l=>[l.variantId,l]))
      for(const l of prepared){
        const lineId=randomUUID(),ml=moveByVariant.get(l.variantId);if(!ml)throw new Error('Adjustment movement invariant failed')
        await client.query(`INSERT INTO inventory_adjustment_lines(id,adjustment_id,variant_id,quantity_difference,unit_cost) VALUES($1,$2,$3,$4,$5)`,
          [lineId,id,l.variantId,l.diff.normalized,l.unitCost])
        const track=tracking.get(l.variantId);if(!track)throw new Error('Adjustment tracking invariant failed')
        if(l.diff.scaled<0n){
          if(track.tracking_serial)await this.serials.issueWithinTransaction(client,{actorUserId:actor,movementLineId:ml.id,serialNumbers:l.serialNumbers??[]})
          const allocations=track.tracking_batch?await this.batches.issueFefoWithinTransaction(client,{actorUserId:actor,movementLineId:ml.id}):[]
          for(const a of allocations)await client.query(
            'INSERT INTO inventory_adjustment_line_batches(adjustment_line_id,batch_id,quantity) VALUES($1,$2,$3)',
            [lineId,a.batchId,a.quantity])
          const serialRows=await client.query<{serial_id:string}&QueryResultRow>('SELECT serial_id FROM inventory_line_serials WHERE movement_line_id=$1',[ml.id])
          for(const s of serialRows.rows)await client.query('INSERT INTO inventory_adjustment_line_serials(adjustment_line_id,serial_id) VALUES($1,$2)',[lineId,s.serial_id])
          await this.costs.applyOutboundWithinTransaction(client,{actorUserId:actor,warehouseId,variantId:l.variantId,quantity:fmt(-l.diff.scaled,6)})
        }else{
          if(track.tracking_serial)await this.serials.receiveWithinTransaction(client,{actorUserId:actor,movementLineId:ml.id,serialNumbers:l.serialNumbers??[]})
          const allocations=track.tracking_batch?await this.batches.receiveWithinTransaction(client,{actorUserId:actor,movementLineId:ml.id,batches:l.batches??[]}):[]
          for(const a of allocations)await client.query('INSERT INTO inventory_adjustment_line_batches(adjustment_line_id,batch_id,quantity) VALUES($1,$2,$3)',[lineId,a.batchId,a.quantity])
          const serialRows=await client.query<{serial_id:string}&QueryResultRow>('SELECT serial_id FROM inventory_line_serials WHERE movement_line_id=$1',[ml.id])
          for(const s of serialRows.rows)await client.query('INSERT INTO inventory_adjustment_line_serials(adjustment_line_id,serial_id) VALUES($1,$2)',[lineId,s.serial_id])
          await this.costs.applyInboundWithinTransaction(client,{actorUserId:actor,warehouseId,variantId:l.variantId,quantity:l.diff.normalized,unitCost:l.unitCost})
        }
      }

      const shortfalls=await client.query<{id:string;sales_order_id:string;sales_order_line_id:string;variant_id:string;quantity:string;on_hand:string;reserved:string}&QueryResultRow>(
        `SELECT sr.id,sr.sales_order_id,sr.sales_order_line_id,sr.variant_id,sr.quantity::text,
                isp.on_hand::text,isp.reserved::text
           FROM stock_reservations sr JOIN inventory_stock_positions isp
             ON isp.warehouse_id=sr.warehouse_id AND isp.variant_id=sr.variant_id
          WHERE sr.warehouse_id=$1 AND sr.variant_id=ANY($2::uuid[])
            AND sr.status IN ('ACTIVE','PARTIALLY_CONSUMED') AND isp.on_hand<isp.reserved
          ORDER BY sr.variant_id,sr.id FOR UPDATE OF sr`,
        [warehouseId,prepared.map(l=>l.variantId)])
      if(shortfalls.rowCount&&shortfalls.rowCount>0)await this.outbox.enqueue(client,{
        eventType:'inventory.reservation_shortfall.detected',aggregateType:'inventory_adjustment',aggregateId:id,
        payload:{inventoryAdjustmentId:id,reservations:shortfalls.rows},
      })
      // Accounting posting rules are introduced in PHASE 09. The adjustment
      // emits the source event now; no fabricated Journal Entry is created here.
      await this.outbox.enqueue(client,{eventType:'accounting.inventory_adjustment.posted',aggregateType:'inventory_adjustment',aggregateId:id,payload:{inventoryAdjustmentId:id,postingBatchId:pb.id}})
      await this.audit.record(client,{companyId:wh.company_id,branchId:wh.branch_id,userId:actor,action:'inventory.adjustment.posted',entityType:'inventory_adjustment',entityId:id,after:{reasonCode:input.reasonCode,notes,lineCount:prepared.length,reservationShortfallCount:shortfalls.rowCount??0}})
      const value=Object.freeze({id,branchId:wh.branch_id,documentNumber:sequence.documentNumber,warehouseId,reasonCode:input.reasonCode,notes,postedAt:pb.postedAt,reservationShortfallCount:shortfalls.rowCount??0})
      return {value,resultReference:id}
    })
  }
}
