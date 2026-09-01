import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../src/components/OrdersPage.tsx", import.meta.url), "utf8");
const intake = readFileSync(new URL("../convex/orderIntake.ts", import.meta.url), "utf8");
const lifecycle = readFileSync(new URL("../convex/orderLifecycle.ts", import.meta.url), "utf8");

test("ORU-01 edit form is wired to the dedicated order intake update", () => {
  assert.match(page, /useMutation\(api\.orderIntake\.update\)/);
  assert.match(page, /await update\(\{ id: order\._id/);
});

test("ORU-02 intake edit action is limited to pending orders before invoice linkage", () => {
  assert.match(page, /current === "pending" && canEditIntake && !order\.linkedInvoiceId/);
  assert.match(intake, /if \(order\.status !== "pending" \|\| order\.linkedInvoiceId\)/);
});

test("ORU-03 intake edit submits linked products and quantities without client totals or prices", () => {
  assert.match(page, /items: selected\.map/);
  assert.match(page, /productId: item\.productId/);
  assert.match(page, /expectedDate: form\.expectedDate/);
  assert.doesNotMatch(page, /await update\(\{[\s\S]{0,700}\btotal\s*:/);
  assert.doesNotMatch(page, /await update\(\{[\s\S]{0,700}\bunitPrice\s*:/);
});

test("ORU-04 cancellation uses a dedicated modal and atomic lifecycle mutation", () => {
  assert.match(page, /cancelOrder/);
  assert.match(page, /submitCancel/);
  assert.match(page, /useMutation\(api\.orderLifecycle\.cancel\)/);
  assert.doesNotMatch(page, /\bprompt\s*\(|\bconfirm\s*\(|window\.prompt|window\.confirm/);
});

test("ORU-05 lifecycle transitions and cancellation use the dedicated lifecycle permission", () => {
  assert.match(page, /usePermission\("manage_order_lifecycle"\)/);
  assert.match(lifecycle, /requireModulePermission\(ctx, "manage_order_lifecycle", "orders"\)/);
});

test("ORU-06 cancellation modal explains the two supported payment dispositions", () => {
  assert.match(page, /معالجة المدفوعات/);
  assert.match(page, /يظل رصيدًا مقدمًا للعميل/);
  assert.match(page, /رد المدفوعات من الخزائن الأصلية/);
  assert.match(page, /cancelOrder\.deposit > 0 \|\| cancelOrder\.linkedInvoiceId/);
});

test("ORU-07 direct delivery remains protected by the server delivery lock", () => {
  assert.match(lifecycle, /if \(args\.status === "delivered_to_customer"\) await assertOrderNotLockedByDelivery/);
  assert.match(lifecycle, /canTransition\(ORDER_TRANSITIONS, current, args\.status\)/);
});

test("ORU-08 details modal uses the server-owned order details read model", () => {
  assert.match(page, /useQuery\(api\.orders\.details/);
  assert.match(page, /details\.invoice/);
  assert.match(page, /details\.deliveries/);
  assert.match(page, /details\.timeline/);
});

test("ORU-09 financial history remains linked to the order reference", () => {
  assert.match(page, /FinancialHistory referenceType="order"/);
  assert.match(page, /referenceId=\{String\(details\.order\._id\)\}/);
});

test("ORU-10 final collection and cancellation refund are exposed only in their lifecycle dialogs", () => {
  assert.match(page, /canCollect && collection \? \{\} : "skip"/);
  assert.match(page, /collection\.order\.remaining/);
  assert.match(page, /canRefund && <option value="refund"/);
  assert.doesNotMatch(page, /api\.orders\.addPayment|api\.orders\.refundDeposit/);
});

test("ORU-11 lifecycle financial actions keep stable request IDs while submitting", () => {
  assert.match(page, /requestId: collection\.requestId/);
  assert.match(page, /requestId: cancelRequestId/);
  assert.match(page, /setCancelRequestId\(uuid\(\)\)/);
});

test("ORU-12 shared busy guards disable financial and cancellation actions", () => {
  assert.match(page, /if \(!collection \|\| busy\) return/);
  assert.match(page, /if \(!cancelOrder \|\| busy/);
  assert.match(page, /disabled=\{busy/);
});

test("ORU-13 customer identity cannot change after a deposit", () => {
  assert.match(intake, /if \(order\.deposit > 0 && order\.customerId && args\.customerId !== order\.customerId\)/);
  assert.match(intake, /لا يمكن تغيير العميل بعد تسجيل عربون/);
});

test("ORU-14 lifecycle failures surface real Convex errors", () => {
  assert.match(page, /getErrorMessage\(error, "تعذر تغيير حالة الطلب"\)/);
  assert.match(page, /getErrorMessage\(error, "تعذر إلغاء الطلب"\)/);
});

test("ORU-15 order UI has no unsafe TypeScript escapes", () => {
  assert.doesNotMatch(page, /@ts-ignore|as any/);
});
