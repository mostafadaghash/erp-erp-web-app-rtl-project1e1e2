import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const shipments = readFileSync("src/components/ShipmentsPage.tsx", "utf8");
const suppliers = readFileSync("src/components/SuppliersPage.tsx", "utf8");

test("purchase receipt UI calls shipments.receive and never updateStatus(arrived)", () => {
  assert.match(shipments, /api\.shipments\.receive/);
  assert.doesNotMatch(shipments, /updateStatus\([^)]*arrived/);
});

test("purchase receipt request id remains stable for failed retry and resets with a new modal", () => {
  assert.match(shipments, /const \[requestId\] = useState\(\(\) => crypto\.randomUUID\(\)\)/);
  assert.match(shipments, /await receiveShipment\([^;]+requestId/);
  assert.match(shipments, /toast\.success[\s\S]{0,200}onClose\(\)/);
});

test("purchase receipt submit prevents double clicks", () => {
  assert.match(shipments, /if \(submitting\) return/);
  assert.match(shipments, /disabled=\{submitting\}/);
});

test("receipt action is hidden without post permission", () => {
  assert.match(shipments, /post_purchase_receipts/);
});

test("supplier balance query is skipped without permission or an explicit effective branch", () => {
  assert.match(
    suppliers,
    /canViewSupplierLedger && effectiveBranch[\s\S]{0,100}\{ branchId: effectiveBranch \}[\s\S]{0,40}: "skip"/,
  );
  assert.match(suppliers, /view_supplier_ledger/);
  assert.doesNotMatch(suppliers, /branches\?\.\[0\]\?\._id|pinnedBalanceArgs/);
});

test("supplier UI never displays legacy supplier balance", () => {
  assert.doesNotMatch(suppliers, /s\.balance|supplier\.balance/);
});

test("receipt UI displays the real Convex error", () => {
  assert.match(shipments, /getErrorMessage\(error, "تعذر استلام الشحنة"\)/);
});

test("purchase UI modified files have no unsafe TypeScript escapes", () => {
  assert.doesNotMatch(shipments + suppliers, new RegExp("as\\s+any|@" + "ts-ignore"));
});
