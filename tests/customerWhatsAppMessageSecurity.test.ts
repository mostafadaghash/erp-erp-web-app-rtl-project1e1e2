import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("WhatsApp center uses the existing audit ledger instead of a mutable parallel table", async () => {
  const backend = await readFile("convex/customerWhatsAppMessages.ts", "utf8");
  const schema = await readFile("convex/schema.ts", "utf8");
  assert.match(backend, /const MODULE = "customer_whatsapp_messages"/);
  assert.match(backend, /\.withIndex\("by_record"/);
  assert.match(backend, /ACTION_CREATED/);
  assert.match(backend, /ACTION_ATTEMPT/);
  assert.match(backend, /ACTION_SENT/);
  assert.match(backend, /ACTION_SUCCEEDED/);
  assert.match(backend, /ACTION_FAILED/);
  assert.doesNotMatch(schema, /^\s{2}customerWhatsAppMessages:\s*defineTable\(/m);
  assert.match(schema, /\.index\("by_record", \["module", "recordId"\]\)/);
});

test("duplicate protection is based on customer + operation + message type", async () => {
  const rules = await readFile("shared/customerWhatsAppMessageRules.ts", "utf8");
  const backend = await readFile("convex/customerWhatsAppMessages.ts", "utf8");
  assert.match(rules, /customerKey.*operationType.*operationId.*messageType/s);
  assert.match(backend, /buildCustomerWhatsAppMessageKey/);
  assert.match(backend, /canStartCustomerWhatsAppAttempt\(existing\.status\)/);
  assert.match(backend, /تم إرسال هذه الرسالة من قبل، ولذلك تم منع الإرسال المكرر/);
});

test("manual WhatsApp launcher requires an explicit send result before another attempt", async () => {
  const component = await readFile("src/components/CustomerWhatsAppCenter.tsx", "utf8");
  assert.match(component, /window\.open\("about:blank", "_blank"\)/);
  assert.match(component, /openManualAttempt/);
  assert.match(component, /whatsapp-confirm-sent-/);
  assert.match(component, /recordResult\(message\.messageType, "failed"\)/);
  assert.match(component, /إعادة المحاولة/);
});

test("WhatsApp center remains inside the customer card flow and no standalone page is introduced", async () => {
  const trackingActions = await readFile("src/components/CustomerTrackingLinkActions.tsx", "utf8");
  assert.match(trackingActions, /open-customer-whatsapp-center/);
  assert.match(trackingActions, /CustomerWhatsAppCenter followUpId=\{followUpId\}/);
  assert.match(trackingActions, /جزء من بطاقة العميل، وليس صفحة مستقلة/);
});

test("Business API can update the same logical message record later without redesign", async () => {
  const backend = await readFile("convex/customerWhatsAppMessages.ts", "utf8");
  assert.match(backend, /export const applyProviderResult = internalMutation/);
  assert.match(backend, /whatsapp_business_api/);
  assert.match(backend, /messageKey/);
  assert.match(backend, /providerMessageId/);
  assert.match(backend, /providerStatus/);
});
