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
  currentIndex: number,
): CustomerTrackingStep[] {
  return definitions.map((step, index) => ({
    ...step,
    state: index < currentIndex ? "completed" : index === currentIndex ? "current" : "upcoming",
  }));
}

const ORDER_STEPS = [
  { key: "pending", label: "تم استلام الطلب" },
  { key: "processing", label: "جاري التجهيز" },
  { key: "ready", label: "تم التجهيز" },
  { key: "shipped", label: "تم التسليم لشركة الشحن" },
  { key: "delivered", label: "تم تسليم الأوردر" },
];

const REPAIR_STEPS = [
  { key: "received", label: "تم استلام الجهاز" },
  { key: "under_inspection", label: "الفحص" },
  { key: "in_progress", label: "جاري الصيانة" },
  { key: "ready", label: "تم الإصلاح" },
  { key: "delivered", label: "تم التسليم" },
];

const DELIVERY_STEPS = [
  { key: "pending", label: "جاري تجهيز الشحنة" },
  { key: "shipped", label: "تم الشحن" },
  { key: "delivered", label: "تم التسليم" },
];

export function publicOrderStatus(rawStatus: string, deliveryStatus?: string): string {
  if (rawStatus === "cancelled") return "ملغي";
  if (deliveryStatus === "returned" || deliveryStatus === "cancelled") return "تعذر إتمام التوصيل";
  if (rawStatus === "delivered" || deliveryStatus === "delivered") return "تم تسليم الأوردر";
  if (deliveryStatus === "shipped") return "تم التسليم لشركة الشحن";
  if (rawStatus === "ready") return "تم التجهيز";
  if (rawStatus === "processing") return "جاري التجهيز";
  return "قيد الإنتظار";
}

export function publicRepairStatus(rawStatus: string): string {
  switch (rawStatus) {
    case "under_inspection": return "جاري الفحص";
    case "awaiting_approval": return "في انتظار الموافقة";
    case "in_progress": return "جاري الصيانة";
    case "ready": return "تم الإصلاح";
    case "delivered": return "تم التسليم";
    case "cancelled": return "تم إيقاف العملية";
    default: return "قيد الإنتظار";
  }
}

export function publicDeliveryStatus(rawStatus: string): string {
  switch (rawStatus) {
    case "shipped": return "تم الشحن";
    case "delivered": return "تم التسليم";
    case "returned": return "تم الإرجاع";
    case "cancelled": return "ملغي";
    default: return "جاري التجهيز";
  }
}

export function buildPublicTrackingSteps(
  sourceType: CustomerTrackingSourceType,
  rawStatus: string,
  deliveryStatus?: string,
): CustomerTrackingStep[] {
  if (sourceType === "order") {
    if (rawStatus === "cancelled" || deliveryStatus === "returned" || deliveryStatus === "cancelled") {
      return [{ key: "stopped", label: publicOrderStatus(rawStatus, deliveryStatus), state: "stopped" }];
    }
    const effective =
      rawStatus === "delivered" || deliveryStatus === "delivered" ? "delivered" :
      deliveryStatus === "shipped" ? "shipped" :
      rawStatus === "ready" ? "ready" :
      rawStatus === "processing" ? "processing" : "pending";
    return buildLinearSteps(ORDER_STEPS, ORDER_STEPS.findIndex((step) => step.key === effective));
  }

  if (sourceType === "repair") {
    if (rawStatus === "cancelled") {
      return [{ key: "stopped", label: "تم إيقاف العملية", state: "stopped" }];
    }
    const effective = rawStatus === "awaiting_approval" ? "under_inspection" : rawStatus;
    const index = REPAIR_STEPS.findIndex((step) => step.key === effective);
    return buildLinearSteps(REPAIR_STEPS, Math.max(0, index));
  }

  if (rawStatus === "returned" || rawStatus === "cancelled") {
    return [{ key: "stopped", label: publicDeliveryStatus(rawStatus), state: "stopped" }];
  }
  const index = DELIVERY_STEPS.findIndex((step) => step.key === rawStatus);
  return buildLinearSteps(DELIVERY_STEPS, Math.max(0, index));
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
