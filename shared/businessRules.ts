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

export const ORDER_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["ready", "cancelled"],
  ready: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export const SHIPMENT_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  ordered: ["in_transit", "cancelled"],
  in_transit: ["arrived", "cancelled"],
  arrived: [],
  cancelled: [],
};

export function canTransition(
  transitions: Readonly<Record<string, readonly string[]>>,
  current: string,
  next: string,
): boolean {
  return (transitions[current] ?? []).includes(next);
}
