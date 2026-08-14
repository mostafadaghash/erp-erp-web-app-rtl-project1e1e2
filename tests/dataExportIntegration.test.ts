import test from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema.ts";
import { api } from "../convex/_generated/api.js";

const modules = {
  "../convex/_generated/api.js": () => import("../convex/_generated/api.js"),
  "../convex/_generated/server.js": () =>
    import("../convex/_generated/server.js"),
  "../convex/dataExport.ts": () => import("../convex/dataExport.ts"),
};

async function fixture() {
  const raw = convexTest(schema, modules);
  const ids = await raw.run(async (ctx) => {
    const branchId = await ctx.db.insert("branches", {
      name: "الفرع الأول",
      address: "القاهرة",
      isActive: true,
    });
    const otherBranchId = await ctx.db.insert("branches", {
      name: "الفرع الثاني",
      address: "الجيزة",
      isActive: true,
    });
    for (const profile of [
      {
        userId: "admin",
        tokenIdentifier: "admin-token",
        name: "Admin",
        role: "admin",
        branchId,
        permissions: [],
      },
      {
        userId: "manager",
        tokenIdentifier: "manager-token",
        name: "Manager",
        role: "manager",
        branchId,
        permissions: [],
      },
      {
        userId: "viewer",
        tokenIdentifier: "viewer-token",
        name: "Viewer",
        role: "viewer",
        branchId,
        permissions: [],
      },
      {
        userId: "export-only",
        tokenIdentifier: "export-only-token",
        name: "Export Only",
        role: "viewer",
        branchId,
        permissions: ["export_data"],
      },
    ]) {
      await ctx.db.insert("userProfiles", { ...profile, isActive: true });
    }
    await ctx.db.insert("products", {
      name: "منتج الفرع الأول",
      sku: "EXP-ONE",
      costPrice: 70,
      sellPrice: 100,
      stock: 4,
      minStock: 1,
      unit: "قطعة",
      branchId,
      isActive: true,
    });
    await ctx.db.insert("products", {
      name: "منتج الفرع الثاني",
      sku: "EXP-TWO",
      costPrice: 140,
      sellPrice: 200,
      stock: 8,
      minStock: 2,
      unit: "قطعة",
      branchId: otherBranchId,
      isActive: true,
    });
    return { branchId, otherBranchId };
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
    viewer: raw.withIdentity({
      subject: "viewer",
      tokenIdentifier: "viewer-token",
    }),
    exportOnly: raw.withIdentity({
      subject: "export-only",
      tokenIdentifier: "export-only-token",
    }),
    ...ids,
  };
}

test("EXP-03 admin export can include every branch without internal identifiers", async () => {
  const environment = await fixture();
  const result = await environment.admin.mutation(
    api.dataExport.exportDataset,
    { dataset: "products" },
  );
  assert.equal(result.scope, "all_branches");
  assert.equal(result.rows.length, 2);
  assert.deepEqual(
    result.rows.map((row) => row[0]).sort(),
    ["منتج الفرع الأول", "منتج الفرع الثاني"].sort(),
  );
  assert.equal(
    result.columns.some((column) =>
      /token|password|request|fingerprint|userId|_id/i.test(column.key),
    ),
    false,
  );
});

test("EXP-04 non-admin export is isolated to the assigned branch", async () => {
  const environment = await fixture();
  const result = await environment.manager.mutation(
    api.dataExport.exportDataset,
    { dataset: "products" },
  );
  assert.equal(result.scope, "assigned_branch");
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0]?.[0], "منتج الفرع الأول");
  const logs = await environment.raw.run((ctx) =>
    ctx.db.query("auditLogs").collect(),
  );
  assert.equal(logs.length, 1);
  assert.equal(logs[0]?.action, "export");
  assert.equal(logs[0]?.module, "data_export");
  assert.equal(logs[0]?.branchId, environment.branchId);
});

test("EXP-05 export requires both export_data and dataset view permission", async () => {
  const environment = await fixture();
  await assert.rejects(
    environment.viewer.mutation(api.dataExport.exportDataset, {
      dataset: "products",
    }),
    /export_data|صلاحية/,
  );
  await assert.rejects(
    environment.exportOnly.mutation(api.dataExport.exportDataset, {
      dataset: "products",
    }),
    /صلاحية عرض البيانات المطلوبة/,
  );
});

test("EXP-06 export payload declares its bounded row limit", async () => {
  const environment = await fixture();
  const result = await environment.manager.mutation(
    api.dataExport.exportDataset,
    { dataset: "products" },
  );
  assert.equal(result.rowLimit, 5_000);
  assert.equal(result.truncated, false);
});
