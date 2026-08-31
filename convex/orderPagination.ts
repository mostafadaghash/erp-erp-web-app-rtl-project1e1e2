import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireModulePermission } from "./lib/auth";

const orderStatus = v.union(
  v.literal("pending"),
  v.literal("confirmed"),
  v.literal("preparing"),
  v.literal("ready"),
  v.literal("delivered_to_customer"),
  v.literal("handed_to_shipping"),
  v.literal("received"),
  v.literal("cancelled"),
);

/** Cursor-paginated Orders read model using the unified lifecycle. */
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
        if (args.status === "received") {
          return ctx.db
            .query("orders")
            .filter((q) => q.or(
              q.eq(q.field("status"), "received"),
              q.eq(q.field("status"), "delivered"),
            ))
            .order("desc");
        }
        return args.status
          ? ctx.db
              .query("orders")
              .withIndex("by_status", (q) => q.eq("status", args.status!))
              .order("desc")
          : ctx.db.query("orders").order("desc");
      }

      const branchId = user.branchId!;
      if (args.status === "received") {
        return ctx.db
          .query("orders")
          .filter((q) => q.and(
            q.eq(q.field("branchId"), branchId),
            q.or(
              q.eq(q.field("status"), "received"),
              q.eq(q.field("status"), "delivered"),
            ),
          ))
          .order("desc");
      }
      if (args.status) {
        return ctx.db
          .query("orders")
          .withIndex("by_branch_status", (q) =>
            q.eq("branchId", branchId).eq("status", args.status!),
          )
          .order("desc");
      }

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
