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
test("UI-19 separates confirmation and settlement account pickers", () => {
  assert.match(source, /purpose:"confirmation_cod"/);
  assert.match(source, /purpose:"settlement_source"/);
  assert.match(source, /purpose:"settlement_destination"/);
});
test("UI-20 accountant settlement source is gated by settlement permission", () => assert.match(source, /settlementSources=useQuery\(api\.deliveries\.accountPicker,canSettle/));
test("UI-21 shipping settlement pickers are not gated by confirmation permission", () => assert.doesNotMatch(source, /settlementSources=useQuery\([^\n]*canConfirm/));
test("UI-22 settlement id and reason use independent state", () => { assert.match(source, /selectedSettlementId/); assert.match(source, /reversalReason/); assert.match(source, /setSelectedSettlementId\(settlementId\)[\s\S]*setReversalReason\(""\)/); });
test("UI-23 settlement reversal sends trimmed user reason", () => { const args=callArgumentObject("reverseSettlement"); assert.match(args, /settlementId:selectedSettlementId/); assert.match(args, /reason:reversalReason\.trim\(\)/); assert.doesNotMatch(args, /عكس التسوية من الواجهة/); });
test("UI-24 settlement reversal keeps request stable while retrying", () => assert.match(callArgumentObject("reverseSettlement"), /requestId:operationRequestId\.current/));
test("UI-25 real Convex delivery print query is awaited", () => assert.match(source, /const dto=await convex\.query\(api\.deliveries\.printDelivery/));
test("UI-26 real Convex settlement print query is awaited", () => assert.match(source, /const dto=await convex\.query\(api\.deliveries\.printCodSettlement/));
test("UI-27 delivery and settlement print structured Arabic vouchers", () => { assert.match(source, /سند توصيل/); assert.match(source, /سند تسوية/); assert.match(source, /توقيع الناقل/); assert.match(source, /الإجمالي/); });
test("UI-28 stats cards use branch-scoped getStats", () => { assert.match(source, /api\.deliveries\.getStats,activeBranch\?\{branchId:activeBranch\}/); for(const label of ["COD لدى شركات الشحن","COD تمت تسويته","COD معكوس","رسوم شركات الشحن"])assert.ok(source.includes(label)); });
test("UI-29 avoids prompt global print hooks and unsafe escapes", () => { assert.doesNotMatch(source, new RegExp(["window\\.prompt","__deliveryPrint",["as","any"].join(" "),["@ts","ignore"].join("-")].join("|"))); });
test("UI-30 reversal creation confirmation and settlement share busy protection", () => { assert.match(source, /if\(busy\)return/); assert.match(source, /disabled=\{busy\}/); });
test("UI-31 opening any operation resets shared COD form state", () => {
  assert.match(source, /const resetOperationState=\(\)=>\{[\s\S]*setAccountId\(""\)[\s\S]*setDestinationId\(""\)[\s\S]*setChecked\(new Set<string>\(\)\)/);
  assert.match(source, /const open=\(kind:Modal,row\?:Selected\)=>\{resetOperationState\(\)/);
  assert.match(source, /const openSettlementReversal=.*resetOperationState\(\)/);
});
test("UI-32 branch changes clear modal and operation state", () => {
  assert.match(source, /const handleBranchChange=\(value:string\)=>\{[\s\S]*resetOperationState\(\)[\s\S]*setSelected\(null\)[\s\S]*setModal\(null\)/);
  assert.match(source, /onChange=\{e=>handleBranchChange\(e\.target\.value\)\}/);
});
test("UI-33 changing settlement source clears stale selected deliveries", () => {
  assert.match(source, /اختر حساب مصدر التسوية[\s\S]*setChecked\(new Set<string>\(\)\)/);
});
test("UI-34 opening a fresh operation rotates the idempotency request", () => {
  assert.match(source, /resetOperationState\(\);setSelected\(row\?\?null\);operationRequestId\.current=requestId\(\);setModal\(kind\)/);
});
