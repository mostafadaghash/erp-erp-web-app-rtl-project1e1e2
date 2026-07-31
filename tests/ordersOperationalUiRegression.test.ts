import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../src/components/OrdersPage.tsx", import.meta.url), "utf8");

test("ORU-01 edit form is wired to orders.update", () => {
  assert.match(page, /useMutation\(api\.orders\.update\)/);
  assert.match(page, /await updateOrder\(\{/);
});

test("ORU-02 edit action is limited before invoice linkage", () => {
  assert.match(page, /\["pending", "confirmed"\]\.includes\(order\.status\)/);
  assert.match(page, /!order\.linkedInvoiceId/);
});

test("ORU-03 order edit submits items and trusted server-recalculated fields", () => {
  assert.match(page, /items: items\.map/);
  assert.match(page, /expectedDate: form\.expectedDate/);
  assert.doesNotMatch(page, /updateOrder\([\s\S]{0,500}total,/);
});

test("ORU-04 cancellation uses a dedicated modal, never prompt or confirm", () => {
  assert.match(page, /cancelTarget/);
  assert.match(page, /handleCancel/);
  assert.match(page, /useMutation\(api\.orders\.cancel\)/);
  assert.doesNotMatch(page, /\bprompt\s*\(|\bconfirm\s*\(|window\.prompt|window\.confirm/);
});

test("ORU-05 cancellation action is permission-aligned to delete_orders", () => {
  assert.match(page, /usePermission\("delete_orders"\)/);
  assert.match(page, /\{canDelete && !\["cancelled", "delivered"\]\.includes\(order\.status\)/);
});

test("ORU-06 cancellation modal explains deposit and invoice blockers", () => {
  assert.match(page, /يوجد عربون بقيمة/);
  assert.match(page, /الطلب مرتبط بفاتورة/);
  assert.match(page, /cancelTarget\.deposit > 0/);
  assert.match(page, /Boolean\(cancelTarget\.linkedInvoiceId\)/);
});

test("ORU-07 linked delivery orders do not offer direct delivered transition", () => {
  assert.match(page, /candidate === "delivered" && order\.linkedInvoiceId \? null : candidate/);
  assert.match(page, /التسليم من التوصيل/);
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

test("ORU-10 payment and refund UI are hidden after invoice linkage", () => {
  assert.match(page, /const financialEditable = !order\.linkedInvoiceId/);
  assert.match(page, /canCollect && financialEditable/);
  assert.match(page, /canRefund && financialEditable/);
});

test("ORU-11 financial actions keep stable request IDs while submitting", () => {
  assert.match(page, /paymentRequestId/);
  assert.match(page, /refundRequestId/);
  assert.match(page, /requestId: paymentRequestId/);
  assert.match(page, /requestId: refundRequestId/);
});

test("ORU-12 shared busy guards disable financial and cancellation actions", () => {
  assert.match(page, /if \(busy\) return/);
  assert.match(page, /disabled=\{busy/);
});

test("ORU-13 customer is visibly locked after a deposit", () => {
  assert.match(page, /disabledCustomer=\{order\.deposit > 0\}/);
  assert.match(page, /لا يمكن تغيير العميل بعد تسجيل عربون/);
});

test("ORU-14 status failures surface real Convex errors", () => {
  assert.match(page, /getErrorMessage\(error, "تعذر تحديث حالة الطلب"\)/);
  assert.match(page, /getErrorMessage\(error, "تعذر إلغاء الطلب"\)/);
});

test("ORU-15 order UI has no unsafe TypeScript escapes", () => {
  assert.doesNotMatch(page, /@ts-ignore|as any/);
});
