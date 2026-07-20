import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { assertBranchAccess, type AuthUser } from "./auth";

import { calculateStockAfter, INVENTORY_MOVEMENT_TYPES, type InventoryMovementType } from "../../shared/inventoryRules";

type ChangeStockInput = {
  productId: Id<"products">;
  quantityDelta: number;
  type: InventoryMovementType;
  reason: string;
  referenceId?: string;
  referenceType?: string;
};

export async function changeProductStock(ctx: MutationCtx, user: AuthUser, input: ChangeStockInput) {
  const product = await ctx.db.get(input.productId);
  if (!product) throw new ConvexError("المنتج غير موجود");
  assertBranchAccess(user, product);
  let stockAfter: number;
  try {
    stockAfter = calculateStockAfter(product.stock, input.quantityDelta, input.reason);
  } catch (error) {
    throw new ConvexError(error instanceof Error ? error.message : "حركة المخزون غير صالحة");
  }
  await ctx.db.patch(product._id, { stock: stockAfter });
  await ctx.db.insert("inventoryMovements", {
    productId: product._id,
    productName: product.name,
    type: input.type,
    quantityDelta: input.quantityDelta,
    stockBefore: product.stock,
    stockAfter,
    reason: input.reason.trim(),
    referenceId: input.referenceId,
    referenceType: input.referenceType,
    branchId: product.branchId,
    userId: user.userId,
    createdAt: Date.now(),
  });
  return stockAfter;
}
