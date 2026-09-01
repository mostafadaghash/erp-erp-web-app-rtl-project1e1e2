import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ORDER_TRANSITIONS,
  canTransition,
  normalizeOrderStatus,
} from "../shared/businessRules.ts";
import {
  decodeOrderOperationalMeta,
  encodeOrderOperationalMeta,
} from "../shared/orderOperationalMeta.ts";

const permissionsSource = readFileSync("convex/lib/permissions.ts", "utf8");
const intakeSource = readFileSync("convex/orderIntake.ts", "utf8");
const lifecycleSource = readFileSync("convex/orderLifecycle.ts", "utf8");
const followUpSyncSource = readFileSync("convex/lib/operationFollowUpSync.ts", "utf8");
const followUpReconcileSource = readFileSync("convex/operationFollowUps.ts", "utf8");
const permissionMigrationSource = readFileSync("convex/permissionMigrations.ts", "utf8");
const ordersUiSource = readFileSync("src/components/OrdersPage.tsx", "utf8");
const headerSource = readFileSync("src/components/GlobalSearch.tsx", "utf8");
const sidebarSource = readFileSync("src/components/Sidebar.tsx", "utf8");

test("SO-01 customer service intake is separated from sales pricing and lifecycle permissions", () => {
  const customerServiceBlock = permissionsSource.match(/customer_service:\s*\[([\s\S]*?)\],\n\s*technician:/)?.[1] ?? "";
  assert.match(customerServiceBlock, /"create_order_intake"/);
  assert.match(customerServiceBlock, /"edit_order_intake"/);
  assert.match(customerServiceBlock, /"record_order_deposits"/);
  assert.doesNotMatch(customerServiceBlock, /"create_orders"/);
  assert.doesNotMatch(customerServiceBlock, /"edit_orders"/);
  assert.doesNotMatch(customerServiceBlock, /"price_orders"/);
  assert.doesNotMatch(customerServiceBlock, /"manage_order_lifecycle"/);

  const salesBlock = permissionsSource.match(/sales:\s*\[([\s\S]*?)\],\n\s*customer_service:/)?.[1] ?? "";
  assert.match(salesBlock, /"create_order_intake"/);
  assert.match(salesBlock, /"edit_order_intake"/);
  assert.match(salesBlock, /"price_orders"/);
  assert.match(salesBlock, /"manage_order_lifecycle"/);
  assert.doesNotMatch(salesBlock, /"create_orders"/);
  assert.doesNotMatch(salesBlock, /"edit_orders"/);

  assert.match(lifecycleSource, /requireModulePermission\(ctx,\s*"manage_order_lifecycle",\s*"orders"\)/);
  assert.match(ordersUiSource, /usePermission\("manage_order_lifecycle"\)/);
});

test("SO-02 order intake accepts registered customer, products and quantities without any selling price input", () => {
  assert.match(intakeSource, /customerId:\s*v\.id\("customers"\)/);
  assert.match(intakeSource, /productId:\s*v\.id\("products"\)/);
  assert.match(intakeSource, /quantity:\s*v\.number\(\)/);
  assert.doesNotMatch(intakeSource.match(/const itemValidator[\s\S]*?\);/)?.[0] ?? "", /unitPrice|sellPrice|price:/);
  assert.match(intakeSource, /unitPrice:\s*-1/);
  assert.match(intakeSource, /requireModulePermission\(ctx,\s*"create_order_intake",\s*"orders"\)/);
});

