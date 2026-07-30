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
  "../convex/customers.ts": () => import("../convex/customers.ts"),
  "../convex/suppliers.ts": () => import("../convex/suppliers.ts"),
};

async function fixture() {
  const raw = convexTest(schema, modules);
  const ids = await raw.run(async (ctx) => {
    const branchId = await ctx.db.insert("branches", {
      name: "فرع القاهرة",
      address: "القاهرة",
      isActive: true,
    });
    const otherBranchId = await ctx.db.insert("branches", {
      name: "فرع الجيزة",
      address: "الجيزة",
      isActive: true,
    });
    const inactiveBranchId = await ctx.db.insert("branches", {
      name: "فرع معطل",
      address: "الإسكندرية",
      isActive: false,
    });
    for (const profile of [
      {
        userId: "admin",
        tokenIdentifier: "admin-token",
        name: "مدير النظام",
        role: "admin",
        branchId,
        permissions: [],
      },
      {
        userId: "manager",
        tokenIdentifier: "manager-token",
        name: "مدير القاهرة",
        role: "manager",
        branchId,
        permissions: [],
      },
      {
        userId: "other-manager",
        tokenIdentifier: "other-manager-token",
        name: "مدير الجيزة",
        role: "manager",
        branchId: otherBranchId,
        permissions: [],
      },
      {
        userId: "supplier-viewer",
        tokenIdentifier: "supplier-viewer-token",
        name: "مشاهد الموردين",
        role: "viewer",
        branchId,
        permissions: ["view_suppliers"],
      },
    ]) {
      await ctx.db.insert("userProfiles", { ...profile, isActive: true });
    }
    return { branchId, otherBranchId, inactiveBranchId };
  });
  return {
    raw,
    admin: raw.withIdentity({
      subject: "admin",
      tokenIdentifier: "admin-token",
    }),
    manager: raw.withIdentity({
      subject: "manager",
      tokenIdentifier: "manager-token",
    }),
    otherManager: raw.withIdentity({
      subject: "other-manager",
      tokenIdentifier: "other-manager-token",
    }),
    supplierViewer: raw.withIdentity({
      subject: "supplier-viewer",
      tokenIdentifier: "supplier-viewer-token",
    }),
    ...ids,
  };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

async function masterSnapshot(e: Fixture) {
  return e.raw.run(async (ctx) => ({
    customers: (await ctx.db.query("customers").collect()).sort((a, b) =>
      String(a._id).localeCompare(String(b._id)),
    ),
    suppliers: (await ctx.db.query("suppliers").collect()).sort((a, b) =>
      String(a._id).localeCompare(String(b._id)),
    ),
    auditLogs: (await ctx.db.query("auditLogs").collect()).sort((a, b) =>
      String(a._id).localeCompare(String(b._id)),
    ),
    supplierBalances: (await ctx.db.query("supplierBalances").collect()).sort(
      (a, b) => String(a._id).localeCompare(String(b._id)),
    ),
    supplierLedgerEntries: (
      await ctx.db.query("supplierLedgerEntries").collect()
    ).sort((a, b) => String(a._id).localeCompare(String(b._id))),
  }));
}

async function createCustomer(
  e: Fixture,
  phone: string,
  branchId: Id<"branches"> = e.branchId,
) {
  return e.admin.mutation(api.customers.create, {
    name: "عميل تجريبي",
    phone,
    branchId,
  });
}

async function createSupplier(e: Fixture, phone: string) {
  return e.admin.mutation(api.suppliers.create, {
    name: "مورد تجريبي",
    phone,
  });
}

test("CSM-01 customer creation normalizes trusted contact fields", async () => {
  const e = await fixture();
  const id = await e.admin.mutation(api.customers.create, {
    name: "  أحمد   علي  ",
    phone: "٠١٠-١٢٣٤-٥٦٧٨",
    email: "  AHMED@EXAMPLE.COM ",
    address: " شارع   التحرير ",
    notes: " عميل   منتظم ",
    branchId: e.branchId,
  });
  const customer = await e.raw.run((ctx) => ctx.db.get(id));
  assert.equal(customer?.name, "أحمد علي");
  assert.equal(customer?.phone, "01012345678");
  assert.equal(customer?.email, "ahmed@example.com");
  assert.equal(customer?.address, "شارع التحرير");
  assert.equal(customer?.notes, "عميل منتظم");
  assert.equal(customer?.branchId, e.branchId);
  assert.equal(customer?.balance, 0);
  assert.equal(customer?.totalPurchases, 0);
});

test("CSM-02 customer duplicate phone is rejected after canonicalization", async () => {
  const e = await fixture();
  await createCustomer(e, "٠١٠ ١٢٣٤ ٥٦٧٨");
  const before = await masterSnapshot(e);
  await assert.rejects(
    e.admin.mutation(api.customers.create, {
      name: "عميل مكرر",
      phone: "+20 10 1234 5678",
      branchId: e.branchId,
    }),
    /رقم الهاتف مسجل/,
  );
  assert.deepEqual(await masterSnapshot(e), before);
});

test("CSM-03 customer phone uniqueness is scoped to the branch", async () => {
  const e = await fixture();
  const first = await createCustomer(e, "01010000000", e.branchId);
  const second = await createCustomer(e, "01010000000", e.otherBranchId);
  const rows = await e.raw.run((ctx) => ctx.db.query("customers").collect());
  assert.deepEqual(
    rows.map((row) => row._id).sort(),
    [first, second].sort(),
  );
  assert.deepEqual(
    rows.map((row) => row.branchId).sort(),
    [e.branchId, e.otherBranchId].sort(),
  );
});

test("CSM-04 invalid customer contact data rolls back atomically", async () => {
  const e = await fixture();
  for (const args of [
    { name: " ", phone: "01010000000" },
    { name: "عميل", phone: "123" },
    { name: "عميل", phone: "01010000000", email: "not-an-email" },
  ]) {
    const before = await masterSnapshot(e);
    await assert.rejects(
      e.admin.mutation(api.customers.create, {
        ...args,
        branchId: e.branchId,
      }),
      /أدخل اسمًا ورقم هاتف صحيحين/,
    );
    assert.deepEqual(await masterSnapshot(e), before);
  }
});

test("CSM-05 customer update stores normalized edits and clears blank optionals", async () => {
  const e = await fixture();
  const id = await e.admin.mutation(api.customers.create, {
    name: "عميل قديم",
    phone: "01020000000",
    email: "old@example.com",
    address: "عنوان قديم",
    notes: "ملاحظة",
    branchId: e.branchId,
  });
  await e.admin.mutation(api.customers.update, {
    id,
    name: " عميل   جديد ",
    phone: "+20 10 2000 0001",
    email: "",
    address: "",
    notes: "",
  });
  const row = await e.raw.run((ctx) => ctx.db.get(id));
  assert.equal(row?.name, "عميل جديد");
  assert.equal(row?.phone, "01020000001");
  assert.equal(row?.email, undefined);
  assert.equal(row?.address, undefined);
  assert.equal(row?.notes, undefined);
});

test("CSM-06 partial customer update preserves omitted optional fields", async () => {
  const e = await fixture();
  const id = await e.admin.mutation(api.customers.create, {
    name: "عميل أول",
    phone: "01030000000",
    email: "keep@example.com",
    address: "العنوان",
    notes: "احتفظ بي",
    branchId: e.branchId,
  });
  await e.admin.mutation(api.customers.update, { id, name: "عميل ثاني" });
  const row = await e.raw.run((ctx) => ctx.db.get(id));
  assert.equal(row?.email, "keep@example.com");
  assert.equal(row?.address, "العنوان");
  assert.equal(row?.notes, "احتفظ بي");
});

test("CSM-07 customer update cannot adopt another phone in the branch", async () => {
  const e = await fixture();
  const first = await createCustomer(e, "01040000000");
  const second = await createCustomer(e, "01040000001");
  const before = await masterSnapshot(e);
  await assert.rejects(
    e.admin.mutation(api.customers.update, {
      id: second,
      phone: "+20 10 4000 0000",
    }),
    /رقم الهاتف مسجل/,
  );
  assert.deepEqual(await masterSnapshot(e), before);
  assert.notEqual(first, second);
});

test("CSM-08 customer list is indexed and isolated by branch", async () => {
  const e = await fixture();
  const ownId = await createCustomer(e, "01050000000", e.branchId);
  const otherId = await createCustomer(e, "01050000001", e.otherBranchId);
  const own = await e.manager.query(api.customers.list, {});
  assert.deepEqual(own.map((row) => row._id), [ownId]);
  await assert.rejects(
    e.manager.query(api.customers.list, { branchId: e.otherBranchId }),
    /ليس لديك صلاحية/,
  );
  const other = await e.admin.query(api.customers.list, {
    branchId: e.otherBranchId,
  });
  assert.deepEqual(other.map((row) => row._id), [otherId]);
});

test("CSM-09 customer activation follows delete permission and writes audit only on success", async () => {
  const e = await fixture();
  const id = await createCustomer(e, "01060000000");
  const before = await masterSnapshot(e);
  await assert.rejects(
    e.manager.mutation(api.customers.setActive, { id, isActive: false }),
    /delete_customers/,
  );
  assert.deepEqual(await masterSnapshot(e), before);
  await e.admin.mutation(api.customers.setActive, { id, isActive: false });
  const after = await masterSnapshot(e);
  assert.equal(after.customers[0].isActive, false);
  assert.equal(after.auditLogs.length, before.auditLogs.length + 1);
  assert.equal(after.auditLogs.at(-1)?.action, "deactivate");
});

test("CSM-10 customer public DTO redacts legacy financial totals", async () => {
  const e = await fixture();
  const id = await e.raw.run((ctx) =>
    ctx.db.insert("customers", {
      name: "عميل Legacy",
      phone: "01070000000",
      balance: 999,
      totalPurchases: 5000,
      branchId: e.branchId,
      isActive: true,
    }),
  );
  const [listRow] = await e.manager.query(api.customers.list, {});
  const getRow = await e.manager.query(api.customers.get, { id });
  assert.equal("balance" in listRow, false);
  assert.equal("totalPurchases" in listRow, false);
  assert.equal(getRow ? "balance" in getRow : true, false);
  assert.equal(getRow ? "totalPurchases" in getRow : true, false);
});

test("CSM-11 supplier creation normalizes trusted contact fields", async () => {
  const e = await fixture();
  const id = await e.admin.mutation(api.suppliers.create, {
    name: "  مورد   القاهرة ",
    phone: "٠١١-١٢٣٤-٥٦٧٨",
    email: " SALES@SUPPLIER.COM ",
    address: " المنطقة   الصناعية ",
    notes: " توريد   أسبوعي ",
  });
  const row = await e.raw.run((ctx) => ctx.db.get(id));
  assert.equal(row?.name, "مورد القاهرة");
  assert.equal(row?.phone, "01112345678");
  assert.equal(row?.email, "sales@supplier.com");
  assert.equal(row?.address, "المنطقة الصناعية");
  assert.equal(row?.notes, "توريد أسبوعي");
});

test("CSM-12 supplier duplicate phone is rejected globally after canonicalization", async () => {
  const e = await fixture();
  await createSupplier(e, "01112345678");
  const before = await masterSnapshot(e);
  await assert.rejects(
    e.admin.mutation(api.suppliers.create, {
      name: "مورد مكرر",
      phone: "+20 11 1234 5678",
    }),
    /رقم الهاتف مسجل/,
  );
  assert.deepEqual(await masterSnapshot(e), before);
});

test("CSM-13 partial supplier update preserves optionals and normalizes edits", async () => {
  const e = await fixture();
  const id = await e.admin.mutation(api.suppliers.create, {
    name: "مورد أول",
    phone: "01120000000",
    email: "keep@supplier.com",
    address: "عنوان المورد",
    notes: "ملاحظة المورد",
  });
  await e.admin.mutation(api.suppliers.update, {
    id,
    name: " مورد   ثان ",
    phone: "۰۱۱ ۲۰۰۰ ۰۰۰۱",
  });
  const row = await e.raw.run((ctx) => ctx.db.get(id));
  assert.equal(row?.name, "مورد ثان");
  assert.equal(row?.phone, "01120000001");
  assert.equal(row?.email, "keep@supplier.com");
  assert.equal(row?.address, "عنوان المورد");
  assert.equal(row?.notes, "ملاحظة المورد");
});

test("CSM-14 supplier update cannot adopt another supplier phone", async () => {
  const e = await fixture();
  await createSupplier(e, "01130000000");
  const second = await createSupplier(e, "01130000001");
  const before = await masterSnapshot(e);
  await assert.rejects(
    e.admin.mutation(api.suppliers.update, {
      id: second,
      phone: "+20 11 3000 0000",
    }),
    /رقم الهاتف مسجل/,
  );
  assert.deepEqual(await masterSnapshot(e), before);
});

test("CSM-15 supplier activation follows delete permission", async () => {
  const e = await fixture();
  const id = await createSupplier(e, "01140000000");
  const before = await masterSnapshot(e);
  await assert.rejects(
    e.manager.mutation(api.suppliers.setActive, { id, isActive: false }),
    /delete_suppliers/,
  );
  assert.deepEqual(await masterSnapshot(e), before);
  await e.admin.mutation(api.suppliers.setActive, { id, isActive: false });
  const row = await e.raw.run((ctx) => ctx.db.get(id));
  assert.equal(row?.isActive, false);
});

test("CSM-16 supplier balances are branch-isolated minimal DTOs", async () => {
  const e = await fixture();
  const supplierId = await createSupplier(e, "01150000000");
  await e.raw.run(async (ctx) => {
    await ctx.db.insert("supplierBalances", {
      key: `${supplierId}:${e.branchId}`,
      supplierId,
      branchId: e.branchId,
      balance: 125,
      updatedAt: 1,
    });
    await ctx.db.insert("supplierBalances", {
      key: `${supplierId}:${e.otherBranchId}`,
      supplierId,
      branchId: e.otherBranchId,
      balance: 75,
      updatedAt: 2,
    });
  });
  const own = await e.manager.query(api.suppliers.branchBalances, {
    branchId: e.branchId,
  });
  assert.deepEqual(own, [{ supplierId, balance: 125 }]);
  await assert.rejects(
    e.manager.query(api.suppliers.branchBalances, {
      branchId: e.otherBranchId,
    }),
    /ليس لديك صلاحية/,
  );
  assert.deepEqual(
    await e.admin.query(api.suppliers.branchBalances, {
      branchId: e.otherBranchId,
    }),
    [{ supplierId, balance: 75 }],
  );
});

test("CSM-17 supplier ledger paginates real entries and redacts internals", async () => {
  const e = await fixture();
  const supplierId = await createSupplier(e, "01160000000");
  await e.raw.run(async (ctx) => {
    for (const [index, amount] of [100, -25].entries()) {
      await ctx.db.insert("supplierLedgerEntries", {
        entryNumber: `SUP-2026-0000${index + 1}`,
        idempotencyKey: `secret-${index}`,
        supplierId,
        supplierName: "مورد تجريبي",
        branchId: e.branchId,
        type: index === 0 ? "purchase_receipt" : "supplier_payment",
        status: "posted",
        date: `2026-01-0${index + 1}`,
        amountDelta: amount,
        balanceBefore: index === 0 ? 0 : 100,
        balanceAfter: index === 0 ? 100 : 75,
        referenceType: index === 0 ? "purchase_receipt" : "supplier_payment",
        referenceId: `internal-${index}`,
        referenceNumber: `REF-${index + 1}`,
        description: index === 0 ? "استلام بضاعة" : "دفعة للمورد",
        userId: "raw-user-id",
        createdAt: index + 1,
      });
    }
  });
  const first = await e.manager.query(api.suppliers.ledger, {
    supplierId,
    branchId: e.branchId,
    paginationOpts: { numItems: 1, cursor: null },
  });
  assert.equal(first.page.length, 1);
  assert.equal(first.isDone, false);
  const second = await e.manager.query(api.suppliers.ledger, {
    supplierId,
    branchId: e.branchId,
    paginationOpts: { numItems: 1, cursor: first.continueCursor },
  });
  assert.equal(second.page.length, 1);
  assert.notEqual(first.page[0]._id, second.page[0]._id);
  assert.deepEqual(Object.keys(first.page[0]).sort(), [
    "_id",
    "amountDelta",
    "balanceAfter",
    "balanceBefore",
    "date",
    "description",
    "entryNumber",
    "referenceNumber",
    "referenceType",
    "status",
    "type",
  ]);
  assert.equal("idempotencyKey" in first.page[0], false);
  assert.equal("userId" in first.page[0], false);
  assert.equal("referenceId" in first.page[0], false);
});

test("CSM-18 supplier ledger branch choices follow central and branch policy", async () => {
  const e = await fixture();
  const adminBranches = await e.admin.query(api.suppliers.availableBranches, {});
  assert.deepEqual(
    adminBranches.map((branch) => branch._id),
    [e.branchId, e.otherBranchId],
  );
  const managerBranches = await e.manager.query(
    api.suppliers.availableBranches,
    {},
  );
  assert.deepEqual(managerBranches, [
    { _id: e.branchId, name: "فرع القاهرة" },
  ]);
  assert.equal(
    adminBranches.some((branch) => branch._id === e.inactiveBranchId),
    false,
  );
});

test("CSM-19 supplier ledger rejects a user with supplier view only", async () => {
  const e = await fixture();
  const supplierId = await createSupplier(e, "01170000000");
  await assert.rejects(
    e.supplierViewer.query(api.suppliers.ledger, {
      supplierId,
      branchId: e.branchId,
      paginationOpts: { numItems: 10, cursor: null },
    }),
    /view_supplier_ledger/,
  );
  await assert.rejects(
    e.supplierViewer.query(api.suppliers.branchBalances, {
      branchId: e.branchId,
    }),
    /view_supplier_ledger/,
  );
});

test("CSM-20 supplier list and get never expose the legacy balance", async () => {
  const e = await fixture();
  const id = await e.raw.run((ctx) =>
    ctx.db.insert("suppliers", {
      name: "مورد Legacy",
      phone: "01180000000",
      balance: 900,
      isActive: true,
    }),
  );
  const [listRow] = await e.supplierViewer.query(api.suppliers.list, {});
  const getRow = await e.supplierViewer.query(api.suppliers.get, { id });
  assert.equal("balance" in listRow, false);
  assert.equal(getRow ? "balance" in getRow : true, false);
});
