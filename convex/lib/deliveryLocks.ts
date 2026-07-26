import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { ConvexError } from "convex/values";

export async function assertInvoiceNotLockedByActiveDelivery(ctx: MutationCtx, invoiceId: Id<"invoices">) {
  const pending = await ctx.db.query("deliveries").withIndex("by_invoice_status", q => q.eq("invoiceId", invoiceId).eq("status", "pending")).first();
  const shipped = pending ? null : await ctx.db.query("deliveries").withIndex("by_invoice_status", q => q.eq("invoiceId", invoiceId).eq("status", "shipped")).first();
  if (pending || shipped) throw new ConvexError("الفاتورة مقفلة مالياً لوجود توصيل نشط");
}

export async function assertOrderNotLockedByDelivery(ctx: MutationCtx, orderId: Id<"orders">) {
  const pending = await ctx.db.query("deliveries").withIndex("by_order_status", q => q.eq("orderId", orderId).eq("status", "pending")).first();
  const shipped = pending ? null : await ctx.db.query("deliveries").withIndex("by_order_status", q => q.eq("orderId", orderId).eq("status", "shipped")).first();
  const delivered = pending || shipped ? null : await ctx.db.query("deliveries").withIndex("by_order_status", q => q.eq("orderId", orderId).eq("status", "delivered")).first();
  if (pending || shipped || delivered) throw new ConvexError("لا يمكن تعديل الطلب أثناء دورة توصيل نشطة");
}
