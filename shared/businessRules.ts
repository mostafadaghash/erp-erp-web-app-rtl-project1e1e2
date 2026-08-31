export const roundMoney = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export type InvoiceStatusInput = { cancelled?: boolean; netTotal: number; creditedTotal: number; paid: number; remaining: number };

/** The single source of truth for invoice settlement/return status. */
export function deriveInvoiceStatus(input: InvoiceStatusInput): string {
  if (input.cancelled) return "cancelled";
  if (input.netTotal === 0) return "returned";
  if (input.creditedTotal > 0) return input.remaining === 0 ? "paid_returned_partial" : "partial_return";
  if (input.remaining === 0) return "paid";
  return input.paid > 0 ? "partial" : "unpaid";
}

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

/**
 * دورة أمر البيع الموحدة.
 * `delivered` قيمة تاريخية فقط وتُعامل كـ `received` للحفاظ على البيانات القديمة.
 */
export const CURRENT_ORDER_STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "delivered_to_customer",
  "handed_to_shipping",
  "received",
  "cancelled",
] as const;
export type CanonicalOrderStatus = (typeof CURRENT_ORDER_STATUSES)[number];
export const ORDER_STATUSES = [...CURRENT_ORDER_STATUSES, "delivered"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Readonly<Record<CanonicalOrderStatus, string>> = {
  pending: "قيد الإنتظار",
  confirmed: "مؤكد",
  preparing: "جاري التجهيز",
  ready: "تم التجهيز",
  delivered_to_customer: "تم التسليم للعميل",
  handed_to_shipping: "تم التسليم لشركة الشحن",
  received: "تم الإستلام",
  cancelled: "ملغي",
};

export function normalizeOrderStatus(value: string): CanonicalOrderStatus | null {
  if (value === "delivered") return "received";
  return (CURRENT_ORDER_STATUSES as readonly string[]).includes(value)
    ? value as CanonicalOrderStatus
    : null;
}

export function orderStatusLabel(value: string): string {
  const normalized = normalizeOrderStatus(value);
  return normalized ? ORDER_STATUS_LABELS[normalized] : value;
}

export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["delivered_to_customer", "cancelled"],
  delivered_to_customer: [],
  handed_to_shipping: [],
  received: [],
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

/**
 * الحالات الخام للصيانة تحتفظ بالقيم التاريخية، بينما الواجهة وبقية النظام
 * يعرضان دورة العمل التجارية المتفق عليها. `rejected_by_shipping` حالة تشغيلية
 * جديدة لأنها تختلف عن رفض العميل ولا تعكس قيد الصيانة ماليًا.
 */
export const REPAIR_STATUSES = [
  "received",
  "under_inspection",
  "awaiting_approval",
  "in_progress",
  "ready",
  "delivered",
  "cancelled",
  "rejected_by_shipping",
] as const;
export type RepairStatus = (typeof REPAIR_STATUSES)[number];
export type RepairLifecycleStatus =
  | "pending"
  | "in_progress"
  | "new_issue"
  | "repaired"
  | "delivered_to_customer"
  | "rejected_by_customer"
  | "rejected_by_shipping";

export const REPAIR_STATUS_LABELS: Readonly<Record<RepairLifecycleStatus, string>> = {
  pending: "قيد الإنتظار",
  in_progress: "جاري الصيانة",
  new_issue: "ظهور مشكلة جديدة",
  repaired: "تم الإصلاح",
  delivered_to_customer: "تم التسليم للعميل",
  rejected_by_customer: "مرفوض من العميل",
  rejected_by_shipping: "مرفوض من شركة الشحن",
};

export function isRepairStatus(value: string): value is RepairStatus {
  return (REPAIR_STATUSES as readonly string[]).includes(value);
}

export function normalizeRepairStatus(value: string): RepairLifecycleStatus | null {
  if (value === "received") return "pending";
  if (value === "under_inspection" || value === "in_progress") return "in_progress";
  if (value === "awaiting_approval") return "new_issue";
  if (value === "ready") return "repaired";
  if (value === "delivered") return "delivered_to_customer";
  if (value === "cancelled") return "rejected_by_customer";
  if (value === "rejected_by_shipping") return "rejected_by_shipping";
  return null;
}

export function repairStatusLabel(value: string): string {
  const normalized = normalizeRepairStatus(value);
  return normalized ? REPAIR_STATUS_LABELS[normalized] : value;
}

export const REPAIR_TRANSITIONS: Readonly<Record<RepairStatus, readonly RepairStatus[]>> = {
  received: ["under_inspection", "cancelled"],
  under_inspection: ["awaiting_approval", "in_progress", "cancelled"],
  awaiting_approval: ["in_progress", "cancelled"],
  in_progress: ["ready", "awaiting_approval", "cancelled"],
  ready: ["delivered", "in_progress", "cancelled", "rejected_by_shipping"],
  rejected_by_shipping: ["ready", "cancelled"],
  delivered: [],
  cancelled: [],
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
