import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import test from "node:test";

const sourcePath = "src/components/OrdersPage.tsx";

test("صفحة أوامر البيع تستخدم تخطيطًا مضغوطًا وشريط أدوات موحدًا", async () => {
  const source = await fs.readFile(sourcePath, "utf8");
  assert.match(source, /data-testid="orders-compact-stats"/);
  assert.match(source, /data-testid="orders-toolbar"/);
  assert.match(source, /data-testid="order-status-filter"/);
  assert.match(source, /data-testid="order-period-filter"/);
  assert.match(source, /فترة مخصصة/);
});

test("الضغط على سطر أمر البيع يفتح التفاصيل مباشرة ويدعم لوحة المفاتيح", async () => {
  const source = await fs.readFile(sourcePath, "utf8");
  assert.match(source, /data-testid="order-row"/);
  assert.match(source, /onClick=\{\(\) => setDetailsTarget\(order\._id\)\}/);
  assert.match(source, /role="button" tabIndex=\{0\}/);
  assert.match(source, /event\.key === "Enter" \|\| event\.key === " "/);
});

test("الإجراءات الثانوية مخفية خلف قائمة المزيد", async () => {
  const source = await fs.readFile(sourcePath, "utf8");
  assert.match(source, /data-testid="order-actions-menu"/);
  assert.match(source, /MoreHorizontal/);
  assert.match(source, /data-testid="order-actions-expanded"/);
  assert.match(source, /مزيد من الإجراءات/);
  assert.match(source, /تسجيل دفعة/);
  assert.match(source, /استرداد عربون/);
  assert.match(source, /إلغاء أمر البيع/);
});
