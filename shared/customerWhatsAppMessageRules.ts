export const CUSTOMER_WHATSAPP_MESSAGE_TYPES = [
  "order_confirmation",
  "ready_for_pickup",
  "shipped",
  "delivered",
  "post_sale_follow_up",
] as const;

export type CustomerWhatsAppMessageType = (typeof CUSTOMER_WHATSAPP_MESSAGE_TYPES)[number];
export type CustomerWhatsAppOperationType = "order" | "repair" | "delivery";
export type CustomerWhatsAppMessageStatus = "prepared" | "opened" | "sent" | "succeeded" | "failed";

export const CUSTOMER_WHATSAPP_MESSAGE_TYPE_LABELS: Record<CustomerWhatsAppMessageType, string> = {
  order_confirmation: "تأكيد الطلب",
  ready_for_pickup: "جاهز للاستلام",
  shipped: "تم التسليم لشركة الشحن",
  delivered: "تم الإستلام / التسليم",
  post_sale_follow_up: "متابعة ما بعد البيع",
};

export const CUSTOMER_WHATSAPP_MESSAGE_STATUS_LABELS: Record<CustomerWhatsAppMessageStatus, string> = {
  prepared: "جاهزة",
  opened: "تم فتح واتساب",
  sent: "تم الإرسال",
  succeeded: "نجح",
  failed: "فشل",
};

export const CUSTOMER_WHATSAPP_OPERATION_LABELS: Record<CustomerWhatsAppOperationType, string> = {
  order: "طلب",
  repair: "صيانة",
  delivery: "شحنة",
};

function normalizeDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/\D/g, "");
}

export function buildCustomerWhatsAppMessageKey(args: {
  customerId?: string;
  phone: string;
  operationType: CustomerWhatsAppOperationType;
  operationId: string;
  messageType: CustomerWhatsAppMessageType;
}): string {
  const customerKey = args.customerId?.trim() || `phone:${normalizeDigits(args.phone)}`;
  return `${customerKey}:${args.operationType}:${args.operationId}:${args.messageType}`;
}

export function isCustomerWhatsAppMessageApplicable(
  operationType: CustomerWhatsAppOperationType,
  messageType: CustomerWhatsAppMessageType,
): boolean {
  if (messageType === "order_confirmation") return operationType === "order";
  if (messageType === "ready_for_pickup") return operationType === "order" || operationType === "repair";
  if (messageType === "shipped") return operationType === "order" || operationType === "delivery";
  return true;
}

export function canStartCustomerWhatsAppAttempt(status: CustomerWhatsAppMessageStatus | undefined): boolean {
  return !status || status === "prepared" || status === "failed";
}

export function buildCustomerWhatsAppMessageBody(args: {
  customerName: string;
  operationType: CustomerWhatsAppOperationType;
  operationNumber: string;
  messageType: CustomerWhatsAppMessageType;
}): string {
  const name = args.customerName.trim();
  const operationLabel = CUSTOMER_WHATSAPP_OPERATION_LABELS[args.operationType];
  const reference = `${operationLabel} رقم ${args.operationNumber}`;

  switch (args.messageType) {
    case "order_confirmation":
      return `مرحبًا ${name}، تم تأكيد طلبك رقم ${args.operationNumber} بنجاح. سنبلغ حضرتك بأي تحديث جديد على الطلب.`;
    case "ready_for_pickup":
      return `مرحبًا ${name}، ${reference} جاهز الآن للاستلام. يسعدنا استقبال حضرتك.`;
    case "shipped":
      return `مرحبًا ${name}، تم تسليم ${reference} لشركة الشحن وهو الآن في طريقه إليك. سنوافي حضرتك بأي تحديث جديد.`;
    case "delivered":
      return `مرحبًا ${name}، تم تسجيل استلام/تسليم ${reference} بنجاح. نتمنى أن تكون تجربتك معنا مرضية.`;
    case "post_sale_follow_up":
      return `مرحبًا ${name}، نطمئن على حضرتك بعد استلام ${reference}. هل كل شيء يعمل بشكل جيد؟ يسعدنا معرفة رأيك أو مساعدتك في أي ملاحظة.`;
  }
}
