import test from "node:test";
import assert from "node:assert/strict";
import {
  CUSTOMER_WHATSAPP_MESSAGE_STATUS_LABELS,
  buildCustomerWhatsAppMessageBody,
  buildCustomerWhatsAppMessageKey,
  canStartCustomerWhatsAppAttempt,
  isCustomerWhatsAppMessageApplicable,
} from "../shared/customerWhatsAppMessageRules.ts";

test("WhatsApp idempotency key is stable for customer + operation + message type", () => {
  const base = {
    customerId: "customer-1",
    phone: "01001234567",
    operationType: "order" as const,
    operationId: "order-1",
    messageType: "order_confirmation" as const,
  };
  const first = buildCustomerWhatsAppMessageKey(base);
  const second = buildCustomerWhatsAppMessageKey({ ...base, phone: "01111111111" });
  assert.equal(first, second);
  assert.notEqual(first, buildCustomerWhatsAppMessageKey({ ...base, operationId: "order-2" }));
  assert.notEqual(first, buildCustomerWhatsAppMessageKey({ ...base, messageType: "ready_for_pickup" }));
});

test("phone fallback key normalizes Arabic and Persian digits", () => {
  const arabic = buildCustomerWhatsAppMessageKey({
    phone: "+20 ٠١٠٠ ١٢٣ ٤٥٦٧",
    operationType: "repair",
    operationId: "repair-1",
    messageType: "ready_for_pickup",
  });
  const latin = buildCustomerWhatsAppMessageKey({
    phone: "+20 0100 123 4567",
    operationType: "repair",
    operationId: "repair-1",
    messageType: "ready_for_pickup",
  });
  assert.equal(arabic, latin);
});

test("message types are restricted to relevant operation families", () => {
  assert.equal(isCustomerWhatsAppMessageApplicable("order", "order_confirmation"), true);
  assert.equal(isCustomerWhatsAppMessageApplicable("repair", "order_confirmation"), false);
  assert.equal(isCustomerWhatsAppMessageApplicable("repair", "ready_for_pickup"), true);
  assert.equal(isCustomerWhatsAppMessageApplicable("delivery", "ready_for_pickup"), false);
  assert.equal(isCustomerWhatsAppMessageApplicable("delivery", "shipped"), true);
  assert.equal(isCustomerWhatsAppMessageApplicable("repair", "post_sale_follow_up"), true);
});

test("duplicate protection blocks unresolved or completed sends but permits failed retries", () => {
  assert.equal(canStartCustomerWhatsAppAttempt(undefined), true);
  assert.equal(canStartCustomerWhatsAppAttempt("prepared"), true);
  assert.equal(canStartCustomerWhatsAppAttempt("failed"), true);
  assert.equal(canStartCustomerWhatsAppAttempt("opened"), false);
  assert.equal(canStartCustomerWhatsAppAttempt("sent"), false);
  assert.equal(canStartCustomerWhatsAppAttempt("succeeded"), false);
});

test("prepared templates contain customer and operation reference without financial data", () => {
  const message = buildCustomerWhatsAppMessageBody({
    customerName: "أحمد",
    operationType: "delivery",
    operationNumber: "DEL-2026-001",
    messageType: "shipped",
  });
  assert.match(message, /أحمد/);
  assert.match(message, /DEL-2026-001/);
  assert.match(message, /تم شحن/);
  assert.doesNotMatch(message, /تكلفة|ربح|متبقي|مدفوع/);
});

test("status contract is ready for manual and Business API delivery lifecycle", () => {
  assert.equal(CUSTOMER_WHATSAPP_MESSAGE_STATUS_LABELS.opened, "تم فتح واتساب");
  assert.equal(CUSTOMER_WHATSAPP_MESSAGE_STATUS_LABELS.sent, "تم الإرسال");
  assert.equal(CUSTOMER_WHATSAPP_MESSAGE_STATUS_LABELS.succeeded, "نجح");
  assert.equal(CUSTOMER_WHATSAPP_MESSAGE_STATUS_LABELS.failed, "فشل");
});
