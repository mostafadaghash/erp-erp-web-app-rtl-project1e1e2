export const roundMoney = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export function calculateInvoiceTotals(
  lineTotals: number[],
  discount: number,
  taxRate: number,
  paid: number,
) {
  const subtotal = roundMoney(lineTotals.reduce((sum, value) => sum + value, 0));
  if (!Number.isFinite(discount) || discount < 0 || discount > subtotal) {
    throw new RangeError("invalid discount");
  }
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
    throw new RangeError("invalid tax rate");
  }
  const normalizedDiscount = roundMoney(discount);
  const tax = roundMoney((subtotal - normalizedDiscount) * taxRate / 100);
  const total = roundMoney(subtotal - normalizedDiscount + tax);
  if (!Number.isFinite(paid) || paid < 0 || paid > total) {
    throw new RangeError("invalid paid amount");
  }
  const normalizedPaid = roundMoney(paid);
  const remaining = roundMoney(total - normalizedPaid);
  const status = remaining === 0 ? "paid" : normalizedPaid > 0 ? "partial" : "unpaid";
  return { subtotal, discount: normalizedDiscount, tax, total, paid: normalizedPaid, remaining, status };
}

export const ORDER_STATUSES = ["pending", "confirmed", "ready", "delivered", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["ready", "cancelled"],
  ready: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export const SHIPMENT_STATUSES = ["ordered", "in_transit", "arrived", "cancelled"] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];
export const SHIPMENT_TRANSITIONS: Readonly<Record<ShipmentStatus, readonly ShipmentStatus[]>> = {
  ordered: ["in_transit", "cancelled"],
  in_transit: ["arrived", "cancelled"],
  arrived: [],
  cancelled: [],
};

export const REPAIR_STATUSES = ["received", "in_progress", "ready", "delivered", "cancelled"] as const;
export type RepairStatus = (typeof REPAIR_STATUSES)[number];
export const REPAIR_TRANSITIONS: Readonly<Record<RepairStatus, readonly RepairStatus[]>> = {
  received: ["in_progress", "cancelled"], in_progress: ["ready", "cancelled"],
  ready: ["delivered", "cancelled"], delivered: [], cancelled: [],
};

export const DELIVERY_STATUSES = ["pending", "shipped", "delivered", "returned", "cancelled"] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];
export const DELIVERY_TRANSITIONS: Readonly<Record<DeliveryStatus, readonly DeliveryStatus[]>> = {
  pending: ["shipped", "cancelled"], shipped: ["delivered", "returned"],
  delivered: ["returned"], returned: [], cancelled: [],
};

export const PAYMENT_METHODS = ["cash", "card", "bank_transfer", "wallet"] as const;

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function calculateDeliveryAmounts(items: readonly { quantity: number; unitPrice: number }[], shipping: number) {
  const totalAmount = roundMoney(items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0));
  return { totalAmount, shippingCost: roundMoney(shipping), grandTotal: roundMoney(totalAmount + shipping) };
}

export function canTransition(
  transitions: Readonly<Record<string, readonly string[]>>,
  current: string,
  next: string,
): boolean {
  return (transitions[current] ?? []).includes(next);
}
