export type PaymentMethodKind = "cash" | "wallet" | "bank" | "gateway" | "credit" | "other";
export type PaymentMethodDefinition = { code: string; name: string; kind: PaymentMethodKind; requiresAccount: boolean; allowedAccountTypes: string[]; isSystem: boolean; isActive: boolean; sortOrder: number; };

export const PAYMENT_METHOD_PRESETS: PaymentMethodDefinition[] = [
  { code: "cash", name: "نقدًا", kind: "cash", requiresAccount: true, allowedAccountTypes: ["cash"], isSystem: true, isActive: true, sortOrder: 10 },
  { code: "wallet", name: "محفظة إلكترونية", kind: "wallet", requiresAccount: true, allowedAccountTypes: ["vodafone_cash", "other"], isSystem: true, isActive: true, sortOrder: 20 },
  { code: "instapay", name: "InstaPay", kind: "wallet", requiresAccount: true, allowedAccountTypes: ["instapay", "bank"], isSystem: true, isActive: true, sortOrder: 30 },
  { code: "paymob", name: "Paymob", kind: "gateway", requiresAccount: true, allowedAccountTypes: ["paymob_clearing"], isSystem: true, isActive: true, sortOrder: 40 },
  { code: "fawry", name: "فوري", kind: "gateway", requiresAccount: true, allowedAccountTypes: ["fawry_clearing"], isSystem: true, isActive: true, sortOrder: 50 },
  { code: "bank", name: "تحويل بنكي", kind: "bank", requiresAccount: true, allowedAccountTypes: ["bank"], isSystem: true, isActive: true, sortOrder: 60 },
  { code: "credit", name: "آجل", kind: "credit", requiresAccount: false, allowedAccountTypes: [], isSystem: true, isActive: true, sortOrder: 90 },
];
export function paymentMethodPreset(code: string) { return PAYMENT_METHOD_PRESETS.find((method) => method.code === code); }
export function paymentMethodAllowsAccount(method: Pick<PaymentMethodDefinition, "requiresAccount" | "allowedAccountTypes">, accountType: string) { return method.requiresAccount && (method.allowedAccountTypes.length === 0 || method.allowedAccountTypes.includes(accountType)); }
