import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const orders = readFileSync("src/components/OrdersPage.tsx", "utf8");
const lifecycle = readFileSync("convex/orderLifecycle.ts", "utf8");
const invoices = readFileSync("src/components/InvoicesPage.tsx", "utf8");
const repairs = readFileSync("src/components/RepairsPage.tsx", "utf8");
const expenses = readFileSync("src/components/ExpensesPage.tsx", "utf8");

test("Orders final collection picker is permission and lifecycle-action gated", () => {
  assert.match(orders, /collectionAccountPicker, canCollect && collection \? \{\} : "skip"/);
  assert.match(orders, /usePermission\("record_collections"\)/);
  assert.match(orders, /المتبقي المطلوب تحصيله/);
});

test("Orders final collection is posted by the atomic lifecycle mutation", () => {
  assert.match(orders, /useMutation\(api\.orderLifecycle\.transition\)/);
  assert.match(orders, /collection:\s*\{/);
  assert.match(lifecycle, /requirePermission\(ctx, "record_collections"\)/);
  assert.match(lifecycle, /type:\s*"invoice_payment"/);
});

test("Orders cancellation refund is permission gated and reverses original financial transactions", () => {
  assert.match(orders, /usePermission\("refund_collections"\)/);
  assert.match(orders, /value="refund"/);
  assert.match(lifecycle, /requirePermission\(ctx, "refund_collections"\)/);
  assert.match(lifecycle, /reversePostedFinancialTransaction/);
});

test("Orders lifecycle financial request ids remain stable while a dialog is retried", () => {
  assert.match(orders, /requestId:\s*collection\.requestId/);
  assert.match(orders, /requestId:\s*cancelRequestId/);
  assert.doesNotMatch(orders, /catch[\s\S]{0,180}setCancelRequestId/);
});

test("Orders financial and cancellation submits prevent duplicate clicks", () => {
  assert.match(orders, /if \(!collection \|\| busy\) return/);
  assert.match(orders, /if \(!cancelOrder \|\| busy/);
  assert.ok((orders.match(/disabled=\{busy/g) ?? []).length >= 3);
});

test("invoice and repair refunds use refund picker", () => {
  assert.match(invoices, /refundAccountPicker/);
  assert.match(repairs, /refundAccountPicker/);
});

test("expenses gate account and initialization queries independently", () => {
  assert.match(expenses, /disbursementAccountPicker, canDisburse \?/);
  assert.match(expenses, /initializationStatus, canViewFinance \?/);
});

test("order preparation printing uses print_orders and a server-owned safe DTO", () => {
  assert.match(orders, /usePermission\("print_orders"\)/);
  assert.match(orders, /api\.orderLifecycle\.preparationOrder/);
  assert.match(orders, /preparation-order-print/);
  assert.match(lifecycle, /requireModulePermission\(ctx, "print_orders", "orders"\)/);
});

test("Orders contains no unsafe state or empty-args assertion", () => {
  assert.doesNotMatch(orders, /useState<any>/);
  assert.doesNotMatch(orders, /\{\} as const/);
});
