import assert from 'node:assert/strict'
import test from 'node:test'
import { replayInventoryCosts } from '../infrastructure/inventory/inventory-projection-reconciliation.js'

test('08.10 cost replay reproduces Phase 08.03 WA and purchase-only last cost',async()=>{
  let sql=''
  const client={query:async(text:string)=>{sql=text;return {rows:[
    {warehouse_id:'89100000-0000-4000-8000-000000000003',variant_id:'v1',movement_type:'PURCHASE',quantity_signed:'10.000000',unit_cost:'100.0000'},
    {warehouse_id:'89100000-0000-4000-8000-000000000003',variant_id:'v1',movement_type:'PURCHASE',quantity_signed:'10.000000',unit_cost:'200.0000'},
    {warehouse_id:'89100000-0000-4000-8000-000000000003',variant_id:'v1',movement_type:'SALE',quantity_signed:'-5.000000',unit_cost:'150.0000'},
    {warehouse_id:'89100000-0000-4000-8000-000000000003',variant_id:'v1',movement_type:'SALES_RETURN',quantity_signed:'5.000000',unit_cost:'150.0000'},
    {warehouse_id:'89100000-0000-4000-8000-000000000003',variant_id:'v1',movement_type:'ADJUSTMENT',quantity_signed:'10.000000',unit_cost:'150.0000'},
  ]}}} as any
  const rows=await replayInventoryCosts(client,'89100000-0000-4000-8000-000000000003')
  assert.match(sql,/ORDER BY pb\.posted_at,pb\.id,im\.id,iml\.id/)
  assert.deepEqual(rows,[{
    warehouseId:'89100000-0000-4000-8000-000000000003',variantId:'v1',
    weightedAverageCost:'150.0000',lastPurchaseCost:'200.0000',inventoryValue:'4500.0000',
  }])
})

test('08.10 cost replay uses half-away-from-zero four-decimal WA rounding',async()=>{
  const client={query:async()=>({rows:[
    {warehouse_id:'89100000-0000-4000-8000-000000000003',variant_id:'v1',movement_type:'PURCHASE',quantity_signed:'3.000000',unit_cost:'1.0000'},
    {warehouse_id:'89100000-0000-4000-8000-000000000003',variant_id:'v1',movement_type:'PURCHASE',quantity_signed:'3.000000',unit_cost:'2.0001'},
  ]})} as any
  const [row]=await replayInventoryCosts(client,'89100000-0000-4000-8000-000000000003')
  assert.equal(row?.weightedAverageCost,'1.5001')
  assert.equal(row?.lastPurchaseCost,'2.0001')
  assert.equal(row?.inventoryValue,'9.0006')
})
