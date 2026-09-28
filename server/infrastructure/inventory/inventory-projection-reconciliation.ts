import type { PoolClient, QueryResultRow } from 'pg'

/**
 * 08.10 read-only inventory reconciliation.
 * Ledger history is authoritative for on-hand; active reservations are
 * authoritative for reserved. Never mutate a projection from this routine.
 * Run against a consistent snapshot in maintenance mode for a stable report.
 */
export interface ProjectionDifference {
  warehouseId: string
  variantId: string
  expectedOnHand: string
  actualOnHand: string
  expectedReserved: string
  actualReserved: string
}
interface DifferenceRow extends QueryResultRow {
  warehouse_id: string
  variant_id: string
  expected_on_hand: string
  actual_on_hand: string
  expected_reserved: string
  actual_reserved: string
}

export async function reconcileInventoryStockPositions(
  client: Pick<PoolClient, 'query'>,
  warehouseId: string,
): Promise<readonly ProjectionDifference[]> {
  if (typeof warehouseId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(warehouseId)) {
    throw new TypeError('warehouseId must be a UUID')
  }
  const result = await client.query<DifferenceRow>(
    `WITH historical AS (
       SELECT im.warehouse_id, iml.variant_id,
              SUM(iml.quantity_signed)::numeric(18,6) AS on_hand
         FROM inventory_movements im
         JOIN inventory_movement_lines iml ON iml.movement_id=im.id
        WHERE im.warehouse_id=$1
        GROUP BY im.warehouse_id, iml.variant_id
     ), active_reservations AS (
       SELECT warehouse_id, variant_id,
              SUM(quantity)::numeric(18,6) AS reserved
         FROM stock_reservations
        WHERE warehouse_id=$1
          AND status IN ('ACTIVE','PARTIALLY_CONSUMED')
        GROUP BY warehouse_id,variant_id
     ), all_keys AS (
       SELECT warehouse_id,variant_id FROM historical
       UNION SELECT warehouse_id,variant_id FROM active_reservations
       UNION SELECT warehouse_id,variant_id FROM inventory_stock_positions
        WHERE warehouse_id=$1
     )
     SELECT k.warehouse_id,k.variant_id,
            COALESCE(h.on_hand,0)::numeric(18,6)::text AS expected_on_hand,
            COALESCE(p.on_hand,0)::numeric(18,6)::text AS actual_on_hand,
            COALESCE(r.reserved,0)::numeric(18,6)::text AS expected_reserved,
            COALESCE(p.reserved,0)::numeric(18,6)::text AS actual_reserved
       FROM all_keys k
       LEFT JOIN historical h USING(warehouse_id,variant_id)
       LEFT JOIN active_reservations r USING(warehouse_id,variant_id)
       LEFT JOIN inventory_stock_positions p USING(warehouse_id,variant_id)
      WHERE COALESCE(h.on_hand,0) IS DISTINCT FROM COALESCE(p.on_hand,0)
         OR COALESCE(r.reserved,0) IS DISTINCT FROM COALESCE(p.reserved,0)
      ORDER BY k.warehouse_id,k.variant_id`,
    [warehouseId],
  )
  return Object.freeze(result.rows.map(row => Object.freeze({
    warehouseId: row.warehouse_id,
    variantId: row.variant_id,
    expectedOnHand: row.expected_on_hand,
    actualOnHand: row.actual_on_hand,
    expectedReserved: row.expected_reserved,
    actualReserved: row.actual_reserved,
  })))
}

export interface BatchProjectionDifference {
  warehouseId: string
  batchId: string
  expectedOnHand: string
  actualOnHand: string
  expectedReserved: string
  actualReserved: string
}
interface BatchDifferenceRow extends QueryResultRow {
  warehouse_id: string; batch_id: string
  expected_on_hand: string; actual_on_hand: string
  expected_reserved: string; actual_reserved: string
}

/** Signed batch ledger links are historical; batch reserved is a separate
 * operational allocation and cannot be inferred from variant reservations. */
