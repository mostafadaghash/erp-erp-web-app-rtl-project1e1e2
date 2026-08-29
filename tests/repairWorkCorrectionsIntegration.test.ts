import test from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema.ts";
import { api } from "../convex/_generated/api.js";

const modules = {
  "../convex/_generated/api.js": () => import("../convex/_generated/api.js"),
  "../convex/_generated/server.js": () => import("../convex/_generated/server.js"),
  "../convex/repairWorkCorrections.ts": () => import("../convex/repairWorkCorrections.ts"),
};

async function fixture(status: "ready" | "delivered" = "ready") {
  const raw = convexTest(schema, modules);
  const ids = await raw.run(async (ctx) => {
    const branchId = await ctx.db.insert("branches", {
      name: "فرع الصيانة",
      address: "القاهرة",
      isActive: true,
    });
    await ctx.db.insert("settings", {
      storeName: "اختبار الصيانة",
      storeType: "repair",
      primaryColor: "#111111",
      secondaryColor: "#ffffff",
      currency: "EGP",
      taxRate: 0,
      modules: { repairs: true },
    });
    await ctx.db.insert("userProfiles", {
      userId: "admin",
      tokenIdentifier: "admin-token",
      name: "مدير النظام",
      role: "admin",
      branchId,
      permissions: [],
      isActive: true,
    });
    const productId = await ctx.db.insert("products", {
      name: "IC Power",
      sku: "PART-001",
      costPrice: 100,
      inventoryValue: 900,
      sellPrice: 150,
      stock: 9,
      minStock: 0,
      unit: "قطعة",
      branchId,
      isActive: true,
    });
    const repairId = await ctx.db.insert("repairs", {
      repairNumber: "REP-2026-90001",
      customerName: "عميل اختبار",
      customerPhone: "01000000000",
      deviceType: "بلايستيشن",
      deviceBrand: "Sony",
      deviceModel: "PS5",
      problem: "لا يعمل",
      diagnosis: "عطل باور",
      parts: [{
        productId,
        name: "IC Power",
        cost: 150,
        quantity: 1,
        unitPrice: 150,
        lineTotal: 150,
        historicalUnitCost: 100,
        inventoryValueRemoved: 100,
      }],
      laborCost: 50,
      partsTotal: 150,
      partsCogsTotal: 100,
      costingVersion: 1,
      totalCost: 200,
      deposit: 0,
      remaining: 200,
      status,
      receivedDate: "2026-08-20",
      branchId,
      createdBy: "admin",
    });
    return { branchId, productId, repairId };
  });
  return {
    raw,
    admin: raw.withIdentity({ subject: "admin", tokenIdentifier: "admin-token" }),
    ...ids,
  };
}

test("RWC-I01 ready repair can replace issued parts and recalculate totals atomically", async () => {
  const e = await fixture("ready");
  await e.admin.mutation(api.repairWorkCorrections.updateWork, {
    repairId: e.repairId,
    laborCost: 75,
    parts: [{ productId: e.productId, quantity: 2, unitPrice: 160 }],
    diagnosis: "تم تغيير دائرة الباور واختبار الجهاز",
    qualityCheckNotes: "اختبار ساعتين",
    date: "2026-08-29",
    reason: "إثبات القطع الفعلية بعد انتهاء الفني",
    requestId: "repair-work-ready-01",
  });

  const state = await e.raw.run(async (ctx) => ({
    repair: await ctx.db.get(e.repairId),
    product: await ctx.db.get(e.productId),
    movements: await ctx.db.query("inventoryMovements").collect(),
    audit: await ctx.db.query("auditLogs").collect(),
  }));
  assert.equal(state.repair?.status, "ready");
  assert.equal(state.repair?.parts.length, 1);
  assert.equal(state.repair?.parts[0].quantity, 2);
  assert.equal(state.repair?.parts[0].unitPrice, 160);
  assert.equal(state.repair?.partsTotal, 320);
  assert.equal(state.repair?.laborCost, 75);
  assert.equal(state.repair?.totalCost, 395);
  assert.equal(state.repair?.remaining, 395);
  assert.equal(state.repair?.partsCogsTotal, 200);
  assert.equal(state.product?.stock, 8);
  assert.equal(state.product?.inventoryValue, 800);
  assert.equal(state.movements.length, 2);
  assert.equal(state.movements[0].quantityDelta, 1);
  assert.equal(state.movements[1].quantityDelta, -2);
  assert.equal(state.audit.at(-1)?.module, "repairs");
  assert.match(state.audit.at(-1)?.details ?? "", /إثبات القطع الفعلية/);
});

test("RWC-I02 delivered repairs are locked against work-value corrections", async () => {
  const e = await fixture("delivered");
  const before = await e.raw.run(async (ctx) => ({
    repair: await ctx.db.get(e.repairId),
    product: await ctx.db.get(e.productId),
  }));
  await assert.rejects(
    () => e.admin.mutation(api.repairWorkCorrections.updateWork, {
      repairId: e.repairId,
      laborCost: 100,
      parts: [{ productId: e.productId, quantity: 1, unitPrice: 150 }],
      date: "2026-08-29",
      reason: "محاولة تعديل بعد التسليم",
      requestId: "repair-work-delivered-01",
    }),
    /لا يمكن تغيير القطع أو التكلفة بعد التسليم/,
  );
  const after = await e.raw.run(async (ctx) => ({
    repair: await ctx.db.get(e.repairId),
    product: await ctx.db.get(e.productId),
  }));
  assert.deepEqual(after, before);
});

test("RWC-I03 correction cannot reduce total below already collected amount", async () => {
  const e = await fixture("ready");
  await e.raw.run(async (ctx) => {
    await ctx.db.patch(e.repairId, { deposit: 190, remaining: 10 });
  });
  await assert.rejects(
    () => e.admin.mutation(api.repairWorkCorrections.updateWork, {
      repairId: e.repairId,
      laborCost: 20,
      parts: [{ productId: e.productId, quantity: 1, unitPrice: 100 }],
      date: "2026-08-29",
      reason: "خفض التكلفة",
      requestId: "repair-work-paid-01",
    }),
    /الإجمالي الجديد أقل من المبلغ المحصل/,
  );
});
