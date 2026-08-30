export const FOLLOW_UP_SOURCE_TYPES = [
  "lead",
  "order",
  "repair",
  "delivery",
  "delivered_operation",
  "manual",
] as const;

export type FollowUpSourceType = (typeof FOLLOW_UP_SOURCE_TYPES)[number];

export const FOLLOW_UP_WORKFLOW_STATUSES = [
  "pending",
  "follow_up_later",
  "completed",
] as const;

export type FollowUpWorkflowStatus = (typeof FOLLOW_UP_WORKFLOW_STATUSES)[number];

export const FOLLOW_UP_COMMERCIAL_STATUSES = [
  "needs_follow_up",
  "today",
  "overdue",
  "completed",
  "follow_up_later",
] as const;

export type FollowUpCommercialStatus = (typeof FOLLOW_UP_COMMERCIAL_STATUSES)[number];

export const FOLLOW_UP_COMMERCIAL_STATUS_LABELS: Record<FollowUpCommercialStatus, string> = {
  needs_follow_up: "مطلوب متابعة",
  today: "اليوم",
  overdue: "متأخر",
  completed: "مكتمل",
  follow_up_later: "متابعة لاحقة",
};

export function deriveFollowUpCommercialStatus(input: {
  status: FollowUpWorkflowStatus;
  followUpDate: string;
  asOfDate: string;
}): FollowUpCommercialStatus {
  if (input.status === "completed") return "completed";
  if (input.followUpDate < input.asOfDate) return "overdue";
  if (input.followUpDate === input.asOfDate) return "today";
  if (input.status === "follow_up_later") return "follow_up_later";
  return "needs_follow_up";
}

export const SALES_ORDER_SOURCE_STATUS_LABELS = [
  "قيد الإنتظار",
  "جارى التجهيز",
  "تم التجهيز",
  "تم التسليم لشركة الشحن",
  "تم تسليم الأوردر",
  "ملغي",
] as const;

export const REPAIR_SOURCE_STATUS_LABELS = [
  "قيد الإنتظار",
  "جاري الصيانة",
  "ظهور مشكلة جديدة",
  "تم الإصلاح",
  "تم التسليم",
  "مرفوض من العميل",
  "مرفوض من الفني",
] as const;

export type RepairRejectionParty = "customer" | "technician";

export function mapOrderSourceStatus(status: string, hasShippedDelivery = false): string | undefined {
  if (status === "cancelled") return "ملغي";
  if (status === "delivered") return "تم تسليم الأوردر";
  if (hasShippedDelivery) return "تم التسليم لشركة الشحن";
  if (status === "ready") return "تم التجهيز";
  if (status === "confirmed") return "جارى التجهيز";
  if (status === "pending") return "قيد الإنتظار";
  return undefined;
}

export function mapDeliverySourceStatus(status: string): string | undefined {
  if (status === "pending") return "قيد الإنتظار";
  if (status === "shipped") return "تم التسليم لشركة الشحن";
  if (status === "delivered") return "تم تسليم الأوردر";
  if (status === "returned") return "مرتجع";
  if (status === "cancelled") return "ملغي";
  return undefined;
}

function inferRepairRejectionParty(reason?: string): RepairRejectionParty | undefined {
  const normalized = reason?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (/(فني|الفني|technician|technical)/i.test(normalized)) return "technician";
  if (/(عميل|العميل|customer|client)/i.test(normalized)) return "customer";
  return undefined;
}

export function mapRepairSourceStatus(
  status: string,
  cancellationReason?: string,
  rejectionParty?: RepairRejectionParty,
): string | undefined {
  if (status === "received") return "قيد الإنتظار";
  if (status === "under_inspection" || status === "in_progress") return "جاري الصيانة";
  if (status === "awaiting_approval") return "ظهور مشكلة جديدة";
  if (status === "ready") return "تم الإصلاح";
  if (status === "delivered") return "تم التسليم";
  if (status === "cancelled") {
    const party = rejectionParty ?? inferRepairRejectionParty(cancellationReason);
    if (party === "customer") return "مرفوض من العميل";
    if (party === "technician") return "مرفوض من الفني";
    return undefined;
  }
  return undefined;
}