export async function reconcileBatchStockPositions(
  client: Pick<PoolClient, 'query'>,
  warehouseId: string,
): Promise<readonly BatchProjectionDifference[]> {
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(warehouseId)) {
    throw new TypeError('warehouseId must be a UUID')
  }
  const result = await client.query<BatchDifferenceRow>(
    `WITH historical AS (
       SELECT im.warehouse_id, ilb.batch_id,
              SUM(CASE WHEN iml.quantity_signed<0 THEN -ilb.quantity ELSE ilb.quantity END)::numeric(18,6) AS on_hand
         FROM inventory_movements im
         JOIN inventory_movement_lines iml ON iml.movement_id=im.id
         JOIN inventory_line_batches ilb ON ilb.movement_line_id=iml.id
        WHERE im.warehouse_id=$1
        GROUP BY im.warehouse_id,ilb.batch_id
     ), all_keys AS (
       SELECT warehouse_id,batch_id FROM historical
       UNION SELECT warehouse_id,batch_id FROM batch_stock_positions WHERE warehouse_id=$1
     )
     SELECT k.warehouse_id,k.batch_id,
            COALESCE(h.on_hand,0)::numeric(18,6)::text AS expected_on_hand,
            COALESCE(p.on_hand,0)::numeric(18,6)::text AS actual_on_hand,
            COALESCE(p.reserved,0)::numeric(18,6)::text AS expected_reserved,
            COALESCE(p.reserved,0)::numeric(18,6)::text AS actual_reserved
       FROM all_keys k
       LEFT JOIN historical h USING(warehouse_id,batch_id)
       LEFT JOIN batch_stock_positions p USING(warehouse_id,batch_id)
      WHERE COALESCE(h.on_hand,0) IS DISTINCT FROM COALESCE(p.on_hand,0)
      ORDER BY k.warehouse_id,k.batch_id`,[warehouseId])
  return Object.freeze(result.rows.map(row=>Object.freeze({
    warehouseId:row.warehouse_id,batchId:row.batch_id,
    expectedOnHand:row.expected_on_hand,actualOnHand:row.actual_on_hand,
    expectedReserved:row.expected_reserved,actualReserved:row.actual_reserved,
  })))
}

export interface ReplayedInventoryCost {
  warehouseId:string; variantId:string
  weightedAverageCost:string; lastPurchaseCost:string; inventoryValue:string
}
export interface CostProjectionDifference extends ReplayedInventoryCost {
  actualWeightedAverageCost:string|null
  actualLastPurchaseCost:string|null
  actualInventoryValue:string|null
}
interface CostLedgerRow extends QueryResultRow {
  warehouse_id:string; variant_id:string; movement_type:string
  quantity_signed:string; unit_cost:string
}
const Q=1_000_000n, M=10_000n
function decimal(value:string,scale:number):bigint {
  const m=/^(-?)(\d+)(?:\.(\d+))?$/.exec(value)
  if(!m)throw new TypeError('invalid historical decimal')
  const sign=m[1]==='-'?-1n:1n
  return sign*(BigInt(m[2]??'0')*10n**BigInt(scale)+BigInt((m[3]??'').padEnd(scale,'0').slice(0,scale)||'0'))
}
function fmt(value:bigint,scale:number):string {
  const neg=value<0n,a=neg?-value:value,f=10n**BigInt(scale)
  return `${neg?'-':''}${a/f}.${(a%f).toString().padStart(scale,'0')}`
}
function divHalfAway(n:bigint,d:bigint):bigint {
  if(d===0n)throw new RangeError('historical cost replay division by zero')
  const neg=(n<0n)!==(d<0n),a=n<0n?-n:n,b=d<0n?-d:d
  let q=a/b; if((a%b)*2n>=b)q+=1n
  return neg?-q:q
}
function value(qty6:bigint,cost4:bigint):bigint{return divHalfAway(qty6*cost4,Q)}
function wa(v4:bigint,qty6:bigint):bigint {
  if(qty6===0n){if(v4!==0n)throw new Error('historical zero-quantity value residual');return 0n}
  const result=divHalfAway(v4*Q,qty6)
  if(result<0n)throw new Error('historical negative weighted-average result')
  return result
}
/** Replays the exact Phase 08.03 algorithm in authoritative posted_at order.
 * Only PURCHASE updates lastPurchaseCost; returns/transfers/adjustments do not. */
