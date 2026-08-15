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

test("UI-01 uses createFromOrderInvoice", () =>
  assert.match(source, /useMutation\(api\.deliveries\.createFromOrderInvoice\)/));
test("UI-02 never uses legacy deliveries.create", () =>
  assert.doesNotMatch(source, /api\.deliveries\.create\b/));
test("UI-03 uses real paginated delivery query", () =>
  assert.match(source, /usePaginatedQuery\(\s*api\.deliveries\.listPaginated/));
test("UI-04 skips queries without permission or input", () =>
  assert.match(source, /canSettle\s*&&\s*activeBranch\s*&&\s*accountId\s*\?[\s\S]*:\s*"skip"/));
test("UI-05 keeps create requestId stable while retrying", () =>
  assert.match(callArgumentObject("createDelivery"), /requestId:\s*operationRequestId\.current/));
test("UI-06 keeps confirmation requestId stable while retrying", () =>
  assert.match(callArgumentObject("confirmDelivered"), /requestId:\s*operationRequestId\.current/));
test("UI-07 keeps settlement requestId stable while retrying", () =>
  assert.match(callArgumentObject("createSettlement"), /requestId:\s*operationRequestId\.current/));
test("UI-08 keeps reversal requestId stable while retrying", () =>
  assert.match(callArgumentObject("reverseConfirmation"), /requestId:\s*operationRequestId\.current/));
test("UI-09 create is protected by the shared busy guard", () =>
  assert.match(source, /const run\s*=\s*async[\s\S]*if\s*\(busy\)\s*return/));
test("UI-10 confirmation is protected by busy and validation state", () =>
  assert.match(source, /disabled=\{busy\s*\|\|\s*Boolean\(validationReason\)\}[\s\S]*confirmDelivered/));
test("UI-11 settlement is protected by busy and validation state", () =>
  assert.match(source, /disabled=\{busy\s*\|\|\s*Boolean\(validationReason\)\}[\s\S]*createSettlement/));
test("UI-12 reversal is protected by busy and validation state", () =>
  assert.match(source, /disabled=\{busy\s*\|\|\s*Boolean\(validationReason\)\}[\s\S]*reverseSettlement/));
test("UI-13 exposes a shipping modal", () =>
  assert.match(source, /ship:\s*"تأكيد الشحن"/));
test("UI-14 exposes a delivery confirmation modal", () =>
  assert.match(source, /deliver:\s*"تأكيد التسليم والتحصيل"/));
test("UI-15 exposes cancellation and return modals", () => {
  assert.match(source, /return:\s*"إرجاع قبل التسليم"/);
  assert.match(source, /cancel:\s*"إلغاء الشحن"/);
});
test("UI-16 settlement and reversal collect date and reason", () => {
  assert.match(source, /settle:\s*"تسوية COD مجمعة"/);
  assert.match(source, /reverse-settlement/);
  assert.match(source, /placeholder="السبب الإلزامي"/);
  assert.match(source, /type="date"/);
});
test("UI-17 protects printing and awaits its DTO", () =>
  assert.match(source, /if\s*\(busy\s*\|\|\s*!canPrint\)\s*return;[\s\S]*const dto\s*=\s*await/));
test("UI-18 renders safe errors without TypeScript escapes", () => {
  assert.match(source, /getErrorMessage/);
  assert.doesNotMatch(source, new RegExp(["as", "any"].join(" ")));
  assert.doesNotMatch(source, new RegExp(["@ts", "ignore"].join("-")));
});
test("UI-19 separates confirmation and settlement account pickers", () => {
  assert.match(source, /purpose:\s*"confirmation_cod"/);
  assert.match(source, /purpose:\s*"settlement_source"/);
  assert.match(source, /purpose:\s*"settlement_destination"/);
});
test("UI-20 accountant settlement source is gated by settlement permission", () =>
  assert.match(source, /settlementSources\s*=\s*useQuery\([\s\S]*api\.deliveries\.accountPicker,[\s\S]*canSettle/));
test("UI-21 shipping settlement pickers are not gated by confirmation permission", () =>
  assert.doesNotMatch(source, /settlementSources\s*=\s*useQuery\([\s\S]{0,180}canConfirm/));
test("UI-22 settlement id and reason use independent state", () => {
  assert.match(source, /selectedSettlementId/);
  assert.match(source, /reversalReason/);
  assert.match(source, /const openSettlementReversal[\s\S]*resetOperationState\(\)[\s\S]*setSelectedSettlementId\(settlementId\)/);
});
test("UI-23 settlement reversal sends trimmed user reason", () => {
  const args = callArgumentObject("reverseSettlement");
  assert.match(args, /settlementId:\s*selectedSettlementId/);
  assert.match(args, /reason:\s*reversalReason\.trim\(\)/);
  assert.doesNotMatch(args, /عكس التسوية من الواجهة/);
});
test("UI-24 settlement reversal keeps request stable while retrying", () =>
  assert.match(callArgumentObject("reverseSettlement"), /requestId:\s*operationRequestId\.current/));
test("UI-25 real Convex delivery print query is awaited", () =>
  assert.match(source, /const dto\s*=\s*await convex\.query\(api\.deliveries\.printDelivery/));
test("UI-26 real Convex settlement print query is awaited", () =>
  assert.match(source, /const dto\s*=\s*await convex\.query\(api\.deliveries\.printCodSettlement/));
test("UI-27 delivery and settlement print structured Arabic vouchers", () => {
  assert.match(source, /سند شحن/);
  assert.match(source, /سند تسوية/);
  assert.match(source, /توقيع الناقل/);
  assert.match(source, /الإجمالي/);
});
test("UI-28 stats cards use branch-scoped getStats", () => {
  assert.match(source, /api\.deliveries\.getStats,\s*activeBranch\s*\?\s*\{\s*branchId:\s*activeBranch\s*\}/);
  for (const label of ["COD لدى شركات الشحن", "COD تمت تسويته", "COD معكوس", "رسوم شركات الشحن"]) {
    assert.ok(source.includes(label));
  }
});
test("UI-29 avoids prompt global print hooks and unsafe escapes", () =>
  assert.doesNotMatch(
    source,
    new RegExp(["window\\.prompt", "__deliveryPrint", ["as", "any"].join(" "), ["@ts", "ignore"].join("-")].join("|")),
  ));
test("UI-30 operations share busy and validation protection", () => {
  assert.match(source, /if\s*\(busy\)\s*return/);
  assert.match(source, /disabled=\{busy\s*\|\|\s*Boolean\(validationReason\)\}/);
});
test("UI-31 opening any operation resets shared COD form state", () => {
  assert.match(source, /const resetOperationState\s*=\s*\(\)\s*=>\s*\{[\s\S]*setAccountId\(""\)[\s\S]*setDestinationId\(""\)[\s\S]*setChecked\(new Set<string>\(\)\)/);
  assert.match(source, /const open\s*=\s*\(kind:\s*Modal,\s*row\?:\s*Selected\)\s*=>\s*\{[\s\S]*resetOperationState\(\)/);
  assert.match(source, /const openSettlementReversal[\s\S]*resetOperationState\(\)/);
});
test("UI-32 branch changes clear modal and operation state", () => {
  assert.match(source, /const handleBranchChange\s*=\s*\(value:\s*string\)\s*=>\s*\{[\s\S]*resetOperationState\(\)[\s\S]*setSelected\(null\)[\s\S]*setModal\(null\)/);
  assert.match(source, /onChange=\{\(event\) => handleBranchChange\(event\.target\.value\)\}/);
});
test("UI-33 changing settlement source clears stale selected deliveries", () =>
  assert.match(source, /setAccountId\(event\.target\.value\);[\s\S]*setChecked\(new Set<string>\(\)\);[\s\S]*اختر حساب مصدر التسوية/));
test("UI-34 opening a fresh operation rotates the idempotency request", () =>
  assert.match(source, /resetOperationState\(\);[\s\S]*setSelected\(row\s*\?\?\s*null\);[\s\S]*operationRequestId\.current\s*=\s*requestId\(\);[\s\S]*setModal\(kind\)/));
test("UI-35 central validation covers create delivery required inputs", () => {
  for (const message of [
    "اختر الفرع",
    "اختر طلبًا جاهزًا",
    "اختر الفاتورة المؤهلة",
    "أدخل المدينة",
    "أدخل عنوان الشحن",
    "أدخل شركة الشحن",
    "أدخل رسوم ناقل صحيحة",
  ]) {
    assert.ok(source.includes(message), `missing ${message}`);
  }
});
test("UI-36 COD confirmation requires a clearing account only for positive COD", () => {
  assert.match(source, /\(selected\?\.codAmount \?\? 0\) > 0 && !accountId/);
  assert.ok(source.includes("اختر حساب تأكيد COD"));
});
test("UI-37 settlement validates accounts selection gross fee and date", () => {
  for (const message of [
    "اختر حساب مصدر التسوية",
    "اختر حساب وجهة التسوية",
    "يجب اختلاف حساب المصدر عن الوجهة",
    "اختر عملية شحن COD واحدة على الأقل",
    "إجمالي COD المحدد يجب أن يكون أكبر من صفر",
    "لا يمكن أن تتجاوز الرسوم إجمالي COD",
    "اختر تاريخ التسوية",
  ]) {
    assert.ok(source.includes(message), `missing ${message}`);
  }
});
test("UI-38 cancellation and reversals require user-entered reasons", () => {
  assert.match(source, /modal === "return" \|\| modal === "cancel" \|\| modal === "reverse-confirmation"/);
  assert.match(source, /!reason\.trim\(\)/);
  assert.match(source, /!reversalReason\.trim\(\)/);
});
test("UI-39 invalid actions show the blocking reason and cannot run", () => {
  assert.match(source, /role="alert"/);
  assert.match(source, /\{validationReason\}/);
  assert.match(source, /if \(validationReason\) \{[\s\S]*toast\.error\(validationReason\);[\s\S]*return;/);
  assert.match(source, /title=\{validationReason \?\? undefined\}/);
});
test("UI-40 date input is shown only for operations that send a date", () =>
  assert.match(source, /\["create", "deliver", "reverse-confirmation", "settle", "reverse-settlement"\]\.includes\(\s*modal/));
