import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { ConvexError } from "convex/values";

export async function requireActiveBranch(ctx: MutationCtx, branchId?: Id<"branches">) {
  if (!branchId) return;
  const branch = await ctx.db.get(branchId);
  if (!branch) throw new ConvexError("الفرع غير موجود");
  if (!branch.isActive) throw new ConvexError("لا يمكن إنشاء مستند في فرع معطل");
}
export async function requireActiveCustomer(ctx: MutationCtx, id: Id<"customers">, branchId?: Id<"branches">) {
  const customer = await ctx.db.get(id);
  if (!customer) throw new ConvexError("العميل غير موجود");
  if (customer.isActive === false) throw new ConvexError("العميل معطل");
  if (branchId && customer.branchId && customer.branchId !== branchId) throw new ConvexError("العميل لا ينتمي إلى فرع المستند");
  return customer;
}
export async function requireActiveSupplier(ctx: MutationCtx, id: Id<"suppliers">) {
  const supplier = await ctx.db.get(id);
  if (!supplier) throw new ConvexError("المورد غير موجود");
  if (supplier.isActive === false) throw new ConvexError("المورد معطل");
  return supplier;
}