test("SO-03 optional deposit is posted once to finance and customer advance ledger", () => {
  assert.match(intakeSource, /requirePermission\(ctx,\s*"record_order_deposits"\)/);
  assert.match(intakeSource, /type:\s*"order_deposit"/);
  assert.match(intakeSource, /advanceDelta:\s*deposit/);
  assert.match(intakeSource, /postFinancialTransaction\(ctx, user/);
  assert.match(intakeSource, /creationRequestId:\s*idempotency/);
  assert.match(intakeSource, /withIndex\("by_creation_request"/);
});

test("SO-04 all order items must be priced before confirmation", () => {
  assert.match(lifecycleSource, /export const price = mutation/);
  assert.match(lifecycleSource, /requireModulePermission\(ctx,\s*"price_orders",\s*"orders"\)/);
  assert.match(lifecycleSource, /يجب تسعير الصنف/);
  assert.match(lifecycleSource, /if \(order\.items\.some\(item => !item\.productId \|\| item\.unitPrice < 0\)\)/);
  assert.match(ordersUiSource, /data-testid="order-price-input"/);
  assert.match(ordersUiSource, /سعّر جميع الأصناف قبل الحفظ/);
});

test("SO-05 confirmation creates or reuses exactly one invoice identity per order", () => {
  assert.match(lifecycleSource, /const creationRequestId = `order-invoice:\$\{String\(order\._id\)\}`/);
  assert.match(lifecycleSource, /withIndex\("by_creation_request"/);
  assert.match(lifecycleSource, /if \(order\.linkedInvoiceId\)/);
  assert.match(lifecycleSource, /linkedInvoiceId:\s*invoiceId/);
  assert.match(lifecycleSource, /type:\s*"invoice_charge"/);
  assert.match(lifecycleSource, /type:\s*"order_deposit_application"/);
});

test("SO-06 confirming the order posts stock through the existing inventory engine", () => {
  assert.match(lifecycleSource, /changeProductStock\(ctx, user/);
  assert.match(lifecycleSource, /INVENTORY_MOVEMENT_TYPES\.sale/);
  assert.match(lifecycleSource, /quantityDelta:\s*-quantity/);
  assert.match(lifecycleSource, /المخزون غير كافٍ للمنتج/);
});

test("SO-07 final delivery requires collecting the exact invoice remainder", () => {
  assert.match(lifecycleSource, /يجب تحصيل كامل المتبقي/);
  assert.match(lifecycleSource, /if \(!args\.collection\) throw new ConvexError\("يجب تحصيل المتبقي قبل إغلاق الطلب"\)/);
  assert.match(lifecycleSource, /type:\s*"invoice_payment"/);
  assert.match(lifecycleSource, /remaining:\s*0/);
  assert.match(ordersUiSource, /العربون السابق محسوب بالفعل ولن يُحصّل مرة ثانية/);
});

test("SO-08 cancellation supports customer credit or financial refund with stock and ledger reversal", () => {
  assert.match(lifecycleSource, /v\.literal\("customer_credit"\)/);
  assert.match(lifecycleSource, /v\.literal\("refund"\)/);
  assert.match(lifecycleSource, /INVENTORY_MOVEMENT_TYPES\.saleReversal/);
  assert.match(lifecycleSource, /type:\s*"invoice_cancel"/);
  assert.match(lifecycleSource, /reversePostedFinancialTransaction/);
  assert.match(lifecycleSource, /type:\s*"order_refund"/);
  assert.match(ordersUiSource, /يظل رصيدًا مقدمًا للعميل/);
  assert.match(ordersUiSource, /رد المدفوعات من الخزائن الأصلية/);
});

test("SO-09 preparation order is an operational DTO without pricing or profit fields", () => {
  const preparationSection = lifecycleSource.match(/export const preparationOrder = query\(([\s\S]*?)export const pendingNotifications/)?.[1] ?? "";
  assert.match(preparationSection, /orderNumber/);
  assert.match(preparationSection, /customerName/);
  assert.match(preparationSection, /customerPhone/);
  assert.match(preparationSection, /sku:/);
  assert.match(preparationSection, /quantity:/);
  const returnBody = preparationSection.match(/return \{([\s\S]*?)\n\s*\};/)?.[1] ?? "";
  assert.ok(returnBody.length > 0);
  assert.doesNotMatch(returnBody, /unitPrice|sellPrice|costPrice|profit|deposit|remaining|\btotal\s*:/);
  assert.match(ordersUiSource, /هذا المستند تشغيلي ولا يحتوي على أسعار أو تكلفة أو ربح أو إجماليات مالية/);
});

test("SO-10 order transitions allow guarded backward moves while preserving terminal states", () => {
  assert.equal(canTransition(ORDER_TRANSITIONS, "ready", "preparing"), true);
  assert.equal(canTransition(ORDER_TRANSITIONS, "handed_to_shipping", "ready"), true);
  assert.equal(canTransition(ORDER_TRANSITIONS, "received", "ready"), false);
  assert.equal(normalizeOrderStatus("delivered"), "received");
  assert.match(lifecycleSource, /BACKWARD_TRANSITIONS/);
  assert.match(lifecycleSource, /سبب الرجوع للحالة السابقة مطلوب/);
});

test("SO-11 order and repair follow-ups reconcile idempotently by source identity", () => {
  assert.match(followUpSyncSource, /withIndex\("by_source"/);
  assert.match(followUpSyncSource, /auto:\$\{input\.sourceType\}:\$\{sourceId\}/);
  assert.match(followUpSyncSource, /duplicateCount/);
  assert.match(followUpReconcileSource, /OPEN_ORDER_STATUSES/);
  assert.match(followUpReconcileSource, /OPEN_REPAIR_STATUSES/);
  assert.match(followUpReconcileSource, /sourceType:\s*"order"/);
  assert.match(followUpReconcileSource, /sourceType:\s*"repair"/);
});

test("SO-12 header, sidebar and periodic reconciliation surface operational work", () => {
  assert.match(headerSource, /api\.orderLifecycle\.pendingNotifications/);
  assert.match(headerSource, /api\.customerFollowUps\.list/);
  assert.match(headerSource, /data-testid="header-operational-notifications"/);
  assert.match(sidebarSource, /api\.operationFollowUps\.syncOpenOperations/);
  assert.match(sidebarSource, /5 \* 60 \* 1000/);
  assert.match(sidebarSource, /window\.addEventListener\("online"/);
  assert.match(sidebarSource, /data-testid=\{`nav-badge-\$\{item\.id\}`\}/);
});

test("SO-13 existing explicit employee permission arrays have a safe compatibility migration", () => {
  assert.match(permissionMigrationSource, /export const reconcileRolePermissions = mutation/);
  assert.match(permissionMigrationSource, /ROLE_PERMISSIONS\[profile\.role\]/);
  assert.match(permissionMigrationSource, /requireAdmin\(ctx\)/);
  assert.match(permissionMigrationSource, /reconcile_permissions/);
});

test("SO-14 operational metadata preserves legacy notes and structured shipping fields", () => {
  const encoded = encodeOrderOperationalMeta({
    internalNotes: "ملاحظة داخلية",
    customerAddress: "القاهرة",
    deliveryAddress: "مدينة نصر",
    shippingCompany: "شركة شحن",
    deliveryNotes: "اتصل قبل الوصول",
  });
  assert.ok(encoded);
  assert.deepEqual(decodeOrderOperationalMeta(encoded), {
    internalNotes: "ملاحظة داخلية",
    customerAddress: "القاهرة",
    deliveryAddress: "مدينة نصر",
    shippingCompany: "شركة شحن",
    deliveryNotes: "اتصل قبل الوصول",
  });
  assert.deepEqual(decodeOrderOperationalMeta("legacy free text"), { internalNotes: "legacy free text" });
});

test("SO-15 automated cancellation refuses active sales returns or prior refunds", () => {
  assert.match(lifecycleSource, /invoiceReturns\.some\(salesReturn => salesReturn\.status === "posted"\)/);
  assert.match(lifecycleSource, /مرتجع مبيعات نشط/);
  assert.match(lifecycleSource, /tx\.type === "order_refund" \|\| tx\.type === "invoice_refund"/);
  assert.match(lifecycleSource, /لتجنب رد المبلغ مرتين/);
});
