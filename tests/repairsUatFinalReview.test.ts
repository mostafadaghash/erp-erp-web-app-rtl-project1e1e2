import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile("src/components/RepairsPage.tsx", "utf8");
const printTemplate = await readFile("src/components/PrintTemplate.tsx", "utf8");

test("RFU-01 distinguishes true empty repairs from filtered no-results", () => {
  assert.ok(page.includes("لا توجد أوامر صيانة في هذا الفرع"));
  assert.ok(page.includes("لا توجد نتائج مطابقة للبحث أو الفلتر"));
  assert.match(page, /repairs\.length === 0/);
});

test("RFU-02 history modal distinguishes first load, loading more, and true empty", () => {
  assert.match(page, /history\.status === "LoadingFirstPage"/);
  assert.match(page, /history\.status === "LoadingMore"/);
  assert.match(page, /history\.status === "Exhausted" && history\.results\.length === 0/);
  assert.ok(page.includes("جارٍ تحميل سجل الصيانة"));
  assert.ok(page.includes("جارٍ تحميل المزيد"));
});

test("RFU-03 history shows quality-check details returned by the DTO", () => {
  assert.match(page, /entry\.qualityCheckNotes/);
  assert.ok(page.includes("اختبار الجودة:"));
});

test("RFU-04 branch changes close all branch-sensitive repair surfaces", () => {
  const start = page.indexOf("const handleBranchChange");
  const end = page.indexOf("const initialDepositAccounts", start);
  const block = page.slice(start, end);
  for (const setter of [
    "setEditTarget(null)",
    "setHistoryTarget(null)",
    "setTransitionTarget(null)",
    "setTransitionNext(null)",
    "setCollectionTarget(null)",
    "setRefundTarget(null)",
    "setPrintTargetId(null)",
    "setPrintRepair(null)",
  ]) {
    assert.ok(block.includes(setter), `missing ${setter}`);
  }
});

test("RFU-05 tracking copy and rotation await clipboard and expose a busy guard", () => {
  assert.match(page, /const \[trackingBusyId, setTrackingBusyId\]/);
  assert.match(page, /const copyTrackingLink = async/);
  assert.match(page, /await navigator\.clipboard\.writeText\(url\)/);
  assert.match(page, /finally \{\s*setTrackingBusyId\(null\)/);
  assert.match(page, /disabled=\{trackingBusyId === detailTarget\._id\}/);
  assert.ok(page.includes("تعذر نسخ رابط التتبع"));
  assert.ok(page.includes("تم تجديد الرابط لكن تعذر نسخه"));
});

test("RFU-06 print buttons are guarded while the repair print DTO loads", () => {
  assert.match(page, /disabled=\{printTargetId !== null\}/);
  assert.ok(page.includes("جارٍ تجهيز الطباعة"));
});

test("RFU-07 repair print contract includes and renders status history", () => {
  assert.match(printTemplate, /history\?: Array<\{/);
  assert.ok(printTemplate.includes("سجل حالات الصيانة"));
  assert.match(printTemplate, /data\.history\.map/);
  assert.match(printTemplate, /statusLabel\[entry\.toStatus\]/);
  assert.ok(printTemplate.includes("بواسطة"));
});

test("RFU-08 status-transition success identifies the repair and new status", () => {
  assert.match(page, /toast\.success\(`تم تحديث \$\{transitionTarget\.repairNumber\} إلى \$\{statusConfig\[transitionNext\]\.label\}`\)/);
});

test("RFU-09 final Repairs UAT changes keep TypeScript safety escapes out", () => {
  assert.doesNotMatch(page, /as any|@ts-ignore/);
  assert.doesNotMatch(printTemplate, /@ts-ignore/);
});
