export const INVENTORY_MOVEMENT_TYPES = {
  openingBalance: "opening_balance",
  manualAdjustment: "manual_adjustment",
  sale: "sale",
  saleReversal: "sale_reversal",
  salesReturn: "sales_return",
  shipmentReceipt: "shipment_receipt",
  purchaseReturn: "purchase_return",
} as const;

export type InventoryMovementType = typeof INVENTORY_MOVEMENT_TYPES[keyof typeof INVENTORY_MOVEMENT_TYPES];

export function calculateStockAfter(stockBefore: number, quantityDelta: number, reason: string) {
  if (!Number.isFinite(quantityDelta) || !Number.isInteger(quantityDelta)) throw new Error("كمية حركة المخزون يجب أن تكون عدداً صحيحاً");
  if (quantityDelta === 0) throw new Error("كمية حركة المخزون لا يمكن أن تساوي صفراً");
  if (!reason.trim()) throw new Error("سبب حركة المخزون مطلوب");
  const stockAfter = stockBefore + quantityDelta;
  if (stockAfter < 0) throw new Error("لا يمكن أن يصبح المخزون سالباً");
  return stockAfter;
}

export const roundAverageCost = (value: number) => Math.round((value + Number.EPSILON) * 10_000) / 10_000;
export const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function calculateInventoryChange(stock: number, averageCost: number, inventoryValue: number | undefined, quantityDelta: number, unitCost?: number, exactValueDelta?: number) {
  const oldValue = inventoryValue ?? money(stock * averageCost);
  const nextStock = calculateStockAfter(stock, quantityDelta, "inventory valuation");
  if (unitCost === undefined || !Number.isFinite(unitCost) || unitCost < 0) throw new Error("تكلفة حركة المخزون مطلوبة");
  if (exactValueDelta !== undefined && (!Number.isFinite(exactValueDelta) || money(exactValueDelta) !== exactValueDelta || (quantityDelta > 0 ? exactValueDelta < 0 : exactValueDelta > 0))) {
    throw new Error("قيمة حركة المخزون الدقيقة غير صالحة");
  }
  const valueDelta = exactValueDelta ?? money(quantityDelta * unitCost);
  const nextValue = nextStock === 0 ? 0 : money(oldValue + valueDelta);
  if (nextValue < 0) throw new Error("لا يمكن أن تصبح قيمة المخزون سالبة");
  return { stockAfter: nextStock, inventoryValueBefore: oldValue, inventoryValueAfter: nextValue, valueDelta: money(nextValue - oldValue), averageCostAfter: nextStock === 0 ? averageCost : roundAverageCost(nextValue / nextStock) };
}

export function allocateProportionally(total: number, weights: number[]) {
  const result = weights.map(() => 0); const sum = weights.reduce((a, b) => a + b, 0);
  const eligible = weights.map((w, i) => w > 0 ? i : -1).filter(i => i >= 0);
  if (!eligible.length || total === 0) return result;
  let allocated = 0;
  for (const i of eligible.slice(0, -1)) { result[i] = money(total * weights[i] / sum); allocated = money(allocated + result[i]); }
  result[eligible[eligible.length - 1]] = money(total - allocated);
  return result;
}
