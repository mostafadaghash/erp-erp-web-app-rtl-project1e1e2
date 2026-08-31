import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync("src/components/ERPApp.tsx", "utf8");
const newCustomer = readFileSync("src/components/NewCustomerPage.tsx", "utf8");

test("WS-CUSTOMER-01 new customer distinguishes successful save from cancellation", () => {
  assert.match(newCustomer, /onClose: \(reason: "saved" \| "cancel"\) => void/);
  assert.match(newCustomer, /onClose\("saved"\)/);
  assert.match(newCustomer, /onClose\("cancel"\)/);
});

test("WS-CUSTOMER-02 successful save bypasses unsaved guard while cancel still respects it", () => {
  assert.match(
    app,
    /onClose=\{\(reason\) => \{[\s\S]{0,220}if \(reason === "saved"\) \{[\s\S]{0,100}performClose\(\[tab\.id\]\)[\s\S]{0,120}requestClose\(\[tab\.id\]\)/,
  );
});

test("WS-CUSTOMER-03 save-and-add-another clears workspace dirty state", () => {
  assert.match(newCustomer, /onSaved\?\.\(\)/);
  assert.match(app, /onSaved=\{\(\) => markTabDirty\(tab\.id, false\)\}/);
});
