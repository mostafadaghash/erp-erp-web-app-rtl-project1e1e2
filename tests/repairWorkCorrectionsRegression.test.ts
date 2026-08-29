import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [page, dialog, backend, generatedApi] = await Promise.all([
  readFile("src/components/RepairsPage.tsx", "utf8"),
  readFile("src/components/RepairWorkEditDialog.tsx", "utf8"),
  readFile("convex/repairWorkCorrections.ts", "utf8"),
  readFile("convex/_generated/api.d.ts", "utf8"),
]);

test("REPAIR-WORK-01 repairs render as dense table rows instead of card grid", () => {
  assert.match(page, /data-testid="repair-table"/);
  assert.match(page, /<table/);
  assert.match(page, /<tr[\s\S]*data-testid="repair-card"/);
  assert.match(page, /onClick=\{\(\) => setDetailTarget\(r\)\}/);
  assert.doesNotMatch(page, /grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4/);
});

test("REPAIR-WORK-02 ready repairs remain editable before final delivery", () => {
  assert.match(page, /data-testid="repair-work-edit-open"/);
  assert.match(page, /!\["delivered", "cancelled"\]\.includes\(r\.status\)/);
  assert.match(dialog, /repair\.status === "ready"/);
  assert.match(dialog, /الفني أنهى العمل/);
  assert.match(backend, /repair\.status === "delivered" \|\| repair\.status === "cancelled"/);
});

test("REPAIR-WORK-03 correction requires a documented reason and preserves collected money", () => {
  assert.match(dialog, /data-testid="repair-work-reason"/);
  assert.match(dialog, /reason\.trim\(\)/);
  assert.match(backend, /سبب تعديل أعمال الصيانة مطلوب/);
  assert.match(backend, /const amountAlreadyCollected = roundMoney\(repair\.deposit\)/);
  assert.match(backend, /totalPreview < amountAlreadyCollected/);
  assert.match(backend, /remaining = roundMoney\(totalCost - amountAlreadyCollected\)/);
});

test("REPAIR-WORK-04 correction reverses old inventory and posts actual used parts", () => {
  assert.match(backend, /عكس قطع الصيانة قبل تصحيح/);
  assert.match(backend, /quantityDelta: part\.quantity/);
  assert.match(backend, /valueDelta: exactValue/);
  assert.match(backend, /type: INVENTORY_MOVEMENT_TYPES\.repairPartReversal/);
  assert.match(backend, /بلا تكلفة مخزون تاريخية/);
  assert.match(backend, /صرف قطع الصيانة بعد تصحيح/);
  assert.match(backend, /quantityDelta: -requested\.quantity/);
  assert.match(backend, /partsCogsTotal/);
});

test("REPAIR-WORK-05 accounting effects are adjusted rather than silently overwritten", () => {
  assert.match(backend, /type: "repair_adjustment"/);
  assert.match(backend, /receivableDelta: remainingDelta/);
  assert.match(backend, /purchasesDelta: totalDelta/);
  assert.match(backend, /reverseRepairRevenueJournal/);
  assert.match(backend, /postRepairRevenueJournal/);
  assert.match(backend, /action: "update"/);
  assert.match(backend, /correctionReason: reason/);
});

test("REPAIR-WORK-06 generated Convex API exposes correction module", () => {
  assert.match(generatedApi, /repairWorkCorrections/);
  assert.doesNotMatch(page + dialog + backend, /\bas any\b|@ts-ignore/);
});
