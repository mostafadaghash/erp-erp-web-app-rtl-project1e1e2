import { mutation } from "../convex/_generated/server";
import { v } from "convex/values";
import { requirePermission } from "../convex/lib/auth";
import { postFinancialTransaction } from "../convex/lib/finance";

const transactionType = v.union(
  v.literal("opening_balance"),
  v.literal("invoice_payment"),
  v.literal("order_deposit"),
  v.literal("repair_payment"),
  v.literal("expense_payment"),
  v.literal("supplier_payment"),
  v.literal("supplier_refund"),
  v.literal("account_transfer"),
  v.literal("paymob_settlement"),
  v.literal("clearing_settlement"),
  v.literal("delivery_cod_collection"),
  v.literal("cod_settlement"),
  v.literal("invoice_refund"),
  v.literal("sales_return_refund"),
  v.literal("order_refund"),
  v.literal("repair_refund"),
);

export const post = mutation({
  args: {
    type: transactionType,
    requestId: v.string(),
    date: v.string(),
    amount: v.number(),
    feeAmount: v.optional(v.number()),
    description: v.string(),
    branchId: v.id("branches"),
    customerId: v.optional(v.id("customers")),
    supplierId: v.optional(v.id("suppliers")),
    movements: v.array(
      v.object({
        accountId: v.id("financialAccounts"),
        signedAmount: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "view_general_ledger");
    return await postFinancialTransaction(ctx, user, {
      ...args,
      referenceType: "bridge_test",
      referenceId: args.requestId,
      referenceNumber: args.requestId,
    });
  },
});
