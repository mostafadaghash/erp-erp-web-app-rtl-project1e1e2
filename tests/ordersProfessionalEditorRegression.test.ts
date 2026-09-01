import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import test from "node:test";

const ordersPath = "src/components/OrdersPage.tsx";
const comboboxPath = "src/components/SearchableCombobox.tsx";
const intakePath = "convex/orderIntake.ts";
const schemaPath = "convex/schema.ts";

test("محرر طلب البيع يستخدم بحث العميل ويعرض الهاتف بدون تسعير", async () => {
  const source = await fs.readFile(ordersPath, "utf8");
  assert.match(source, /SearchableCombobox value=\{form\.customerId\}/);
  assert.match(source, /ابحث باسم العميل أو الهاتف/);
  assert.match(source, /description: customer\.phone/);
  assert.match(source, /هذه الشاشة لا تعرض ولا تقبل أسعار بيع/);
});

test("بنود إدخال طلب البيع مرتبطة بالأصناف المسجلة وتعرض الكمية والمخزون دون السعر", async () => {
  const source = await fs.readFile(ordersPath, "utf8");
  assert.match(source, /useQuery\(api\.products\.list/);
  assert.match(source, /data-testid="order-intake-item"/);
  assert.match(source, /product\.sku/);
  assert.match(source, /product\.barcode/);
  assert.match(source, /data-testid="order-intake-quantity"/);
  assert.doesNotMatch(source.match(/function OrderIntakeDialog[\s\S]*?function PricingDialog/)?.[0] ?? "", /سعر البيع|order-price-input/);
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

test("خادم الإدخال يثبت هوية الصنف واسمه من كارت الصنف", async () => {
  const backend = await fs.readFile(intakePath, "utf8");
  const schema = await fs.readFile(schemaPath, "utf8");
  assert.match(backend, /ctx\.db\.get\(productId\)/);
  assert.match(backend, /product\.branchId !== branchId/);
  assert.match(backend, /productName: product\.name/);
  assert.match(backend, /unitPrice: -1/);
  assert.match(schema, /productId: v\.optional\(v\.id\("products"\)\)/);
});
