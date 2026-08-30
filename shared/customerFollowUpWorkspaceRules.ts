export const FOLLOW_UP_WORKSPACE_ROLES = [
  "admin",
  "manager",
  "sales",
  "customer_service",
  "technician",
  "shipping",
] as const;

export type FollowUpWorkspaceRole = (typeof FOLLOW_UP_WORKSPACE_ROLES)[number];

export const ACTIVE_ORDER_STATUSES = ["pending", "confirmed", "ready"] as const;
export const ACTIVE_REPAIR_STATUSES = [
  "received",
  "under_inspection",
  "awaiting_approval",
  "in_progress",
  "ready",
] as const;
export const ACTIVE_DELIVERY_STATUSES = ["pending", "shipped"] as const;

export type FollowUpAttentionKind =
  | "repair_ready"
  | "order_overdue"
  | "repair_overdue"
  | "delivery_overdue"
  | "order_ready";

export const FOLLOW_UP_ATTENTION_PRIORITY: Record<FollowUpAttentionKind, number> = {
  repair_ready: 100,
  order_overdue: 90,
  repair_overdue: 85,
  delivery_overdue: 80,
  order_ready: 70,
};

export function roleHasFollowUpWorkspaceAccess(role: string): boolean {
  return FOLLOW_UP_WORKSPACE_ROLES.includes(role as FollowUpWorkspaceRole);
}

export function isOperationOverdue(
  expectedDate: string | undefined,
  status: string,
  asOfDate: string,
  activeStatuses: readonly string[],
): boolean {
  return Boolean(
    expectedDate &&
      expectedDate < asOfDate &&
      activeStatuses.includes(status),
  );
}

export function shouldSuppressResolvedAttention(input: {
  currentSourceStatus?: string;
  completedSourceStatus?: string;
  hasOpenFollowUp: boolean;
}): boolean {
  if (input.hasOpenFollowUp) return false;
  return Boolean(
    input.currentSourceStatus &&
      input.completedSourceStatus &&
      input.currentSourceStatus === input.completedSourceStatus,
  );
}
