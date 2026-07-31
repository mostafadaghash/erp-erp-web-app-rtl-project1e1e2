import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const backend = readFileSync(new URL("../convex/orders.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/components/OrdersPage.tsx", import.meta.url), "utf8");
const integration = readFileSync(new URL("./ordersOperationalIntegration.test.ts", import.meta.url), "utf8");

test("order operational completion guard", () => {
  assert.match(backend, /export const update = mutation/);
  assert.match(backend, /editableStatuses = new Set\(\["pending", "confirmed"\]\)/);
  assert.match(backend, /if \(order\.linkedInvoiceId\) throw new ConvexError\("لا يمكن تعديل الطلب بعد ربطه بالفاتورة"\)/);
  assert.match(backend, /await assertOrderNotLockedByDelivery\(ctx, order\._id\)/);
  assert.match(backend, /if \(total < order\.deposit\) throw new ConvexError/);
  assert.match(backend, /if \(args\.status === "cancelled"\) throw new ConvexError\("استخدم مسار إلغاء الطلب المخصص"\)/);
  assert.match(backend, /requireModulePermission\(ctx, "delete_orders", "orders"\)/);
  assert.match(backend, /export const details = query/);
  assert.match(backend, /withIndex\("by_reference", q => q\.eq\("referenceType", "order"\)/);
  assert.match(backend, /withIndex\("by_order_status", q => q\.eq\("orderId", order\._id\)\)/);
  assert.doesNotMatch(page, /\bprompt\s*\(|\bconfirm\s*\(|window\.prompt|window\.confirm/);
  assert.doesNotMatch(page, /@ts-ignore|as any/);
  assert.doesNotMatch(backend, /@ts-ignore|as any|ctx\.db\.delete/);
  for (let id = 1; id <= 12; id += 1) {
    assert.match(integration, new RegExp(`ORD-${String(id).padStart(2, "0")}`));
  }
});
