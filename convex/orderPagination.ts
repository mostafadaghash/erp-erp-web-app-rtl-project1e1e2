import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireModulePermission } from "./lib/auth";

const orderStatus = v.union(
  v.literal("pending"),
  v.literal("confirmed"),
  v.literal("ready"),
  v.literal("delivered"),
  v.literal("cancelled"),
);

/**
 * Cursor-paginated Orders read model.
 *
 * The legacy orders.list query intentionally remains untouched during this
 * backend-first slice so existing callers keep their contract. The Orders UI
 * can migrate to this endpoint independently, then the legacy collector can be
 * removed once no callers remain.
 */
export const list = query({
  args: {
    status: v.optional(orderStatus),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "view_orders", "orders");

    if (user.role !== "admin" && !user.branchId) {
      return {
        page: [],
        isDone: true,
        continueCursor: "",
      };
    }

    const baseQuery = (() => {
      if (user.role === "admin") {
        return args.status
          ? ctx.db
              .query("orders")
              .withIndex("by_status", (q) => q.eq("status", args.status!))
              .order("desc")
          : ctx.db.query("orders").order("desc");
      }

      const branchId = user.branchId!;
      if (args.status) {
        return ctx.db
          .query("orders")
          .withIndex("by_branch_status", (q) =>
            q.eq("branchId", branchId).eq("status", args.status!),
          )
          .order("desc");
      }

      // There is no by_branch index in the current schema. Filtering the
      // creation-time ordered query keeps the existing newest-first semantics
      // while paginate() bounds the materialized result and exposes a server
      // cursor. A dedicated by_branch index is the next schema optimization.
      return ctx.db
        .query("orders")
        .filter((q) => q.eq(q.field("branchId"), branchId))
        .order("desc");
    })();

    const result = await baseQuery.paginate(args.paginationOpts);
    const page = await Promise.all(
      result.page.map(async (order) => {
        if (!order.linkedInvoiceId) return order;
        const invoice = await ctx.db.get(order.linkedInvoiceId);
        return {
          ...order,
          linkedInvoiceId: invoice?._id,
          linkedInvoiceNumber: invoice?.invoiceNumber,
        };
      }),
    );

    return {
      ...result,
      page,
    };
  },
});
