import test from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema.ts";
import { api } from "../convex/_generated/api.js";
import type { Id } from "../convex/_generated/dataModel";

const modules = {
  "../convex/_generated/api.js": () => import("../convex/_generated/api.js"),
  "../convex/_generated/server.js": () => import("../convex/_generated/server.js"),
  "../convex/orders.ts": () => import("../convex/orders.ts"),
};

async function fixture() {
  const raw = convexTest(schema, modules);
  const ids = await raw.run(async (ctx) => {
    const branchId = await ctx.db.insert("branches", { name: "القاهرة", address: "القاهرة", isActive: true });
    const otherBranchId = await ctx.db.insert("branches", { name: "الجيزة", address: "الجيزة", isActive: true });
    await ctx.db.insert("userProfiles", { userId: "admin", tokenIdentifier: "admin-token", name: "مدير", role: "admin", branchId, permissions: [], isActive: true });
    await ctx.db.insert("userProfiles", { userId: "editor", tokenIdentifier: "editor-token", name: "محرر", role: "viewer", branchId, permissions: ["view_orders", "edit_orders"], isActive: true });
    await ctx.db.insert("userProfiles", { userId: "viewer", tokenIdentifier: "viewer-token", name: "مشاهد", role: "viewer", branchId, permissions: ["view_orders"], isActive: true });
    const customerId = await ctx.db.insert("customers", { name: "أحمد", phone: "01000000000", balance: 0, totalPurchases: 0, branchId, isActive: true });
    const otherCustomerId = await ctx.db.insert("customers", { name: "محمود", phone: "01100000000", balance: 0, totalPurchases: 0, branchId, isActive: true });
    return { branchId, otherBranchId, customerId, otherCustomerId };
  });
  return {
    raw,
    admin: raw.withIdentity({ subject: "admin", tokenIdentifier: "admin-token" }),
    editor: raw.withIdentity({ subject: "editor", tokenIdentifier: "editor-token" }),
    viewer: raw.withIdentity({ subject: "viewer", tokenIdentifier: "viewer-token" }),
    ...ids,
  };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

async function insertOrder(e: Fixture, overrides: Partial<{ status: string; deposit: number; remaining: number; linkedInvoiceId: Id<"invoices">; branchId: Id<"branches">; customerId: Id<"customers"> }> = {}) {
  return e.raw.run((ctx) => ctx.db.insert("orders", {
    orderNumber: `ORD-2026-${Math.floor(Math.random() * 90000 + 10000)}`,
    customerId: overrides.customerId ?? e.customerId,
    customerName: "أحمد",
    customerPhone: "01000000000",
    items: [{ productName: "PS5", quantity: 1, unitPrice: 25000 }],
    total: 25000,
    deposit: overrides.deposit ?? 0,
    remaining: overrides.remaining ?? 25000,
    status: overrides.status ?? "pending",
    branchId: overrides.branchId ?? e.branchId,
    linkedInvoiceId: overrides.linkedInvoiceId,
  }));
}

async function snapshot(e: Fixture) {
  return e.raw.run(async (ctx) => ({
    orders: await ctx.db.query("orders").collect(),
    logs: await ctx.db.query("auditLogs").collect(),
  }));
}

test("ORD-01 pending order edit recalculates totals on the server", async () => {
  const e = await fixture();
  const id = await insertOrder(e);
  await e.editor.mutation(api.orders.update, {
    id,
    customerName: "  عميل نقدي  ",
    customerPhone: " 01234567890 ",
    items: [{ productName: " Slim 5 ", quantity: 2, unitPrice: 12000.125, notes: "  أسود  " }],
    expectedDate: "2026-08-05",
    notes: "  تجهيز خاص  ",
  });
  const row = await e.raw.run((ctx) => ctx.db.get(id));
  assert.equal(row?.customerName, "عميل نقدي");
  assert.equal(row?.items[0].productName, "Slim 5");
  assert.equal(row?.items[0].unitPrice, 12000.13);
  assert.equal(row?.total, 24000.26);
  assert.equal(row?.remaining, 24000.26);
  assert.equal(row?.notes, "تجهيز خاص");
});

test("ORD-02 confirmed order remains editable before invoice linkage", async () => {
  const e = await fixture();
  const id = await insertOrder(e, { status: "confirmed" });
  await e.editor.mutation(api.orders.update, { id, customerName: "أحمد", items: [{ productName: "PS5", quantity: 1, unitPrice: 24000 }] });
  const row = await e.raw.run((ctx) => ctx.db.get(id));
  assert.equal(row?.total, 24000);
  assert.equal(row?.status, "confirmed");
});

test("ORD-03 ready order rejects body edits atomically", async () => {
  const e = await fixture();
  const id = await insertOrder(e, { status: "ready" });
  const before = await snapshot(e);
  await assert.rejects(e.editor.mutation(api.orders.update, { id, customerName: "تعديل", items: [{ productName: "PS5", quantity: 1, unitPrice: 1 }] }), /لا يمكن تعديل بيانات الطلب/);
  assert.deepEqual(await snapshot(e), before);
});

test("ORD-04 total cannot be reduced below a recorded deposit", async () => {
  const e = await fixture();
  const id = await insertOrder(e, { deposit: 5000, remaining: 20000 });
  const before = await snapshot(e);
  await assert.rejects(e.editor.mutation(api.orders.update, { id, customerName: "أحمد", items: [{ productName: "PS5", quantity: 1, unitPrice: 4000 }] }), /خفض إجمالي الطلب/);
  assert.deepEqual(await snapshot(e), before);
});

test("ORD-05 customer cannot change after deposit", async () => {
  const e = await fixture();
  const id = await insertOrder(e, { deposit: 5000, remaining: 20000 });
  await assert.rejects(e.editor.mutation(api.orders.update, { id, customerId: e.otherCustomerId, customerName: "محمود", items: [{ productName: "PS5", quantity: 1, unitPrice: 25000 }] }), /لا يمكن تغيير العميل/);
});

test("ORD-06 cancellation is closed from edit_orders status mutation", async () => {
  const e = await fixture();
  const id = await insertOrder(e);
  await assert.rejects(e.editor.mutation(api.orders.updateStatus, { id, status: "cancelled", reason: "اختبار" }), /مسار إلغاء الطلب المخصص/);
  assert.equal((await e.raw.run((ctx) => ctx.db.get(id)))?.status, "pending");
});

test("ORD-07 viewer without delete_orders cannot cancel", async () => {
  const e = await fixture();
  const id = await insertOrder(e);
  await assert.rejects(e.viewer.mutation(api.orders.cancel, { id, reason: "غير مسموح" }));
  assert.equal((await e.raw.run((ctx) => ctx.db.get(id)))?.status, "pending");
});

test("ORD-08 cancellation rejects an outstanding deposit", async () => {
  const e = await fixture();
  const id = await insertOrder(e, { deposit: 1000, remaining: 24000 });
  await assert.rejects(e.admin.mutation(api.orders.cancel, { id, reason: "إلغاء" }), /يحتاج معالجة استرداد مالي/);
});

test("ORD-09 linked invoice locks order cancellation and edits", async () => {
  const e = await fixture();
  const invoiceId = await e.raw.run((ctx) => ctx.db.insert("invoices", {
    invoiceNumber: "INV-2026-00001", customerId: e.customerId, customerName: "أحمد",
    items: [], subtotal: 0, discount: 0, tax: 0, total: 25000, paid: 0, remaining: 25000,
    paymentMethod: "unpaid", status: "pending", branchId: e.branchId, type: "sale",
  }));
  const id = await insertOrder(e, { linkedInvoiceId: invoiceId });
  await assert.rejects(e.admin.mutation(api.orders.cancel, { id, reason: "إلغاء" }), /بعد ربطه بالفاتورة/);
  await assert.rejects(e.editor.mutation(api.orders.update, { id, customerName: "أحمد", items: [{ productName: "PS5", quantity: 1, unitPrice: 25000 }] }), /بعد ربطه بالفاتورة/);
});

test("ORD-10 details expose linked invoice and delivery summaries", async () => {
  const e = await fixture();
  const invoiceId = await e.raw.run((ctx) => ctx.db.insert("invoices", {
    invoiceNumber: "INV-2026-00002", customerId: e.customerId, customerName: "أحمد",
    items: [], subtotal: 0, discount: 0, tax: 0, total: 25000, paid: 5000, remaining: 20000,
    paymentMethod: "partial", status: "partial", branchId: e.branchId, type: "sale",
  }));
  const id = await insertOrder(e, { status: "ready", linkedInvoiceId: invoiceId });
  await e.raw.run((ctx) => ctx.db.insert("deliveries", {
    deliveryNumber: "DEL-2026-00001", orderId: id, orderNumber: "ORD-TEST", invoiceId, invoiceNumber: "INV-2026-00002",
    customerId: e.customerId, customerName: "أحمد", customerPhone: "01000000000", city: "القاهرة", address: "عنوان",
    items: [{ productName: "PS5", quantity: 1, unitPrice: 25000 }], totalAmount: 25000, paymentMethod: "partial", codAmount: 20000,
    prepaidAmount: 5000, shippingCompany: "شركة", shippingCost: 100, status: "pending", branchId: e.branchId,
  }));
  const details = await e.viewer.query(api.orders.details, { id });
  assert.equal(details.invoice?.invoiceNumber, "INV-2026-00002");
  assert.equal(details.deliveries.length, 1);
  assert.equal(details.deliveries[0].deliveryNumber, "DEL-2026-00001");
  assert.ok(details.timeline.some((event) => event.kind === "delivery"));
  assert.ok(details.timeline.some((event) => event.kind === "created"));
});

test("ORD-11 details preserve branch isolation", async () => {
  const e = await fixture();
  const id = await insertOrder(e, { branchId: e.otherBranchId });
  await assert.rejects(e.viewer.query(api.orders.details, { id }));
});

test("ORD-12 successful cancellation records an auditable reason", async () => {
  const e = await fixture();
  const id = await insertOrder(e);
  await e.admin.mutation(api.orders.cancel, { id, reason: "طلب العميل" });
  const state = await e.raw.run(async (ctx) => ({ row: await ctx.db.get(id), logs: await ctx.db.query("auditLogs").collect() }));
  assert.equal(state.row?.status, "cancelled");
  assert.equal(state.row?.cancellationReason, "طلب العميل");
  assert.ok(state.logs.some((log) => log.recordId === id && log.action === "cancel" && log.details?.includes("طلب العميل")));
});
