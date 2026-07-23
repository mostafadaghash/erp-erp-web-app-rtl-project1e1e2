import test from "node:test";
import assert from "node:assert/strict";
import { allocationTotal, canonicalAllocations, derivePurchaseReceiptState, hasAtMostTwoDecimals, reverseAllocatedPayment } from "../shared/supplierPaymentRules.ts";

test("supplier payment pure rules calculate and round allocation totals", () => assert.equal(allocationTotal([{ purchaseReceiptId: "a", amount: 10.1 }, { purchaseReceiptId: "b", amount: 20.2 }]), 30.3));
test("supplier payment pure rules reject fractions below a piastre", () => { assert.equal(hasAtMostTwoDecimals(1.23), true); assert.equal(hasAtMostTwoDecimals(1.234), false); });
test("receipt state derives unpaid, partial and paid", () => { assert.equal(derivePurchaseReceiptState(100, 0).status, "unpaid"); assert.equal(derivePurchaseReceiptState(100, 40).status, "partial"); assert.equal(derivePurchaseReceiptState(100, 100).status, "paid"); });
test("reversal subtracts the allocation and restores remaining", () => assert.deepEqual(reverseAllocatedPayment(100, 75, 25), { paidAmount: 50, remainingAmount: 50, status: "partial" }));
test("canonical allocations ignore input ordering", () => assert.deepEqual(canonicalAllocations([{ purchaseReceiptId: "z", amount: 2 }, { purchaseReceiptId: "a", amount: 1 }]), [{ purchaseReceiptId: "a", amount: 1 }, { purchaseReceiptId: "z", amount: 2 }]));
