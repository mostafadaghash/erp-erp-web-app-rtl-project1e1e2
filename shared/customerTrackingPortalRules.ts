export const CUSTOMER_TRACKING_TOKEN_BYTES = 32;
export const CUSTOMER_TRACKING_TOKEN_HEX_LENGTH = CUSTOMER_TRACKING_TOKEN_BYTES * 2;
export const CUSTOMER_TRACKING_MAX_FAILED_ATTEMPTS = 5;
export const CUSTOMER_TRACKING_LOCK_MS = 15 * 60 * 1000;

export type CustomerTrackingSourceType = "order" | "repair" | "delivery";
export type CustomerTrackingStepState = "completed" | "current" | "upcoming" | "stopped";

export type CustomerTrackingStep = {
  key: string;
  label: string;
  state: CustomerTrackingStepState;
};

export const CUSTOMER_TRACKING_SOURCE_LABELS: Record<CustomerTrackingSourceType, string> = {
  order: "أمر بيع",
  repair: "صيانة",
  delivery: "شحنة",
};

const ARABIC_DIGIT_MAP: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

export function normalizeTrackingDigits(value: string): string {
  return value
    .replace(/[٠-٩۰-۹]/g, (digit) => ARABIC_DIGIT_MAP[digit] ?? digit)
    .replace(/\D/g, "");
}

export function getPhoneLast4(phone: string): string | null {
  const digits = normalizeTrackingDigits(phone);
  return digits.length >= 4 ? digits.slice(-4) : null;
}

export function normalizePhoneLast4Input(value: string): string | null {
  const digits = normalizeTrackingDigits(value);
  return digits.length === 4 ? digits : null;
}

export function isValidCustomerTrackingToken(token: string): boolean {
  return new RegExp(`^[a-f0-9]{${CUSTOMER_TRACKING_TOKEN_HEX_LENGTH}}$`, "i").test(token);
}

export function customerTrackingCreationKey(
  sourceType: CustomerTrackingSourceType,
  sourceId: string,
): string {
  return `customer_tracking:${sourceType}:${sourceId}`;
}

function buildLinearSteps(
  definitions: Array<{ key: string; label: string }>,
  currentKey: string,
): CustomerTrackingStep[] {
  const currentIndex = Math.max(0, definitions.findIndex((step) => step.key === currentKey));
  return definitions.map((step, index) => ({
    ...step,
    state: index < currentIndex ? "completed" : index === currentIndex ? "current" : "upcoming",
  }));
}

const ORDER_PICKUP_STEPS = [
  { key: "pending", label: "قيد الإنتظار" },
  { key: "confirmed", label: "مؤكد" },
  { key: "preparing", label: "جاري التجهيز" },
  { key: "ready", label: "تم التجهيز" },
  { key: "delivered_to_customer", label: "تم التسليم للعميل" },
];

const ORDER_SHIPPING_STEPS = [
  { key: "pending", label: "قيد الإنتظار" },
  { key: "confirmed", label: "مؤكد" },
  { key: "preparing", label: "جاري التجهيز" },
  { key: "ready", label: "تم التجهيز" },
  { key: "handed_to_shipping", label: "تم التسليم لشركة الشحن" },
  { key: "received", label: "تم الإستلام" },
];

const REPAIR_STEPS = [
  { key: "pending", label: "قيد الإنتظار" },
  { key: "in_progress", label: "جاري الصيانة" },
  { key: "repaired", label: "تم الإصلاح" },
  { key: "delivered_to_customer", label: "تم التسليم للعميل" },
];

const DELIVERY_STEPS = [
  { key: "pending", label: "قيد الإنتظار" },
  { key: "shipped", label: "تم التسليم لشركة الشحن" },
  { key: "delivered", label: "تم الإستلام" },
];

function effectiveOrderStatus(rawStatus: string, deliveryStatus?: string): string {
  if (rawStatus === "cancelled") return "cancelled";
  if (deliveryStatus === "returned" || deliveryStatus === "cancelled") return "delivery_failed";
  if (deliveryStatus === "delivered" || rawStatus === "received" || rawStatus === "delivered") return "received";
  if (deliveryStatus === "shipped" || rawStatus === "handed_to_shipping") return "handed_to_shipping";
  if (rawStatus === "delivered_to_customer") return "delivered_to_customer";
  if (rawStatus === "ready") return "ready";
  if (rawStatus === "preparing" || rawStatus === "processing") return "preparing";
  if (rawStatus === "confirmed") return "confirmed";
  return "pending";
}

