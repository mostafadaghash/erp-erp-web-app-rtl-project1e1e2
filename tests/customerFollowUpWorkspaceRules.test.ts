import test from "node:test";
import assert from "node:assert/strict";
import {
  ACTIVE_DELIVERY_STATUSES,
  ACTIVE_ORDER_STATUSES,
  ACTIVE_REPAIR_STATUSES,
  FOLLOW_UP_ATTENTION_PRIORITY,
  isOperationOverdue,
  roleHasFollowUpWorkspaceAccess,
  shouldSuppressResolvedAttention,
} from "../shared/customerFollowUpWorkspaceRules.ts";

test("follow-up workspace is available to operational customer-facing roles", () => {
  for (const role of ["admin", "manager", "sales", "customer_service", "technician", "shipping"]) {
    assert.equal(roleHasFollowUpWorkspaceAccess(role), true, role);
  }
  assert.equal(roleHasFollowUpWorkspaceAccess("accountant"), false);
  assert.equal(roleHasFollowUpWorkspaceAccess("viewer"), false);
});

test("operational overdue detection excludes terminal or future work", () => {
  assert.equal(isOperationOverdue("2026-08-29", "pending", "2026-08-30", ACTIVE_ORDER_STATUSES), true);
  assert.equal(isOperationOverdue("2026-08-30", "pending", "2026-08-30", ACTIVE_ORDER_STATUSES), false);
  assert.equal(isOperationOverdue("2026-08-29", "delivered", "2026-08-30", ACTIVE_ORDER_STATUSES), false);
  assert.equal(isOperationOverdue(undefined, "ready", "2026-08-30", ACTIVE_ORDER_STATUSES), false);
  assert.equal(isOperationOverdue("2026-08-29", "ready", "2026-08-30", ACTIVE_REPAIR_STATUSES), true);
  assert.equal(isOperationOverdue("2026-08-29", "shipped", "2026-08-30", ACTIVE_DELIVERY_STATUSES), true);
});

test("ready repair attention outranks delayed and ready order attention", () => {
  assert.ok(FOLLOW_UP_ATTENTION_PRIORITY.repair_ready > FOLLOW_UP_ATTENTION_PRIORITY.order_overdue);
  assert.ok(FOLLOW_UP_ATTENTION_PRIORITY.order_overdue > FOLLOW_UP_ATTENTION_PRIORITY.order_ready);
  assert.ok(FOLLOW_UP_ATTENTION_PRIORITY.repair_overdue > FOLLOW_UP_ATTENTION_PRIORITY.delivery_overdue);
});

test("resolved attention is suppressed only for the same unchanged source status", () => {
  assert.equal(
    shouldSuppressResolvedAttention({
      currentSourceStatus: "تم الإصلاح",
      completedSourceStatus: "تم الإصلاح",
      hasOpenFollowUp: false,
    }),
    true,
  );
  assert.equal(
    shouldSuppressResolvedAttention({
      currentSourceStatus: "تم التسليم",
      completedSourceStatus: "تم الإصلاح",
      hasOpenFollowUp: false,
    }),
    false,
  );
  assert.equal(
    shouldSuppressResolvedAttention({
      currentSourceStatus: "تم الإصلاح",
      completedSourceStatus: "تم الإصلاح",
      hasOpenFollowUp: true,
    }),
    false,
  );
});
