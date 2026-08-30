import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import baseSchema from "./lib/baseSchema.ts";

export default defineSchema({
  ...baseSchema.tables,

  // القلب الموحد لمتابعات العملاء. الحالات الزمنية مثل "اليوم" و"متأخر"
  // مشتقة عند القراءة ولا تُخزن حتى لا تصبح البيانات قديمة بمرور الوقت.
  customerFollowUps: defineTable({
    branchId: v.id("branches"),
    customerId: v.optional(v.id("customers")),
    customerName: v.string(),
    phone: v.string(),
    sourceType: v.union(
      v.literal("lead"),
      v.literal("order"),
      v.literal("repair"),
      v.literal("delivery"),
      v.literal("delivered_operation"),
      v.literal("manual"),
    ),
    sourceId: v.optional(v.string()),
    sourceNumber: v.optional(v.string()),
    sourceStatus: v.optional(v.string()),
    followUpType: v.string(),
    followUpDate: v.string(),
    assignedToProfileId: v.id("userProfiles"),
    assignedToName: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("follow_up_later"),
      v.literal("completed"),
    ),
    lastContactAt: v.optional(v.number()),
    result: v.optional(v.string()),
    notes: v.optional(v.string()),
    creationRequestId: v.string(),
    creationKey: v.string(),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedBy: v.string(),
    updatedAt: v.number(),
    completedBy: v.optional(v.string()),
    completedAt: v.optional(v.number()),
  })
    .index("by_date", ["followUpDate"])
    .index("by_status_date", ["status", "followUpDate"])
    .index("by_branch_date", ["branchId", "followUpDate"])
    .index("by_branch_status_date", ["branchId", "status", "followUpDate"])
    .index("by_assignee_date", ["assignedToProfileId", "followUpDate"])
    .index("by_assignee_status_date", ["assignedToProfileId", "status", "followUpDate"])
    .index("by_customer_date", ["customerId", "followUpDate"])
    .index("by_source", ["sourceType", "sourceId"])
    .index("by_creation_key", ["creationKey"]),
});
