import { strict as assert } from 'node:assert'
import test from 'node:test'
import { InventoryAdjustmentError } from '../infrastructure/inventory/inventory-adjustment-service.js'
import { ERROR_CODES, toErrorContract } from '../infrastructure/errors/error-mapper.js'
test('08.09 Inventory Adjustment exposes a stable safe error contract',()=>{
 const e=new InventoryAdjustmentError('OTHER_NOTE_REQUIRED')
 assert.deepEqual(toErrorContract(e),{errorCode:ERROR_CODES.INVENTORY_ADJUSTMENT_OPERATION_REJECTED,params:{reason:'OTHER_NOTE_REQUIRED'}})
 assert.equal(e.message,'Inventory adjustment operation rejected')
})