function effectiveRepairStatus(rawStatus: string): string {
  if (rawStatus === "cancelled") return "rejected_by_customer";
  if (rawStatus === "rejected_by_shipping") return "rejected_by_shipping";
  if (rawStatus === "delivered") return "delivered_to_customer";
  if (rawStatus === "ready") return "repaired";
  if (rawStatus === "awaiting_approval") return "new_issue";
  if (rawStatus === "under_inspection" || rawStatus === "in_progress") return "in_progress";
  return "pending";
}

export function publicOrderStatus(rawStatus: string, deliveryStatus?: string): string {
  switch (effectiveOrderStatus(rawStatus, deliveryStatus)) {
    case "cancelled": return "ملغي";
    case "delivery_failed": return "تعذر إتمام التوصيل";
    case "received": return "تم الإستلام";
    case "handed_to_shipping": return "تم التسليم لشركة الشحن";
    case "delivered_to_customer": return "تم التسليم للعميل";
    case "ready": return "تم التجهيز";
    case "preparing": return "جاري التجهيز";
    case "confirmed": return "مؤكد";
    default: return "قيد الإنتظار";
  }
}

export function publicRepairStatus(rawStatus: string): string {
  switch (effectiveRepairStatus(rawStatus)) {
    case "in_progress": return "جاري الصيانة";
    case "new_issue": return "ظهور مشكلة جديدة";
    case "repaired": return "تم الإصلاح";
    case "delivered_to_customer": return "تم التسليم للعميل";
    case "rejected_by_customer": return "مرفوض من العميل";
    case "rejected_by_shipping": return "مرفوض من شركة الشحن";
    default: return "قيد الإنتظار";
  }
}

export function publicDeliveryStatus(rawStatus: string): string {
  switch (rawStatus) {
    case "shipped": return "تم التسليم لشركة الشحن";
    case "delivered": return "تم الإستلام";
    case "returned": return "تم الإرجاع";
    case "cancelled": return "ملغي";
    default: return "قيد الإنتظار";
  }
}

export function buildPublicTrackingSteps(
  sourceType: CustomerTrackingSourceType,
  rawStatus: string,
  deliveryStatus?: string,
): CustomerTrackingStep[] {
  if (sourceType === "order") {
    const effective = effectiveOrderStatus(rawStatus, deliveryStatus);
    if (effective === "cancelled" || effective === "delivery_failed") {
      return [{ key: "stopped", label: publicOrderStatus(rawStatus, deliveryStatus), state: "stopped" }];
    }
    if (effective === "handed_to_shipping" || effective === "received") {
      return buildLinearSteps(ORDER_SHIPPING_STEPS, effective);
    }
    return buildLinearSteps(ORDER_PICKUP_STEPS, effective);
  }

  if (sourceType === "repair") {
    const effective = effectiveRepairStatus(rawStatus);
    if (effective === "rejected_by_customer" || effective === "rejected_by_shipping") {
      return [{ key: effective, label: publicRepairStatus(rawStatus), state: "stopped" }];
    }
    if (effective === "new_issue") {
      return [
        { key: "pending", label: "قيد الإنتظار", state: "completed" },
        { key: "in_progress", label: "جاري الصيانة", state: "completed" },
        { key: "new_issue", label: "ظهور مشكلة جديدة", state: "current" },
        { key: "repaired", label: "تم الإصلاح", state: "upcoming" },
        { key: "delivered_to_customer", label: "تم التسليم للعميل", state: "upcoming" },
      ];
    }
    return buildLinearSteps(REPAIR_STEPS, effective);
  }

  if (rawStatus === "returned" || rawStatus === "cancelled") {
    return [{ key: "stopped", label: publicDeliveryStatus(rawStatus), state: "stopped" }];
  }
  return buildLinearSteps(DELIVERY_STEPS, rawStatus === "delivered" ? "delivered" : rawStatus === "shipped" ? "shipped" : "pending");
}

export function publicTrackingStatus(
  sourceType: CustomerTrackingSourceType,
  rawStatus: string,
  deliveryStatus?: string,
): string {
  if (sourceType === "order") return publicOrderStatus(rawStatus, deliveryStatus);
  if (sourceType === "repair") return publicRepairStatus(rawStatus);
  return publicDeliveryStatus(rawStatus);
}
