import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireModulePermission } from "./lib/auth";

export const recentInvoices = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "view_invoices", "invoices");
    const requestedLimit = Number.isFinite(args.limit) ? Math.trunc(args.limit ?? 5) : 5;
    const limit = Math.min(10, Math.max(1, requestedLimit));

    let invoices;
    if (user.branchId) {
      invoices = await ctx.db
        .query("invoices")
        .withIndex("by_branch_date", (q) => q.eq("branchId", user.branchId))
        .order("desc")
        .take(limit);
    } else if (user.role === "admin") {
      invoices = await ctx.db.query("invoices").order("desc").take(limit);
    } else {
      return [];
    }

    return invoices.map((invoice) => ({
      _id: String(invoice._id),
      invoiceNumber: invoice.invoiceNumber,
      customerName: invoice.customerName,
      total: invoice.total,
      paid: invoice.paid,
      remaining: invoice.remaining,
      status: invoice.status,
      date: invoice.date,
    }));
  },
});
