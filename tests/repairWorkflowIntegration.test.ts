import test from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema.ts";
import { api } from "../convex/_generated/api.js";
import type { Id } from "../convex/_generated/dataModel";

const modules = {
  "../convex/_generated/api.js": () => import("../convex/_generated/api.js"),
  "../convex/_generated/server.js": () =>
    import("../convex/_generated/server.js"),
  "../convex/repairs.ts": () => import("../convex/repairs.ts"),
};

async function fixture() {
  const raw = convexTest(schema, modules);
  const ids = await raw.run(async (ctx) => {
    const branchId = await ctx.db.insert("branches", {
      name: "فرع الصيانة",
      address: "القاهرة",
      isActive: true,
    });
    const otherBranchId = await ctx.db.insert("branches", {
      name: "فرع آخر",
      address: "الجيزة",
      isActive: true,
    });
    const adminId = await ctx.db.insert("userProfiles", {
      userId: "admin",
      tokenIdentifier: "admin-token",
      name: "مدير النظام",
      role: "admin",
      branchId,
      permissions: [],
      isActive: true,
    });
    const technicianId = await ctx.db.insert("userProfiles", {
      userId: "technician",
      tokenIdentifier: "technician-token",
      name: "فني الفرع",
      role: "technician",
      branchId,
      permissions: [],
      isActive: true,
    });
    const inactiveTechnicianId = await ctx.db.insert("userProfiles", {
      userId: "inactive-technician",
      name: "فني معطل",
      role: "technician",
      branchId,
      permissions: [],
      isActive: false,
    });
    const otherTechnicianId = await ctx.db.insert("userProfiles", {
      userId: "other-technician",
      name: "فني الفرع الآخر",
      role: "technician",
      branchId: otherBranchId,
      permissions: [],
      isActive: true,
    });
    await ctx.db.insert("userProfiles", {
      userId: "manager",
      tokenIdentifier: "manager-token",
      name: "مدير الفرع",
      role: "manager",
      branchId,
      permissions: [],
      isActive: true,
    });
    await ctx.db.insert("userProfiles", {
      userId: "other-manager",
      tokenIdentifier: "other-manager-token",
      name: "مدير الفرع الآخر",
      role: "manager",
      branchId: otherBranchId,
      permissions: [],
      isActive: true,
    });
    await ctx.db.insert("userProfiles", {
      userId: "viewer",
      tokenIdentifier: "viewer-token",
      name: "مشاهد",
      role: "viewer",
      branchId,
      permissions: [],
      isActive: true,
    });
    await ctx.db.insert("settings", {
      storeName: "متجر الاختبار",
      storeType: "repair",
      primaryColor: "#111111",
      secondaryColor: "#ffffff",
      currency: "EGP",
      taxRate: 0,
      modules: { repairs: true },
    });
    await ctx.db.insert("generalLedgerSettings", {
      baseCurrency: "EGP",
      chartVersion: "repair-workflow-test",
      status: "foundation_ready",
      operationalPostingEnabled: false,
      financialPostingEnabled: false,
      cutoverDate: "2026-01-01",
      initializedAt: Date.now(),
      initializedBy: "admin",
      initializationRequestId: "workflow-init",
      initializationFingerprint: "workflow-fixture",
    });
    return {
      branchId,
      otherBranchId,
      adminId,
      technicianId,
      inactiveTechnicianId,
      otherTechnicianId,
    };
  });
  return {
    raw,
    admin: raw.withIdentity({ subject: "admin", tokenIdentifier: "admin-token" }),
    technician: raw.withIdentity({
      subject: "technician",
      tokenIdentifier: "technician-token",
    }),
    manager: raw.withIdentity({
      subject: "manager",
      tokenIdentifier: "manager-token",
    }),
    otherManager: raw.withIdentity({
      subject: "other-manager",
      tokenIdentifier: "other-manager-token",
    }),
    viewer: raw.withIdentity({
      subject: "viewer",
      tokenIdentifier: "viewer-token",
    }),
    ...ids,
  };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

function createArgs(
  e: Fixture,
  requestId: string,
  options?: {
    technicianId?: Id<"userProfiles">;
    laborCost?: number;
    branchId?: Id<"branches">;
  },
) {
  return {
    customerName: "عميل الصيانة",
    customerPhone: "01000000000",
    deviceType: "بلايستيشن",
    deviceBrand: "Sony",
    deviceModel: "PS5",
    serialNumber: " SN-100 ",
    accessories: " دراع وكابل ",
    intakeCondition: " خدش بسيط ",
    problem: " لا يعمل ",
    laborCost: options?.laborCost ?? 0,
    parts: [],
    date: "2026-01-10",
    creationRequestId: requestId,
    technicianProfileId: options?.technicianId,
    branchId: options?.branchId ?? e.branchId,
  };
}

async function createRepair(
  e: Fixture,
  requestId: string,
  options?: Parameters<typeof createArgs>[2],
) {
  return e.admin.mutation(api.repairs.create, createArgs(e, requestId, options));
}

async function startAndReady(e: Fixture, repairId: Id<"repairs">, prefix: string) {
  await e.admin.mutation(api.repairs.transitionStatus, {
    id: repairId,
    status: "in_progress",
    date: "2026-01-11",
    requestId: `${prefix}-start`,
  });
  await e.admin.mutation(api.repairs.transitionStatus, {
    id: repairId,
    status: "ready",
    date: "2026-01-12",
    requestId: `${prefix}-ready`,
    diagnosis: "تغيير دائرة الباور",
    qualityCheckNotes: "تم الاختبار لمدة ساعتين",
  });
}

test("RWF-01 create stores trusted intake snapshots and initial history", async () => {
  const e = await fixture();
  const id = await createRepair(e, "rwf-01", { technicianId: e.technicianId });
  const snapshot = await e.raw.run(async (ctx) => ({
    repair: await ctx.db.get(id),
    history: await ctx.db.query("repairStatusHistory").collect(),
  }));
  assert.equal(snapshot.repair?.serialNumber, "SN-100");
  assert.equal(snapshot.repair?.accessories, "دراع وكابل");
  assert.equal(snapshot.repair?.intakeCondition, "خدش بسيط");
  assert.equal(snapshot.repair?.technicianName, "فني الفرع");
  assert.equal(snapshot.history.length, 1);
  assert.equal(snapshot.history[0].toStatus, "received");
});

test("RWF-02 technician picker returns active technicians from the selected branch only", async () => {
  const e = await fixture();
  const result = await e.admin.query(api.repairs.technicianPicker, {
    branchId: e.branchId,
  });
  assert.deepEqual(result, [{ _id: e.technicianId, name: "فني الفرع" }]);
});

test("RWF-03 create rejects an inactive or cross-branch technician atomically", async () => {
  const e = await fixture();
  await assert.rejects(
    () => createRepair(e, "rwf-03-a", { technicianId: e.inactiveTechnicianId }),
    /الفني/,
  );
  await assert.rejects(
    () => createRepair(e, "rwf-03-b", { technicianId: e.otherTechnicianId }),
    /الفني/,
  );
  assert.equal(
    await e.raw.run(async (ctx) => (await ctx.db.query("repairs").collect()).length),
    0,
  );
});

test("RWF-04 update details assigns a server-authoritative technician snapshot", async () => {
  const e = await fixture();
  const id = await createRepair(e, "rwf-04");
  await e.admin.mutation(api.repairs.updateDetails, {
    id,
    technicianProfileId: e.technicianId,
  });
  const repair = await e.raw.run(async (ctx) => ctx.db.get(id));
  assert.equal(repair?.technicianName, "فني الفرع");
  assert.equal(repair?.assignedTechnicianProfileId, e.technicianId);
});

test("RWF-05 update details normalizes diagnosis device condition and notes", async () => {
  const e = await fixture();
  const id = await createRepair(e, "rwf-05");
  await e.admin.mutation(api.repairs.updateDetails, {
    id,
    diagnosis: "  عطل باور  ",
    intakeCondition: "  خدشان  ",
    notes: "  الاتصال قبل التسليم  ",
  });
  const repair = await e.raw.run(async (ctx) => ctx.db.get(id));
  assert.equal(repair?.diagnosis, "عطل باور");
  assert.equal(repair?.intakeCondition, "خدشان");
  assert.equal(repair?.notes, "الاتصال قبل التسليم");
});

test("RWF-06 details lock after the repair reaches ready", async () => {
  const e = await fixture();
  const id = await createRepair(e, "rwf-06", { technicianId: e.technicianId });
  await startAndReady(e, id, "rwf-06");
  const before = await e.raw.run(async (ctx) => ctx.db.get(id));
  await assert.rejects(
    () => e.admin.mutation(api.repairs.updateDetails, { id, notes: "تعديل" }),
    /لا يمكن تعديل/,
  );
  assert.deepEqual(await e.raw.run(async (ctx) => ctx.db.get(id)), before);
});

test("RWF-07 starting repair requires an assigned technician and rolls back", async () => {
  const e = await fixture();
  const id = await createRepair(e, "rwf-07");
  await assert.rejects(
    () => e.admin.mutation(api.repairs.transitionStatus, {
      id,
      status: "in_progress",
      date: "2026-01-11",
      requestId: "rwf-07-start",
    }),
    /تعيين فني/,
  );
  const state = await e.raw.run(async (ctx) => ({
    repair: await ctx.db.get(id),
    history: await ctx.db.query("repairStatusHistory").collect(),
  }));
  assert.equal(state.repair?.status, "received");
  assert.equal(state.history.length, 1);
});

test("RWF-08 starting repair posts one immutable status-history entry", async () => {
  const e = await fixture();
  const id = await createRepair(e, "rwf-08", { technicianId: e.technicianId });
  await e.technician.mutation(api.repairs.transitionStatus, {
    id,
    status: "in_progress",
    date: "2026-01-11",
    requestId: "rwf-08-start",
  });
  const history = await e.raw.run(async (ctx) =>
    ctx.db.query("repairStatusHistory").collect(),
  );
  assert.equal(history.length, 2);
  assert.equal(history[1].fromStatus, "received");
  assert.equal(history[1].toStatus, "in_progress");
  assert.equal(history[1].technicianNameSnapshot, "فني الفرع");
});

test("RWF-09 ready status requires diagnosis and preserves the in-progress snapshot", async () => {
  const e = await fixture();
  const id = await createRepair(e, "rwf-09", { technicianId: e.technicianId });
  await e.admin.mutation(api.repairs.transitionStatus, {
    id,
    status: "in_progress",
    date: "2026-01-11",
    requestId: "rwf-09-start",
  });
  const before = await e.raw.run(async (ctx) => ctx.db.get(id));
  await assert.rejects(
    () => e.admin.mutation(api.repairs.transitionStatus, {
      id,
      status: "ready",
      date: "2026-01-12",
      requestId: "rwf-09-ready",
    }),
    /التشخيص مطلوب/,
  );
  assert.deepEqual(await e.raw.run(async (ctx) => ctx.db.get(id)), before);
});

test("RWF-10 ready status stores diagnosis and quality-check snapshots", async () => {
  const e = await fixture();
  const id = await createRepair(e, "rwf-10", { technicianId: e.technicianId });
  await startAndReady(e, id, "rwf-10");
  const state = await e.raw.run(async (ctx) => ({
    repair: await ctx.db.get(id),
    history: await ctx.db.query("repairStatusHistory").collect(),
  }));
  assert.equal(state.repair?.status, "ready");
  assert.equal(state.repair?.diagnosis, "تغيير دائرة الباور");
  assert.equal(state.repair?.qualityCheckNotes, "تم الاختبار لمدة ساعتين");
  assert.equal(state.history.at(-1)?.diagnosisSnapshot, "تغيير دائرة الباور");
});

test("RWF-11 delivery rejects a remaining balance without partial effects", async () => {
  const e = await fixture();
  const id = await createRepair(e, "rwf-11", {
    technicianId: e.technicianId,
    laborCost: 10,
  });
  await startAndReady(e, id, "rwf-11");
  const before = await e.raw.run(async (ctx) => ({
    repair: await ctx.db.get(id),
    history: await ctx.db.query("repairStatusHistory").collect(),
  }));
  await assert.rejects(
    () => e.admin.mutation(api.repairs.transitionStatus, {
      id,
      status: "delivered",
      date: "2026-01-13",
      requestId: "rwf-11-delivery",
      warrantyDays: 30,
    }),
    /مبلغ متبق/,
  );
  assert.deepEqual(
    await e.raw.run(async (ctx) => ({
      repair: await ctx.db.get(id),
      history: await ctx.db.query("repairStatusHistory").collect(),
    })),
    before,
  );
});

test("RWF-12 delivery stores the supplied date warranty and employee link", async () => {
  const e = await fixture();
  const id = await createRepair(e, "rwf-12", { technicianId: e.technicianId });
  await startAndReady(e, id, "rwf-12");
  await e.admin.mutation(api.repairs.transitionStatus, {
    id,
    status: "delivered",
    date: "2026-01-13",
    requestId: "rwf-12-delivery",
    warrantyDays: 30,
  });
  const repair = await e.raw.run(async (ctx) => ctx.db.get(id));
  assert.equal(repair?.deliveredDate, "2026-01-13");
  assert.equal(repair?.warrantyDays, 30);
  assert.equal(repair?.warrantyUntil, "2026-02-12");
  assert.equal(repair?.deliveredBy, "admin");
});

test("RWF-13 delivery rejects fractional negative and excessive warranty days", async () => {
  for (const [index, warrantyDays] of [-1, 1.5, 366].entries()) {
    const e = await fixture();
    const id = await createRepair(e, `rwf-13-${index}`, {
      technicianId: e.technicianId,
    });
    await startAndReady(e, id, `rwf-13-${index}`);
    await assert.rejects(
      () => e.admin.mutation(api.repairs.transitionStatus, {
        id,
        status: "delivered",
        date: "2026-01-13",
        requestId: `rwf-13-delivery-${index}`,
        warrantyDays,
      }),
      /مدة الضمان/,
    );
  }
});

test("RWF-14 matching status retry returns the same repair without duplicate history", async () => {
  const e = await fixture();
  const id = await createRepair(e, "rwf-14", { technicianId: e.technicianId });
  const args = {
    id,
    status: "in_progress" as const,
    date: "2026-01-11",
    requestId: "rwf-14-start",
  };
  assert.equal(await e.admin.mutation(api.repairs.transitionStatus, args), id);
  assert.equal(await e.admin.mutation(api.repairs.transitionStatus, args), id);
  assert.equal(
    await e.raw.run(async (ctx) =>
      (await ctx.db.query("repairStatusHistory").collect()).length,
    ),
    2,
  );
});

test("RWF-15 same status request id with a changed fingerprint is rejected", async () => {
  const e = await fixture();
  const id = await createRepair(e, "rwf-15", { technicianId: e.technicianId });
  await e.admin.mutation(api.repairs.transitionStatus, {
    id,
    status: "in_progress",
    date: "2026-01-11",
    requestId: "rwf-15-start",
  });
  await assert.rejects(
    () => e.admin.mutation(api.repairs.transitionStatus, {
      id,
      status: "in_progress",
      date: "2026-01-12",
      requestId: "rwf-15-start",
    }),
    /بيانات مختلفة/,
  );
});

test("RWF-16 illegal status jumps are rejected before writing history", async () => {
  const e = await fixture();
  const id = await createRepair(e, "rwf-16", { technicianId: e.technicianId });
  await assert.rejects(
    () => e.admin.mutation(api.repairs.transitionStatus, {
      id,
      status: "ready",
      date: "2026-01-11",
      requestId: "rwf-16-ready",
      diagnosis: "تشخيص",
    }),
    /لا يمكن تغيير/,
  );
  assert.equal(
    await e.raw.run(async (ctx) =>
      (await ctx.db.query("repairStatusHistory").collect()).length,
    ),
    1,
  );
});

test("RWF-17 cancellation requires a normalized nonblank reason", async () => {
  const e = await fixture();
  const id = await createRepair(e, "rwf-17");
  await assert.rejects(
    () => e.admin.mutation(api.repairs.transitionStatus, {
      id,
      status: "cancelled",
      date: "2026-01-11",
      requestId: "rwf-17-cancel",
      reason: "   ",
    }),
    /سبب الإلغاء/,
  );
});

test("RWF-18 cancellation is permanent and appears in status history", async () => {
  const e = await fixture();
  const id = await createRepair(e, "rwf-18");
  await e.admin.mutation(api.repairs.transitionStatus, {
    id,
    status: "cancelled",
    date: "2026-01-11",
    requestId: "rwf-18-cancel",
    reason: " العميل رفض الإصلاح ",
  });
  const state = await e.raw.run(async (ctx) => ({
    repair: await ctx.db.get(id),
    history: await ctx.db.query("repairStatusHistory").collect(),
  }));
  assert.equal(state.repair?.status, "cancelled");
  assert.equal(state.repair?.cancellationReason, "العميل رفض الإصلاح");
  assert.equal(state.history.at(-1)?.reason, "العميل رفض الإصلاح");
});

test("RWF-19 status history uses server cursors across one-item pages", async () => {
  const e = await fixture();
  const id = await createRepair(e, "rwf-19", { technicianId: e.technicianId });
  await startAndReady(e, id, "rwf-19");
  const first = await e.manager.query(api.repairs.historyPaginated, {
    repairId: id,
    paginationOpts: { numItems: 1, cursor: null },
  });
  assert.equal(first.page.length, 1);
  assert.equal(first.isDone, false);
  const second = await e.manager.query(api.repairs.historyPaginated, {
    repairId: id,
    paginationOpts: { numItems: 1, cursor: first.continueCursor },
  });
  assert.equal(second.page.length, 1);
  assert.notEqual(first.page[0]._id, second.page[0]._id);
});

test("RWF-20 history and print queries enforce branch isolation", async () => {
  const e = await fixture();
  const id = await createRepair(e, "rwf-20", { technicianId: e.technicianId });
  await assert.rejects(
    () => e.otherManager.query(api.repairs.historyPaginated, {
      repairId: id,
      paginationOpts: { numItems: 10, cursor: null },
    }),
    /الفرع/,
  );
  await assert.rejects(
    () => e.otherManager.query(api.repairs.repairForPrint, { id }),
    /الفرع/,
  );
});

test("RWF-21 viewer cannot access protected technician or print queries", async () => {
  const e = await fixture();
  const id = await createRepair(e, "rwf-21");
  await assert.rejects(
    () => e.viewer.query(api.repairs.technicianPicker, {}),
    /صلاحية/,
  );
  await assert.rejects(
    () => e.viewer.query(api.repairs.repairForPrint, { id }),
    /صلاحية/,
  );
});

test("RWF-22 printable repair is a redacted runtime allowlist with creator name", async () => {
  const e = await fixture();
  const id = await createRepair(e, "rwf-22", { technicianId: e.technicianId });
  const dto = await e.manager.query(api.repairs.repairForPrint, { id });
  assert.equal(dto.employeeName, "مدير النظام");
  for (const forbidden of [
    "_id",
    "createdBy",
    "creationRequestId",
    "creationFingerprint",
    "journalEntryId",
    "partsCogsTotal",
    "assignedTechnicianProfileId",
  ]) {
    assert.equal(forbidden in dto, false, forbidden);
  }
  assert.deepEqual(Object.keys(dto.parts[0] ?? {}).sort(), []);
});

test("RWF-23 printable creator lookup supports by_token and unknown fallback", async () => {
  const e = await fixture();
  const id = await createRepair(e, "rwf-23");
  await e.raw.run(async (ctx) => ctx.db.patch(id, { createdBy: "technician-token" }));
  assert.equal(
    (await e.manager.query(api.repairs.repairForPrint, { id })).employeeName,
    "فني الفرع",
  );
  await e.raw.run(async (ctx) => ctx.db.patch(id, { createdBy: "missing-profile" }));
  const dto = await e.manager.query(api.repairs.repairForPrint, { id });
  assert.equal(dto.employeeName, "مستخدم غير معروف");
  assert.equal(JSON.stringify(dto).includes("missing-profile"), false);
});

test("RWF-24 workflow remains operationally dormant and never writes legacy payments", async () => {
  const e = await fixture();
  const id = await createRepair(e, "rwf-24", {
    technicianId: e.technicianId,
    laborCost: 25,
  });
  const state = await e.raw.run(async (ctx) => ({
    repair: await ctx.db.get(id),
    settings: await ctx.db.query("generalLedgerSettings").first(),
    journals: await ctx.db.query("journalEntries").collect(),
    payments: await ctx.db.query("payments").collect(),
  }));
  assert.equal(state.settings?.operationalPostingEnabled, false);
  assert.equal(state.repair?.journalEntryId, undefined);
  assert.equal(state.journals.length, 0);
  assert.equal(state.payments.length, 0);
});
