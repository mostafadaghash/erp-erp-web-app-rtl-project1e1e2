import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import test from "node:test";

const ordersPath = "src/components/OrdersPage.tsx";
const comboboxPath = "src/components/SearchableCombobox.tsx";
const backendPath = "convex/orders.ts";
const schemaPath = "convex/schema.ts";

test("محرر أمر البيع يستخدم بحث العميل ويعرض الهاتف", async () => {
  const source = await fs.readFile(ordersPath, "utf8");
  assert.match(source, /order-customer-combobox/);
  assert.match(source, /ابحث باسم العميل أو رقم الهاتف/);
  assert.match(source, /description: customer\.phone/);
  assert.match(source, /رقم الهاتف/);
});

test("بنود أمر البيع مرتبطة بالأصناف المسجلة وتضيف سطرًا جديدًا تلقائيًا", async () => {
  const source = await fs.readFile(ordersPath, "utf8");
  assert.match(source, /useQuery\(api\.products\.list/);
  assert.match(source, /order-item-product/);
  assert.match(source, /product\.sku/);
  assert.match(source, /product\.barcode/);
  assert.match(source, /productId,/);
  assert.match(source, /if \(index === items\.length - 1\) next\.push\(emptyItem\(\)\)/);
  assert.match(source, /الصنف موجود بالفعل وتمت زيادة الكمية/);
  assert.doesNotMatch(source, /data-testid="order-item-name"/);
});

test("القائمة المشتركة تدعم الكتابة والكيبورد والمسح", async () => {
  const source = await fs.readFile(comboboxPath, "utf8");
  assert.match(source, /role="combobox"/);
  assert.match(source, /ArrowDown/);
  assert.match(source, /ArrowUp/);
  assert.match(source, /event\.key === "Enter"/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /aria-label="مسح الاختيار"/);
  assert.match(source, /normalizeSearch/);
});

test("الخادم يثبت اسم الصنف من كارت الصنف عند وجود productId", async () => {
  const backend = await fs.readFile(backendPath, "utf8");
  const schema = await fs.readFile(schemaPath, "utf8");
  assert.match(backend, /productId\?: Id<"products">/);
  assert.match(backend, /ctx\.db\.get\(item\.productId\)/);
  assert.match(backend, /productName = product\.name/);
  assert.match(backend, /product\.branchId !== branchId/);
  assert.match(backend, /await normalizeOrderItems\(ctx, branchId, args\.items\)/);
  assert.match(backend, /await normalizeOrderItems\(ctx, order\.branchId, args\.items\)/);
  assert.match(schema, /productId: v\.optional\(v\.id\("products"\)\)/);
});
