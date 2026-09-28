import type { PoolClient } from 'pg'
import type { TransactionOptions, TransactionWork } from '../database/transaction.js'
import {
  reconcileBatchStockPositions,
  reconcileInventoryStockPositions,
  reconcileInventoryCosts,
  replayInventoryCosts,
} from './inventory-projection-reconciliation.js'

export class InventoryRebuildError extends Error {
  constructor(readonly reason: 'VERIFICATION_FAILED'|'WAREHOUSE_NOT_FOUND') {
    super('Inventory projection rebuild rejected: '+reason)
    this.name='InventoryRebuildError'
  }
}
export interface RebuildDatabase {
  transaction<T>(work:TransactionWork<T>,options?:TransactionOptions):Promise<T>
}
export interface RebuildReport {
  warehouseId:string
  stockDifferences:number
  batchDifferences:number
  costDifferences:number
  repaired:boolean
}
/** Requires the database-wide exclusive advisory transaction lock. Every
 * historical/projection writer takes its shared counterpart in migration 0027.
 * Never use this as a substitute for historical WA cost replay. */
export class InventoryProjectionRebuildService {
  constructor(private readonly database:RebuildDatabase){}
  async run(input:{warehouseId:string;repair:boolean}):Promise<RebuildReport>{
    if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(input.warehouseId))
      throw new TypeError('warehouseId must be UUID')
    if(typeof input.repair!=='boolean')throw new TypeError('repair must be boolean')
    return this.database.transaction(async(client:PoolClient)=>{
      // Exclusive lock precedes all reads. Writer triggers use shared lock.
      await client.query('SELECT pg_advisory_xact_lock(721017,810)')
      const w=await client.query('SELECT id FROM warehouses WHERE id=$1 FOR UPDATE',[input.warehouseId])
      if(w.rowCount!==1)throw new InventoryRebuildError('WAREHOUSE_NOT_FOUND')
      const stock=await reconcileInventoryStockPositions(client,input.warehouseId)
      const batches=await reconcileBatchStockPositions(client,input.warehouseId)
      const costs=await reconcileInventoryCosts(client,input.warehouseId)
      const report:RebuildReport={warehouseId:input.warehouseId,
        stockDifferences:stock.length,batchDifferences:batches.length,
        costDifferences:costs.length,repaired:false}
      if(!input.repair)return report
      const replayedCosts=await replayInventoryCosts(client,input.warehouseId)
      for(const line of stock){
        await client.query(`INSERT INTO inventory_stock_positions
          (warehouse_id,variant_id,on_hand,reserved,version,updated_at)
          VALUES($1,$2,$3,$4,1,now())
          ON CONFLICT(warehouse_id,variant_id) DO UPDATE SET
          on_hand=EXCLUDED.on_hand,reserved=EXCLUDED.reserved,
          version=inventory_stock_positions.version+1,updated_at=now()`,
          [line.warehouseId,line.variantId,line.expectedOnHand,line.expectedReserved])
      }
      for(const line of batches){
        await client.query(`INSERT INTO batch_stock_positions
          (warehouse_id,batch_id,on_hand,reserved,version,updated_at)
          VALUES($1,$2,$3,$4,1,now())
          ON CONFLICT(warehouse_id,batch_id) DO UPDATE SET
          on_hand=EXCLUDED.on_hand,version=batch_stock_positions.version+1,
          updated_at=now()`,
          [line.warehouseId,line.batchId,line.expectedOnHand,line.expectedReserved])
      }
      const replayIds=new Set(replayedCosts.map(x=>x.variantId))
      for(const cost of replayedCosts){
        await client.query(`INSERT INTO variant_warehouse_cost_projection
          (warehouse_id,variant_id,weighted_average_cost,last_purchase_cost,inventory_value,updated_at)
          VALUES($1,$2,$3,$4,$5,now())
          ON CONFLICT(warehouse_id,variant_id) DO UPDATE SET
          weighted_average_cost=EXCLUDED.weighted_average_cost,
          last_purchase_cost=EXCLUDED.last_purchase_cost,
          inventory_value=EXCLUDED.inventory_value,updated_at=now()`,
          [cost.warehouseId,cost.variantId,cost.weightedAverageCost,cost.lastPurchaseCost,cost.inventoryValue])
      }
      const existingCosts=await client.query<{variant_id:string}>(
        'SELECT variant_id FROM variant_warehouse_cost_projection WHERE warehouse_id=$1',[input.warehouseId])
      for(const row of existingCosts.rows)if(!replayIds.has(row.variant_id))
        await client.query('DELETE FROM variant_warehouse_cost_projection WHERE warehouse_id=$1 AND variant_id=$2',[input.warehouseId,row.variant_id])
      const [remainingStock,remainingBatch,remainingCost]=await Promise.all([
        reconcileInventoryStockPositions(client,input.warehouseId),
        reconcileBatchStockPositions(client,input.warehouseId),
        reconcileInventoryCosts(client,input.warehouseId),
      ])
      if(remainingStock.length||remainingBatch.length||remainingCost.length)
        throw new InventoryRebuildError('VERIFICATION_FAILED')
      return {...report,repaired:true}
    },{maxAttempts:1})
  }
}
