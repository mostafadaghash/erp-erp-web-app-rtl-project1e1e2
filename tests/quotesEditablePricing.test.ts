import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const uiPath = "src/components/QuotesPage.tsx";
const backendPath = "convex/quotes.ts";

test("عرض السعر يسمح بسعر وحدة وخصم قابلين للتعديل لكل صنف", async () => {
  const source = await readFile(uiPath, "utf8");

  assert.match(source, /type QuoteLine = \{ productId: string; quantity: number; unitPrice: string; discount: string \}/);
  assert.match(source, /data-testid="quote-line-unit-price"/);
  assert.match(source, /data-testid="quote-line-discount"/);
  assert.match(source, /unitPrice: product \? String\(product\.sellPrice\) : "0"/);
  assert.match(source, /unitPrice: Number\(line\.unitPrice \|\| 0\)/);
  assert.match(source, /discount: Number\(line\.discount \|\| 0\)/);
  assert.doesNotMatch(source, /unitPrice: product\.sellPrice, discount: 0/);
});

test("تعديل عرض سعر محفوظ يعيد استخدام الأسعار المحفوظة ولا يغير سعر كارت الصنف", async () => {
  const source = await readFile(uiPath, "utf8");

  assert.match(source, /const updateQuote = useMutation\(api\.quotes\.update\)/);
  assert.match(source, /unitPrice: String\(item\.unitPrice\)/);
  assert.match(source, /discount: String\(item\.discount\)/);
  assert.match(source, /data-testid="quote-edit"/);
  assert.match(source, /سعر الصنف يُملأ تلقائيًا ويمكن تعديله لهذا العرض فقط دون تغيير سعر كارت الصنف/);
});

test("الخادم يعيد حساب الإجماليات ويحمي تعديل عروض الأسعار المغلقة", async () => {
  const source = await readFile(backendPath, "utf8");

  assert.match(source, /export const update = mutation\(/);
  assert.match(source, /requirePermission\(ctx, "edit_quotes"\)/);
  assert.match(source, /quote\.status !== "draft" && quote\.status !== "sent"/);
  assert.match(source, /const unitPrice = roundMoney\(item\.unitPrice\), discount = roundMoney\(item\.discount \?\? 0\)/);
  assert.match(source, /total: roundMoney\(unitPrice \* item\.quantity - discount\)/);
  assert.match(source, /const nextStatus = quote\.status === "sent" \? "draft" : quote\.status/);
  assert.match(source, /total: roundMoney\(subtotal - discount \+ tax\)/);
});
