export const INVENTORY_MOVEMENT_TYPES = {
  openingBalance: "opening_balance",
  manualAdjustment: "manual_adjustment",
  sale: "sale",
  saleReversal: "sale_reversal",
  shipmentReceipt: "shipment_receipt",
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
