import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const businessE2e = readFileSync("scripts/staging-business-e2e.mjs", "utf8");
const deliveriesPage = readFileSync("src/components/DeliveriesPage.tsx", "utf8");

const deliveryMessages = [
  "تم إنشاء الشحنة بنجاح",
  "تم تسجيل إرسال الشحنة",
  "تم تسجيل التسليم والتحصيل بنجاح",
  "تمت تسوية مبالغ التحصيل بنجاح",
];

test("mutable business delivery flow follows the current delivery UI success messages", () => {
  for (const message of deliveryMessages) {
    assert.ok(deliveriesPage.includes(message), `Deliveries UI is missing: ${message}`);
    assert.ok(businessE2e.includes(message), `Business E2E is missing: ${message}`);
  }
});

test("mutable business delivery flow no longer waits for legacy shipping messages", () => {
  for (const legacy of [
    "تم إنشاء عملية الشحن بنجاح",
    "تم تأكيد إرسال الشحنة",
    "تم تأكيد التسليم وتسجيل تحصيل COD",
    "تم إنشاء تسوية COD بنجاح",
  ]) {
    assert.equal(businessE2e.includes(legacy), false, `Legacy delivery message remains in E2E: ${legacy}`);
  }
});
