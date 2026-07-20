import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("role-sensitive pages skip full-list queries they cannot authorize", () => {
  const products = source("src/components/ProductsPage.tsx");
  const branches = source("src/components/BranchesPage.tsx");
  assert.match(products, /api\.suppliers\.list, canViewSuppliers \? \{\} : "skip"/);
  assert.match(branches, /api\.employees\.list, canViewEmployees \? \{\} : "skip"/);
});

test("repair and shipment forms use least-privilege picker queries", () => {
  const repairs = source("src/components/RepairsPage.tsx");
  const shipments = source("src/components/ShipmentsPage.tsx");
  assert.match(repairs, /api\.customers\.repairPicker/);
  assert.doesNotMatch(repairs, /api\.customers\.list/);
  assert.match(shipments, /api\.shipments\.creationOptions/);
  assert.doesNotMatch(shipments, /api\.(?:products|suppliers)\.list/);
});
