import { useMemo } from "react";
import { useQuery } from "convex/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { api } from "../../convex/_generated/api";
import {
  DEFAULT_CURRENCY_CODE,
  getCurrencyDefinition,
  normalizeCurrencyCode,
  type CurrencyCode,
} from "../../shared/currency";
import {
  APP_LOCALE,
  formatCurrencyValue,
  formatNumberValue,
} from "./currency";

export { APP_LOCALE };

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatAppNumber(amount: number): string {
  return formatNumberValue(amount);
}

export function formatAppCurrency(
  amount: number,
  currency: CurrencyCode | string | null | undefined = DEFAULT_CURRENCY_CODE,
): string {
  return formatCurrencyValue(amount, currency);
}

export function formatAppDate(value: Date | string | number): string {
  return new Intl.DateTimeFormat(APP_LOCALE).format(new Date(value));
}

export function useCurrency() {
  const settings = useQuery(api.settings.getPublic);
  const currency = normalizeCurrencyCode(settings?.currency);

  return useMemo(() => {
    const definition = getCurrencyDefinition(currency);
    return {
      currency,
      currencyCode: currency,
      currencyLabel: definition.labelAr,
      formatCurrency: (amount: number) => formatCurrencyValue(amount, currency),
      formatAmount: formatNumberValue,
    };
  }, [currency]);
}

export function normalizeEgyptPhoneForWhatsApp(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0020")) digits = digits.slice(2);
  if (digits.startsWith("20")) return digits;
  if (digits.startsWith("0")) return `20${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith("1")) return `20${digits}`;
  return digits;
}

export function buildEgyptWhatsAppUrl(phone: string, message: string): string {
  return `https://wa.me/${normalizeEgyptPhoneForWhatsApp(phone)}?text=${encodeURIComponent(message)}`;
}
