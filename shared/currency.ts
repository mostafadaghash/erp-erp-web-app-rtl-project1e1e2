export const SUPPORTED_CURRENCY_CODES = ["EGP", "USD", "SAR"] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCY_CODES)[number];

export type CurrencyDefinition = {
  code: CurrencyCode;
  labelAr: string;
  labelEn: string;
};

export const CURRENCY_DEFINITIONS: Record<CurrencyCode, CurrencyDefinition> = {
  EGP: { code: "EGP", labelAr: "جنيه مصري", labelEn: "Egyptian Pound" },
  USD: { code: "USD", labelAr: "دولار أمريكي", labelEn: "US Dollar" },
  SAR: { code: "SAR", labelAr: "ريال سعودي", labelEn: "Saudi Riyal" },
};

export const DEFAULT_CURRENCY_CODE: CurrencyCode = "EGP";

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === "string" && SUPPORTED_CURRENCY_CODES.includes(value as CurrencyCode);
}

export function normalizeCurrencyCode(value: unknown): CurrencyCode {
  if (typeof value !== "string") return DEFAULT_CURRENCY_CODE;
  const normalized = value.trim().toUpperCase();
  return isCurrencyCode(normalized) ? normalized : DEFAULT_CURRENCY_CODE;
}

export function getCurrencyDefinition(value: unknown): CurrencyDefinition {
  return CURRENCY_DEFINITIONS[normalizeCurrencyCode(value)];
}
