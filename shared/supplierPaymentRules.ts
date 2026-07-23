const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export type AllocationInput<T extends string = string> = { purchaseReceiptId: T; amount: number };

export function canonicalAllocations<T extends string>(allocations: readonly AllocationInput<T>[]): AllocationInput<T>[] {
  return [...allocations].map(row => ({ ...row, amount: roundMoney(row.amount) })).sort((a, b) => String(a.purchaseReceiptId).localeCompare(String(b.purchaseReceiptId)));
}

export function allocationTotal(allocations: readonly AllocationInput[]): number {
  return roundMoney(allocations.reduce((sum, row) => sum + row.amount, 0));
}

export function hasAtMostTwoDecimals(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value * 100 - Math.round(value * 100)) < 1e-7;
}

export function derivePurchaseReceiptState(payableAmount: number, paidAmount: number) {
  const payable = roundMoney(payableAmount), paid = roundMoney(paidAmount), remaining = roundMoney(payable - paid);
  if (!Number.isFinite(payable) || !Number.isFinite(paid) || payable < 0 || paid < 0 || paid > payable || remaining < 0 || roundMoney(paid + remaining) !== payable) throw new Error("مبالغ مستند الشراء غير متسقة");
  return { paidAmount: paid, remainingAmount: remaining, status: (paid === 0 ? "unpaid" : remaining === 0 ? "paid" : "partial") as "unpaid" | "partial" | "paid" };
}

export function reverseAllocatedPayment(payableAmount: number, paidAmount: number, allocation: number) {
  return derivePurchaseReceiptState(payableAmount, roundMoney(paidAmount - allocation));
}
