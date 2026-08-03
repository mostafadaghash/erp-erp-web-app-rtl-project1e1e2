import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const modal = await readFile("src/components/ContactFormModal.tsx", "utf8");
const customers = await readFile("convex/customers.ts", "utf8");
const suppliers = await readFile("convex/suppliers.ts", "utf8");

test("CSA-01 contact form uses a synchronous submit lock", () => {
  assert.match(modal, /useRef/);
  assert.match(modal, /submitLock\.current/);
  assert.match(modal, /if \(submitLock\.current\) return/);
  assert.match(modal, /submitLock\.current = true/);
});

test("CSA-02 submit lock resets only after the saving cycle finishes", () => {
  assert.match(modal, /useEffect\([\s\S]*if \(!saving\)[\s\S]*submitLock\.current = false/);
  assert.match(modal, /onSubmit=\{handleSubmit\}/);
});

test("CSA-03 customer updates return early when normalized data is unchanged", () => {
  assert.match(customers, /const customerUnchanged =/);
  assert.match(customers, /if \(customerUnchanged\) return/);
  assert.ok(customers.indexOf("if (customerUnchanged) return") < customers.indexOf("await ctx.db.patch(id, normalized)"));
});

test("CSA-04 supplier updates return early when normalized data is unchanged", () => {
  assert.match(suppliers, /const supplierUnchanged =/);
  assert.match(suppliers, /if \(supplierUnchanged\) return/);
  assert.ok(suppliers.indexOf("if (supplierUnchanged) return") < suppliers.indexOf("await ctx.db.patch(id, normalized)"));
});

test("CSA-05 customer activation is idempotent and does not duplicate audit entries", () => {
  assert.match(customers, /if \(customer\.isActive === args\.isActive\) return/);
  assert.ok(customers.indexOf("customer.isActive === args.isActive") < customers.indexOf("await ctx.db.patch(args.id, { isActive: args.isActive })"));
});

test("CSA-06 supplier activation is idempotent and does not duplicate audit entries", () => {
  assert.match(suppliers, /if \(supplier\.isActive === args\.isActive\) return/);
  assert.ok(suppliers.indexOf("supplier.isActive === args.isActive") < suppliers.indexOf("await ctx.db.patch(args.id, { isActive: args.isActive })"));
});

test("CSA-07 duplicate create protection remains enforced by normalized phone uniqueness", () => {
  assert.match(customers, /await assertUniqueCustomerPhone\(ctx, branchId, normalized\.phone\)/);
  assert.match(suppliers, /await assertUniqueSupplierPhone\(ctx, normalized\.phone\)/);
});

test("CSA-08 no unsafe TypeScript escape is introduced", () => {
  for (const source of [modal, customers, suppliers]) {
    assert.doesNotMatch(source, /as any|@ts-ignore/);
  }
});
