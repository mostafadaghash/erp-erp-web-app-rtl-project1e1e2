import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("src/components/DeliveriesPage.tsx", "utf8");

function callArgumentObject(name: string) {
  const callStart = source.indexOf(`${name}(`);
  assert.notEqual(callStart, -1, `missing ${name} call`);
  const objectStart = source.indexOf("{", callStart + name.length + 1);
  assert.notEqual(objectStart, -1, `missing ${name} argument object`);
  let depth = 0;
  for (let index = objectStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}" && --depth === 0) return source.slice(objectStart, index + 1);
  }
  assert.fail(`unterminated ${name} argument object`);
}

test("UI-01 uses createFromOrderInvoice", () => assert.match(source, /useMutation\(api\.deliveries\.createFromOrderInvoice\)/));
test("UI-02 never uses legacy deliveries.create", () => assert.doesNotMatch(source, /api\.deliveries\.create\b/));
test("UI-03 uses real paginated delivery query", () => assert.match(source, /usePaginatedQuery\(api\.deliveries\.listPaginated/));
test("UI-04 skips queries without permission or input", () => assert.match(source, /canSettle&&activeBranch&&accountId\?[\s\S]*:"skip"/));
test("UI-05 keeps create requestId stable while retrying", () => assert.match(callArgumentObject("createDelivery"), /requestId:operationRequestId\.current/));
test("UI-06 keeps confirmation requestId stable while retrying", () => assert.match(callArgumentObject("confirmDelivered"), /requestId:operationRequestId\.current/));
test("UI-07 keeps settlement requestId stable while retrying", () => assert.match(callArgumentObject("createSettlement"), /requestId:operationRequestId\.current/));
test("UI-08 keeps reversal requestId stable while retrying", () => assert.match(callArgumentObject("reverseConfirmation"), /requestId:operationRequestId\.current/));
test("UI-09 create is protected by the shared busy guard", () => assert.match(source, /run=async[\s\S]*if\(busy\)return/));
test("UI-10 confirmation is protected by disabled busy state", () => assert.match(source, /disabled=\{busy\}[\s\S]*confirmDelivered/));
test("UI-11 settlement is protected by disabled busy state", () => assert.match(source, /disabled=\{busy\}[\s\S]*createSettlement/));
test("UI-12 reversal is protected by disabled busy state", () => assert.match(source, /disabled=\{busy\}[\s\S]*reverseSettlement/));
test("UI-13 exposes a shipping modal", () => assert.match(source, /ship:"تأكيد الشحن"/));
test("UI-14 exposes a delivery confirmation modal", () => assert.match(source, /deliver:"تأكيد التسليم والتحصيل"/));
test("UI-15 exposes cancellation and return modals", () => assert.match(source, /return:"إرجاع قبل التسليم",cancel:"إلغاء التوصيل"/));
test("UI-16 settlement and reversal collect date and reason", () => { assert.match(source, /settle:"تسوية COD مجمعة"/); assert.match(source, /reverse-settlement/); assert.match(source, /placeholder="السبب الإلزامي"/); assert.match(source, /type="date"/); });
test("UI-17 protects printing and awaits its DTO", () => assert.match(source, /if\(busy\|\|!canPrint\)return;[\s\S]*const dto=await/));
test("UI-18 renders safe errors without TypeScript escapes", () => {
  assert.match(source, /getErrorMessage/);
  assert.doesNotMatch(source, new RegExp(["as", "any"].join(" ")));
  assert.doesNotMatch(source, new RegExp(["@ts", "ignore"].join("-")));
});
