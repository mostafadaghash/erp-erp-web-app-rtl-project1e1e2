import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireAuth, requirePermission, filterByBranch, logAction } from "./lib/auth";

export const list = query({
  args: {
    status: v.optional(v.string()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "view_leads");
    let leads;
    if (args.status) {
      leads = await ctx.db
        .query("leads")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .collect();
    } else {
      leads = await ctx.db.query("leads").order("desc").collect();
    }
    if (args.source) {
      leads = leads.filter((l) => l.source === args.source);
    }
    return filterByBranch(leads, user);
  },
});

export const get = query({
  args: { id: v.id("leads") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "view_leads");
    return await ctx.db.get(args.id);
  },
});

export const getWithActivities = query({
  args: { id: v.id("leads") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "view_leads");
    const lead = await ctx.db.get(args.id);
    if (!lead) return null;
    const activities = await ctx.db
      .query("leadActivities")
      .withIndex("by_lead", (q) => q.eq("leadId", args.id))
      .order("desc")
      .collect();
    return { ...lead, activities };
  },
});

export const stats = query({
  args: {},
  handler: async (ctx) => {
    const user = await requirePermission(ctx, "view_leads");
    const all = await ctx.db.query("leads").collect();
    const filtered = filterByBranch(all, user);
    const byStatus: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    for (const l of filtered) {
      byStatus[l.status] = (byStatus[l.status] ?? 0) + 1;
      bySource[l.source] = (bySource[l.source] ?? 0) + 1;
    }
    const won = filtered.filter((l) => l.status === "won").length;
    const total = filtered.filter((l) => l.status !== "new").length;
    return {
      total: filtered.length,
      new: byStatus["new"] ?? 0,
      contacted: byStatus["contacted"] ?? 0,
      interested: byStatus["interested"] ?? 0,
      negotiating: byStatus["negotiating"] ?? 0,
      won: byStatus["won"] ?? 0,
      lost: byStatus["lost"] ?? 0,
      conversionRate: total > 0 ? Math.round((won / total) * 100) : 0,
      bySource,
    };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    phone: v.string(),
    email: v.optional(v.string()),
    source: v.string(),
    status: v.optional(v.string()),
    interest: v.optional(v.string()),
    budget: v.optional(v.number()),
    assignedTo: v.optional(v.string()),
    branchId: v.optional(v.id("branches")),
    notes: v.optional(v.string()),
    nextFollowUpDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "create_leads");
    const branchId = args.branchId ?? (user.branchId as any);
    const id = await ctx.db.insert("leads", {
      ...args,
      branchId,
      status: args.status ?? "new",
      lastContactDate: new Date().toISOString().split("T")[0],
    });
    await logAction(ctx, user, {
      action: "create",
      module: "leads",
      recordId: id,
      recordLabel: args.name,
      details: `إضافة عميل محتمل: ${args.name} - ${args.phone}`,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("leads"),
    name: v.string(),
    phone: v.string(),
    email: v.optional(v.string()),
    source: v.string(),
    status: v.string(),
    interest: v.optional(v.string()),
    budget: v.optional(v.number()),
    assignedTo: v.optional(v.string()),
    branchId: v.optional(v.id("branches")),
    notes: v.optional(v.string()),
    lostReason: v.optional(v.string()),
    nextFollowUpDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "edit_leads");
    const { id, ...data } = args;
    const lead = await ctx.db.get(id);
    if (!lead) throw new ConvexError("العميل المحتمل غير موجود");
    await ctx.db.patch(id, data);
    await logAction(ctx, user, {
      action: "update",
      module: "leads",
      recordId: id,
      recordLabel: args.name,
      details: `تحديث بيانات العميل المحتمل: ${args.name}`,
    });
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("leads"),
    status: v.string(),
    lostReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "edit_leads");
    const lead = await ctx.db.get(args.id);
    if (!lead) throw new ConvexError("العميل المحتمل غير موجود");
    await ctx.db.patch(args.id, {
      status: args.status,
      lostReason: args.lostReason,
      lastContactDate: new Date().toISOString().split("T")[0],
    });
    await logAction(ctx, user, {
      action: "update",
      module: "leads",
      recordId: args.id,
      recordLabel: lead.name,
      details: `تحديث حالة العميل ${lead.name} إلى: ${args.status}`,
    });
  },
});

export const convertToCustomer = mutation({
  args: {
    id: v.id("leads"),
    address: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "edit_leads");
    const lead = await ctx.db.get(args.id);
    if (!lead) throw new ConvexError("العميل المحتمل غير موجود");
    if (lead.convertedToCustomerId)
      throw new ConvexError("تم تحويل هذا العميل مسبقاً");
    const customerId = await ctx.db.insert("customers", {
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      address: args.address,
      balance: 0,
      totalPurchases: 0,
      notes: lead.notes,
      branchId: lead.branchId,
    });
    await ctx.db.patch(args.id, {
      status: "won",
      convertedToCustomerId: customerId,
      lastContactDate: new Date().toISOString().split("T")[0],
    });
    await logAction(ctx, user, {
      action: "convert",
      module: "leads",
      recordId: args.id,
      recordLabel: lead.name,
      details: `تحويل العميل المحتمل ${lead.name} إلى عميل فعلي`,
    });
    return customerId;
  },
});

export const remove = mutation({
  args: { id: v.id("leads") },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "delete_leads");
    const lead = await ctx.db.get(args.id);
    if (!lead) throw new ConvexError("العميل المحتمل غير موجود");
    const activities = await ctx.db
      .query("leadActivities")
      .withIndex("by_lead", (q) => q.eq("leadId", args.id))
      .collect();
    for (const a of activities) await ctx.db.delete(a._id);
    await ctx.db.delete(args.id);
    await logAction(ctx, user, {
      action: "delete",
      module: "leads",
      recordId: args.id,
      recordLabel: lead.name,
      details: `حذف العميل المحتمل: ${lead.name}`,
    });
  },
});

export const listActivities = query({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "view_leads");
    return await ctx.db
      .query("leadActivities")
      .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
      .order("desc")
      .collect();
  },
});

export const addActivity = mutation({
  args: {
    leadId: v.id("leads"),
    type: v.string(),
    notes: v.string(),
    outcome: v.optional(v.string()),
    nextAction: v.optional(v.string()),
    createdBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "edit_leads");
    const lead = await ctx.db.get(args.leadId);
    if (!lead) throw new ConvexError("العميل المحتمل غير موجود");
    await ctx.db.patch(args.leadId, {
      lastContactDate: new Date().toISOString().split("T")[0],
    });
    const id = await ctx.db.insert("leadActivities", {
      ...args,
      createdBy: user.name,
    });
    await logAction(ctx, user, {
      action: "create",
      module: "leads",
      recordId: id,
      recordLabel: lead.name,
      details: `إضافة نشاط للعميل ${lead.name}: ${args.type}`,
    });
    return id;
  },
});

export const deleteActivity = mutation({
  args: { id: v.id("leadActivities") },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "edit_leads");
    await ctx.db.delete(args.id);
    await logAction(ctx, user, {
      action: "delete",
      module: "leads",
      recordId: args.id,
      recordLabel: undefined,
      details: `حذف نشاط`,
    });
  },
});
