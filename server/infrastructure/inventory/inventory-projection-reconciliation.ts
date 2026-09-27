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

export interface CostProjectionDifference {
  warehouseId:string;variantId:string
  expectedInventoryValue:string;actualInventoryValue:string
}
/** This detects historical value drift. Replaying WA is a separate,
 * ordered operation: a SUM of historical costs is NOT the WA cost itself. */
export async function reconcileInventoryValue(
  client: Pick<PoolClient,'query'>, warehouseId:string,
):Promise<readonly CostProjectionDifference[]> {
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(warehouseId)) {
    throw new TypeError('warehouseId must be a UUID')
  }
  const result=await client.query<QueryResultRow & {
    warehouse_id:string;variant_id:string;expected_value:string;actual_value:string
  }>(`WITH history AS (
      SELECT im.warehouse_id,iml.variant_id,
             SUM(CASE WHEN iml.quantity_signed<0 THEN -iml.total_cost
                      ELSE iml.total_cost END)::numeric(18,4) AS value
        FROM inventory_movements im
        JOIN inventory_movement_lines iml ON iml.movement_id=im.id
       WHERE im.warehouse_id=$1 GROUP BY im.warehouse_id,iml.variant_id
    ), keys AS (
      SELECT warehouse_id,variant_id FROM history
      UNION SELECT warehouse_id,variant_id FROM variant_warehouse_cost_projection
       WHERE warehouse_id=$1
    )
    SELECT k.warehouse_id,k.variant_id,
           COALESCE(h.value,0)::numeric(18,4)::text AS expected_value,
           COALESCE(c.inventory_value,0)::numeric(18,4)::text AS actual_value
      FROM keys k LEFT JOIN history h USING(warehouse_id,variant_id)
      LEFT JOIN variant_warehouse_cost_projection c USING(warehouse_id,variant_id)
     WHERE COALESCE(h.value,0) IS DISTINCT FROM COALESCE(c.inventory_value,0)
     ORDER BY k.warehouse_id,k.variant_id`,[warehouseId])
  return Object.freeze(result.rows.map(row=>Object.freeze({
    warehouseId:row.warehouse_id,variantId:row.variant_id,
    expectedInventoryValue:row.expected_value,actualInventoryValue:row.actual_value,
  })))
}
