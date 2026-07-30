import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const page = fs.readFileSync(
  new URL("../src/components/RepairsPage.tsx", import.meta.url),
  "utf8",
);

const section = (start: string, end: string) => {
  const from = page.indexOf(start);
  const to = page.indexOf(end, from);
  assert.notEqual(from, -1, `missing ${start}`);
  assert.notEqual(to, -1, `missing ${end}`);
  return page.slice(from, to);
};

test("RFU-01 repair collection and refund no longer use prompt dialogs", () => {
  assert.doesNotMatch(page, /\bprompt\(/);
  assert.match(page, /collectionTarget && \(/);
  assert.match(page, /refundTarget && \(/);
});

test("RFU-02 collection and refund use independent permission hooks", () => {
  assert.match(page, /usePermission\("record_collections"\)/);
  assert.match(page, /usePermission\("refund_collections"\)/);
  assert.match(page, /canCollect &&/);
  assert.match(page, /canRefund &&/);
});

test("RFU-03 collection picker loads only for creation or an open collection modal", () => {
  assert.match(
    page,
    /api\.finance\.collectionAccountPicker,[\s\S]*?canCollect && \(showForm \|\| collectionTarget\) \? \{\} : "skip"/,
  );
});

test("RFU-04 refund picker loads only for an authorized open refund modal", () => {
  assert.match(
    page,
    /api\.finance\.refundAccountPicker,[\s\S]*?canRefund && refundTarget \? \{\} : "skip"/,
  );
});

test("RFU-05 initial deposit accounts are filtered to the selected branch", () => {
  assert.match(page, /const initialDepositAccounts = selectedBranchId/);
  assert.match(page, /account\.branchId === selectedBranchId/);
  assert.match(page, /initialDepositAccounts\.map/);
});

test("RFU-06 financial modal accounts are filtered to the repair branch", () => {
  assert.match(page, /account\.branchId === collectionTarget\.branchId/);
  assert.match(page, /account\.branchId === refundTarget\.branchId/);
  assert.match(page, /targetCollectionAccounts\.map/);
  assert.match(page, /targetRefundAccounts\.map/);
});

test("RFU-07 opening a new financial action rotates and resets its request", () => {
  const collection = section("const openCollection", "const openRefund");
  const refund = section("const openRefund", "const submitCollection");
  assert.match(collection, /setCollectionRequestId\(crypto\.randomUUID\(\)\)/);
  assert.match(collection, /accountId: ""/);
  assert.match(refund, /setRefundRequestId\(crypto\.randomUUID\(\)\)/);
  assert.match(refund, /reason: ""/);
});

test("RFU-08 collection submits the complete typed backend contract", () => {
  const handler = section("const submitCollection", "const submitRefund");
  for (const marker of [
    "repairId: collectionTarget._id",
    "accountId: account._id",
    "paymentDate: collectionForm.date",
    "requestId: collectionRequestId",
    "notes: collectionForm.notes.trim()",
  ]) {
    assert.match(handler, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("RFU-09 refund submits amount account date reason and stable request", () => {
  const handler = section("const submitRefund", "const handleStatusSelection");
  for (const marker of [
    "repairId: refundTarget._id",
    "accountId: account._id",
    "date: refundForm.date",
    "reason,",
    "requestId: refundRequestId",
  ]) {
    assert.match(handler, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("RFU-10 financial request ids remain unchanged after mutation failure", () => {
  const collection = section("const submitCollection", "const submitRefund");
  const refund = section("const submitRefund", "const handleStatusSelection");
  assert.doesNotMatch(collection, /catch[\s\S]*setCollectionRequestId/);
  assert.doesNotMatch(refund, /catch[\s\S]*setRefundRequestId/);
  assert.match(collection, /setCollectionRequestId\(crypto\.randomUUID\(\)\)/);
  assert.match(refund, /setRefundRequestId\(crypto\.randomUUID\(\)\)/);
});

test("RFU-11 both financial handlers block double submission", () => {
  assert.match(page, /if \(!collectionTarget \|\| financialBusy\) return/);
  assert.match(page, /if \(!refundTarget \|\| financialBusy\) return/);
  assert.match(page, /setFinancialBusy\("collection"\)/);
  assert.match(page, /setFinancialBusy\("refund"\)/);
  assert.match(page, /disabled=\{financialBusy !== null/);
});

test("RFU-12 modal validation enforces server-compatible monetary limits", () => {
  assert.match(page, /amount > collectionTarget\.remaining/);
  assert.match(page, /amount > refundTarget\.deposit/);
  assert.match(page, /Number\.isFinite\(amount\)/);
  assert.match(page, /const reason = refundForm\.reason\.trim\(\)/);
});

test("RFU-13 collection is hidden for terminal repairs while refund remains permission based", () => {
  assert.match(page, /r\.status !== "delivered"/);
  assert.match(page, /r\.status !== "cancelled"/);
  assert.match(page, /canRefund && r\.deposit > 0/);
});

test("RFU-14 financial UI surfaces Convex errors without unsafe escapes", () => {
  assert.match(page, /getErrorMessage\(error, "تعذر تحصيل دفعة الصيانة"\)/);
  assert.match(page, /getErrorMessage\(error, "تعذر استرداد مبلغ الصيانة"\)/);
  assert.doesNotMatch(page, /as any|@ts-ignore/);
});