export async function replayInventoryCosts(
  client:Pick<PoolClient,'query'>,warehouseId:string,
):Promise<readonly ReplayedInventoryCost[]> {
  if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(warehouseId))
    throw new TypeError('warehouseId must be a UUID')
  const rows=await client.query<CostLedgerRow>(`
    SELECT im.warehouse_id,iml.variant_id,im.movement_type,
           iml.quantity_signed::text,iml.unit_cost::text
      FROM inventory_movements im
      JOIN posting_batches pb ON pb.id=im.posting_batch_id
      JOIN inventory_movement_lines iml ON iml.movement_id=im.id
     WHERE im.warehouse_id=$1
     ORDER BY pb.posted_at,pb.id,im.id,iml.id`,[warehouseId])
  const states=new Map<string,{qty:bigint;weighted:bigint;last:bigint;value:bigint}>()
  for(const row of rows.rows){
    const state=states.get(row.variant_id)??{qty:0n,weighted:0n,last:0n,value:0n}
    const delta=decimal(row.quantity_signed,6),unit=decimal(row.unit_cost,4)
    if(delta>0n){
      const nextQty=state.qty+delta
      const unrounded=state.value+value(delta,unit)
      state.weighted=wa(unrounded,nextQty)
      state.qty=nextQty
      state.value=value(state.qty,state.weighted)
      if(row.movement_type==='PURCHASE')state.last=unit
    }else if(delta<0n){
      state.qty+=delta
      state.value=value(state.qty,state.weighted)
    }
    states.set(row.variant_id,state)
  }
  return Object.freeze([...states.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([variantId,x])=>Object.freeze({
    warehouseId,variantId,weightedAverageCost:fmt(x.weighted,4),
    lastPurchaseCost:fmt(x.last,4),inventoryValue:fmt(x.value,4),
  })))
}
export async function reconcileInventoryCosts(
  client:Pick<PoolClient,'query'>,warehouseId:string,
):Promise<readonly CostProjectionDifference[]> {
  const expected=await replayInventoryCosts(client,warehouseId)
  const actual=await client.query<QueryResultRow & {variant_id:string;weighted_average_cost:string;last_purchase_cost:string;inventory_value:string}>(
    `SELECT variant_id,weighted_average_cost::text,last_purchase_cost::text,inventory_value::text
       FROM variant_warehouse_cost_projection WHERE warehouse_id=$1 ORDER BY variant_id`,[warehouseId])
  const byId=new Map(actual.rows.map(x=>[x.variant_id,x]))
  const expectedIds=new Set(expected.map(x=>x.variantId))
  const diffs:CostProjectionDifference[]=[]
  for(const e of expected){
    const a=byId.get(e.variantId)
    if(!a||a.weighted_average_cost!==e.weightedAverageCost||a.last_purchase_cost!==e.lastPurchaseCost||a.inventory_value!==e.inventoryValue)
      diffs.push({...e,actualWeightedAverageCost:a?.weighted_average_cost??null,
        actualLastPurchaseCost:a?.last_purchase_cost??null,actualInventoryValue:a?.inventory_value??null})
  }
  for(const a of actual.rows)if(!expectedIds.has(a.variant_id))diffs.push({
    warehouseId,variantId:a.variant_id,weightedAverageCost:'0.0000',lastPurchaseCost:'0.0000',inventoryValue:'0.0000',
    actualWeightedAverageCost:a.weighted_average_cost,actualLastPurchaseCost:a.last_purchase_cost,actualInventoryValue:a.inventory_value,
  })
  return Object.freeze(diffs.map(x=>Object.freeze(x)))
}
