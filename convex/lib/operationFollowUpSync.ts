import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { AuthUser } from "./auth.ts";

export type OperationFollowUpSource = "order" | "repair";

export type OperationFollowUpInput = {
  sourceType: OperationFollowUpSource;
  sourceId: string;
  sourceNumber: string;
  sourceStatus: string;
  branchId: Id<"branches">;
  customerId?: Id<"customers">;
  customerName: string;
  phone?: string;
  terminal: boolean;
};

const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * Synchronizes the operational truth into the existing customerFollowUps table.
 * Manual contact notes/results/dates are preserved; only source/customer identity,
 * sourceStatus and terminal/open state are controlled by the source operation.
 */
export async function upsertOperationFollowUp(
  ctx: MutationCtx,
  user: AuthUser,
  input: OperationFollowUpInput,
) {
  const sourceId = input.sourceId.trim();
  if (!sourceId) throw new Error("sourceId is required for operational follow-up sync");
  const existing = await ctx.db
    .query("customerFollowUps")
    .withIndex("by_source", q => q.eq("sourceType", input.sourceType).eq("sourceId", sourceId))
    .collect();

  const now = Date.now();
  const phone = input.phone?.trim() || "غير مسجل";
  const canonical = existing.sort((a, b) => a.createdAt - b.createdAt)[0];
  const nextStatus = input.terminal ? "completed" as const : "pending" as const;

  if (canonical) {
    await ctx.db.patch(canonical._id, {
      branchId: input.branchId,
      customerId: input.customerId,
      customerName: input.customerName,
      phone,
      sourceNumber: input.sourceNumber,
      sourceStatus: input.sourceStatus,
      status: nextStatus,
      updatedBy: user.userId,
      updatedAt: now,
      ...(input.terminal
        ? { completedBy: user.userId, completedAt: canonical.completedAt ?? now }
        : { completedBy: undefined, completedAt: undefined }),
    });

    // Historical duplicates are never deleted. Close them deterministically so
    // the workspace has one live operational follow-up per source record.
    for (const duplicate of existing.slice(1)) {
      if (duplicate.status !== "completed" || duplicate.sourceStatus !== input.sourceStatus) {
        await ctx.db.patch(duplicate._id, {
          sourceStatus: input.sourceStatus,
          status: "completed",
          completedBy: duplicate.completedBy ?? user.userId,
          completedAt: duplicate.completedAt ?? now,
          updatedBy: user.userId,
          updatedAt: now,
        });
      }
    }
    return { followUpId: canonical._id, created: false, duplicateCount: Math.max(0, existing.length - 1) };
  }

  const creationKey = `auto:${input.sourceType}:${sourceId}`;
  const priorByKey = await ctx.db
    .query("customerFollowUps")
    .withIndex("by_creation_key", q => q.eq("creationKey", creationKey))
    .unique();
  if (priorByKey) {
    await ctx.db.patch(priorByKey._id, {
      sourceStatus: input.sourceStatus,
      status: nextStatus,
      updatedBy: user.userId,
      updatedAt: now,
      ...(input.terminal ? { completedBy: user.userId, completedAt: now } : {}),
    });
    return { followUpId: priorByKey._id, created: false, duplicateCount: 0 };
  }

  const followUpId = await ctx.db.insert("customerFollowUps", {
    branchId: input.branchId,
    customerId: input.customerId,
    customerName: input.customerName,
    phone,
    sourceType: input.sourceType,
    sourceId,
    sourceNumber: input.sourceNumber,
    sourceStatus: input.sourceStatus,
    followUpType: input.sourceType === "order" ? "متابعة طلب بيع" : "متابعة صيانة",
    followUpDate: todayIso(),
    assignedToProfileId: user.employeeId,
    assignedToName: user.name,
    status: nextStatus,
    creationRequestId: creationKey,
    creationKey,
    createdBy: user.userId,
    createdAt: now,
    updatedBy: user.userId,
    updatedAt: now,
    ...(input.terminal ? { completedBy: user.userId, completedAt: now } : {}),
  });
  return { followUpId, created: true, duplicateCount: 0 };
}
