import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { requirePermission } from "./lib/auth";

function toAuditLogDto(log: Doc<"auditLogs">) {
  return {
    id: log._id,
    createdAt: log.timestamp ?? log._creationTime,
    actor: log.userName ?? "النظام",
    userName: log.userName ?? "النظام",
    action: log.action,
    module: log.module,
    recordId: log.recordId ?? null,
    recordLabel: log.recordLabel ?? null,
    details: log.details ?? null,
    beforeSnapshot: log.beforeSnapshot ?? [],
    afterSnapshot: log.afterSnapshot ?? [],
    changedFields: log.changedFields ?? [],
    snapshotVersion: log.snapshotVersion ?? null,
    sourceType: log.sourceType ?? null,
    sourceId: log.sourceId ?? null,
    sourceNumber: log.sourceNumber ?? null,
    relatedType: log.relatedType ?? null,
    relatedId: log.relatedId ?? null,
    relatedNumber: log.relatedNumber ?? null,
    financialTransactionId: log.financialTransactionId ?? null,
    journalEntryId: log.journalEntryId ?? null,
    reversalOfId: log.reversalOfId ?? null,
    branchId: log.branchId ?? null,
  };
}

export const listPaginated = query({
  args: {
    paginationOpts: paginationOptsValidator,
    module: v.optional(v.string()),
    action: v.optional(v.string()),
    userId: v.optional(v.string()),
    branchId: v.optional(v.id("branches")),
    fromTimestamp: v.optional(v.number()),
    toTimestamp: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "view_audit_logs");
    const moduleFilter = args.module?.trim() || undefined;
    const actionFilter = args.action?.trim() || undefined;
    const requestedUserId = args.userId?.trim() || undefined;

    if (
      args.fromTimestamp !== undefined &&
      args.toTimestamp !== undefined &&
      args.fromTimestamp > args.toTimestamp
    ) {
      throw new ConvexError("نطاق تاريخ سجل المراجعة غير صالح");
    }

    if (user.role !== "admin") {
      if (requestedUserId && requestedUserId !== user.userId) {
        throw new ConvexError("ليس لديك صلاحية لعرض سجل مستخدم آخر");
      }
      if (args.branchId && args.branchId !== user.branchId) {
        throw new ConvexError("ليس لديك صلاحية لعرض سجل فرع آخر");
      }
    }

    const effectiveUserId = user.role === "admin" ? requestedUserId : user.userId;
    const effectiveBranchId = args.branchId;

    let logsQuery = ctx.db.query("auditLogs").order("desc");

    if (effectiveUserId && moduleFilter && actionFilter) {
      logsQuery = ctx.db
        .query("auditLogs")
        .withIndex("by_user_module_action", (q) =>
          q
            .eq("userId", effectiveUserId)
            .eq("module", moduleFilter)
            .eq("action", actionFilter),
        )
        .order("desc");
    } else if (effectiveUserId) {
      logsQuery = ctx.db
        .query("auditLogs")
        .withIndex("by_user", (q) => q.eq("userId", effectiveUserId))
        .order("desc");
    } else if (effectiveBranchId && moduleFilter && actionFilter) {
      logsQuery = ctx.db
        .query("auditLogs")
        .withIndex("by_branch_module_action", (q) =>
          q
            .eq("branchId", effectiveBranchId)
            .eq("module", moduleFilter)
            .eq("action", actionFilter),
        )
        .order("desc");
    } else if (effectiveBranchId) {
      logsQuery = ctx.db
        .query("auditLogs")
        .withIndex("by_branch", (q) => q.eq("branchId", effectiveBranchId))
        .order("desc");
    } else if (moduleFilter && actionFilter) {
      logsQuery = ctx.db
        .query("auditLogs")
        .withIndex("by_module_action", (q) =>
          q.eq("module", moduleFilter).eq("action", actionFilter),
        )
        .order("desc");
    } else if (moduleFilter) {
      logsQuery = ctx.db
        .query("auditLogs")
        .withIndex("by_module", (q) => q.eq("module", moduleFilter))
        .order("desc");
    } else if (actionFilter) {
      logsQuery = ctx.db
        .query("auditLogs")
        .withIndex("by_action", (q) => q.eq("action", actionFilter))
        .order("desc");
    }

    if (effectiveUserId) {
      logsQuery = logsQuery.filter((q) =>
        q.eq(q.field("userId"), effectiveUserId),
      );
    }
    if (effectiveBranchId) {
      logsQuery = logsQuery.filter((q) =>
        q.eq(q.field("branchId"), effectiveBranchId),
      );
    }
    if (moduleFilter) {
      logsQuery = logsQuery.filter((q) =>
        q.eq(q.field("module"), moduleFilter),
      );
    }
    if (actionFilter) {
      logsQuery = logsQuery.filter((q) =>
        q.eq(q.field("action"), actionFilter),
      );
    }
    if (args.fromTimestamp !== undefined) {
      logsQuery = logsQuery.filter((q) =>
        q.gte(q.field("_creationTime"), args.fromTimestamp!),
      );
    }
    if (args.toTimestamp !== undefined) {
      logsQuery = logsQuery.filter((q) =>
        q.lte(q.field("_creationTime"), args.toTimestamp!),
      );
    }

    const result = await logsQuery.paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.map(toAuditLogDto),
    };
  },
});
