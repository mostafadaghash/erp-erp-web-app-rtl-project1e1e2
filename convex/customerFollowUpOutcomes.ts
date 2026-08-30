import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  assertBranchAccess,
  hasPermission,
  logAction,
  requireAuth,
  type AuthUser,
} from "./lib/auth";
import type { Permission } from "./lib/permissions";
import { businessDate } from "../shared/businessDate.ts";
import { isValidIsoDate } from "../shared/businessRules.ts";
import {
  FOLLOW_UP_OUTCOME_LABELS,
  buildFollowUpOutcomeTransition,
  outcomeRequiresDetails,
  outcomeRequiresNextDate,
  type FollowUpOutcome,
} from "../shared/customerFollowUpOutcomeRules.ts";
import { roleHasFollowUpWorkspaceAccess } from "../shared/customerFollowUpWorkspaceRules.ts";
import type { FollowUpSourceType } from "../shared/customerFollowUpRules.ts";

const outcomeValidator = v.union(
  v.literal("satisfied"),
  v.literal("problem"),
  v.literal("follow_up"),
  v.literal("no_answer"),
);

const SOURCE_VIEW_PERMISSION: Partial<Record<FollowUpSourceType, Permission>> = {
  lead: "view_leads",
  order: "view_orders",
  repair: "view_repairs",
  delivery: "view_deliveries",
  delivered_operation: "view_deliveries",
};

function cleanOptional(value: string | undefined, maxLength = 2000): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (normalized.length > maxLength) throw new ConvexError("التفاصيل أطول من الحد المسموح");
  return normalized;
}

async function requireOutcomeUser(ctx: Parameters<typeof requireAuth>[0]): Promise<AuthUser> {
  const user = await requireAuth(ctx);
  if (!hasPermission(user, "manage_follow_ups") && !roleHasFollowUpWorkspaceAccess(user.role)) {
    throw new ConvexError("ليس لديك صلاحية لإدارة متابعات العملاء");
  }
  return user;
}

function canAccessFollowUp(user: AuthUser, followUp: Doc<"customerFollowUps">): boolean {
  if (user.role === "admin") return true;
  if (!user.branchId || followUp.branchId !== user.branchId) return false;
  if (user.role === "manager") return true;
  if (followUp.sourceType === "manual") {
    return (
      followUp.assignedToProfileId === user.employeeId ||
      followUp.createdBy === user.userId ||
      hasPermission(user, "view_customers") ||
      user.role === "customer_service"
    );
  }
  if (
    user.role === "customer_service" &&
    (followUp.sourceType === "delivery" || followUp.sourceType === "delivered_operation")
  ) {
    return true;
  }
  const permission = SOURCE_VIEW_PERMISSION[followUp.sourceType];
  return Boolean(permission && hasPermission(user, permission));
}

function composeResult(outcome: FollowUpOutcome, details?: string): string {
  const label = FOLLOW_UP_OUTCOME_LABELS[outcome];
  return details ? `${label} — ${details}` : label;
}

export const apply = mutation({
  args: {
    id: v.id("customerFollowUps"),
    outcome: outcomeValidator,
    details: v.optional(v.string()),
    nextFollowUpDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireOutcomeUser(ctx);
    const followUp = await ctx.db.get(args.id);
    if (!followUp) throw new ConvexError("المتابعة غير موجودة");
    assertBranchAccess(user, followUp);
    if (!canAccessFollowUp(user, followUp)) {
      throw new ConvexError("ليس لديك صلاحية للوصول إلى هذه المتابعة");
    }
    if (followUp.status === "completed") {
      throw new ConvexError("المتابعة مكتملة بالفعل. أعد فتحها قبل تسجيل نتيجة جديدة");
    }

    const outcome = args.outcome as FollowUpOutcome;
    const details = cleanOptional(args.details);
    if (outcomeRequiresDetails(outcome) && !details) {
      throw new ConvexError("اكتب تفاصيل مشكلة العميل");
    }

    const currentDate = businessDate();
    let nextFollowUpDate = args.nextFollowUpDate;
    if (outcomeRequiresNextDate(outcome)) {
      if (!nextFollowUpDate || !isValidIsoDate(nextFollowUpDate)) {
        throw new ConvexError("حدد موعد المتابعة القادمة");
      }
    } else if (nextFollowUpDate !== undefined) {
      if (!isValidIsoDate(nextFollowUpDate)) throw new ConvexError("موعد المتابعة غير صالح");
      nextFollowUpDate = undefined;
    }

    let transition;
    try {
      transition = buildFollowUpOutcomeTransition({
        outcome,
        currentDate,
        currentFollowUpDate: followUp.followUpDate,
        currentFollowUpType: followUp.followUpType,
        nextFollowUpDate,
      });
    } catch (error) {
      throw new ConvexError(error instanceof Error ? error.message : "تعذر تطبيق نتيجة المتابعة");
    }

    const now = Date.now();
    const result = composeResult(outcome, details);
    const completedFields = transition.isCompleted
      ? { completedBy: user.userId, completedAt: now }
      : { completedBy: undefined, completedAt: undefined };

    await ctx.db.patch(args.id, {
      status: transition.status,
      followUpDate: transition.followUpDate,
      followUpType: transition.followUpType,
      result,
      lastContactAt: now,
      updatedBy: user.userId,
      updatedAt: now,
      ...completedFields,
    });

    const logBase = {
      module: "customer_follow_ups",
      recordId: args.id,
      recordLabel: `${followUp.customerName} - ${transition.followUpType}`,
      branchId: followUp.branchId,
      sourceType: followUp.sourceType,
      sourceId: followUp.sourceId,
      sourceNumber: followUp.sourceNumber,
    };
    const before = {
      status: followUp.status,
      followUpDate: followUp.followUpDate,
      followUpType: followUp.followUpType,
      result: followUp.result,
    };
    const after = {
      outcome,
      outcomeLabel: FOLLOW_UP_OUTCOME_LABELS[outcome],
      status: transition.status,
      followUpDate: transition.followUpDate,
      followUpType: transition.followUpType,
      result,
      completedAt: transition.isCompleted ? now : undefined,
    };

    if (outcome === "satisfied") {
      await logAction(ctx, user, {
        action: "complete",
        ...logBase,
        details: result,
        before,
        after,
      });
    } else {
      await logAction(ctx, user, {
        action: "contact",
        ...logBase,
        details: result,
        before,
        after,
      });
      if (outcomeRequiresNextDate(outcome)) {
        await logAction(ctx, user, {
          action: "reschedule",
          ...logBase,
          details: `موعد المتابعة القادمة: ${transition.followUpDate}`,
          before: { followUpDate: followUp.followUpDate, status: followUp.status },
          after: { followUpDate: transition.followUpDate, status: transition.status },
        });
      }
    }

    return {
      id: followUp._id,
      outcome,
      outcomeLabel: FOLLOW_UP_OUTCOME_LABELS[outcome],
      status: transition.status,
      followUpDate: transition.followUpDate,
      followUpType: transition.followUpType,
      completed: transition.isCompleted,
    };
  },
});
