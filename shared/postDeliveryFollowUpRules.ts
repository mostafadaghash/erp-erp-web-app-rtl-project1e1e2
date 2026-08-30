export const DEFAULT_POST_DELIVERY_FOLLOW_UP_DAYS = 2;
export const MAX_POST_DELIVERY_FOLLOW_UP_DAYS = 365;
export const POST_DELIVERY_FOLLOW_UP_TYPE = "متابعة ما بعد البيع";

export type PostDeliveryFollowUpSourceType = "order" | "repair" | "delivery";

export function normalizePostDeliveryFollowUpDays(value?: number): number {
  const resolved = value ?? DEFAULT_POST_DELIVERY_FOLLOW_UP_DAYS;
  if (
    !Number.isInteger(resolved) ||
    resolved < 0 ||
    resolved > MAX_POST_DELIVERY_FOLLOW_UP_DAYS
  ) {
    throw new Error(
      `مدة متابعة ما بعد البيع يجب أن تكون عدد أيام صحيحًا من 0 إلى ${MAX_POST_DELIVERY_FOLLOW_UP_DAYS}`,
    );
  }
  return resolved;
}

export function addDaysToIsoDate(date: string, days: number): string {
  const normalizedDays = normalizePostDeliveryFollowUpDays(days);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error("تاريخ التسليم غير صالح");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const value = new Date(Date.UTC(year, month - 1, day));
  if (
    value.getUTCFullYear() !== year ||
    value.getUTCMonth() !== month - 1 ||
    value.getUTCDate() !== day
  ) {
    throw new Error("تاريخ التسليم غير صالح");
  }
  value.setUTCDate(value.getUTCDate() + normalizedDays);
  return value.toISOString().slice(0, 10);
}

export function buildPostDeliveryFollowUpCreationKey(
  sourceType: PostDeliveryFollowUpSourceType,
  sourceId: string,
): string {
  const normalizedId = sourceId.trim();
  if (!normalizedId) throw new Error("معرف عملية التسليم مطلوب");
  return `system:post_delivery_follow_up:${sourceType}:${normalizedId}`;
}

export function isPostDeliveryAuditTrigger(input: {
  module: string;
  action: string;
  status?: string;
}): input is {
  module: "orders" | "repairs" | "deliveries";
  action: "update_status" | "confirm";
  status: "delivered";
} {
  if (input.status !== "delivered") return false;
  if (input.module === "orders") return input.action === "update_status";
  if (input.module === "repairs") return input.action === "update_status";
  if (input.module === "deliveries") return input.action === "confirm";
  return false;
}

export function sourceTypeFromDeliveryAuditModule(
  module: "orders" | "repairs" | "deliveries",
): PostDeliveryFollowUpSourceType {
  if (module === "orders") return "order";
  if (module === "repairs") return "repair";
  return "delivery";
}
