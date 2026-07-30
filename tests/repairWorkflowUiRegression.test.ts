import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const page = fs.readFileSync(
  new URL("../src/components/RepairsPage.tsx", import.meta.url),
  "utf8",
);
const print = fs.readFileSync(
  new URL("../src/components/PrintTemplate.tsx", import.meta.url),
  "utf8",
);

test("RWU-01 repair workflow uses technician picker with permission and modal skip", () => {
  assert.match(page, /api\.repairs\.technicianPicker/);
  assert.match(page, /canEdit && \(showForm \|\| editTarget\)/);
  assert.match(page, /: "skip"/);
});

test("RWU-02 repair workflow sends technician profile ids rather than typed names", () => {
  assert.match(page, /technicianProfileId:/);
  assert.match(page, /as Id<"userProfiles">/);
  assert.doesNotMatch(page, /placeholder="اسم الفني"/);
});

test("RWU-03 intake form captures serial accessories and device condition", () => {
  assert.match(page, /serialNumber/);
  assert.match(page, /accessories/);
  assert.match(page, /intakeCondition/);
  assert.match(page, /حالة الجهاز عند الاستلام/);
});

test("RWU-04 operational status changes use the dedicated transition mutation", () => {
  assert.match(page, /useMutation\(api\.repairs\.transitionStatus\)/);
  assert.doesNotMatch(page, /useMutation\(api\.repairs\.updateStatus\)/);
});

test("RWU-05 transition modal submits date diagnosis quality and warranty fields", () => {
  assert.match(page, /date: transitionForm\.date/);
  assert.match(page, /diagnosis: transitionForm\.diagnosis/);
  assert.match(page, /qualityCheckNotes:/);
  assert.match(page, /warrantyDays:/);
});

test("RWU-06 transition request id remains stable after failure", () => {
  const handler = page.slice(
    page.indexOf("const submitTransition"),
    page.indexOf("const openEdit"),
  );
  assert.match(handler, /requestId: transitionRequestId/);
  assert.doesNotMatch(handler, /catch[\s\S]*setTransitionRequestId/);
  assert.match(handler, /toast\.error\(getErrorMessage/);
});

test("RWU-07 transition and details handlers prevent double submission", () => {
  assert.match(page, /if \(!transitionTarget \|\| !transitionNext \|\| updatingId\) return/);
  assert.match(page, /if \(!editTarget \|\| updatingId\) return/);
  assert.match(page, /disabled=\{updatingId !== null\}/);
});

test("RWU-08 repair details modal calls updateDetails with server technician selection", () => {
  assert.match(page, /useMutation\(api\.repairs\.updateDetails\)/);
  assert.match(page, /await updateDetails\(\{/);
  assert.match(page, /حفظ التفاصيل/);
});

test("RWU-09 status history uses Convex pagination and a load-more action", () => {
  assert.match(page, /usePaginatedQuery\(/);
  assert.match(page, /api\.repairs\.historyPaginated/);
  assert.match(page, /history\.loadMore\(10\)/);
  assert.match(page, /تحميل المزيد/);
});

test("RWU-10 print waits for protected repair DTO before opening modal", () => {
  assert.match(page, /api\.repairs\.repairForPrint/);
  assert.match(page, /canPrint && printTargetId/);
  assert.match(page, /if \(!printableRepair\) return/);
  assert.match(page, /setPrintRepair\(printableRepair\)/);
});

test("RWU-11 branch selector scopes part technician and create requests", () => {
  assert.match(page, /api\.branches\.list/);
  assert.match(page, /selectedBranchId/);
  assert.match(page, /branchId: selectedBranchId/);
  assert.match(page, /اختر فرع أمر الصيانة أولًا/);
});

test("RWU-12 delivered cards display delivery date and warranty", () => {
  assert.match(page, /r\.status === "delivered"/);
  assert.match(page, /r\.deliveredDate/);
  assert.match(page, /r\.warrantyDays/);
  assert.match(page, /r\.warrantyUntil/);
});

test("RWU-13 printable repair includes intake diagnosis quality warranty and creator", () => {
  for (const marker of [
    "data.serialNumber",
    "data.accessories",
    "data.intakeCondition",
    "data.qualityCheckNotes",
    "data.warrantyUntil",
    "data.employeeName",
  ]) {
    assert.match(print, new RegExp(marker.replace(".", "\\.")));
  }
});

test("RWU-14 workflow UI contains no TypeScript escape hatch", () => {
  assert.doesNotMatch(page, /\bas any\b|@ts-ignore/);
  assert.doesNotMatch(print, /\bas any\b|@ts-ignore/);
});
